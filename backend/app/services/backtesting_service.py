"""
Professional-grade ICT/SMC Backtesting Engine for FinSight.

Strategies implemented (all based on ICT / Smart Money Concepts):
  1. BOS_FVG        — Break of Structure + Fair Value Gap (trend continuation)
  2. CHOCH_FVG      — Change of Character + FVG (reversal entry)
  3. MSS_OrderBlock — Market Structure Shift + Order Block (high-confidence)
  4. LiqSweep_FVG   — Liquidity Sweep + FVG (stop-hunt reversal)
  5. SR_Bounce      — Support/Resistance swing-level bounce
  6. RSI_OTE        — RSI confirmation in Optimal Trade Entry zone (62-79% retracement)
  7. PriceAction    — Engulfing / Hammer / Shooting-Star candlestick patterns + trend filter
  8. MA_FVG         — EMA 21/55 crossover + FVG confirmation

News filter: signals generated within ±30 min of a High/Medium impact event are skipped.

Run modes:
  - Single strategy: run_backtest(symbol, strategy="BOS_FVG", ...)
  - Leaderboard:     run_all_strategies(symbol, ...)  → ranked list of all 8 strategies
"""
from __future__ import annotations

import logging
import math
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# INDICATOR HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _ema(s: pd.Series, span: int) -> pd.Series:
    return s.ewm(span=span, adjust=False).mean()


def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    tr = pd.concat([
        high - low,
        (high - close.shift()).abs(),
        (low - close.shift()).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / period, adjust=False).mean()


def _swing_highs(high: pd.Series, lookback: int = 3) -> pd.Series:
    """True where the bar is the highest over ±lookback bars."""
    is_high = pd.Series(False, index=high.index)
    h = high.values
    for i in range(lookback, len(h) - lookback):
        window = h[i - lookback: i + lookback + 1]
        if h[i] == window.max() and list(window).count(h[i]) == 1:
            is_high.iloc[i] = True
    return is_high


def _swing_lows(low: pd.Series, lookback: int = 3) -> pd.Series:
    """True where the bar is the lowest over ±lookback bars."""
    is_low = pd.Series(False, index=low.index)
    l = low.values
    for i in range(lookback, len(l) - lookback):
        window = l[i - lookback: i + lookback + 1]
        if l[i] == window.min() and list(window).count(l[i]) == 1:
            is_low.iloc[i] = True
    return is_low


# ══════════════════════════════════════════════════════════════════════════════
# ICT / SMC SIGNAL GENERATORS
# Each returns a pd.Series of str: "BUY" | "SELL" | "HOLD"
# ══════════════════════════════════════════════════════════════════════════════

def _signals_bos_fvg(df: pd.DataFrame) -> pd.Series:
    """
    BOS + FVG: Price breaks the 10-bar recent high/low (structure break),
    and a Fair Value Gap (3-candle imbalance) was present on the previous bar.
    """
    recent_high = df["high"].rolling(10).max().shift(1)
    recent_low  = df["low"].rolling(10).min().shift(1)

    bos_long  = df["close"] > recent_high
    bos_short = df["close"] < recent_low

    fvg_bull = df["low"] > df["high"].shift(2)   # gap above: bullish momentum
    fvg_bear = df["high"] < df["low"].shift(2)   # gap below: bearish momentum

    sig = pd.Series("HOLD", index=df.index)
    sig[bos_long  & fvg_bull.shift(1)] = "BUY"
    sig[bos_short & fvg_bear.shift(1)] = "SELL"
    return sig


def _signals_choch_fvg(df: pd.DataFrame) -> pd.Series:
    """
    CHoCH + FVG: Change of Character detected by reversal of HH/LL pattern,
    confirmed by a Fair Value Gap.
    """
    # HH/LL detection
    hh = df["high"] > df["high"].shift(2)
    ll = df["low"]  < df["low"].shift(2)

    choch_long  = (~hh.shift(2).fillna(False).astype(bool)) & hh    # Was NOT making HH, now is
    choch_short = (~ll.shift(2).fillna(False).astype(bool)) & ll    # Was NOT making LL, now is

    fvg_bull = df["low"]  > df["high"].shift(2)
    fvg_bear = df["high"] < df["low"].shift(2)

    sig = pd.Series("HOLD", index=df.index)
    sig[choch_long  & fvg_bull.shift(1)] = "BUY"
    sig[choch_short & fvg_bear.shift(1)] = "SELL"
    return sig


def _signals_mss_orderblock(df: pd.DataFrame) -> pd.Series:
    """
    MSS + Order Block: Price is above/below EMA-200 (trend filter), and the
    last red-before-green (bullish OB) or green-before-red (bearish OB) candle
    fires a signal. Highest confidence setup.
    """
    red   = df["close"] < df["open"]   # bearish candle
    green = df["close"] > df["open"]   # bullish candle

    ob_bull = red & green.shift(-1)    # last red before impulsive green
    ob_bear = green & red.shift(-1)    # last green before impulsive red

    ema200 = _ema(df["close"], 200)
    above_ema = df["close"] > ema200
    below_ema = df["close"] < ema200

    sig = pd.Series("HOLD", index=df.index)
    sig[ob_bull & above_ema.shift(1)] = "BUY"
    sig[ob_bear & below_ema.shift(1)] = "SELL"
    return sig


def _signals_liq_sweep_fvg(df: pd.DataFrame) -> pd.Series:
    """
    Liquidity Sweep + FVG: Price sweeps a recent 5-bar high/low (stop hunt)
    but closes back on the other side (rejection), confirmed by a prior FVG.
    Classic ICT "stop hunt + displacement" entry.
    """
    recent_high = df["high"].rolling(5).max().shift(1)
    recent_low  = df["low"].rolling(5).min().shift(1)

    # Sweep: wick above level but close below (bull → sell stops then reverse)
    sweep_long  = (df["high"] > recent_high) & (df["close"] < recent_high)
    sweep_short = (df["low"]  < recent_low)  & (df["close"] > recent_low)

    fvg_bull = df["low"]  > df["high"].shift(2)
    fvg_bear = df["high"] < df["low"].shift(2)

    sig = pd.Series("HOLD", index=df.index)
    sig[sweep_long  & fvg_bull.shift(1)] = "BUY"
    sig[sweep_short & fvg_bear.shift(1)] = "SELL"
    return sig


def _signals_sr_bounce(df: pd.DataFrame) -> pd.Series:
    """
    S/R Bounce: Detects swing highs/lows as support/resistance levels.
    Enters when price is within 0.3% of a S/R level and the candle confirms.
    """
    sh = _swing_highs(df["high"], lookback=3)
    sl = _swing_lows(df["low"],   lookback=3)

    sig = pd.Series("HOLD", index=df.index)
    close = df["close"].values
    high_arr = df["high"].values
    low_arr  = df["low"].values
    sh_arr   = sh.values
    sl_arr   = sl.values

    # Collect S/R prices from prior swings
    resistance_prices: list[float] = []
    support_prices:    list[float] = []

    for i in range(len(df)):
        price = close[i]

        # Touch S/R → bounce signal
        for r in resistance_prices[-10:]:
            if abs(price - r) / r < 0.003 and price < r:   # at resistance, bearish
                sig.iloc[i] = "SELL"
                break
        for s in support_prices[-10:]:
            if abs(price - s) / s < 0.003 and price > s:   # at support, bullish
                sig.iloc[i] = "BUY"
                break

        # Update levels
        if sh_arr[i]:
            resistance_prices.append(high_arr[i])
        if sl_arr[i]:
            support_prices.append(low_arr[i])

    return sig


def _signals_rsi_ote(df: pd.DataFrame) -> pd.Series:
    """
    RSI + OTE (Optimal Trade Entry): After a BOS, price retraces 62-79% of
    the move. RSI must confirm direction (>50 for longs, <50 for shorts).
    The 70.5% Fibonacci "sweet spot" is the ideal entry.
    """
    rsi_ser    = _rsi(df["close"])
    ema20      = _ema(df["close"], 20)
    ema50      = _ema(df["close"], 50)

    # OTE zone: price between EMA20 and EMA50 (proxy for ~62-79% retracement)
    ote_long  = (df["close"] > ema50) & (df["close"] < ema20)   # pulled back into zone
    ote_short = (df["close"] < ema50) & (df["close"] > ema20)

    sig = pd.Series("HOLD", index=df.index)
    sig[ote_long  & (rsi_ser > 45)] = "BUY"
    sig[ote_short & (rsi_ser < 55)] = "SELL"
    return sig


def _signals_price_action(df: pd.DataFrame) -> pd.Series:
    """
    Price Action Patterns: Detects:
    - Bullish Engulfing + above EMA50 → BUY
    - Bearish Engulfing + below EMA50 → SELL
    - Hammer (long lower wick, small body) near support → BUY
    - Shooting Star (long upper wick) near resistance → SELL
    """
    o, h, l, c = df["open"], df["high"], df["low"], df["close"]
    body  = (c - o).abs()
    rng   = h - l
    ema50 = _ema(c, 50)

    # Engulfing
    bull_engulf = (c > o) & (c > o.shift(1)) & (o < c.shift(1)) & (c > o.shift(1))
    bear_engulf = (c < o) & (c < o.shift(1)) & (o > c.shift(1)) & (c < o.shift(1))

    # Hammer: small body in upper 30%, long lower wick (≥2× body)
    lower_wick = (o.clip(lower=c) - l)
    upper_wick = (h - o.clip(lower=c))
    hammer       = (lower_wick >= 2 * body) & (body < 0.3 * rng) & (c > o)
    shooting_star = (upper_wick >= 2 * body) & (body < 0.3 * rng) & (c < o)

    sig = pd.Series("HOLD", index=df.index)
    sig[(bull_engulf | hammer) & (c > ema50)] = "BUY"
    sig[(bear_engulf | shooting_star) & (c < ema50)] = "SELL"
    return sig


def _signals_ma_fvg(df: pd.DataFrame) -> pd.Series:
    """
    EMA21/55 Crossover + FVG: MA crossover gives directional bias,
    FVG on prior bar confirms institutional momentum.
    """
    ema21 = _ema(df["close"], 21)
    ema55 = _ema(df["close"], 55)

    cross_long  = (ema21 > ema55) & (ema21.shift(1) <= ema55.shift(1))
    cross_short = (ema21 < ema55) & (ema21.shift(1) >= ema55.shift(1))

    fvg_bull = df["low"]  > df["high"].shift(2)
    fvg_bear = df["high"] < df["low"].shift(2)

    sig = pd.Series("HOLD", index=df.index)
    sig[cross_long  & fvg_bull.shift(1)] = "BUY"
    sig[cross_short & fvg_bear.shift(1)] = "SELL"
    return sig


# Registry of available strategies
STRATEGY_REGISTRY: dict[str, callable] = {
    "BOS_FVG":        _signals_bos_fvg,
    "CHOCH_FVG":      _signals_choch_fvg,
    "MSS_OrderBlock": _signals_mss_orderblock,
    "LiqSweep_FVG":   _signals_liq_sweep_fvg,
    "SR_Bounce":      _signals_sr_bounce,
    "RSI_OTE":        _signals_rsi_ote,
    "PriceAction":    _signals_price_action,
    "MA_FVG":         _signals_ma_fvg,
}


# ══════════════════════════════════════════════════════════════════════════════
# NEWS FILTER — skip signals within ±30 min of High/Medium impact events
# ══════════════════════════════════════════════════════════════════════════════

def _build_news_blackout(df: pd.DataFrame) -> set[str]:
    """
    Return a set of date strings (YYYY-MM-DD) that fall near known recurring
    High/Medium impact events.  For daily bars, we exclude the whole day.
    For intraday, we'd exclude ±30 min around known event times.

    Since we pull daily bars for backtesting, we blackout the entire day
    on which major scheduled releases fall in the US calendar.
    Major US events: NFP (1st Friday of month), FOMC (8× per year),
    CPI (~mid-month Tuesday).
    """
    # We use a rough heuristic: blackout the first Friday of each month (NFP)
    # and any date that happens to be a Wednesday in months when FOMC meets.
    blackout: set[str] = set()

    if df.empty:
        return blackout

    start = df.index[0].date() if hasattr(df.index[0], 'date') else df.index[0]
    end   = df.index[-1].date() if hasattr(df.index[-1], 'date') else df.index[-1]

    current = start
    while current <= end:
        # First Friday of month → NFP day
        if current.weekday() == 4:  # Friday
            # Is it in the first 7 days?
            if current.day <= 7:
                blackout.add(str(current))

        # ~8 FOMC dates per year: heuristic — 3rd Wednesday of every 6-week cycle
        # Approximation: 3rd Wednesday of Jan, Mar, May, Jun, Jul, Sep, Nov, Dec
        fomc_months = {1, 3, 5, 6, 7, 9, 11, 12}
        if current.month in fomc_months and current.weekday() == 2:
            # Is it the 3rd Wednesday (day 15-21)?
            if 15 <= current.day <= 21:
                blackout.add(str(current))

        # Mid-month Tuesday (13th-16th) → typical CPI release
        if current.weekday() == 1 and 13 <= current.day <= 16:
            blackout.add(str(current))

        current += timedelta(days=1)

    return blackout


# ══════════════════════════════════════════════════════════════════════════════
# TRADE SIMULATOR
# ══════════════════════════════════════════════════════════════════════════════

def _session_end_of_day(ts, interval: str) -> bool:
    """True if this bar is the LAST bar of the trading session for the given interval."""
    if interval == "1d":
        return False  # daily bars: no intraday session exit
    # For intraday: session ends when the NEXT bar is a different calendar date
    # (handled in _simulate_trades by peeking at the next index)
    return False  # placeholder — logic is inline in _simulate_trades


def _close_position(
    position: dict,
    exit_price: float,
    exit_date: str,
    exit_reason: str,
    capital: float,
) -> tuple[dict, float]:
    """Compute P&L for closing a position and return (trade_dict, new_capital)."""
    ep = position["entry"]
    sl = position["sl"]
    sl_dist = abs(ep - sl) / ep if ep != sl else 0.02
    risk_amt = capital * 0.02
    units = risk_amt / (sl_dist * ep) if sl_dist > 0 else 0

    if position["side"] == "LONG":
        pnl     = units * (exit_price - ep)
        pnl_pct = (exit_price - ep) / ep * 100
    else:
        pnl     = units * (ep - exit_price)
        pnl_pct = (ep - exit_price) / ep * 100

    trade = {
        "entry_date":  position["entry_date"],
        "exit_date":   exit_date,
        "side":        position["side"],
        "entry":       round(ep, 4),
        "exit":        round(exit_price, 4),
        "pnl":         round(pnl, 2),
        "pnl_pct":     round(pnl_pct, 2),
        "exit_reason": exit_reason,
        "strategy":    position.get("strategy", ""),
    }
    return trade, capital + pnl


def _simulate_trades(
    df: pd.DataFrame,
    signals: pd.Series,
    initial_capital: float,
    sl_atr_mult: float,
    tp_atr_mult: float,
    allow_short: bool,
    blackout_dates: set[str],
    interval: str = "1h",
) -> tuple[list[float], list[dict]]:
    """
    Walk-forward simulation.
    Risk: 2% of current equity per trade.
    Exit: SL hit, TP hit, opposing signal, or end-of-session (intraday only).

    For intraday intervals (1h, 15m, etc.) each position is closed at the last
    bar of its trading session so trades never carry overnight — consistent with
    actual ICT/SMC discipline.
    """
    intraday = interval != "1d"

    df = df.copy()
    df["atr"]    = _atr(df["high"], df["low"], df["close"])
    df["signal"] = signals

    # Pre-compute date string for each bar (YYYY-MM-DD)
    dates = [str(ts)[:10] for ts in df.index]

    capital = initial_capital
    equity: list[float] = []
    trades: list[dict] = []
    position: Optional[dict] = None
    rows = df.values
    cols = {c: i for i, c in enumerate(df.columns)}

    n = len(df)
    for i in range(n):
        price   = float(rows[i][cols["close"]])
        atr_raw = rows[i][cols["atr"]]
        atr_val = float(atr_raw) if pd.notna(atr_raw) and atr_raw > 0 else price * 0.02
        sig      = rows[i][cols["signal"]]
        date_str = dates[i]

        # ── Intraday EOD exit: last bar of day before midnight rollover ────
        is_last_bar_of_day = (
            intraday and (i == n - 1 or dates[i + 1] != date_str)
        )

        # ── Check exit ────────────────────────────────────────────────────
        if position is not None:
            hit_sl = (
                (position["side"] == "LONG"  and price <= position["sl"]) or
                (position["side"] == "SHORT" and price >= position["sl"])
            )
            hit_tp = (
                (position["side"] == "LONG"  and price >= position["tp"]) or
                (position["side"] == "SHORT" and price <= position["tp"])
            )
            opposing = (
                (position["side"] == "LONG"  and sig == "SELL") or
                (position["side"] == "SHORT" and sig == "BUY")
            )
            eod_exit = intraday and is_last_bar_of_day

            if hit_sl or hit_tp or opposing or eod_exit:
                reason     = "SL" if hit_sl else ("TP" if hit_tp else ("Signal" if opposing else "EOD"))
                exit_price = position["sl"] if hit_sl else (position["tp"] if hit_tp else price)
                trade, capital = _close_position(position, exit_price, date_str, reason, capital)
                trades.append(trade)
                position = None

        # ── Enter new position (skip news blackout, skip if EOD bar) ──────
        if position is None and date_str not in blackout_dates and not is_last_bar_of_day:
            if sig == "BUY":
                sl_p = price - sl_atr_mult * atr_val
                tp_p = price + tp_atr_mult * atr_val
                position = {
                    "side": "LONG", "entry": price, "sl": sl_p, "tp": tp_p,
                    "entry_date": date_str, "strategy": signals.name or "",
                }
            elif sig == "SELL" and allow_short:
                sl_p = price + sl_atr_mult * atr_val
                tp_p = price - tp_atr_mult * atr_val
                position = {
                    "side": "SHORT", "entry": price, "sl": sl_p, "tp": tp_p,
                    "entry_date": date_str, "strategy": signals.name or "",
                }

        equity.append(round(capital, 2))

    # Close any open position at last bar
    if position is not None:
        lp = float(df["close"].iloc[-1])
        trade, capital = _close_position(position, lp, dates[-1], "EOD", capital)
        trades.append(trade)
        equity.append(round(capital, 2))

    return equity, trades


# ══════════════════════════════════════════════════════════════════════════════
# METRICS
# ══════════════════════════════════════════════════════════════════════════════

_BARS_PER_YEAR: dict[str, float] = {
    "1d":  252.0,
    "1h":  252.0 * 6.5,        # ~1638
    "30m": 252.0 * 6.5 * 2,    # ~3276
    "15m": 252.0 * 6.5 * 4,    # ~6552
    "5m":  252.0 * 6.5 * 12,   # ~19656
}


def _compute_metrics(
    equity: list[float],
    trades: list[dict],
    initial_capital: float,
    df_len: int,
    interval: str = "1h",
) -> dict:
    if not equity:
        return {
            "total_return_pct": 0.0, "sharpe_ratio": 0.0, "max_drawdown_pct": 0.0,
            "win_rate_pct": 0.0, "profit_factor": 0.0, "total_trades": 0,
            "winning_trades": 0, "losing_trades": 0, "avg_trade_pct": 0.0,
            "calmar_ratio": 0.0,
        }

    bars_per_year = _BARS_PER_YEAR.get(interval, 252.0)

    final_capital = equity[-1]
    eq_arr = np.array(equity, dtype=float)
    bar_rets = np.diff(eq_arr) / np.maximum(eq_arr[:-1], 1e-10)

    total_return = (final_capital - initial_capital) / initial_capital * 100

    sharpe = 0.0
    if len(bar_rets) > 1 and bar_rets.std() > 1e-10:
        sharpe = float(bar_rets.mean() / bar_rets.std() * math.sqrt(bars_per_year))

    running_max = np.maximum.accumulate(eq_arr)
    drawdowns   = (eq_arr - running_max) / np.maximum(running_max, 1e-10)
    max_dd      = float(drawdowns.min()) * 100

    # Annualised return for Calmar (correct for any interval)
    years = max(df_len / bars_per_year, 1e-6)
    ann_ret = ((final_capital / initial_capital) ** (1 / years) - 1) * 100
    calmar  = ann_ret / abs(max_dd) if max_dd != 0 else 0.0

    win_trades  = [t for t in trades if t["pnl"] > 0]
    lose_trades = [t for t in trades if t["pnl"] <= 0]
    win_rate    = len(win_trades) / len(trades) * 100 if trades else 0.0

    gross_profit = sum(t["pnl"] for t in win_trades)
    gross_loss   = abs(sum(t["pnl"] for t in lose_trades))
    pf = gross_profit / gross_loss if gross_loss > 0 else (999.0 if gross_profit > 0 else 0.0)

    avg_trade_pct = (sum(t["pnl_pct"] for t in trades) / len(trades)) if trades else 0.0

    return {
        "total_return_pct":  round(total_return, 2),
        "sharpe_ratio":      round(sharpe, 3),
        "max_drawdown_pct":  round(max_dd, 2),
        "win_rate_pct":      round(win_rate, 2),
        "profit_factor":     round(min(pf, 999.0), 3),
        "total_trades":      len(trades),
        "winning_trades":    len(win_trades),
        "losing_trades":     len(lose_trades),
        "avg_trade_pct":     round(avg_trade_pct, 3),
        "calmar_ratio":      round(calmar, 3),
    }


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ══════════════════════════════════════════════════════════════════════════════

def _fetch_ohlcv(symbol: str, period: str, interval: str = "1h") -> pd.DataFrame:
    """
    Fetch and normalise OHLCV data from yfinance.

    yfinance interval limits:
      1m  → max 7d   (too short for ICT backtest)
      5m  → max 60d
      15m → max 60d
      30m → max 60d
      1h  → max 730d (~2 years) — DEFAULT for ICT/SMC
      1d  → unlimited
    """
    # Cap period to yfinance limits per interval
    _caps = {"1m": "7d", "5m": "60d", "15m": "60d", "30m": "60d", "1h": "730d", "90m": "60d"}
    if interval in _caps:
        # Convert both to days for comparison
        def _to_days(p: str) -> int:
            p = p.lower().strip()
            if p.endswith("d"):  return int(p[:-1])
            if p.endswith("mo"): return int(p[:-2]) * 30
            if p.endswith("y"):  return int(p[:-1]) * 365
            return 9999
        cap = _caps[interval]
        if _to_days(period) > _to_days(cap):
            period = cap

    # Map spot/TradingView tickers (XAUUSD=X, USOIL, …) to a symbol that
    # returns intraday data (futures proxy for spot metals/oil).
    from app.services.market_data_service import resolve_symbol
    from app.services import tradingview_service as tv
    yf_symbol = resolve_symbol(symbol)
    # Route through the TradingView service (TV-first when enabled, yfinance
    # fallback) — returns a yfinance-shaped DataFrame.
    df = tv.get_ohlcv_df(yf_symbol, period=period, interval=interval)
    if df.empty or len(df) < 60:
        raise ValueError(
            f"Insufficient data for {symbol} (period={period}, interval={interval}). Need ≥60 bars."
        )
    df.columns = [c.lower() for c in df.columns]
    df = df[["open", "high", "low", "close", "volume"]].copy()
    df.dropna(inplace=True)
    return df


def run_backtest(
    symbol: str,
    strategy: str = "BOS_FVG",
    period: str = "2y",
    initial_capital: float = 10_000.0,
    sl_atr_mult: float = 1.5,
    tp_atr_mult: float = 2.5,
    allow_short: bool = False,
    filter_news: bool = True,
    interval: str = "1h",
) -> dict:
    """
    Run a single-strategy ICT/SMC backtest.

    Parameters
    ----------
    symbol          : Ticker (e.g. "AAPL", "TCS.NS", "BTC-USD")
    strategy        : One of STRATEGY_REGISTRY keys (default "BOS_FVG")
    period          : yfinance period string ("1y", "2y") — capped by interval limits
    initial_capital : Starting equity
    sl_atr_mult     : ATR multiplier for stop-loss (1.5 default)
    tp_atr_mult     : ATR multiplier for take-profit (2.5 default = 1:1.67 R:R)
    allow_short     : Allow SELL signals to open short positions
    filter_news     : Skip entries on known High/Medium news release days
    interval        : Bar timeframe — "1h" (default), "15m", "30m", "1d"
    """
    if strategy not in STRATEGY_REGISTRY:
        raise ValueError(f"Unknown strategy '{strategy}'. Available: {list(STRATEGY_REGISTRY.keys())}")

    df = _fetch_ohlcv(symbol, period, interval=interval)

    # Build news blackout set
    blackout = _build_news_blackout(df) if filter_news else set()

    # Generate signals
    signal_fn = STRATEGY_REGISTRY[strategy]
    signals   = signal_fn(df)
    signals.name = strategy

    equity, trades = _simulate_trades(
        df, signals, initial_capital, sl_atr_mult, tp_atr_mult, allow_short, blackout,
        interval=interval,
    )

    metrics = _compute_metrics(equity, trades, initial_capital, len(df), interval=interval)
    final_capital = equity[-1] if equity else initial_capital

    # Equity curve (cap at 500 points)
    eq_dates = [str(ts)[:10] for ts in df.index[-len(equity):]]
    equity_curve = [{"date": d, "equity": e} for d, e in zip(eq_dates, equity)]
    step = max(1, len(equity_curve) // 500)
    equity_curve = equity_curve[::step]

    return {
        "symbol":          symbol,
        "strategy":        strategy,
        "period":          period,
        "interval":        interval,
        "initial_capital": initial_capital,
        "final_capital":   round(final_capital, 2),
        "metrics":         metrics,
        "equity_curve":    equity_curve,
        "trades":          trades[-100:],     # last 100 trades
        "news_filter":     filter_news,
        "blackout_days":   len(blackout),
        "data_bars":       len(df),
    }


def run_all_strategies(
    symbol: str,
    period: str = "2y",
    initial_capital: float = 10_000.0,
    sl_atr_mult: float = 1.5,
    tp_atr_mult: float = 2.5,
    allow_short: bool = False,
    filter_news: bool = True,
    interval: str = "1h",
) -> dict:
    """
    Run all 8 ICT/SMC strategies on the same dataset and return a leaderboard
    ranked by Sharpe ratio.

    Returns
    -------
    {
      "symbol": "AAPL",
      "period": "5y",
      "data_bars": 1259,
      "leaderboard": [
        { "rank": 1, "strategy": "MSS_OrderBlock", "metrics": {...}, "equity_curve": [...] },
        ...
      ],
      "best_strategy": "MSS_OrderBlock",
      "trades": [...]    # trades of the best strategy
    }
    """
    df = _fetch_ohlcv(symbol, period, interval=interval)
    blackout = _build_news_blackout(df) if filter_news else set()

    leaderboard = []
    best_equity_curve: list[dict] = []
    best_trades: list[dict] = []
    best_sharpe = -99.0
    best_name   = ""

    for name, signal_fn in STRATEGY_REGISTRY.items():
        try:
            signals = signal_fn(df)
            signals.name = name
            equity, trades = _simulate_trades(
                df, signals, initial_capital, sl_atr_mult, tp_atr_mult, allow_short, blackout,
                interval=interval,
            )
            metrics = _compute_metrics(equity, trades, initial_capital, len(df), interval=interval)

            # Equity curve (capped at 250 pts per strategy for leaderboard response)
            eq_dates = [str(ts)[:10] for ts in df.index[-len(equity):]]
            eq_curve = [{"date": d, "equity": e} for d, e in zip(eq_dates, equity)]
            step = max(1, len(eq_curve) // 250)
            eq_curve = eq_curve[::step]

            leaderboard.append({
                "strategy":     name,
                "metrics":      metrics,
                "equity_curve": eq_curve,
                "trade_count":  len(trades),
            })

            if metrics["sharpe_ratio"] > best_sharpe:
                best_sharpe       = metrics["sharpe_ratio"]
                best_name         = name
                best_equity_curve = eq_curve
                best_trades       = trades[-100:]

        except Exception as e:
            logger.warning(f"Strategy {name} failed for {symbol}: {e}")
            leaderboard.append({
                "strategy": name,
                "metrics":  {"error": str(e)},
                "equity_curve": [],
                "trade_count": 0,
            })

    # Sort by Sharpe (descending), errors last
    leaderboard.sort(
        key=lambda x: x["metrics"].get("sharpe_ratio", -999),
        reverse=True
    )
    for i, item in enumerate(leaderboard):
        item["rank"] = i + 1

    return {
        "symbol":          symbol,
        "period":          period,
        "interval":        interval,
        "initial_capital": initial_capital,
        "data_bars":       len(df),
        "news_filter":     filter_news,
        "blackout_days":   len(blackout),
        "leaderboard":     leaderboard,
        "best_strategy":   best_name,
        "equity_curve":    best_equity_curve,
        "trades":          best_trades,
    }


# ══════════════════════════════════════════════════════════════════════════════
# UNIVERSE — curated multi-asset symbol list for global strategy ranking
# ══════════════════════════════════════════════════════════════════════════════

UNIVERSE: dict[str, list[str]] = {
    "US_STOCKS":   ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "NFLX", "JPM", "GS"],
    "IN_STOCKS":   ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS", "WIPRO.NS", "ITC.NS"],
    "FOREX":       ["EURUSD=X", "GBPUSD=X", "USDJPY=X", "AUDUSD=X", "USDCAD=X"],
    "CRYPTO":      ["BTC-USD", "ETH-USD", "SOL-USD"],
    "COMMODITIES": ["GC=F", "CL=F", "SI=F"],
}

# ══════════════════════════════════════════════════════════════════════════════
# LIVE SIGNAL — apply strategy to the last bar of recent data
# ══════════════════════════════════════════════════════════════════════════════

def get_live_signal(symbol: str, strategy: str = "MSS_OrderBlock") -> dict:
    """
    Apply a single ICT strategy to the most recent 3 months of data and return
    the current bar's signal with computed entry / SL / TP levels.

    Parameters
    ----------
    symbol   : yfinance ticker (any market: AAPL, INFY.NS, BTC-USD, GC=F ...)
    strategy : one of STRATEGY_REGISTRY keys
    """
    if strategy not in STRATEGY_REGISTRY:
        raise ValueError(f"Unknown strategy '{strategy}'. Valid: {list(STRATEGY_REGISTRY.keys())}")

    # ICT/SMC is intraday only — use 15m bars over the last 30d (~750 bars)
    # so signals reflect today's session structure, not last week's daily candle.
    df = _fetch_ohlcv(symbol, "30d", interval="15m")
    signals     = STRATEGY_REGISTRY[strategy](df)
    current_sig = str(signals.iloc[-1])
    atr_val     = float(_atr(df["high"], df["low"], df["close"]).iloc[-1])
    price       = float(df["close"].iloc[-1])
    direction   = 1 if current_sig == "BUY" else (-1 if current_sig == "SELL" else 0)

    return {
        "symbol":       symbol.upper(),
        "strategy":     strategy,
        "signal":       current_sig,
        "price":        round(price, 4),
        "entry":        round(price, 4),
        "sl":           round(price - direction * 1.5 * atr_val, 4),
        "tp":           round(price + direction * 2.5 * atr_val, 4),
        "atr":          round(atr_val, 4),
        "generated_at": datetime.now(timezone.utc).isoformat() + "Z",
    }


# ══════════════════════════════════════════════════════════════════════════════
# UNIVERSE LEADERBOARD — aggregate strategy performance across all assets
# ══════════════════════════════════════════════════════════════════════════════

_universe_cache: dict | None = None
_universe_cache_ts: float = 0.0
UNIVERSE_CACHE_TTL = 86400.0   # 24 hours


def run_universe_leaderboard(
    period: str = "5y",
    filter_news: bool = True,
    force: bool = False,
) -> dict:
    """
    Run all 8 ICT strategies across the full UNIVERSE symbol list (5Y data),
    aggregate results by strategy (mean Sharpe, mean return, win-rate),
    and return global strategy rankings plus per-symbol best-strategy map.

    Results are cached in-process for 24 hours because this operation
    can take 2-5 minutes on first run (~224 individual backtests).

    Parameters
    ----------
    force : bypass cache and recompute (used after new symbol is added)
    """
    global _universe_cache, _universe_cache_ts

    if not force and _universe_cache and (time.time() - _universe_cache_ts) < UNIVERSE_CACHE_TTL:
        return _universe_cache

    all_symbols = [s for syms in UNIVERSE.values() for s in syms]
    strategy_names = list(STRATEGY_REGISTRY.keys())

    # strategy_name → list of per-symbol metric dicts
    agg: dict[str, list[dict]] = {name: [] for name in strategy_names}
    per_symbol_best: list[dict] = []

    total = len(all_symbols)
    for idx, sym in enumerate(all_symbols):
        asset_class = next(
            (k for k, v in UNIVERSE.items() if sym in v), "UNKNOWN"
        )
        logger.info(f"[Universe] {sym} ({idx+1}/{total})")
        try:
            result = run_all_strategies(sym, period="2y", interval="1h", filter_news=filter_news)
            lb = result["leaderboard"]
            # Collect metrics per strategy
            for entry in lb:
                m = entry.get("metrics", {})
                if "error" not in m:
                    agg[entry["strategy"]].append({
                        "symbol":           sym,
                        "asset_class":      asset_class,
                        "sharpe":           m.get("sharpe_ratio", 0),
                        "return_pct":       m.get("total_return_pct", 0),
                        "win_rate":         m.get("win_rate_pct", 0),
                        "max_drawdown":     m.get("max_drawdown_pct", 0),
                        "total_trades":     m.get("total_trades", 0),
                    })
            # Record best strategy per symbol
            if lb:
                best = lb[0]
                per_symbol_best.append({
                    "symbol":       sym,
                    "asset_class":  asset_class,
                    "best_strategy": best["strategy"],
                    "sharpe":        best["metrics"].get("sharpe_ratio", 0),
                    "return_pct":    best["metrics"].get("total_return_pct", 0),
                })
        except Exception as e:
            logger.warning(f"[Universe] {sym} failed: {e}")

    # Aggregate per-strategy across all symbols
    global_rankings = []
    for name in strategy_names:
        rows = agg[name]
        if not rows:
            continue
        sharpes    = [r["sharpe"] for r in rows]
        returns    = [r["return_pct"] for r in rows]
        win_rates  = [r["win_rate"] for r in rows]
        drawdowns  = [r["max_drawdown"] for r in rows]
        global_rankings.append({
            "strategy":          name,
            "symbols_tested":    len(rows),
            "avg_sharpe":        round(sum(sharpes) / len(sharpes), 3),
            "median_sharpe":     round(sorted(sharpes)[len(sharpes) // 2], 3),
            "avg_return_pct":    round(sum(returns) / len(returns), 2),
            "avg_win_rate":      round(sum(win_rates) / len(win_rates), 1),
            "avg_max_drawdown":  round(sum(drawdowns) / len(drawdowns), 2),
            "per_symbol":        rows,   # detailed breakdown
        })

    global_rankings.sort(key=lambda x: x["avg_sharpe"], reverse=True)
    for i, r in enumerate(global_rankings):
        r["rank"] = i + 1

    top_strategies = [r["strategy"] for r in global_rankings[:3]]

    result = {
        "period":           period,
        "symbols_tested":   len(all_symbols),
        "universe":         UNIVERSE,
        "global_rankings":  global_rankings,
        "top_strategies":   top_strategies,        # best 3 by avg Sharpe
        "per_symbol_best":  per_symbol_best,
        "computed_at":      datetime.now(timezone.utc).isoformat() + "Z",
    }

    _universe_cache    = result
    _universe_cache_ts = time.time()
    logger.info(f"[Universe] leaderboard complete. Top strategies: {top_strategies}")
    return result
