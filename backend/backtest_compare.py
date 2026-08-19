"""
Compare old vs new SL logic on historical signal data.

Old logic: Fixed 1.5×ATR SL / 2.5×ATR TP, SL never moves
New logic: Structure-aware SL (OB/FVG/swing), min 1.0×ATR floor, trailing to breakeven at 1.5R

Run:  cd backend && python backtest_compare.py
"""
from __future__ import annotations

import json
import sys
import io
import math
from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np
import pandas as pd

# Ensure UTF-8 output on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from app.services.backtesting_service import (
    _fetch_ohlcv, _atr, _ema, _swing_highs, _swing_lows,
    _signals_mss_orderblock, _signals_bos_fvg, _signals_rsi_ote,
    _signals_liq_sweep_fvg, _signals_sr_bounce, _signals_price_action,
    _signals_choch_fvg, _signals_ma_fvg,
    STRATEGY_REGISTRY, _compute_ict_levels,
)


# ── Old-style simulation (fixed ATR SL/TP, no trailing) ──────────────────────
def _simulate_old(
    df: pd.DataFrame,
    signals: pd.Series,
    sl_mult: float = 1.5,
    tp_mult: float = 2.5,
) -> list[dict]:
    """Walk-forward: fixed ATR-based SL/TP, no trailing, intraday close."""
    df = df.copy()
    df["atr"] = _atr(df["high"], df["low"], df["close"])
    df["signal"] = signals

    dates = [str(ts)[:10] for ts in df.index]
    trades: list[dict] = []
    position: Optional[dict] = None
    rows = df.values
    cols = {c: i for i, c in enumerate(df.columns)}
    n = len(df)

    for i in range(n):
        price = float(rows[i][cols["close"]])
        high = float(rows[i][cols["high"]])
        low = float(rows[i][cols["low"]])
        atr_val = float(rows[i][cols["atr"]])
        sig = rows[i][cols["signal"]]
        date_str = dates[i]
        is_eod = i == n - 1 or dates[i + 1] != date_str

        if position is not None:
            side = position["side"]
            hit_sl = (side == "LONG" and low <= position["sl"]) or \
                     (side == "SHORT" and high >= position["sl"])
            hit_tp = (side == "LONG" and high >= position["tp"]) or \
                     (side == "SHORT" and low <= position["tp"])
            opposing = (side == "LONG" and sig == "SELL") or (side == "SHORT" and sig == "BUY")

            if hit_sl or hit_tp or opposing or is_eod:
                reason = "SL" if hit_sl else ("TP" if hit_tp else ("Signal" if opposing else "EOD"))
                exit_price = position["sl"] if hit_sl else (position["tp"] if hit_tp else price)
                rr = _calc_rr(position, exit_price)
                trades.append({
                    **position,
                    "exit_date": date_str,
                    "exit_price": round(exit_price, 4),
                    "exit_reason": reason,
                    "pnl_r": round(rr, 2),
                    "sl_source": "fixed_atr",
                })
                position = None

        if position is None and not is_eod:
            if sig == "BUY":
                sl_p = price - sl_mult * atr_val
                tp_p = price + tp_mult * atr_val
                position = {"side": "LONG", "entry": price, "sl": sl_p, "tp": tp_p,
                            "entry_date": date_str, "strategy": signals.name or "",
                            "atr": atr_val, "risk": price - sl_p}
            elif sig == "SELL":
                sl_p = price + sl_mult * atr_val
                tp_p = price - tp_mult * atr_val
                position = {"side": "SHORT", "entry": price, "sl": sl_p, "tp": tp_p,
                            "entry_date": date_str, "strategy": signals.name or "",
                            "atr": atr_val, "risk": sl_p - price}

    if position is not None:
        lp = float(df["close"].iloc[-1])
        rr = _calc_rr(position, lp)
        trades.append({**position, "exit_date": dates[-1], "exit_price": round(lp, 4),
                       "exit_reason": "EOD", "pnl_r": round(rr, 2), "sl_source": "fixed_atr"})
    return trades


# ── New-style simulation (structure-aware SL + trailing to breakeven) ─────────
def _simulate_new(
    df: pd.DataFrame,
    signals: pd.Series,
    strategy_name: str,
) -> list[dict]:
    """Walk-forward: structure-aware SL/TP from _compute_ict_levels,
    trailing SL moves to breakeven when peak R >= 1.5."""
    df = df.copy()
    df["atr"] = _atr(df["high"], df["low"], df["close"])
    df["signal"] = signals

    dates = [str(ts)[:10] for ts in df.index]
    trades: list[dict] = []
    position: Optional[dict] = None
    rows = df.values
    cols = {c: i for i, c in enumerate(df.columns)}
    n = len(df)

    BE_TRIGGER = 1.5  # move SL to breakeven after 1.5R unrealized

    for i in range(n):
        price = float(rows[i][cols["close"]])
        high = float(rows[i][cols["high"]])
        low = float(rows[i][cols["low"]])
        atr_val = float(rows[i][cols["atr"]]) if pd.notna(rows[i][cols["atr"]]) else price * 0.02
        sig = rows[i][cols["signal"]]
        date_str = dates[i]
        is_eod = i == n - 1 or dates[i + 1] != date_str

        if position is not None:
            side = position["side"]
            risk = position["risk"]

            # ── Track best unrealized R for trailing ──
            if side == "LONG":
                unrealized = (high - position["entry"]) / risk if risk > 0 else 0
            else:
                unrealized = (position["entry"] - low) / risk if risk > 0 else 0
            if unrealized > position.get("best_r", 0):
                position["best_r"] = unrealized

            # ── Trailing: move SL to breakeven ──
            effective_sl = position["sl"]
            if position.get("best_r", 0) >= BE_TRIGGER:
                effective_sl = position["entry"]  # breakeven

            hit_sl = (side == "LONG" and low <= effective_sl) or \
                     (side == "SHORT" and high >= effective_sl)
            hit_tp = (side == "LONG" and high >= position["tp"]) or \
                     (side == "SHORT" and low <= position["tp"])
            opposing = (side == "LONG" and sig == "SELL") or (side == "SHORT" and sig == "BUY")

            if hit_sl or hit_tp or opposing or is_eod:
                reason = "SL" if hit_sl else ("TP" if hit_tp else ("Signal" if opposing else "EOD"))
                exit_price = effective_sl if hit_sl else (position["tp"] if hit_tp else price)

                # If SL was trailed to breakeven, pnl = 0
                if hit_sl and abs(effective_sl - position["entry"]) < risk * 0.01:
                    rr = 0.0
                else:
                    rr = _calc_rr({"side": side, "entry": position["entry"],
                                   "sl": position["sl"], "tp": position["tp"]}, exit_price)

                trades.append({
                    **{k: v for k, v in position.items() if k != "best_r"},
                    "exit_date": date_str,
                    "exit_price": round(exit_price, 4),
                    "exit_reason": reason,
                    "pnl_r": round(rr, 2),
                    "sl_source": position.get("sl_source", "structure"),
                    "trailed": effective_sl != position["sl"],
                    "best_r": round(position.get("best_r", 0), 2),
                })
                position = None

        if position is None and not is_eod and atr_val > 0:
            if sig in ("BUY", "SELL"):
                levels = _compute_ict_levels(df.iloc[:i + 1], sig, price, atr_val, strategy_name)
                sl_level = levels["sl"] or (price - 1.5 * atr_val if sig == "BUY" else price + 1.5 * atr_val)
                # SL: structure-aware, but only use if in 1.0-2.0×ATR range
                risk = abs(price - sl_level)
                if risk < 1.0 * atr_val:
                    # Structure SL too tight — widen to minimum
                    if sig == "BUY":
                        sl_level = price - 1.0 * atr_val
                    else:
                        sl_level = price + 1.0 * atr_val
                elif risk > 2.0 * atr_val:
                    # Structure SL too wide — fall back to fixed ATR (1.5×)
                    if sig == "BUY":
                        sl_level = price - 1.5 * atr_val
                    else:
                        sl_level = price + 1.5 * atr_val
                risk = abs(price - sl_level)
                # TP: always 2.5× ATR from entry
                tp_level = price + 2.5 * atr_val if sig == "BUY" else price - 2.5 * atr_val

                position = {
                    "side": "LONG" if sig == "BUY" else "SHORT",
                    "entry": price, "sl": sl_level, "tp": tp_level,
                    "entry_date": date_str, "strategy": strategy_name,
                    "atr": atr_val, "risk": risk,
                    "sl_source": levels["sl_source"],
                    "tp_source": "atr_2.5x",
                    "best_r": 0.0,
                }

    if position is not None:
        lp = float(df["close"].iloc[-1])
        risk = position["risk"]
        if position["side"] == "LONG":
            rr = (lp - position["entry"]) / risk if risk > 0 else 0
        else:
            rr = (position["entry"] - lp) / risk if risk > 0 else 0
        trades.append({**{k: v for k, v in position.items() if k != "best_r"},
                       "exit_date": dates[-1], "exit_price": round(lp, 4),
                       "exit_reason": "EOD", "pnl_r": round(rr, 2),
                       "sl_source": position.get("sl_source", "structure"),
                       "trailed": False, "best_r": round(position.get("best_r", 0), 2)})
    return trades


def _calc_rr(pos: dict, exit_price: float) -> float:
    """Compute R-multiple for a trade."""
    risk = pos.get("risk", abs(pos["entry"] - pos["sl"]))
    if risk <= 0:
        return 0.0
    if pos["side"] == "LONG":
        return (exit_price - pos["entry"]) / risk
    else:
        return (pos["entry"] - exit_price) / risk


def _summarize(trades: list[dict], label: str) -> dict:
    """Compute summary stats for a list of trades."""
    if not trades:
        return {"label": label, "total": 0}

    wins = [t for t in trades if t["pnl_r"] > 0]
    losses = [t for t in trades if t["pnl_r"] < 0]
    breakevens = [t for t in trades if t["pnl_r"] == 0]

    total_pnl = sum(t["pnl_r"] for t in trades)
    avg_win = np.mean([t["pnl_r"] for t in wins]) if wins else 0
    avg_loss = np.mean([t["pnl_r"] for t in losses]) if losses else 0
    avg_rr = np.mean([t["pnl_r"] for t in trades])

    # Expectancy per trade
    wr = len(wins) / len(trades) if trades else 0
    expectancy = (wr * avg_win) + ((1 - wr) * avg_loss) if trades else 0

    gross_profit = sum(t["pnl_r"] for t in wins)
    gross_loss = abs(sum(t["pnl_r"] for t in losses))
    pf = gross_profit / gross_loss if gross_loss > 0 else 999.0

    # Max drawdown in R
    cumulative = np.cumsum([t["pnl_r"] for t in trades])
    running_max = np.maximum.accumulate(cumulative)
    drawdowns = cumulative - running_max
    max_dd = float(drawdowns.min())

    # SL source breakdown
    sl_sources = {}
    for t in trades:
        src = t.get("sl_source", "unknown")
        sl_sources[src] = sl_sources.get(src, 0) + 1

    return {
        "label": label,
        "total": len(trades),
        "wins": len(wins),
        "losses": len(losses),
        "breakevens": len(breakevens),
        "win_rate": round(wr * 100, 1),
        "avg_pnl_r": round(avg_rr, 2),
        "total_pnl_r": round(total_pnl, 2),
        "avg_win_r": round(float(avg_win), 2),
        "avg_loss_r": round(float(avg_loss), 2),
        "expectancy_r": round(float(expectancy), 2),
        "profit_factor": round(min(pf, 999.0), 2),
        "max_drawdown_r": round(max_dd, 2),
        "trailed_to_be": sum(1 for t in trades if t.get("trailed")),
        "sl_sources": sl_sources,
    }


# ══════════════════════════════════════════════════════════════════════════════
# MAIN — Run comparison across multiple symbols and strategies
# ══════════════════════════════════════════════════════════════════════════════

TEST_SYMBOLS = [
    ("EURUSD=X", "MSS_OrderBlock"),
    ("GBPUSD=X", "MSS_OrderBlock"),
    ("USDJPY=X", "MSS_OrderBlock"),
    ("GC=F",     "RSI_OTE"),
    ("CL=F",     "RSI_OTE"),
    ("BTC-USD",  "BOS_FVG"),
    ("ETH-USD",  "BOS_FVG"),
    ("NVDA",     "MSS_OrderBlock"),
    ("AAPL",     "MSS_OrderBlock"),
]


def main():
    print("=" * 80)
    print("  SL LOGIC COMPARISON: Fixed ATR vs Structure-Aware + Trailing")
    print("=" * 80)

    all_old = []
    all_new = []

    for symbol, strategy in TEST_SYMBOLS:
        print(f"\n{'─' * 70}")
        print(f"  {symbol} — {strategy}")
        print(f"{'─' * 70}")

        try:
            df = _fetch_ohlcv(symbol, "90d", interval="15m")
            signal_fn = STRATEGY_REGISTRY[strategy]
            signals = signal_fn(df)
            signals.name = strategy

            old_trades = _simulate_old(df, signals)
            new_trades = _simulate_new(df, signals, strategy)

            old_s = _summarize(old_trades, "Fixed ATR (1.5×/2.5×)")
            new_s = _summarize(new_trades, "Structure + Trailing")

            all_old.extend(old_trades)
            all_new.extend(new_trades)

            _print_comparison(old_s, new_s)

        except Exception as e:
            print(f"  ⚠ Error: {e}")

    # Overall aggregate
    print(f"\n{'=' * 80}")
    print(f"  AGGREGATE — All Symbols Combined")
    print(f"{'=' * 80}")
    old_agg = _summarize(all_old, "Fixed ATR (aggregate)")
    new_agg = _summarize(all_new, "Structure + Trailing (aggregate)")
    _print_comparison(old_agg, new_agg)


def _print_comparison(old: dict, new: dict):
    """Pretty-print side-by-side comparison."""
    def _fmt(key, is_pct=False, prefix="", suffix=""):
        o = old.get(key, 0)
        n = new.get(key, 0)
        if is_pct:
            return f"{o:>7.1f}{suffix}  →  {n:>7.1f}{suffix}"
        return f"{o:>7.2f}{suffix}  →  {n:>7.2f}{suffix}"

    def _fmt_int(key):
        o = old.get(key, 0)
        n = new.get(key, 0)
        return f"{o:>7d}  →  {n:>7d}"

    print()
    print(f"  {'Metric':<25} {'Fixed ATR':>12}  →  {'New Logic':>12}")
    print(f"  {'─' * 25} {'─' * 12}    {'─' * 12}")
    print(f"  {'Total Trades':<25} {_fmt_int('total')}")
    print(f"  {'Wins':<25} {_fmt_int('wins')}")
    print(f"  {'Losses':<25} {_fmt_int('losses')}")
    print(f"  {'Breakevens':<25} {_fmt_int('breakevens')}")
    print(f"  {'Win Rate':<25} {_fmt('win_rate', suffix='%')}")
    print(f"  {'Avg R per Trade':<25} {_fmt('avg_pnl_r', suffix='R')}")
    print(f"  {'Total P&L (R)':<25} {_fmt('total_pnl_r', suffix='R')}")
    print(f"  {'Avg Win (R)':<25} {_fmt('avg_win_r', suffix='R')}")
    print(f"  {'Avg Loss (R)':<25} {_fmt('avg_loss_r', suffix='R')}")
    print(f"  {'Expectancy (R)':<25} {_fmt('expectancy_r', suffix='R')}")
    print(f"  {'Profit Factor':<25} {_fmt('profit_factor')}")
    print(f"  {'Max Drawdown (R)':<25} {_fmt('max_drawdown_r', suffix='R')}")
    if new.get("trailed_to_be", 0) > 0:
        print(f"  {'Traded to Breakeven':<25} {_fmt_int('trailed_to_be')}")
    if old.get("sl_sources") or new.get("sl_sources"):
        print(f"  {'SL Sources (new)':<25} {json.dumps(new.get('sl_sources', {}))}")


if __name__ == "__main__":
    main()
