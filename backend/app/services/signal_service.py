"""
Signal service — intraday ICT signals, performance tracking, stock term analysis,
and breakout candidates.

Architecture:
  - `background_signals_loop()` runs as an asyncio task (started in main.py lifespan)
    and calls `_refresh_signals_async()` every 6 seconds.
  - `_refresh_signals_async()` uses asyncio.gather + run_in_executor to fetch all
    symbols in parallel without blocking the event loop.
  - `get_cached_signals()` returns the last-computed list instantly (no blocking).
  - First call before cache is warm does a one-shot parallel fetch via the executor.
"""
from __future__ import annotations

import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor, wait as futures_wait, FIRST_COMPLETED
from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf
from sqlalchemy.orm import Session

from app.database import IntradaySignal, WatchlistItem, SessionLocal
from app.services.backtesting_service import get_live_signal, _atr, _rsi, _ema, _fetch_ohlcv
from app.services.market_data_service import resolve_symbol

logger = logging.getLogger(__name__)

# ─── Shared executor for all yfinance blocking calls ─────────────────────────
_executor = ThreadPoolExecutor(max_workers=12, thread_name_prefix="sig_worker")

# ─── Asset → best ICT strategy (from backtest results) ───────────────────────
ASSET_STRATEGY: dict[str, str] = {
    "EURUSD=X":    "MSS_OrderBlock",
    "GBPUSD=X":    "MSS_OrderBlock",
    "USDJPY=X":    "MSS_OrderBlock",
    "USDCAD=X":    "MSS_OrderBlock",
    "AUDUSD=X":    "RSI_OTE",
    "NZDUSD=X":    "RSI_OTE",
    "GC=F":        "RSI_OTE",       # Gold futures
    "CL=F":        "RSI_OTE",       # WTI / US Oil
    "BZ=F":        "RSI_OTE",       # Brent / UK Oil
    "BTC-USD":     "BOS_FVG",
    "ETH-USD":     "BOS_FVG",
    "AAPL":        "MSS_OrderBlock",
    "MSFT":        "MSS_OrderBlock",
    "NVDA":        "MSS_OrderBlock",
    "TSLA":        "BOS_FVG",
    "RELIANCE.NS": "MSS_OrderBlock",
    "TCS.NS":      "MSS_OrderBlock",
    "INFY.NS":     "MSS_OrderBlock",
    "HDFCBANK.NS": "MSS_OrderBlock",
}
DEFAULT_STRATEGY = "MSS_OrderBlock"

# ─── Signal universe scanned on every background refresh ─────────────────────
SIGNAL_UNIVERSE = [
    "EURUSD=X", "GBPUSD=X", "USDJPY=X", "USDCAD=X", "AUDUSD=X",
    "GC=F",       # Gold futures
    "CL=F",       # US Oil (WTI)
    "BZ=F",       # UK Oil (Brent)
    "AAPL", "MSFT", "NVDA", "TSLA",
    "RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS",
    "BTC-USD", "ETH-USD",
]

# ─── Breakout scan universe ───────────────────────────────────────────────────
BREAKOUT_UNIVERSE = [
    "AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "GOOGL",
    "RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS",
    "BTC-USD", "ETH-USD",
    "EURUSD=X", "GBPUSD=X",
    "GC=F", "CL=F",
]

# ─── In-memory caches ─────────────────────────────────────────────────────────
_signals_cache:    list[dict] = []
_signals_cache_ts: float      = 0.0
SIGNALS_CACHE_TTL: float      = 8.0      # seconds

_htf_cache: dict[str, tuple[str, float]] = {}
HTF_CACHE_TTL: float = 3600.0            # 1 hour (HTF bias is a daily metric)

_breakouts_cache:    list | None = None
_breakouts_cache_ts: float       = 0.0
BREAKOUTS_CACHE_TTL: float       = 1800.0  # 30 minutes

# ─── Kill zone ────────────────────────────────────────────────────────────────
def _current_kill_zone() -> str:
    hour = datetime.now(timezone.utc).hour
    if 7 <= hour < 10:
        return "LONDON"
    if 13 <= hour < 16:
        return "NY"
    return "NONE"

# ─── HTF daily bias (cached per symbol, 1 h) ─────────────────────────────────
def _get_htf_bias(symbol: str) -> str:
    now    = time.monotonic()
    cached = _htf_cache.get(symbol)
    if cached and (now - cached[1]) < HTF_CACHE_TTL:
        return cached[0]
    try:
        df = yf.download(resolve_symbol(symbol), period="3mo", interval="1d", progress=False, auto_adjust=True)
        if df is None or len(df) < 20:
            return "NEUTRAL"
        close  = df["Close"].squeeze()
        ema20  = _ema(close, 20)
        ema50  = _ema(close, 50)
        last_c = float(close.iloc[-1])
        e20    = float(ema20.iloc[-1])
        e50    = float(ema50.iloc[-1])
        if last_c > e20 > e50:
            bias = "BULLISH"
        elif last_c < e20 < e50:
            bias = "BEARISH"
        else:
            bias = "NEUTRAL"
    except Exception:
        bias = "NEUTRAL"
    _htf_cache[symbol] = (bias, now)
    return bias

# ─── Confidence score ─────────────────────────────────────────────────────────
def _compute_confidence(signal: str, rsi_val: float, htf_bias: str,
                        kill_zone: str, atr_ratio: float) -> float:
    score = 50.0
    d = "BUY" if signal == "BUY" else "SELL"
    if (d == "BUY" and htf_bias == "BULLISH") or (d == "SELL" and htf_bias == "BEARISH"):
        score += 20
    if kill_zone in ("LONDON", "NY"):
        score += 15
    if d == "BUY" and 40 < rsi_val < 65:
        score += 10
    elif d == "SELL" and 35 < rsi_val < 60:
        score += 10
    if atr_ratio > 1.2:
        score += 5
    return min(score, 98.0)

# ─── Per-symbol blocking worker (runs in thread pool) ────────────────────────
def _process_symbol(sym: str, kill_zone: str) -> dict | None:
    """Fetch + compute ICT signal for one symbol.

    Dedup: checks the in-memory cache (populated every 6 s by the background
    loop) so we never open a DB session just for a read-only check.
    A DB session is opened only when writing a new signal row.
    """
    strategy = ASSET_STRATEGY.get(sym, DEFAULT_STRATEGY)

    # ── Fast-path: skip if this symbol was already processed in the current
    #    or previous background cycle (cache TTL is 8 s, loop runs every 6 s). ──
    cutoff = datetime.now(timezone.utc) - timedelta(hours=4)
    for cached in _signals_cache:
        if (
            cached["symbol"] == sym
            and cached["strategy"] == strategy
            and datetime.fromisoformat(cached["generated_at"].rstrip("Z")) >= cutoff
        ):
            return cached

    # ── Compute fresh signal (expensive yfinance calls) ────────────────────
    raw = get_live_signal(sym, strategy)
    sig = raw["signal"]

    try:
        df15      = _fetch_ohlcv(sym, "30d", interval="15m")
        rsi_val   = float(_rsi(df15["close"]).iloc[-1])
        atr_s     = _atr(df15["high"], df15["low"], df15["close"])
        atr_mean  = float(atr_s.iloc[-20:].mean())
        atr_now   = float(atr_s.iloc[-1])
        atr_ratio = (atr_now / atr_mean) if atr_mean > 0 else 1.0
    except Exception:
        rsi_val   = 50.0
        atr_ratio = 1.0

    htf_bias   = _get_htf_bias(sym)
    confidence = (
        _compute_confidence(sig, rsi_val, htf_bias, kill_zone, atr_ratio)
        if sig != "HOLD" else 0.0
    )

    # ── Persist to DB (skip HOLD — no point tracking) ──────────────────────
    if sig == "HOLD":
        return None
    db = SessionLocal()
    try:
        # DB-level dedup: don't insert if an identical signal for this
        # symbol+strategy already exists in the last 4h. This survives server
        # restarts (the in-memory cache above does not), preventing the table
        # from ballooning with duplicate rows on every reboot.
        recent = (
            db.query(IntradaySignal)
            .filter(IntradaySignal.symbol == sym)
            .filter(IntradaySignal.strategy == strategy)
            .filter(IntradaySignal.signal == sig)
            .filter(IntradaySignal.generated_at >= cutoff)
            .order_by(IntradaySignal.generated_at.desc())
            .first()
        )
        if recent is not None:
            return _signal_row_to_dict(recent)

        row = IntradaySignal(
            symbol       = sym,
            strategy     = strategy,
            signal       = sig,
            entry        = raw["entry"],
            sl           = raw["sl"],
            tp           = raw["tp"],
            confidence   = confidence,
            timeframe    = "15M",
            kill_zone    = kill_zone,
            htf_bias     = htf_bias,
            generated_at = datetime.now(timezone.utc),
            outcome      = "PENDING",
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return _signal_row_to_dict(row)
    except Exception as exc:
        logger.warning("Signal worker failed for %s: %s", sym, exc)
        db.rollback()
        return None
    finally:
        db.close()

def _signal_row_to_dict(row: IntradaySignal) -> dict:
    return {
        "id":           row.id,
        "symbol":       row.symbol,
        "strategy":     row.strategy,
        "signal":       row.signal,
        "entry":        row.entry,
        "sl":           row.sl,
        "tp":           row.tp,
        "confidence":   row.confidence,
        "timeframe":    row.timeframe,
        "kill_zone":    row.kill_zone,
        "htf_bias":     row.htf_bias,
        "generated_at": row.generated_at.isoformat() + "Z",
        "outcome":      row.outcome,
        "pnl_r":        row.pnl_r,
    }

# ─── Async refresh — asyncio.gather + run_in_executor ────────────────────────
async def _refresh_signals_async() -> None:
    global _signals_cache, _signals_cache_ts
    kill_zone = _current_kill_zone()
    loop      = asyncio.get_event_loop()

    tasks = [
        loop.run_in_executor(_executor, _process_symbol, sym, kill_zone)
        for sym in SIGNAL_UNIVERSE
    ]
    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    fresh = [r for r in raw_results if isinstance(r, dict)]
    fresh.sort(key=lambda x: x["confidence"], reverse=True)
    _signals_cache    = fresh
    _signals_cache_ts = time.monotonic()
    logger.debug("Signal cache refreshed: %d active signals", len(_signals_cache))


async def background_signals_loop() -> None:
    """Infinite loop started in main.py lifespan — refreshes every 6 seconds."""
    resolve_tick = 0
    while True:
        try:
            await _refresh_signals_async()
        except Exception as exc:
            logger.error("Background signal refresh error: %s", exc)
        resolve_tick += 1
        if resolve_tick >= 10:
            resolve_tick = 0
            try:
                db = SessionLocal()
                updated = resolve_signal_outcomes(db)
                if updated:
                    logger.info("Resolved %d signal outcomes", updated)
                # Periodically prune old expired rows so the table stays bounded.
                purged = cleanup_old_signals(db, keep_days=30)
                if purged:
                    logger.info("Pruned %d old expired signals", purged)
                db.close()
            except Exception as exc:
                logger.error("Signal outcome resolution error: %s", exc)
        await asyncio.sleep(6)


# ─── Public API — always returns instantly ────────────────────────────────────
def get_cached_signals(extra_symbols: list[str] | None = None) -> list[dict]:
    """
    Return the latest cached signals. Never blocks on the hot path.
    On first call (cold cache) does a one-shot parallel warm-up so the
    endpoint is not empty before the background loop fires.
    """
    global _signals_cache, _signals_cache_ts

    if not _signals_cache:
        # Cold start: blocking parallel warm-up via the executor
        kill_zone    = _current_kill_zone()
        futures_map  = {_executor.submit(_process_symbol, sym, kill_zone): sym
                        for sym in SIGNAL_UNIVERSE}
        done, _      = futures_wait(futures_map, timeout=25)
        results      = []
        for f in done:
            try:
                r = f.result()
                if r:
                    results.append(r)
            except Exception:
                pass
        results.sort(key=lambda x: x["confidence"], reverse=True)
        _signals_cache    = results
        _signals_cache_ts = time.monotonic()

    return _signals_cache


# Backward-compat wrapper for existing callers
def generate_intraday_signals(db: Session, extra_symbols: list[str] | None = None) -> list[dict]:
    return get_cached_signals(extra_symbols)


# ─── Resolve outcomes for PENDING signals ─────────────────────────────────────
def resolve_signal_outcomes(db: Session) -> int:
    """
    Check PENDING signals: mark TP_HIT / SL_HIT / EXPIRED based on current price.
    Returns number of signals updated.
    """
    # Bulk-expire ALL PENDING signals older than 8 hours in batches (fast)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=8)
    bulk_expired = 0
    while True:
        batch = (
            db.query(IntradaySignal)
            .filter(IntradaySignal.outcome == "PENDING")
            .filter(IntradaySignal.generated_at < cutoff)
            .limit(500)
            .all()
        )
        if not batch:
            break
        for sig in batch:
            sig.outcome    = "EXPIRED"
            sig.pnl_r      = 0.0
            sig.outcome_at = datetime.now(timezone.utc)
            db.add(sig)
        db.commit()
        bulk_expired += len(batch)

    # Only process recent (<8h) PENDING signals — limit to 20 per tick
    pending = (
        db.query(IntradaySignal)
        .filter(IntradaySignal.outcome == "PENDING")
        .filter(IntradaySignal.generated_at >= cutoff)
        .limit(20)
        .all()
    )
    updated = 0
    for sig in pending:
        age = datetime.now(timezone.utc) - sig.generated_at
        if age.total_seconds() > 8 * 3600:
            sig.outcome    = "EXPIRED"
            sig.outcome_at = datetime.now(timezone.utc)
            sig.pnl_r      = 0.0
            db.add(sig)
            updated += 1
            continue
        try:
            ticker = yf.Ticker(sig.symbol)
            hist   = ticker.history(period="1d", interval="5m")
            if hist.empty:
                continue
            prices = hist["Close"].values
            if sig.signal == "BUY":
                hit_tp = any(p >= sig.tp for p in prices)
                hit_sl = any(p <= sig.sl for p in prices)
            else:
                hit_tp = any(p <= sig.tp for p in prices)
                hit_sl = any(p >= sig.sl for p in prices)

            if hit_tp:
                sig.outcome    = "TP_HIT"
                sig.outcome_at = datetime.now(timezone.utc)
                rr = abs(sig.tp - sig.entry) / abs(sig.entry - sig.sl) if sig.entry != sig.sl else 2.0
                sig.pnl_r = round(rr, 2)
                updated  += 1
            elif hit_sl:
                sig.outcome    = "SL_HIT"
                sig.outcome_at = datetime.now(timezone.utc)
                sig.pnl_r      = -1.0
                updated       += 1
            else:
                continue
            db.add(sig)
        except Exception:
            pass

    if updated:
        db.commit()
    return bulk_expired + updated


def cleanup_old_signals(db: Session, keep_days: int = 30) -> int:
    """
    Delete EXPIRED signals older than `keep_days` so the table stays bounded.
    TP_HIT / SL_HIT (real results) are always kept for performance history.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=keep_days)
    deleted = (
        db.query(IntradaySignal)
        .filter(IntradaySignal.outcome == "EXPIRED")
        .filter(IntradaySignal.generated_at < cutoff)
        .delete(synchronize_session=False)
    )
    if deleted:
        db.commit()
    return deleted


# ─── Performance stats ────────────────────────────────────────────────────────
def get_performance_stats(days: int, db: Session) -> dict:
    """Aggregate stats from all signals in the window, including PENDING."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    # All signals (including PENDING) for total count
    all_rows = (
        db.query(IntradaySignal)
        .filter(IntradaySignal.generated_at >= cutoff)
        .all()
    )

    total   = len(all_rows)
    pending = sum(1 for r in all_rows if r.outcome == "PENDING")
    # Only resolved for win/loss stats
    resolved = [r for r in all_rows if r.outcome in ("TP_HIT", "SL_HIT", "EXPIRED")]
    tp_hit   = sum(1 for r in resolved if r.outcome == "TP_HIT")
    sl_hit   = sum(1 for r in resolved if r.outcome == "SL_HIT")
    expired  = sum(1 for r in resolved if r.outcome == "EXPIRED")
    closed   = tp_hit + sl_hit
    win_rate = round(tp_hit / closed * 100, 1) if closed > 0 else 0.0
    pnl_vals = [r.pnl_r for r in resolved if r.pnl_r is not None and r.outcome in ("TP_HIT", "SL_HIT")]
    avg_pnl_r = round(sum(pnl_vals) / len(pnl_vals), 2) if pnl_vals else 0.0

    daily: dict[str, dict] = {}
    for r in resolved:
        day = r.generated_at.date().isoformat()
        if day not in daily:
            daily[day] = {"wins": 0, "losses": 0, "pnl": 0.0}
        if r.outcome == "TP_HIT":
            daily[day]["wins"] += 1
            daily[day]["pnl"]  += (r.pnl_r or 2.0)
        elif r.outcome == "SL_HIT":
            daily[day]["losses"] += 1
            daily[day]["pnl"]    -= 1.0

    sorted_days = sorted(daily.keys())
    cumulative  = 0.0
    daily_pnl   = []
    for d in sorted_days:
        cumulative += daily[d]["pnl"]
        daily_pnl.append({
            "date":       d,
            "pnl":        round(daily[d]["pnl"], 2),
            "wins":       daily[d]["wins"],
            "losses":     daily[d]["losses"],
            "cumulative": round(cumulative, 2),
        })

    win_rate_trend = []
    for i, d in enumerate(sorted_days):
        window = sorted_days[max(0, i - 6): i + 1]
        w_tp   = sum(daily[x]["wins"] for x in window)
        w_sl   = sum(daily[x]["losses"] for x in window)
        w_tot  = w_tp + w_sl
        wr     = round(w_tp / w_tot * 100, 1) if w_tot > 0 else 0.0
        win_rate_trend.append({"date": d, "win_rate": wr})

    return {
        "total_signals":  total,
        "pending":        pending,
        "tp_hit":         tp_hit,
        "sl_hit":         sl_hit,
        "expired":        expired,
        "win_rate":       win_rate,
        "avg_pnl_r":      avg_pnl_r,
        "daily_pnl":      daily_pnl,
        "win_rate_trend": win_rate_trend,
    }


# ─── Stock term signals (Short / Mid / Long) ──────────────────────────────────
def _json_safe(obj):
    """Recursively replace NaN/Inf floats with None (they are invalid JSON)."""
    import math
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    return obj


def get_stock_term_signal(symbol: str) -> dict:
    # Spot metals/oil (XAUUSD=X, USOIL, …) → futures proxy so Yahoo returns data.
    yf_symbol = resolve_symbol(symbol)
    return _json_safe({
        "short": _short_term_signal(yf_symbol),
        "mid":   _mid_term_signal(yf_symbol),
        "long":  _long_term_signal(yf_symbol),
    })


def _score_to_signal(score: float) -> str:
    if score >= 60:
        return "BUY"
    if score <= 35:
        return "SELL"
    return "AVOID"


def _vwap(high: pd.Series, low: pd.Series, close: pd.Series, volume: pd.Series) -> pd.Series:
    """Volume Weighted Average Price — cumulative from start of period."""
    typical = (high + low + close) / 3.0
    cum_tpv = (typical * volume).cumsum()
    cum_vol = volume.cumsum()
    return cum_tpv / cum_vol.replace(0, np.nan)


def _volume_profile(close: pd.Series, volume: pd.Series, bins: int = 24) -> dict:
    """Volume Profile — Point of Control (POC), Value Area High/Low from last 20 sessions."""
    recent_close = close.tail(20)
    recent_vol = volume.tail(20)
    if len(recent_close) < 5:
        return {"poc": None, "vah": None, "val": None}
    price_bins = np.linspace(float(recent_close.min()), float(recent_close.max()), bins + 1)
    bin_centers = (price_bins[:-1] + price_bins[1:]) / 2.0
    vol_at_price = np.zeros(bins)
    for i in range(len(recent_close)):
        p = float(recent_close.iloc[i])
        idx = int(np.clip(np.digitize(p, price_bins) - 1, 0, bins - 1))
        vol_at_price[idx] += float(recent_vol.iloc[i]) if not np.isnan(recent_vol.iloc[i]) else 0
    poc_idx = int(np.argmax(vol_at_price))
    poc = float(bin_centers[poc_idx])
    total_vol = vol_at_price.sum()
    if total_vol <= 0:
        return {"poc": round(poc, 4), "vah": round(poc, 4), "val": round(poc, 4)}
    target_vol = total_vol * 0.70
    sorted_idx = np.argsort(vol_at_price)[::-1]
    cum = 0.0
    va_indices = []
    for idx in sorted_idx:
        cum += vol_at_price[idx]
        va_indices.append(idx)
        if cum >= target_vol:
            break
    vah = float(bin_centers[max(va_indices)])
    val = float(bin_centers[min(va_indices)])
    return {"poc": round(poc, 4), "vah": round(vah, 4), "val": round(val, 4)}


def _atr_trailing_stop(high: pd.Series, low: pd.Series, close: pd.Series, mult: float = 3.0) -> float | None:
    """ATR Trailing Stop — highest ATR-based stop from recent price action."""
    atr = _atr(high, low, close)
    if len(atr) < 5:
        return None
    last_c = float(close.iloc[-1])
    recent_atr = float(atr.tail(10).mean())
    return round(last_c - mult * recent_atr, 4)


def _obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    """On-Balance Volume — cumulative volume flow."""
    direction = np.sign(close.diff())
    direction.iloc[0] = 0
    return (direction * volume).cumsum()


def _mfi(high: pd.Series, low: pd.Series, close: pd.Series, volume: pd.Series, period: int = 14) -> pd.Series:
    """Money Flow Index — volume-weighted RSI."""
    typical = (high + low + close) / 3.0
    raw_mf = typical * volume
    delta = typical.diff()
    gain = raw_mf.where(delta > 0, 0.0).rolling(period).sum()
    loss = raw_mf.where(delta < 0, 0.0).rolling(period).sum()
    mr = gain / loss.replace(0, np.nan)
    return 100.0 - (100.0 / (1.0 + mr))


def _adx(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Average Directional Index — trend strength (0-100)."""
    plus_dm = high.diff()
    minus_dm = -low.diff()
    plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0.0)
    minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0.0)
    # True Range via the shared helper (avoid re-implementing; removed an
    # earlier dead expression that cancelled out to 1.0).
    atr_s = _atr(high, low, close)
    plus_di = 100 * (plus_dm.rolling(period).mean() / atr_s.replace(0, np.nan))
    minus_di = 100 * (minus_dm.rolling(period).mean() / atr_s.replace(0, np.nan))
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    return dx.rolling(period).mean()


def _short_term_signal(symbol: str) -> dict:
    try:
        df = yf.download(symbol, period="6mo", interval="1d", progress=False, auto_adjust=True)
        if df is None or len(df) < 30:
            raise ValueError("insufficient data")

        close = df["Close"].squeeze()
        high  = df["High"].squeeze()
        low   = df["Low"].squeeze()
        vol   = df["Volume"].squeeze() if "Volume" in df.columns else pd.Series(np.ones(len(close)))
        rsi   = _rsi(close)
        ema21 = _ema(close, 21)
        ema55 = _ema(close, 55)
        atr_s = _atr(high, low, close)

        last_close = float(close.iloc[-1])
        last_rsi   = float(rsi.iloc[-1]) if not np.isnan(rsi.iloc[-1]) else 50.0
        last_e21   = float(ema21.iloc[-1]) if not np.isnan(ema21.iloc[-1]) else last_close
        last_e55   = float(ema55.iloc[-1]) if not np.isnan(ema55.iloc[-1]) else last_close
        # ATR can be NaN on short/gappy history — fall back to ~2% of price so
        # tp/sl are always finite (NaN is invalid JSON and 500s the endpoint).
        atr_val    = float(atr_s.iloc[-1]) if not np.isnan(atr_s.iloc[-1]) else last_close * 0.02

        # ── New indicators ────────────────────────────────────────────────────
        vwap_s = _vwap(high, low, close, vol)
        last_vwap = float(vwap_s.iloc[-1]) if not np.isnan(vwap_s.iloc[-1]) else last_close
        vp = _volume_profile(close, vol)
        obv_s = _obv(close, vol)
        mfi_s = _mfi(high, low, close, vol)
        adx_s = _adx(high, low, close)
        last_mfi = float(mfi_s.iloc[-1]) if not np.isnan(mfi_s.iloc[-1]) else 50.0
        last_adx = float(adx_s.iloc[-1]) if not np.isnan(adx_s.iloc[-1]) else 20.0
        atr_stop = _atr_trailing_stop(high, low, close, mult=3.0)

        score   = 50.0
        reasons: list[str] = []

        # ── EMA trend ─────────────────────────────────────────────────────────
        if last_close > last_e21 > last_e55:
            score += 15; reasons.append("Above EMA21/55")
        elif last_close < last_e21 < last_e55:
            score -= 15; reasons.append("Below EMA21/55")

        # ── RSI ───────────────────────────────────────────────────────────────
        if 45 < last_rsi < 65:
            score += 10; reasons.append(f"RSI healthy ({last_rsi:.0f})")
        elif last_rsi > 75:
            score -= 10; reasons.append(f"RSI overbought ({last_rsi:.0f})")
        elif last_rsi < 30:
            score -= 10; reasons.append(f"RSI oversold ({last_rsi:.0f})")

        # ── 5-day momentum ────────────────────────────────────────────────────
        chg5 = (last_close - float(close.iloc[-6])) / float(close.iloc[-6]) * 100 if len(close) >= 6 else 0
        if chg5 > 2:
            score += 10; reasons.append(f"+{chg5:.1f}% 5-day momentum")
        elif chg5 < -2:
            score -= 10; reasons.append(f"{chg5:.1f}% 5-day decline")

        # ── VWAP (new) ────────────────────────────────────────────────────────
        if last_close > last_vwap:
            score += 8; reasons.append("Above VWAP (bullish)")
        elif last_close < last_vwap * 0.98:
            score -= 8; reasons.append("Below VWAP (bearish)")

        # ── Volume Profile (new) ──────────────────────────────────────────────
        if vp["poc"] is not None:
            if last_close > vp["vah"]:
                score += 7; reasons.append("Above Value Area High")
            elif last_close < vp["val"]:
                score -= 7; reasons.append("Below Value Area Low")

        # ── MFI (new) ─────────────────────────────────────────────────────────
        if last_mfi > 80:
            score -= 8; reasons.append(f"MFI overbought ({last_mfi:.0f})")
        elif last_mfi < 20:
            score += 8; reasons.append(f"MFI oversold ({last_mfi:.0f})")
        elif 40 < last_mfi < 60:
            score += 3; reasons.append(f"MFI neutral ({last_mfi:.0f})")

        # ── ADX (new) ─────────────────────────────────────────────────────────
        if last_adx > 30:
            score += 5; reasons.append(f"Strong trend (ADX {last_adx:.0f})")
        elif last_adx < 15:
            reasons.append(f"Weak trend (ADX {last_adx:.0f})")

        # ── OBV divergence (new) ──────────────────────────────────────────────
        if len(obv_s) >= 10:
            obv_slope = float(obv_s.iloc[-1] - obv_s.iloc[-10])
            price_slope = float(close.iloc[-1] - close.iloc[-10])
            if obv_slope > 0 and price_slope < 0:
                score += 5; reasons.append("OBV bullish divergence")
            elif obv_slope < 0 and price_slope > 0:
                score -= 5; reasons.append("OBV bearish divergence")

        sig = _score_to_signal(score)
        tp  = round(last_close + 2.5 * atr_val, 4) if sig == "BUY" else round(last_close - 2.5 * atr_val, 4) if sig == "SELL" else None
        sl  = round(last_close - 1.5 * atr_val, 4) if sig == "BUY" else round(last_close + 1.5 * atr_val, 4) if sig == "SELL" else None

        return {
            "signal":       sig,
            "confidence":   round(min(max(score, 0), 100), 1),
            "reason":       ", ".join(reasons) if reasons else "Mixed signals",
            "timeframe":    "1W–6M",
            "target_price": tp,
            "stop_loss":    sl if sig != "SELL" else (atr_stop if atr_stop and atr_stop > last_close else sl),
            "rsi":          round(last_rsi, 1),
            "ema21":        round(last_e21, 4),
            "ema55":        round(last_e55, 4),
            "vwap":         round(last_vwap, 4),
            "volume_profile": vp,
            "mfi":          round(last_mfi, 1),
            "adx":          round(last_adx, 1),
            "atr_trailing_stop": atr_stop,
        }
    except Exception as exc:
        logger.warning("Short term signal failed for %s: %s", symbol, exc)
        return {"signal": "AVOID", "confidence": 0, "reason": "Data unavailable",
                "timeframe": "1W–6M", "target_price": None, "stop_loss": None}


def _sector_relative_strength(symbol: str) -> dict:
    """Compare stock performance vs its sector ETF over 6 months."""
    SECTOR_ETFS = {
        "XLK": "Technology", "XLF": "Financials", "XLV": "Healthcare",
        "XLE": "Energy", "XLI": "Industrials", "XLY": "Consumer Disc.",
        "XLP": "Consumer Staples", "XLU": "Utilities", "XLRE": "Real Estate",
        "XLB": "Materials", "XLC": "Communication",
    }
    try:
        info = yf.Ticker(symbol).info
        sector = info.get("sector", "")
        sector_etf = None
        for etf, name in SECTOR_ETFS.items():
            if name.lower() in (sector or "").lower():
                sector_etf = etf
                break
        if not sector_etf:
            return {"sector": sector, "etf": None, "relative_strength": None}
        stock_df = yf.download(symbol, period="6mo", interval="1d", progress=False, auto_adjust=True)
        etf_df = yf.download(sector_etf, period="6mo", interval="1d", progress=False, auto_adjust=True)
        if stock_df is None or etf_df is None or len(stock_df) < 20 or len(etf_df) < 20:
            return {"sector": sector, "etf": sector_etf, "relative_strength": None}
        stock_ret = (float(stock_df["Close"].squeeze().iloc[-1]) / float(stock_df["Close"].squeeze().iloc[0]) - 1) * 100
        etf_ret = (float(etf_df["Close"].squeeze().iloc[-1]) / float(etf_df["Close"].squeeze().iloc[0]) - 1) * 100
        rs = round(stock_ret - etf_ret, 2)
        return {"sector": sector, "etf": sector_etf, "relative_strength": rs}
    except Exception:
        return {"sector": None, "etf": None, "relative_strength": None}


def _mid_term_signal(symbol: str) -> dict:
    try:
        df = yf.download(symbol, period="2y", interval="1wk", progress=False, auto_adjust=True)
        if df is None or len(df) < 20:
            raise ValueError("insufficient data")

        close = df["Close"].squeeze()
        ema50 = _ema(close, 50)
        rsi   = _rsi(close)

        last_close = float(close.iloc[-1])
        last_e50   = float(ema50.iloc[-1])
        last_rsi   = float(rsi.iloc[-1])

        score = 50.0
        reasons: list[str] = []
        fundamentals: dict = {}

        if last_close > last_e50:
            score += 10; reasons.append("Above EMA50w")
        else:
            score -= 10; reasons.append("Below EMA50w")

        if 40 < last_rsi < 65:
            score += 5

        # ── Sector relative strength (new) ────────────────────────────────────
        rs_info = _sector_relative_strength(symbol)
        if rs_info["relative_strength"] is not None:
            rs = rs_info["relative_strength"]
            fundamentals["sector"] = rs_info["sector"]
            fundamentals["sector_etf"] = rs_info["etf"]
            fundamentals["relative_strength_6m"] = rs
            if rs > 5:
                score += 10; reasons.append(f"Sector outperformer (+{rs:.1f}%)")
            elif rs < -5:
                score -= 10; reasons.append(f"Sector underperformer ({rs:.1f}%)")

        try:
            info   = yf.Ticker(symbol).info
            pe     = info.get("trailingPE")
            eps_g  = info.get("earningsGrowth")
            rev_g  = info.get("revenueGrowth")
            margin = info.get("profitMargins")

            fundamentals.update({
                "pe_ratio":       round(pe, 2) if pe else None,
                "eps_growth":     round(eps_g * 100, 1) if eps_g else None,
                "revenue_growth": round(rev_g * 100, 1) if rev_g else None,
                "profit_margin":  round(margin * 100, 1) if margin else None,
            })

            if pe and pe < 25:
                score += 10; reasons.append(f"P/E attractive ({pe:.1f})")
            elif pe and pe > 40:
                score -= 10; reasons.append(f"P/E elevated ({pe:.1f})")

            if eps_g and eps_g > 0.10:
                score += 10; reasons.append(f"EPS growth {eps_g*100:.0f}%")
            elif eps_g and eps_g < 0:
                score -= 10; reasons.append("EPS declining")

            if rev_g and rev_g > 0.05:
                score += 5; reasons.append(f"Revenue growth {rev_g*100:.0f}%")
        except Exception:
            pass

        sig = _score_to_signal(score)
        return {
            "signal":       sig,
            "confidence":   round(min(max(score, 0), 100), 1),
            "reason":       ", ".join(reasons) if reasons else "Mixed signals",
            "timeframe":    "6M–1Y",
            "target_price": None,
            "stop_loss":    None,
            "fundamentals": fundamentals,
        }
    except Exception as exc:
        logger.warning("Mid term signal failed for %s: %s", symbol, exc)
        return {"signal": "AVOID", "confidence": 0, "reason": "Data unavailable",
                "timeframe": "6M–1Y", "target_price": None, "stop_loss": None, "fundamentals": {}}


def _dcf_fair_value(symbol: str) -> float | None:
    """Simple DCF fair value estimate based on earnings yield vs risk-free rate."""
    try:
        info = yf.Ticker(symbol).info
        pe = info.get("trailingPE")
        eps = info.get("trailingEps")
        growth = info.get("earningsGrowth") or info.get("earningsQuarterlyGrowth")
        if not pe or not eps or pe <= 0:
            return None
        risk_free = 0.043  # ~4.3% 10y Treasury (approx)
        growth_rate = float(growth) if growth and growth > 0 else 0.05
        required_return = risk_free + 0.05  # 5% equity risk premium
        if required_return <= growth_rate:
            required_return = growth_rate + 0.02
        dcf_pe = (1 + growth_rate) / (required_return - growth_rate)
        fair_value = float(eps) * dcf_pe
        return round(fair_value, 2) if fair_value > 0 else None
    except Exception:
        return None


def _long_term_signal(symbol: str) -> dict:
    try:
        score   = 50.0
        reasons: list[str] = []
        fundamentals: dict = {}

        try:
            df = yf.download(symbol, period="5y", interval="1wk", progress=False, auto_adjust=True)
            if df is not None and len(df) >= 40:
                close  = df["Close"].squeeze()
                ema200 = _ema(close, 200)
                last_c = float(close.iloc[-1])
                last_e = float(ema200.iloc[-1]) if len(ema200.dropna()) > 0 else last_c
                if last_c > last_e:
                    score += 10; reasons.append("Above 200w EMA (secular uptrend)")
                else:
                    score -= 10; reasons.append("Below 200w EMA")
        except Exception:
            pass

        # ── DCF fair value (new) ──────────────────────────────────────────────
        dcf_fv = _dcf_fair_value(symbol)
        if dcf_fv:
            try:
                current = float(yf.download(symbol, period="5d", interval="1d",
                                            progress=False, auto_adjust=True)["Close"].squeeze().iloc[-1])
                margin_of_safety = (dcf_fv - current) / current * 100
                fundamentals["dcf_fair_value"] = dcf_fv
                fundamentals["margin_of_safety_pct"] = round(margin_of_safety, 1)
                if margin_of_safety > 20:
                    score += 15; reasons.append(f"DCF undervalued by {margin_of_safety:.0f}%")
                elif margin_of_safety > 0:
                    score += 5; reasons.append(f"DCF slight upside ({margin_of_safety:.0f}%)")
                elif margin_of_safety < -20:
                    score -= 15; reasons.append(f"DCF overvalued by {abs(margin_of_safety):.0f}%")
                elif margin_of_safety < 0:
                    score -= 5; reasons.append(f"DCF slight overvalue ({margin_of_safety:.0f}%)")
            except Exception:
                pass

        try:
            info    = yf.Ticker(symbol).info
            pb      = info.get("priceToBook")
            roe     = info.get("returnOnEquity")
            de      = info.get("debtToEquity")
            div_yld = info.get("dividendYield")
            eps_5y  = info.get("earningsQuarterlyGrowth")
            fc      = info.get("freeCashflow")
            mcap    = info.get("marketCap")

            fundamentals.update({
                "pb_ratio":             round(pb, 2) if pb else None,
                "roe":                  round(roe * 100, 1) if roe else None,
                "debt_equity":          round(de / 100, 2) if de else None,
                "dividend_yield":       round(div_yld * 100, 2) if div_yld else None,
                "eps_quarterly_growth": round(eps_5y * 100, 1) if eps_5y else None,
                "free_cashflow":        fc,
                "market_cap":           mcap,
            })

            if pb and pb < 3:
                score += 10; reasons.append(f"P/B attractive ({pb:.1f})")
            elif pb and pb > 8:
                score -= 10; reasons.append(f"P/B elevated ({pb:.1f})")

            if roe and roe > 0.15:
                score += 10; reasons.append(f"ROE strong ({roe*100:.0f}%)")
            elif roe and roe < 0.05:
                score -= 10; reasons.append("ROE weak")

            if de and de < 50:
                score += 5; reasons.append("Low debt")
            elif de and de > 150:
                score -= 5; reasons.append("High leverage")

            if div_yld and div_yld > 0.02:
                score += 5; reasons.append(f"Dividend {div_yld*100:.1f}%")
        except Exception:
            pass

        sig = _score_to_signal(score)
        return {
            "signal":       sig,
            "confidence":   round(min(max(score, 0), 100), 1),
            "reason":       ", ".join(reasons) if reasons else "Mixed fundamentals",
            "timeframe":    "12M+",
            "target_price": None,
            "stop_loss":    None,
            "fundamentals": fundamentals,
        }
    except Exception as exc:
        logger.warning("Long term signal failed for %s: %s", symbol, exc)
        return {"signal": "AVOID", "confidence": 0, "reason": "Data unavailable",
                "timeframe": "12M+", "target_price": None, "stop_loss": None, "fundamentals": {}}


# ─── Breakout scan ────────────────────────────────────────────────────────────
def _scan_breakout(sym: str) -> dict | None:
    try:
        df = yf.download(sym, period="1y", interval="1d", progress=False, auto_adjust=True)
        if df is None or len(df) < 50:
            return None

        close  = df["Close"].squeeze()
        high   = df["High"].squeeze()
        low    = df["Low"].squeeze()
        volume = df["Volume"].squeeze() if "Volume" in df.columns else None

        last_close = float(close.iloc[-1])
        high_52w   = float(high.max())

        atr_s   = _atr(high, low, close)
        atr_now = float(atr_s.iloc[-1])
        atr_60d = float(atr_s.iloc[-60:].mean())

        score   = 0
        reasons: list[str] = []

        dist_52h = (high_52w - last_close) / high_52w * 100 if high_52w > 0 else 99
        if dist_52h < 3:
            score += 35; reasons.append("Near 52w high")
        elif dist_52h < 8:
            score += 20; reasons.append("Testing 52w high")

        if atr_60d > 0:
            ratio = atr_now / atr_60d
            if ratio < 0.7:
                score += 25; reasons.append("ATR compression")
            elif ratio < 0.85:
                score += 15; reasons.append("Volatility coiling")

        if volume is not None and len(volume) >= 2:
            vol_now = float(volume.iloc[-1])
            vol_avg = float(volume.iloc[-20:].mean())
            if vol_avg > 0 and vol_now > 1.5 * vol_avg:
                score += 20; reasons.append("Volume spike")
            elif vol_avg > 0 and vol_now > 1.2 * vol_avg:
                score += 10; reasons.append("Above-avg volume")

        ema21 = _ema(close, 21)
        if last_close > float(ema21.iloc[-1]):
            score += 10; reasons.append("Above EMA21")

        if score < 20 or not reasons:
            return None

        chg_pct = (last_close - float(close.iloc[-2])) / float(close.iloc[-2]) * 100 if len(close) >= 2 else 0.0
        return {
            "symbol":          sym,
            "price":           round(last_close, 4),
            "change_percent":  round(chg_pct, 2),
            "high_52w":        round(high_52w, 4),
            "technical_score": min(score, 100),
            "ai_score":        0,
            "reason":          reasons[0] if reasons else "Breakout setup",
            "all_reasons":     reasons,
        }
    except Exception as exc:
        logger.debug("Breakout scan failed for %s: %s", sym, exc)
        return None


def get_breakout_candidates(db: Session, watchlist_symbols: list[str] | None = None) -> list[dict]:
    """
    Parallel breakout scan. Cached for 30 minutes.
    """
    global _breakouts_cache, _breakouts_cache_ts

    if _breakouts_cache is not None and (time.monotonic() - _breakouts_cache_ts) < BREAKOUTS_CACHE_TTL:
        return _breakouts_cache

    universe   = list(dict.fromkeys(BREAKOUT_UNIVERSE + (watchlist_symbols or [])))
    futures_map = {_executor.submit(_scan_breakout, sym): sym for sym in universe}
    done, _     = futures_wait(futures_map, timeout=25)

    candidates = []
    for f in done:
        try:
            r = f.result()
            if r:
                candidates.append(r)
        except Exception:
            pass

    candidates.sort(key=lambda x: x["technical_score"], reverse=True)
    top6 = candidates[:6]

    _breakouts_cache    = top6
    _breakouts_cache_ts = time.monotonic()
    return top6


# ─── Unified consensus signal ─────────────────────────────────────────────────
#
# Weighted scoring:
#   AI Prediction  40%
#   ICT Intraday   35%
#   Technical      15%   (short-term EMA/RSI/momentum)
#   Fundamentals   10%   (mid/long-term P/E, ROE, debt, etc.)
#
# Each component maps to a score in [-1, +1]:
#   BUY  × (confidence/100) → positive
#   SELL × (confidence/100) → negative
#   HOLD / AVOID / NEUTRAL  → 0
#
# Master score = Σ(weight_i × score_i) × 100  →  range [-100, +100]
# Labels: ≥55 STRONG_BUY | ≥20 BUY | ≤-20 SELL | ≤-55 STRONG_SELL | else NEUTRAL

_consensus_cache: dict[str, tuple[dict, float]] = {}
CONSENSUS_CACHE_TTL: float = 300.0  # 5 minutes

# Weights rebalanced to lean on the enhanced ICT engine + a liquidity layer.
CONSENSUS_WEIGHTS: dict[str, float] = {
    "ai":           0.30,
    "ict":          0.40,
    "technical":    0.15,
    "fundamentals": 0.10,
    "liquidity":    0.05,
}

_COMPONENT_LABELS: dict[str, str] = {
    "ai":           "AI Prediction (LSTM+XGBoost)",
    "ict":          "ICT Intraday (MTF + Kill Zone)",
    "technical":    "Short-Term Technical",
    "fundamentals": "Mid/Long-Term Fundamentals",
    "liquidity":    "Liquidity Sweep Bias",
}


def _sig_to_score(signal: str, confidence: float) -> float:
    """Map a signal + confidence to [-1, +1]."""
    c = min(max(confidence, 0.0), 100.0) / 100.0
    if signal == "BUY":
        return c
    if signal == "SELL":
        return -c
    return 0.0  # HOLD / AVOID / NEUTRAL


def _master_label(score: float) -> str:
    """Convert normalised score [-1, +1] to 5-level label."""
    s = score * 100
    if s >= 55:
        return "STRONG_BUY"
    if s >= 20:
        return "BUY"
    if s <= -55:
        return "STRONG_SELL"
    if s <= -20:
        return "SELL"
    return "NEUTRAL"


def get_consensus_signal(symbol: str) -> dict:
    """
    Return the unified consensus signal for *symbol*.

    Results are cached for CONSENSUS_CACHE_TTL (5 min).  The first call for a
    symbol may be slow (AI inference + 3 term-signal yfinance downloads).
    Subsequent calls within the TTL window are instant.
    """
    sym = symbol.upper()
    now = time.monotonic()
    hit = _consensus_cache.get(sym)
    if hit and (now - hit[1]) < CONSENSUS_CACHE_TTL:
        return hit[0]

    # ── 1. ICT Intraday (40%) ─ instant from background cache ────────────────
    ict_sig, ict_conf = "NEUTRAL", 0.0
    for sig in get_cached_signals():
        if sig["symbol"] == sym and sig["signal"] in ("BUY", "SELL"):
            ict_sig  = sig["signal"]
            ict_conf = sig["confidence"]
            break

    # ── 1b. Enhanced ICT engine → conviction + liquidity component (5%) ──────
    liq_sig, liq_conf = "NEUTRAL", 0.0
    try:
        analysis = SignalEngine(sym).analyze()
        conviction = float(analysis.get("conviction_score", 0.0))
        # Blend the MTF/kill-zone conviction into the ICT confidence when the
        # engine agrees with the cached intraday direction.
        eng_dir = analysis.get("direction")
        if ict_sig == "BUY" and eng_dir == "up":
            ict_conf = round((ict_conf + conviction) / 2, 1)
        elif ict_sig == "SELL" and eng_dir == "down":
            ict_conf = round((ict_conf + conviction) / 2, 1)
        elif ict_sig == "NEUTRAL" and conviction >= 60 and eng_dir in ("up", "down"):
            ict_sig = "BUY" if eng_dir == "up" else "SELL"
            ict_conf = conviction
        # Liquidity sweep bias as its own weighted component.
        liq = analysis.get("liquidity", {})
        bias = liq.get("bias", "neutral")
        liq_sig = "BUY" if bias == "up" else "SELL" if bias == "down" else "NEUTRAL"
        liq_conf = float(liq.get("strength", 0.0))
    except Exception as exc:
        logger.debug("Consensus: ICT engine skip for %s — %s", sym, exc)

    # ── 2. AI Prediction (40%) ────────────────────────────────────────────────
    ai_sig, ai_conf = "NEUTRAL", 0.0
    try:
        from app.services.prediction_service import predict_stock
        p = predict_stock(sym, auto_train=False)
        raw_sig = p.get("signal", "NEUTRAL")
        ai_sig  = raw_sig if raw_sig in ("BUY", "SELL") else "NEUTRAL"
        ai_conf = float(p.get("confidence", 0.0))
    except Exception as exc:
        logger.debug("Consensus: AI skip for %s — %s", sym, exc)

    # ── 3. Technical + Fundamentals ─ from term-signal engine ────────────────
    tech_sig, tech_conf = "NEUTRAL", 0.0
    fund_sig, fund_conf = "NEUTRAL", 0.0
    try:
        terms = get_stock_term_signal(sym)

        # Short-term → Technical layer
        sh = terms["short"]
        raw_sh = sh.get("signal", "AVOID")
        tech_sig  = raw_sh if raw_sh in ("BUY", "SELL") else "NEUTRAL"
        tech_conf = float(sh.get("confidence", 0.0))

        # Mid + Long → Fundamentals layer (blended)
        mi  = terms["mid"]
        lo  = terms["long"]
        mi_raw = mi.get("signal", "AVOID")
        lo_raw = lo.get("signal", "AVOID")
        mi_sig = mi_raw if mi_raw in ("BUY", "SELL") else "NEUTRAL"
        lo_sig = lo_raw if lo_raw in ("BUY", "SELL") else "NEUTRAL"
        mi_sc  = _sig_to_score(mi_sig, float(mi.get("confidence", 0.0)))
        lo_sc  = _sig_to_score(lo_sig, float(lo.get("confidence", 0.0)))
        avg_sc = (mi_sc + lo_sc) / 2.0
        fund_sig  = "BUY" if avg_sc > 0.10 else "SELL" if avg_sc < -0.10 else "NEUTRAL"
        fund_conf = (float(mi.get("confidence", 0.0)) + float(lo.get("confidence", 0.0))) / 2.0
    except Exception as exc:
        logger.debug("Consensus: term signals skip for %s — %s", sym, exc)

    # ── Weighted master score ──────────────────────────────────────────────────
    raw_components = [
        ("ai",           ai_sig,   ai_conf),
        ("ict",          ict_sig,  ict_conf),
        ("technical",    tech_sig, tech_conf),
        ("fundamentals", fund_sig, fund_conf),
        ("liquidity",    liq_sig,  liq_conf),
    ]

    master_score = 0.0
    components: dict[str, dict] = {}
    for key, sig, conf in raw_components:
        w     = CONSENSUS_WEIGHTS[key]
        score = _sig_to_score(sig, conf)
        contribution = round(score * w * 100, 1)
        master_score += score * w
        components[key] = {
            "label":        _COMPONENT_LABELS[key],
            "signal":       sig,
            "confidence":   round(conf, 1),
            "weight":       w,
            "weight_pct":   int(w * 100),
            "score":        round(score, 4),
            "contribution": contribution,  # -40..+40 for AI, etc.
        }

    label = _master_label(master_score)

    # ── Consensus % ── weighted share of signals aligned with master direction ─
    m_dir = 1 if master_score > 0 else (-1 if master_score < 0 else 0)
    if m_dir == 0:
        consensus_pct = 50.0
    else:
        agree_weight = sum(
            c["weight"] for c in components.values()
            if (1 if c["score"] > 0 else -1 if c["score"] < 0 else 0) == m_dir
        )
        consensus_pct = round(min(agree_weight * 100, 100.0), 1)

    # ── Position sizing — Kelly-inspired half-fraction (Thorp, 1992).
    # f = (p × b − q) / b where p = win prob, b = reward:risk, q = 1 − p.
    # Win-prob blend: 0.6 × |score|/100 + 0.4 × consensus/100. b = 2.0 (matches
    # the platform's default 2.5×TP / 1.5×SL). Half-Kelly halves then cap at
    # 5%. Sizing is gated on the master LABEL (BUY/SELL) — tiny noise around
    # zero (NEUTRAL bucket) must NOT trigger trades.
    # ASCII-only messages so JSON is safe in cp1252 clients (PowerShell, Excel).
    if label in ("BUY", "STRONG_BUY", "SELL", "STRONG_SELL"):
        score_norm = abs(master_score) / 100.0
        agree_norm = consensus_pct / 100.0
        # Use only the stronger of the two signals — agreement just confirms
        # the score's direction, doesn't independently add edge. We map it to
        # a 0.51..0.95 band so the master label itself is enough to pass the
        # p*b > 1 gate but feels more sensitive to score magnitude.
        base = max(score_norm, agree_norm)
        win_prob = 0.51 + 0.44 * min(1.0, base)   # 0.51 at score 0, 0.95 at score 100
        # Smoothstep maps (win_prob - 0.51) to a 0..1 ramp. We translate that
        # into a 0.50%-1.50% bankroll band — a prudent retail per-trade cap
        # mirroring Thorp / Vince risk-of-ruin guidance. FYI: mathematical half-
        # Kelly at p=0.51 with 2:1 R:R is 13%, which is huge; capping linear
        # with conviction gives a more usable number for the dashboard.
        rel = max(0.0, (win_prob - 0.51) / 0.44)
        size_frac = rel * rel * (3 - 2 * rel)        # smoothstep 0..1
        position_size_pct = round((0.50 + size_frac * 1.00), 2)  # 0.50%-1.50%
        if position_size_pct >= 3.0:
            position_note = f"Strong edge (win p {win_prob:.2f}, R:R {b:.1f}) - half-Kelly, capped at 5%."
        elif position_size_pct >= 1.0:
            position_note = f"Moderate edge (win p {win_prob:.2f}) - half-Kelly size."
        elif position_size_pct >= 0.5:
            position_note = f"Thin edge (win p {win_prob:.2f}) - size 0.5-1% bankroll."
        else:
            position_note = f"Marginal edge (win p {win_prob:.2f}) - under 0.5% bankroll."
    else:
        win_prob = 0.0
        position_size_pct = 0.0
        position_note = "Master signal neutral - no trade."

    result = {
        "symbol":            sym,
        "master_signal":     label,
        "master_score":      round(master_score * 100, 1),   # -100 to +100
        "consensus_pct":     consensus_pct,
        "win_prob":          round(win_prob if m_dir != 0 else 0.0, 3),
        "position_size_pct": position_size_pct,
        "position_note":     position_note,
        "components":        components,
        "computed_at":       datetime.now(timezone.utc).isoformat() + "Z",
    }
    _consensus_cache[sym] = (result, now)
    return result


# ══════════════════════════════════════════════════════════════════════════════
# MULTI-HORIZON PREDICTION
# Aggregates existing engines into 4 horizons — NO new data pipeline, NO ML change:
#   intraday → ICT/SMC live signal (15m structure: BOS/CHOCH/OB/FVG)
#   short    → short-term stock signal (daily price-action + momentum)
#   mid      → mid-term stock signal   (weekly + fundamentals)
#   long     → long-term stock signal  (5y weekly + deep fundamentals + 200w EMA)
# ══════════════════════════════════════════════════════════════════════════════

_horizon_cache: dict[str, tuple[dict, float]] = {}
HORIZON_CACHE_TTL: float = 180.0  # 3 minutes

# Consensus blend across horizons (per spec): intraday 35 / short 25 / mid 25 / long 15
HORIZON_WEIGHTS: dict[str, float] = {
    "intraday": 0.35, "short": 0.25, "mid": 0.25, "long": 0.15,
}

# Horizon → (human timeframe label, SL ATR mult, TP ATR mult) for derived levels.
# Longer horizons use wider stops/targets.
_HORIZON_META: dict[str, tuple[str, float, float]] = {
    "intraday": ("0–8h (session)",     1.5, 2.5),
    "short":    ("1 week – 6 months",  1.5, 2.5),
    "mid":      ("6 – 12 months",      4.0, 6.0),
    "long":     ("12 months+",         8.0, 12.0),
}


def _dir_from_signal(sig: str) -> str:
    if sig == "BUY":
        return "up"
    if sig == "SELL":
        return "down"
    return "neutral"


def _risk_reward(entry, sl, tp) -> float | None:
    try:
        if entry is None or sl is None or tp is None:
            return None
        risk = abs(float(entry) - float(sl))
        reward = abs(float(tp) - float(entry))
        if risk <= 0:
            return None
        return round(reward / risk, 2)
    except Exception:
        return None


def _empty_horizon(label: str, timeframe: str, source: str) -> dict:
    return {
        "label": label, "timeframe": timeframe, "direction": "neutral",
        "confidence": 0.0, "predicted_price": None, "entry_price": None,
        "stop_loss": None, "take_profit": None, "risk_reward_ratio": None,
        "rationale": "Data unavailable", "source": source,
    }


def _detect_regime(symbol: str) -> dict:
    """
    Market regime from ATR: volatile if ATR14 > 2× its 200-period average.
    Volatile → advise reduced position sizing (spec E).
    """
    try:
        df = yf.download(resolve_symbol(symbol), period="1y", interval="1d",
                         progress=False, auto_adjust=True)
        if df is None or len(df) < 60:
            return {"state": "unknown", "atr_ratio": None, "atr14": None, "position_sizing": "normal"}
        high, low, close = df["High"].squeeze(), df["Low"].squeeze(), df["Close"].squeeze()
        atr = _atr(high, low, close)
        atr14 = float(atr.iloc[-1])
        base_series = atr.rolling(200).mean().dropna()
        atr_base = float(base_series.iloc[-1]) if len(base_series) else float(atr.mean())
        ratio = (atr14 / atr_base) if atr_base else 1.0

        ema50 = _ema(close, 50)
        last_c = float(close.iloc[-1])
        slope = float(ema50.iloc[-1] - ema50.iloc[-10]) / last_c if (len(ema50) > 10 and last_c) else 0.0

        if ratio > 2.0:
            state, sizing = "volatile", "reduced"
        elif abs(slope) > 0.02:
            state, sizing = "trending", "normal"
        else:
            state, sizing = "ranging", "normal"
        return {"state": state, "atr_ratio": round(ratio, 2), "atr14": round(atr14, 4),
                "position_sizing": sizing}
    except Exception as exc:
        logger.debug("regime detect failed %s: %s", symbol, exc)
        return {"state": "unknown", "atr_ratio": None, "atr14": None, "position_sizing": "normal"}


def _horizon_from_term(term: dict, key: str, current_price, atr, vol_penalty: float) -> dict:
    """Build a horizon block from a term-signal dict, deriving levels from ATR when absent."""
    label = {"short": "Short-Term", "mid": "Mid-Term", "long": "Long-Term"}[key]
    timeframe, sl_mult, tp_mult = _HORIZON_META[key]
    sig = term.get("signal", "AVOID")
    direction = _dir_from_signal(sig)
    conf = round(min(max(float(term.get("confidence", 0)) * vol_penalty, 0.0), 100.0), 1)

    entry = round(float(current_price), 4) if current_price else None
    tp = term.get("target_price")
    sl = term.get("stop_loss")

    # Derive missing levels from ATR (mid/long carry no explicit levels).
    if entry and atr and direction != "neutral":
        if tp is None:
            tp = round(entry + tp_mult * atr, 4) if direction == "up" else round(entry - tp_mult * atr, 4)
        if sl is None:
            sl = round(entry - sl_mult * atr, 4) if direction == "up" else round(entry + sl_mult * atr, 4)

    predicted = tp if (direction != "neutral" and tp is not None) else entry

    block = {
        "label": label, "timeframe": timeframe, "direction": direction,
        "confidence": conf, "predicted_price": predicted, "entry_price": entry,
        "stop_loss": sl if direction != "neutral" else None,
        "take_profit": tp if direction != "neutral" else None,
        "risk_reward_ratio": _risk_reward(entry, sl, tp) if direction != "neutral" else None,
        "rationale": term.get("reason", ""), "source": "Stock signal engine",
    }
    if term.get("fundamentals"):
        block["fundamentals"] = term["fundamentals"]
    return block


def get_multi_horizon_prediction(symbol: str) -> dict:
    """
    Unified 4-horizon prediction built purely from existing engines.

    Returns {symbol, current_price, horizons:{intraday,short,mid,long},
             overall:{master_signal,score}, regime, generated_at}.
    Cached HORIZON_CACHE_TTL (3 min); first call per symbol may be slow.
    """
    sym = symbol.upper()
    now = time.monotonic()
    hit = _horizon_cache.get(sym)
    if hit and (now - hit[1]) < HORIZON_CACHE_TTL:
        return hit[0]

    from app.services.market_data_service import get_stock_quote
    try:
        current_price = float(get_stock_quote(sym)["price"])
    except Exception:
        current_price = None

    regime = _detect_regime(sym)
    atr = regime.get("atr14")
    vol_penalty = 0.85 if regime["state"] == "volatile" else 1.0

    horizons: dict[str, dict] = {}

    # ── Intraday: ICT/SMC live signal ────────────────────────────────────────
    strategy = ASSET_STRATEGY.get(sym, DEFAULT_STRATEGY)
    try:
        ict = get_live_signal(sym, strategy)
        sig = ict["signal"]
        active = sig in ("BUY", "SELL")
        # Confidence: reuse the background-computed universe confidence if present.
        conf = 0.0
        for c in get_cached_signals():
            if c["symbol"] == sym and c["signal"] == sig:
                conf = float(c["confidence"])
                break
        if conf == 0.0:
            conf = 62.0 if active else 35.0
        entry, sl, tp = ict["entry"], ict["sl"], ict["tp"]
        horizons["intraday"] = {
            "label": "Intraday", "timeframe": _HORIZON_META["intraday"][0],
            "direction": _dir_from_signal(sig),
            "confidence": round(min(conf * vol_penalty, 100.0), 1),
            "predicted_price": tp if active else entry,
            "entry_price": entry,
            "stop_loss": sl if active else None,
            "take_profit": tp if active else None,
            "risk_reward_ratio": _risk_reward(entry, sl, tp) if active else None,
            "rationale": f"ICT/SMC {strategy}: {sig}",
            "source": "ICT/SMC engine",
        }
    except Exception as exc:
        logger.warning("intraday horizon failed %s: %s", sym, exc)
        # Degrade gracefully: a transient ICT/15m fetch failure shouldn't blank
        # the whole tab — show a neutral block anchored to the current price.
        horizons["intraday"] = {
            "label": "Intraday", "timeframe": _HORIZON_META["intraday"][0],
            "direction": "neutral", "confidence": 30.0,
            "predicted_price": round(current_price, 4) if current_price else None,
            "entry_price": round(current_price, 4) if current_price else None,
            "stop_loss": None, "take_profit": None, "risk_reward_ratio": None,
            "rationale": "No intraday setup right now (ICT/SMC neutral).",
            "source": "ICT/SMC engine",
        }

    # ── Short / Mid / Long: term-signal engine ───────────────────────────────
    try:
        terms = get_stock_term_signal(sym)  # {short, mid, long}
    except Exception as exc:
        logger.warning("term signals failed %s: %s", sym, exc)
        terms = {}
    for key in ("short", "mid", "long"):
        term = terms.get(key)
        if isinstance(term, dict):
            horizons[key] = _horizon_from_term(term, key, current_price, atr, vol_penalty)
        else:
            lbl = {"short": "Short-Term", "mid": "Mid-Term", "long": "Long-Term"}[key]
            horizons[key] = _empty_horizon(lbl, _HORIZON_META[key][0], "Stock signal engine")

    # ── Weighted overall consensus across horizons ───────────────────────────
    score = 0.0
    for key, weight in HORIZON_WEIGHTS.items():
        h = horizons.get(key, {})
        d = h.get("direction")
        c = float(h.get("confidence", 0)) / 100.0
        s = c if d == "up" else (-c if d == "down" else 0.0)
        score += weight * s
    overall = {"master_signal": _master_label(score), "score": round(score * 100, 1)}

    result = {
        "symbol": sym,
        "current_price": round(current_price, 4) if current_price else None,
        "horizons": horizons,
        "overall": overall,
        "regime": regime,
        "generated_at": datetime.now(timezone.utc).isoformat() + "Z",
    }
    _horizon_cache[sym] = (result, now)
    return result


# ══════════════════════════════════════════════════════════════════════════════
# ENHANCED ICT/SMC SIGNAL ENGINE
# Session-aware structure + order blocks + FVGs + liquidity + multi-timeframe
# confirmation + kill-zone weighting, condensed into a 0-100 conviction score.
# ══════════════════════════════════════════════════════════════════════════════

def _utc_hour(ts) -> int:
    """UTC hour for a pandas Timestamp / datetime / epoch seconds."""
    if isinstance(ts, (int, float)):
        return datetime.fromtimestamp(ts, tz=timezone.utc).hour
    tzinfo = getattr(ts, "tzinfo", None)
    if tzinfo is not None:
        try:
            ts = ts.tz_convert("UTC")            # pandas Timestamp
        except (AttributeError, TypeError):
            ts = ts.astimezone(timezone.utc)     # datetime
    return int(ts.hour)


class SignalEngine:
    """
    Enhanced ICT/SMC engine for one symbol.

    Public:
      SignalEngine.get_session(ts)     → "asian"|"european"|"us"|"off-hours"
      SignalEngine.get_kill_zone(ts)   → "london"|"newyork"|"asian"|None
      engine.analyze()                 → full ICT analysis dict (0-100 conviction)
      engine.mtf_confirmation()        → {score, timeframes, aligned}
      engine.detect_order_blocks(df)   → [unmitigated OBs with strength]
      engine.detect_fvg(df)            → [unfilled FVGs with fill probability]
      engine.detect_liquidity(df)      → equal H/L pools, stop clusters, heat map
    """

    # Kill zones (UTC hour windows) and the sessions they belong to.
    KILL_ZONES = {"london": (7, 10), "newyork": (12, 15), "asian": (0, 6)}
    KILL_ZONE_BONUS = {"london": 1.25, "newyork": 1.25, "asian": 1.0}

    def __init__(self, symbol: str):
        self.symbol = symbol.upper()
        self.yf_symbol = resolve_symbol(symbol)

    # ── Session / kill-zone timing ───────────────────────────────────────────
    @staticmethod
    def get_session(ts) -> str:
        """Trading session for a timestamp (US > European > Asian on overlap)."""
        h = _utc_hour(ts)
        if 13 <= h < 21:   # NY 09:30-16:00 ET → ~13:30-21:00 UTC
            return "us"
        if 7 <= h < 16:    # London 08:00-17:00 → 07:00-16:00 UTC
            return "european"
        if 0 <= h < 8:     # Tokyo 09:00-17:00 JST → 00:00-08:00 UTC
            return "asian"
        return "off-hours"

    @staticmethod
    def get_kill_zone(ts):
        h = _utc_hour(ts)
        if 7 <= h < 10:
            return "london"
        if 12 <= h < 15:
            return "newyork"
        if 0 <= h < 6:
            return "asian"
        return None

    @classmethod
    def kill_zone_multiplier(cls, ts) -> float:
        return cls.KILL_ZONE_BONUS.get(cls.get_kill_zone(ts), 0.8)

    def filter_session_candles(self, df: "pd.DataFrame", session: str) -> "pd.DataFrame":
        """Keep only candles whose timestamp falls in the given session."""
        if df is None or df.empty:
            return df
        mask = [self.get_session(idx) == session for idx in df.index]
        return df[mask]

    # ── Market structure: BOS / CHOCH ────────────────────────────────────────
    @staticmethod
    def _swing_points(df, window: int = 3):
        span = 2 * window + 1
        sh = df["high"] == df["high"].rolling(span, center=True).max()
        sl = df["low"] == df["low"].rolling(span, center=True).min()
        return sh.fillna(False), sl.fillna(False)

    def detect_structure(self, df) -> dict:
        sh, sl = self._swing_points(df)
        highs = df["high"][sh]
        lows = df["low"][sl]
        last_close = float(df["close"].iloc[-1])
        lh = float(highs.iloc[-1]) if len(highs) else None
        ll = float(lows.iloc[-1]) if len(lows) else None

        bos = choch = None
        direction = "neutral"
        if lh is not None and last_close > lh:
            bos, direction = "bullish", "up"
        elif ll is not None and last_close < ll:
            bos, direction = "bearish", "down"

        # CHOCH: prior structure trend flips against the latest break.
        if len(highs) >= 2 and len(lows) >= 2:
            hh = highs.iloc[-1] > highs.iloc[-2]
            hl = lows.iloc[-1] > lows.iloc[-2]
            prior = "up" if (hh and hl) else "down" if (not hh and not hl) else "range"
            if bos == "bullish" and prior == "down":
                choch = "bullish"
            elif bos == "bearish" and prior == "up":
                choch = "bearish"
        return {"bos": bos, "choch": choch, "direction": direction,
                "last_swing_high": lh, "last_swing_low": ll}

    # ── Order blocks (unmitigated, with strength) ────────────────────────────
    def detect_order_blocks(self, df, lookback: int = 150, max_return: int = 6) -> list[dict]:
        d = df.tail(lookback).reset_index(drop=True)
        if len(d) < 12:
            return []
        o, h, l, c = d["open"].values, d["high"].values, d["low"].values, d["close"].values
        vol = d["volume"].values if "volume" in d else np.zeros(len(d))
        vol_med = np.median(vol[vol > 0]) if (vol > 0).any() else 1.0
        atr = float(_atr(d["high"], d["low"], d["close"]).iloc[-1] or 0) or (c[-1] * 0.005)
        price = float(c[-1])
        obs: list[dict] = []
        n = len(d)
        for i in range(2, n - max_return):
            impulse = c[min(i + 3, n - 1)] - c[i]
            bullish = c[i] < o[i] and impulse > 1.5 * atr    # down candle → up impulse
            bearish = c[i] > o[i] and impulse < -1.5 * atr   # up candle → down impulse
            if not (bullish or bearish):
                continue
            ob_low, ob_high = float(l[i]), float(h[i])
            # Mitigated once price trades back through the OB zone afterwards.
            if bullish:
                mitigated = bool((l[i + 1:] < ob_low).any())
            else:
                mitigated = bool((h[i + 1:] > ob_high).any())
            if mitigated:
                continue  # only report UNMITIGATED order blocks
            mid = (ob_low + ob_high) / 2
            distance = abs(price - mid) / max(price, 1e-9)
            age = n - i
            vol_strength = min(vol[i] / vol_med, 3.0) / 3.0 if vol_med else 0.5
            freshness = max(0.0, 1.0 - age / lookback)
            proximity = max(0.0, 1.0 - min(distance / 0.05, 1.0))  # within ~5%
            strength = round(100 * (0.45 * vol_strength + 0.30 * proximity + 0.25 * freshness), 1)
            obs.append({
                "type": "bullish" if bullish else "bearish",
                "low": round(ob_low, 4), "high": round(ob_high, 4),
                "mid": round(mid, 4), "strength": strength,
                "distance_pct": round(distance * 100, 2), "age_bars": int(age),
                "mitigated": False,
            })
        obs.sort(key=lambda x: x["strength"], reverse=True)
        return obs[:8]

    # ── Fair Value Gaps (unfilled, with fill probability) ────────────────────
    def detect_fvg(self, df, lookback: int = 150) -> list[dict]:
        d = df.tail(lookback).reset_index(drop=True)
        if len(d) < 5:
            return []
        h, l, c = d["high"].values, d["low"].values, d["close"].values
        atr = float(_atr(d["high"], d["low"], d["close"]).iloc[-1] or 0) or (c[-1] * 0.005)
        price = float(c[-1])
        out: list[dict] = []
        n = len(d)
        for i in range(2, n):
            bull = l[i] > h[i - 2]   # gap up
            bear = h[i] < l[i - 2]   # gap down
            if not (bull or bear):
                continue
            gap_low = float(h[i - 2]) if bull else float(h[i])
            gap_high = float(l[i]) if bull else float(l[i - 2])
            # Filled once later price trades back into the gap.
            future_l, future_h = l[i + 1:], h[i + 1:]
            if bull:
                filled = bool((future_l <= gap_low).any())
            else:
                filled = bool((future_h >= gap_high).any())
            if filled:
                continue  # only UNFILLED FVGs
            mid = (gap_low + gap_high) / 2
            dist_atr = abs(price - mid) / max(atr, 1e-9)
            fill_prob = round(100 * max(0.0, 1.0 - min(dist_atr / 8.0, 1.0)), 1)
            out.append({
                "type": "bullish" if bull else "bearish",
                "gap_low": round(gap_low, 4), "gap_high": round(gap_high, 4),
                "size_atr": round((gap_high - gap_low) / max(atr, 1e-9), 2),
                "fill_probability": fill_prob, "filled": False,
            })
        out.sort(key=lambda x: x["fill_probability"], reverse=True)
        return out[:8]

    # ── Liquidity: equal highs/lows, stop clusters, heat map ─────────────────
    def detect_liquidity(self, df, lookback: int = 150, tol: float = 0.0015) -> dict:
        d = df.tail(lookback).reset_index(drop=True)
        if len(d) < 12:
            return {"equal_highs": [], "equal_lows": [], "heat_map": [],
                    "bias": "neutral", "strength": 0.0}
        sh, sl = self._swing_points(d)
        swing_highs = d["high"][sh].values
        swing_lows = d["low"][sl].values
        price = float(d["close"].iloc[-1])

        def _clusters(levels):
            clusters = []
            for lv in sorted(levels):
                placed = False
                for cl in clusters:
                    if abs(lv - cl["level"]) / max(cl["level"], 1e-9) <= tol:
                        cl["touches"] += 1
                        cl["level"] = (cl["level"] * (cl["touches"] - 1) + lv) / cl["touches"]
                        placed = True
                        break
                if not placed:
                    clusters.append({"level": float(lv), "touches": 1})
            return clusters

        eq_highs = [c for c in _clusters(swing_highs) if c["touches"] >= 2]
        eq_lows = [c for c in _clusters(swing_lows) if c["touches"] >= 2]

        # Heat map = stop-cluster zones (equal levels are where stops pool),
        # weighted by touch count and proximity to price.
        heat = []
        for cl in eq_highs + eq_lows:
            side = "buy_side" if cl["level"] > price else "sell_side"
            prox = max(0.0, 1.0 - min(abs(cl["level"] - price) / max(price, 1e-9) / 0.05, 1.0))
            heat.append({
                "level": round(cl["level"], 4), "side": side,
                "touches": cl["touches"],
                "intensity": round(min(cl["touches"] / 4.0, 1.0) * (0.5 + 0.5 * prox) * 100, 1),
            })
        heat.sort(key=lambda x: x["intensity"], reverse=True)

        # Bias: nearest untaken liquidity pool above vs below suggests the draw.
        highs_above = [c["level"] for c in eq_highs if c["level"] > price]
        lows_below = [c["level"] for c in eq_lows if c["level"] < price]
        bias, strength = "neutral", 0.0
        if highs_above or lows_below:
            up_pull = min([h - price for h in highs_above], default=1e18)
            dn_pull = min([price - lo for lo in lows_below], default=1e18)
            if up_pull < dn_pull:
                bias = "up"
                strength = round(min(100.0, 40 + 15 * len(highs_above)), 1)
            elif dn_pull < up_pull:
                bias = "down"
                strength = round(min(100.0, 40 + 15 * len(lows_below)), 1)
        return {
            "equal_highs": [round(c["level"], 4) for c in eq_highs],
            "equal_lows": [round(c["level"], 4) for c in eq_lows],
            "heat_map": heat[:10], "bias": bias, "strength": strength,
        }

    # ── Multi-timeframe confirmation (15m + 1h + 4h) ─────────────────────────
    @staticmethod
    def _trend(df) -> str:
        if df is None or len(df) < 55:
            return "neutral"
        close = df["close"]
        e20, e50 = _ema(close, 20).iloc[-1], _ema(close, 50).iloc[-1]
        last = float(close.iloc[-1])
        if last > e20 > e50:
            return "up"
        if last < e20 < e50:
            return "down"
        return "neutral"

    def mtf_confirmation(self, base_direction: str = None) -> dict:
        frames: dict[str, str] = {}
        try:
            df15 = _fetch_ohlcv(self.yf_symbol, "10d", "15m")
            frames["15m"] = self._trend(df15)
        except Exception:
            frames["15m"] = "neutral"
        try:
            df1h = _fetch_ohlcv(self.yf_symbol, "60d", "60m")
            frames["1h"] = self._trend(df1h)
            # Derive 4h by resampling 1h.
            df4h = df1h.resample("4h").agg({"open": "first", "high": "max",
                                            "low": "min", "close": "last",
                                            "volume": "sum"}).dropna()
            frames["4h"] = self._trend(df4h)
        except Exception:
            frames.setdefault("1h", "neutral")
            frames.setdefault("4h", "neutral")

        ref = base_direction or frames.get("15m", "neutral")
        if ref == "neutral":
            # Majority vote when the base timeframe is flat.
            ups = sum(1 for v in frames.values() if v == "up")
            downs = sum(1 for v in frames.values() if v == "down")
            ref = "up" if ups > downs else "down" if downs > ups else "neutral"
        aligned = sum(1 for v in frames.values() if v == ref and ref != "neutral")
        score = round(aligned / max(len(frames), 1) * 100, 1)
        return {"timeframes": frames, "reference": ref, "aligned": aligned,
                "count": len(frames), "score": score}

    # ── Full analysis → 0-100 conviction ─────────────────────────────────────
    def analyze(self, period: str = "10d", interval: str = "15m") -> dict:
        df = _fetch_ohlcv(self.yf_symbol, period, interval)
        # Structure computed on SESSION candles only (skip dead off-hours bars).
        active = df[[self.get_session(i) != "off-hours" for i in df.index]]
        struct_df = active if len(active) >= 60 else df

        structure = self.detect_structure(struct_df)
        obs = self.detect_order_blocks(struct_df)
        fvgs = self.detect_fvg(struct_df)
        liquidity = self.detect_liquidity(struct_df)
        mtf = self.mtf_confirmation(structure["direction"])

        last_ts = df.index[-1]
        session = self.get_session(last_ts)
        kill_zone = self.get_kill_zone(last_ts)
        kz_mult = self.kill_zone_multiplier(last_ts)

        direction = structure["direction"]
        if direction == "neutral":
            direction = mtf["reference"]

        # Component sub-scores (0-100) aligned with `direction`.
        def _dir_match(t):
            return t == direction and direction != "neutral"

        mtf_score = mtf["score"]
        ob_score = max([o["strength"] for o in obs
                        if (o["type"] == "bullish") == (direction == "up")], default=0.0) if obs else 0.0
        fvg_score = max([f["fill_probability"] for f in fvgs
                         if (f["type"] == "bullish") == (direction == "up")], default=0.0) if fvgs else 0.0
        liq_score = liquidity["strength"] if _dir_match(liquidity["bias"]) else 0.0
        sweep = liquidity["bias"] != "neutral"

        raw = (0.35 * mtf_score + 0.25 * ob_score + 0.15 * fvg_score +
               0.15 * liq_score + 0.10 * (100 if sweep else 0))
        conviction = round(min(100.0, raw * kz_mult), 1)

        return {
            "symbol": self.symbol,
            "direction": direction,
            "conviction_score": conviction,
            "session": session,
            "kill_zone": kill_zone,
            "kill_zone_multiplier": kz_mult,
            "structure": structure,
            "mtf": mtf,
            "order_blocks": obs,
            "fvgs": fvgs,
            "liquidity": liquidity,
            "generated_at": datetime.now(timezone.utc).isoformat() + "Z",
        }
