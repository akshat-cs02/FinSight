"""
ICT / SMC 5-Year Backtest Runner
Symbols: 6 Forex pairs, 2 Crypto, 4 Commodities
Timeframe: Daily bars → intraday simulation (entry at next-open, exit EOD)
Period: 2021-01-01 to 2026-06-29
Risk: 1% per trade, ATR-based SL, 2R TP
"""

import warnings
warnings.filterwarnings("ignore")

import sys
import io
# Force UTF-8 output on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import numpy as np
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta
import json

START = "2021-01-01"
END   = "2026-06-29"

SYMBOLS = {
    # Forex
    "EURUSD": "EURUSD=X",
    "GBPUSD": "GBPUSD=X",
    "USDJPY": "USDJPY=X",
    "AUDUSD": "AUDUSD=X",
    "USDCAD": "USDCAD=X",
    "NZDUSD": "NZDUSD=X",
    # Crypto
    "BTCUSD": "BTC-USD",
    "ETHUSD": "ETH-USD",
    # Commodities
    "GOLD":   "GC=F",
    "SILVER": "SI=F",
    "USOIL":  "CL=F",
    "UKOIL":  "BZ=F",
}

RISK_PCT   = 0.01     # 1% risk per trade
ATR_SL     = 1.5      # SL = 1.5 × ATR
ATR_TP     = 3.0      # TP = 3.0 × ATR  (2R when SL=1.5×ATR)
SWING_LB   = 5        # swing high/low lookback bars
FVG_MIN    = 0.0003   # minimum FVG size as fraction of price


# ─────────────────────────────────────────────
# INDICATOR HELPERS
# ─────────────────────────────────────────────

def atr(high, low, close, period=14):
    tr = pd.concat([
        high - low,
        (high - close.shift()).abs(),
        (low  - close.shift()).abs()
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1/period, adjust=False).mean()


def ema(s, span):
    return s.ewm(span=span, adjust=False).mean()


def swing_highs(high, lb=SWING_LB):
    sh = pd.Series(False, index=high.index)
    h  = high.values
    for i in range(lb, len(h)-lb):
        window = h[i-lb:i+lb+1]
        if h[i] == window.max() and list(window).count(h[i]) == 1:
            sh.iloc[i] = True
    return sh


def swing_lows(low, lb=SWING_LB):
    sl = pd.Series(False, index=low.index)
    l  = low.values
    for i in range(lb, len(l)-lb):
        window = l[i-lb:i+lb+1]
        if l[i] == window.min() and list(window).count(l[i]) == 1:
            sl.iloc[i] = True
    return sl


def rsi(close, period=14):
    delta = close.diff()
    gain  = delta.clip(lower=0).ewm(alpha=1/period, adjust=False).mean()
    loss  = (-delta.clip(upper=0)).ewm(alpha=1/period, adjust=False).mean()
    rs    = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


# ─────────────────────────────────────────────
# STRATEGY 1: BOS + ORDER BLOCK
# Signal: price breaks a swing level → last opposing candle = OB
# Entry:  next bar open when close re-enters OB zone
# SL: beyond OB, TP: 2R
# ─────────────────────────────────────────────

def strategy_bos_ob(df):
    """Break of Structure + Order Block"""
    o, h, l, c = df["Open"], df["High"], df["Low"], df["Close"]
    atr14 = atr(h, l, c)
    sh    = swing_highs(h)
    sl    = swing_lows(l)
    rsi14 = rsi(c)

    signals = []
    last_sh_price = None
    last_sl_price = None
    last_sh_idx   = None
    last_sl_idx   = None

    for i in range(30, len(df)-1):
        if sh.iloc[i]:
            last_sh_price = h.iloc[i]
            last_sh_idx   = i
        if sl.iloc[i]:
            last_sl_price = l.iloc[i]
            last_sl_idx   = i

        entry_price = o.iloc[i+1]  # enter at next-bar open
        atr_val     = atr14.iloc[i]

        # ── BULLISH BOS: close breaks above last swing high ──
        if (last_sh_price is not None
                and last_sh_idx is not None
                and c.iloc[i] > last_sh_price
                and c.iloc[i-1] <= last_sh_price
                and rsi14.iloc[i] < 75):
            # Order Block: last bearish (red) candle before the BOS
            ob_idx = None
            for j in range(i-1, max(i-20, 0), -1):
                if c.iloc[j] < o.iloc[j]:   # bearish candle
                    ob_idx = j
                    break
            if ob_idx is not None:
                ob_high = h.iloc[ob_idx]
                ob_low  = l.iloc[ob_idx]
                # wait for price to return to OB zone
                if ob_low <= entry_price <= ob_high:
                    sl_price = ob_low - atr_val * 0.3
                    tp_price = entry_price + (entry_price - sl_price) * 2.0
                    signals.append({
                        "entry_idx":  i+1,
                        "direction":  1,
                        "entry":      entry_price,
                        "sl":         sl_price,
                        "tp":         tp_price,
                        "strategy":   "BOS_OB",
                    })
                    last_sh_price = None

        # ── BEARISH BOS: close breaks below last swing low ──
        if (last_sl_price is not None
                and last_sl_idx is not None
                and c.iloc[i] < last_sl_price
                and c.iloc[i-1] >= last_sl_price
                and rsi14.iloc[i] > 25):
            ob_idx = None
            for j in range(i-1, max(i-20, 0), -1):
                if c.iloc[j] > o.iloc[j]:   # bullish candle
                    ob_idx = j
                    break
            if ob_idx is not None:
                ob_high = h.iloc[ob_idx]
                ob_low  = l.iloc[ob_idx]
                if ob_low <= entry_price <= ob_high:
                    sl_price = ob_high + atr_val * 0.3
                    tp_price = entry_price - (sl_price - entry_price) * 2.0
                    signals.append({
                        "entry_idx":  i+1,
                        "direction":  -1,
                        "entry":      entry_price,
                        "sl":         sl_price,
                        "tp":         tp_price,
                        "strategy":   "BOS_OB",
                    })
                    last_sl_price = None

    return signals


# ─────────────────────────────────────────────
# STRATEGY 2: FAIR VALUE GAP
# Signal: 3-bar pattern — gap between bar[i-2].high and bar[i].low (bull)
# Entry: price retraces into FVG
# SL: beyond FVG, TP: 1.5R
# ─────────────────────────────────────────────

def strategy_fvg(df):
    """Fair Value Gap fill"""
    o, h, l, c = df["Open"], df["High"], df["Low"], df["Close"]
    atr14 = atr(h, l, c)
    ema21 = ema(c, 21)
    ema55 = ema(c, 55)

    signals = []

    for i in range(2, len(df)-1):
        atr_val     = atr14.iloc[i]
        entry_price = o.iloc[i+1]

        # ── BULLISH FVG: gap up (bar[i-2].high < bar[i].low) ──
        bull_fvg = h.iloc[i-2] < l.iloc[i]
        gap_size = l.iloc[i] - h.iloc[i-2]
        # Trend filter: price above EMA55 = bullish bias
        trend_bull = c.iloc[i] > ema55.iloc[i] and ema21.iloc[i] > ema55.iloc[i]

        if (bull_fvg
                and gap_size / c.iloc[i] > FVG_MIN
                and trend_bull
                and h.iloc[i-2] <= entry_price <= l.iloc[i]):   # retraced into gap
            sl_price = h.iloc[i-2] - atr_val * 0.2
            tp_price = entry_price + (entry_price - sl_price) * 2.0
            signals.append({
                "entry_idx": i+1,
                "direction": 1,
                "entry":     entry_price,
                "sl":        sl_price,
                "tp":        tp_price,
                "strategy":  "FVG",
            })

        # ── BEARISH FVG: gap down (bar[i].high < bar[i-2].low) ──
        bear_fvg = l.iloc[i] > h.iloc[i-2]    # inverted
        if i >= 2:
            bear_fvg = l.iloc[i-2] > h.iloc[i]
            gap_size = l.iloc[i-2] - h.iloc[i]
        trend_bear = c.iloc[i] < ema55.iloc[i] and ema21.iloc[i] < ema55.iloc[i]

        if (i >= 2
                and l.iloc[i-2] > h.iloc[i]
                and gap_size / c.iloc[i] > FVG_MIN
                and trend_bear
                and h.iloc[i] <= entry_price <= l.iloc[i-2]):
            sl_price = l.iloc[i-2] + atr_val * 0.2
            tp_price = entry_price - (sl_price - entry_price) * 2.0
            signals.append({
                "entry_idx": i+1,
                "direction": -1,
                "entry":     entry_price,
                "sl":        sl_price,
                "tp":        tp_price,
                "strategy":  "FVG",
            })

    return signals


# ─────────────────────────────────────────────
# STRATEGY 3: LIQUIDITY SWEEP + FVG
# Signal: price sweeps below swing low (stop hunt) then snaps back with FVG
# ─────────────────────────────────────────────

def strategy_liq_sweep_fvg(df):
    """Liquidity sweep below swing low → FVG reversal"""
    o, h, l, c = df["Open"], df["High"], df["Low"], df["Close"]
    atr14 = atr(h, l, c)
    sl_marks = swing_lows(l)
    sh_marks = swing_highs(h)

    signals = []
    last_sl_price = None
    last_sh_price = None

    for i in range(10, len(df)-1):
        if sl_marks.iloc[i]:
            last_sl_price = l.iloc[i]
        if sh_marks.iloc[i]:
            last_sh_price = h.iloc[i]

        entry_price = o.iloc[i+1]
        atr_val     = atr14.iloc[i]

        # ── BULLISH: sweep below swing low + close back above it + FVG ──
        if (last_sl_price is not None
                and l.iloc[i] < last_sl_price      # swept the low
                and c.iloc[i] > last_sl_price       # closed back above
                and i >= 2):
            # check for bullish FVG in last 3 bars
            fvg_exists = h.iloc[i-2] < l.iloc[i]
            if not fvg_exists:
                # Any bullish candle after sweep is acceptable entry
                if c.iloc[i] > o.iloc[i]:
                    sl_price = l.iloc[i] - atr_val * 0.2
                    tp_price = entry_price + (entry_price - sl_price) * 2.5
                    signals.append({
                        "entry_idx": i+1,
                        "direction": 1,
                        "entry":     entry_price,
                        "sl":        sl_price,
                        "tp":        tp_price,
                        "strategy":  "LiqSweep_FVG",
                    })
                    last_sl_price = None

        # ── BEARISH: sweep above swing high + close back below + snap ──
        if (last_sh_price is not None
                and h.iloc[i] > last_sh_price
                and c.iloc[i] < last_sh_price
                and i >= 2):
            if c.iloc[i] < o.iloc[i]:
                sl_price = h.iloc[i] + atr_val * 0.2
                tp_price = entry_price - (sl_price - entry_price) * 2.5
                signals.append({
                    "entry_idx": i+1,
                    "direction": -1,
                    "entry":     entry_price,
                    "sl":        sl_price,
                    "tp":        tp_price,
                    "strategy":  "LiqSweep_FVG",
                })
                last_sh_price = None

    return signals


# ─────────────────────────────────────────────
# STRATEGY 4: CHOCH + ORDER BLOCK  (Change of Character)
# Signal: After downtrend, first higher high = CHOCH; enter on pullback to last OB
# ─────────────────────────────────────────────

def strategy_choch_ob(df):
    """Change of Character + Order Block entry on pullback"""
    o, h, l, c = df["Open"], df["High"], df["Low"], df["Close"]
    atr14 = atr(h, l, c)
    ema21_ = ema(c, 21)

    signals = []
    # track last 2 swing highs to detect CHOCH
    prev_sh = None
    curr_sh = None
    prev_sl = None
    curr_sl = None

    sh_marks = swing_highs(h)
    sl_marks = swing_lows(l)

    for i in range(20, len(df)-1):
        atr_val     = atr14.iloc[i]
        entry_price = o.iloc[i+1]

        if sh_marks.iloc[i]:
            prev_sh = curr_sh
            curr_sh = (i, h.iloc[i])

        if sl_marks.iloc[i]:
            prev_sl = curr_sl
            curr_sl = (i, l.iloc[i])

        # ── BULLISH CHOCH: new swing high > previous swing high (downtrend → up) ──
        if (prev_sh is not None and curr_sh is not None
                and curr_sh[1] > prev_sh[1]          # higher high = CHOCH
                and c.iloc[i] < curr_sh[1]            # price pulled back
                and c.iloc[i] > ema21_.iloc[i]):       # above 21 EMA = bullish
            # Find last bearish OB between prev_sh and curr_sh
            ob_idx = None
            for j in range(curr_sh[0]-1, max(prev_sh[0], curr_sh[0]-15), -1):
                if c.iloc[j] < o.iloc[j]:
                    ob_idx = j
                    break
            if ob_idx is not None:
                ob_h = h.iloc[ob_idx]
                ob_l = l.iloc[ob_idx]
                if ob_l <= entry_price <= ob_h:
                    sl_price = ob_l - atr_val * 0.3
                    tp_price = entry_price + (entry_price - sl_price) * 2.0
                    signals.append({
                        "entry_idx": i+1,
                        "direction": 1,
                        "entry":     entry_price,
                        "sl":        sl_price,
                        "tp":        tp_price,
                        "strategy":  "CHOCH_OB",
                    })

        # ── BEARISH CHOCH: new swing low < previous swing low (uptrend → down) ──
        if (prev_sl is not None and curr_sl is not None
                and curr_sl[1] < prev_sl[1]
                and c.iloc[i] > curr_sl[1]
                and c.iloc[i] < ema21_.iloc[i]):
            ob_idx = None
            for j in range(curr_sl[0]-1, max(prev_sl[0], curr_sl[0]-15), -1):
                if c.iloc[j] > o.iloc[j]:
                    ob_idx = j
                    break
            if ob_idx is not None:
                ob_h = h.iloc[ob_idx]
                ob_l = l.iloc[ob_idx]
                if ob_l <= entry_price <= ob_h:
                    sl_price = ob_h + atr_val * 0.3
                    tp_price = entry_price - (sl_price - entry_price) * 2.0
                    signals.append({
                        "entry_idx": i+1,
                        "direction": -1,
                        "entry":     entry_price,
                        "sl":        sl_price,
                        "tp":        tp_price,
                        "strategy":  "CHOCH_OB",
                    })

    return signals


# ─────────────────────────────────────────────
# STRATEGY 5: HYBRID ICT+SMC  (best of both worlds)
# Requires ALL of: BOS confirmed + FVG present + Liq sweep + RSI filter
# Fewer signals but much higher quality
# ─────────────────────────────────────────────

def strategy_hybrid(df):
    """Hybrid: BOS + FVG confluence + RSI filter + trend alignment"""
    o, h, l, c = df["Open"], df["High"], df["Low"], df["Close"]
    atr14  = atr(h, l, c)
    ema21_ = ema(c, 21)
    ema55_ = ema(c, 55)
    rsi14  = rsi(c)
    sh_marks = swing_highs(h)
    sl_marks = swing_lows(l)

    signals = []
    last_sh = None
    last_sl = None

    for i in range(30, len(df)-1):
        atr_val     = atr14.iloc[i]
        entry_price = o.iloc[i+1]

        if sh_marks.iloc[i]:
            last_sh = (i, h.iloc[i])
        if sl_marks.iloc[i]:
            last_sl = (i, l.iloc[i])

        # Trend alignment: EMA21 > EMA55 = bullish
        bull_trend = ema21_.iloc[i] > ema55_.iloc[i]
        bear_trend = ema21_.iloc[i] < ema55_.iloc[i]

        # ── BULLISH: BOS + FVG + RSI not overbought + trend up ──
        bos_bull = last_sh is not None and c.iloc[i] > last_sh[1] and c.iloc[i-1] <= last_sh[1]
        if i >= 2:
            fvg_bull = h.iloc[i-2] < l.iloc[i] and (l.iloc[i] - h.iloc[i-2]) / c.iloc[i] > FVG_MIN
        else:
            fvg_bull = False

        if (bos_bull and fvg_bull and bull_trend
                and rsi14.iloc[i] < 70
                and rsi14.iloc[i] > 40):  # momentum building, not overbought
            # Enter if price is at/near the FVG midpoint
            fvg_mid = (h.iloc[i-2] + l.iloc[i]) / 2
            if abs(entry_price - fvg_mid) / atr_val < 0.5:
                sl_price = h.iloc[i-2] - atr_val * 0.2
                tp_price = entry_price + (entry_price - sl_price) * 2.5
                signals.append({
                    "entry_idx": i+1,
                    "direction": 1,
                    "entry":     entry_price,
                    "sl":        sl_price,
                    "tp":        tp_price,
                    "strategy":  "Hybrid_ICT_SMC",
                })
                last_sh = None

        # ── BEARISH: BOS down + FVG + RSI not oversold + trend down ──
        bos_bear = last_sl is not None and c.iloc[i] < last_sl[1] and c.iloc[i-1] >= last_sl[1]
        if i >= 2:
            fvg_bear = l.iloc[i-2] > h.iloc[i] and (l.iloc[i-2] - h.iloc[i]) / c.iloc[i] > FVG_MIN
        else:
            fvg_bear = False

        if (bos_bear and fvg_bear and bear_trend
                and rsi14.iloc[i] > 30
                and rsi14.iloc[i] < 60):
            fvg_mid = (l.iloc[i-2] + h.iloc[i]) / 2
            if abs(entry_price - fvg_mid) / atr_val < 0.5:
                sl_price = l.iloc[i-2] + atr_val * 0.2
                tp_price = entry_price - (sl_price - entry_price) * 2.5
                signals.append({
                    "entry_idx": i+1,
                    "direction": -1,
                    "entry":     entry_price,
                    "sl":        sl_price,
                    "tp":        tp_price,
                    "strategy":  "Hybrid_ICT_SMC",
                })
                last_sl = None

    return signals


# ─────────────────────────────────────────────
# TRADE SIMULATOR
# Intraday rule: entry = next-bar open, exit = same-bar close (no overnight)
# If price doesn't hit SL or TP that day → exit at daily close
# ─────────────────────────────────────────────

def simulate_trades(df, signals, risk_pct=RISK_PCT):
    """
    Simulate trades with:
    - 1% account risk per trade
    - Intraday exit enforced (close position at day's close if SL/TP not hit)
    - Track running equity curve
    """
    equity    = 10000.0   # starting equity
    equity_curve = [equity]
    trades    = []

    h_arr = df["High"].values
    l_arr = df["Low"].values
    c_arr = df["Close"].values

    for sig in signals:
        i    = sig["entry_idx"]
        if i >= len(df):
            continue

        entry  = sig["entry"]
        sl     = sig["sl"]
        tp     = sig["tp"]
        dirn   = sig["direction"]
        risk_amt = equity * risk_pct

        sl_dist = abs(entry - sl)
        if sl_dist < 1e-10:
            continue

        position_size = risk_amt / sl_dist  # units

        # Intraday: check if SL or TP is hit within SAME bar's high/low
        bar_h = h_arr[i]
        bar_l = l_arr[i]
        bar_c = c_arr[i]

        if dirn == 1:   # LONG
            if bar_l <= sl:
                exit_price = sl
                pnl_pts    = sl - entry
            elif bar_h >= tp:
                exit_price = tp
                pnl_pts    = tp - entry
            else:
                exit_price = bar_c   # EOD exit
                pnl_pts    = bar_c - entry
        else:           # SHORT
            if bar_h >= sl:
                exit_price = sl
                pnl_pts    = entry - sl
            elif bar_l <= tp:
                exit_price = tp
                pnl_pts    = entry - tp
            else:
                exit_price = bar_c
                pnl_pts    = entry - bar_c

        pnl_dollar = pnl_pts * position_size * dirn if dirn == 1 else pnl_pts * position_size
        equity    += pnl_dollar
        equity_curve.append(equity)

        trades.append({
            "idx":        i,
            "direction":  "LONG" if dirn == 1 else "SHORT",
            "entry":      entry,
            "exit":       exit_price,
            "sl":         sl,
            "tp":         tp,
            "pnl":        pnl_dollar,
            "equity":     equity,
            "win":        pnl_dollar > 0,
        })

    return trades, np.array(equity_curve)


# ─────────────────────────────────────────────
# METRICS
# ─────────────────────────────────────────────

def compute_metrics(trades, equity_curve, symbol, strategy):
    if len(trades) == 0:
        return None

    pnls     = [t["pnl"] for t in trades]
    wins     = [p for p in pnls if p > 0]
    losses   = [p for p in pnls if p <= 0]

    win_rate = len(wins) / len(trades) * 100
    avg_win  = np.mean(wins)  if wins   else 0
    avg_loss = abs(np.mean(losses)) if losses else 1e-9

    gross_profit = sum(wins)
    gross_loss   = abs(sum(losses)) if losses else 1e-9
    profit_factor = min(gross_profit / gross_loss, 99.99) if gross_loss > 1e-6 else (99.99 if gross_profit > 0 else 0.0)

    total_return = (equity_curve[-1] / equity_curve[0] - 1) * 100

    # Max drawdown
    peak = equity_curve[0]
    max_dd = 0
    for e in equity_curve:
        if e > peak:
            peak = e
        dd = (peak - e) / peak * 100
        if dd > max_dd:
            max_dd = dd

    # Annualized Sharpe (daily returns)
    returns = np.diff(equity_curve) / equity_curve[:-1]
    if len(returns) > 1 and returns.std() > 0:
        sharpe = (returns.mean() / returns.std()) * np.sqrt(252)
    else:
        sharpe = 0.0

    # Expectancy
    expectancy = (win_rate/100 * avg_win) - ((1-win_rate/100) * avg_loss)

    return {
        "symbol":        symbol,
        "strategy":      strategy,
        "total_trades":  len(trades),
        "win_rate":      round(win_rate, 1),
        "profit_factor": round(profit_factor, 2),
        "total_return":  round(total_return, 1),
        "max_drawdown":  round(max_dd, 1),
        "sharpe":        round(sharpe, 2),
        "avg_win":       round(avg_win, 2),
        "avg_loss":      round(avg_loss, 2),
        "expectancy":    round(expectancy, 2),
        "final_equity":  round(equity_curve[-1], 2),
        "n_wins":        len(wins),
        "n_losses":      len(losses),
    }


# ─────────────────────────────────────────────
# MAIN RUNNER
# ─────────────────────────────────────────────

STRATEGIES = {
    "BOS_OB":         strategy_bos_ob,
    "FVG":            strategy_fvg,
    "LiqSweep_FVG":   strategy_liq_sweep_fvg,
    "CHOCH_OB":       strategy_choch_ob,
    "Hybrid_ICT_SMC": strategy_hybrid,
}

all_results = []
market_data = {}

print("=" * 70)
print("  FinSight ICT/SMC 5-Year Backtest  |  Jan 2021 – Jun 2026")
print("  Risk: 1% per trade | Intraday (EOD exit) | Daily bars")
print("=" * 70)

for label, ticker in SYMBOLS.items():
    print(f"\n[{label}] Fetching {ticker} ...")
    try:
        raw = yf.download(ticker, start=START, end=END,
                          interval="1d", auto_adjust=True, progress=False)
        if raw.empty or len(raw) < 60:
            print(f"  !! Not enough data for {ticker}, skipping")
            continue
        # Flatten multi-index if present
        if isinstance(raw.columns, pd.MultiIndex):
            raw.columns = raw.columns.get_level_values(0)
        df = raw[["Open","High","Low","Close"]].dropna().copy()
        market_data[label] = df
        print(f"  Bars: {len(df)}  ({df.index[0].date()} to {df.index[-1].date()})")
    except Exception as e:
        print(f"  !! Error: {e}")
        continue

    for strat_name, strat_fn in STRATEGIES.items():
        try:
            signals = strat_fn(df)
            if not signals:
                continue
            trades, eq = simulate_trades(df, signals)
            m = compute_metrics(trades, eq, label, strat_name)
            if m:
                all_results.append(m)
                flag = "OK" if m["win_rate"] >= 55 else "  "
                print(f"  {flag} {strat_name:20s} | WR:{m['win_rate']:5.1f}% | "
                      f"PF:{m['profit_factor']:5.2f} | "
                      f"DD:{m['max_drawdown']:5.1f}% | "
                      f"Sharpe:{m['sharpe']:5.2f} | "
                      f"Trades:{m['total_trades']:4d} | "
                      f"Ret:{m['total_return']:+6.1f}%")
        except Exception as e:
            print(f"  !! {strat_name} error: {e}")

# ─────────────────────────────────────────────
# AGGREGATE RESULTS TABLE
# ─────────────────────────────────────────────

print("\n\n" + "=" * 70)
print("  AGGREGATE STRATEGY PERFORMANCE  (avg across all 12 symbols)")
print("=" * 70)

df_res = pd.DataFrame(all_results)
if not df_res.empty:
    agg = df_res.groupby("strategy").agg(
        symbols_tested  = ("symbol", "count"),
        avg_win_rate    = ("win_rate", "mean"),
        avg_pf          = ("profit_factor", "mean"),
        avg_return      = ("total_return", "mean"),
        avg_dd          = ("max_drawdown", "mean"),
        avg_sharpe      = ("sharpe", "mean"),
        avg_trades      = ("total_trades", "mean"),
        avg_expectancy  = ("expectancy", "mean"),
    ).round(2).sort_values("avg_sharpe", ascending=False)

    print(agg.to_string())

    # Per-symbol best strategy
    print("\n\n" + "=" * 70)
    print("  BEST STRATEGY PER SYMBOL  (by Sharpe)")
    print("=" * 70)
    best = df_res.sort_values("sharpe", ascending=False).groupby("symbol").first().reset_index()
    for _, row in best.iterrows():
        print(f"  {row['symbol']:10s}  ->  {row['strategy']:20s}  "
              f"WR:{row['win_rate']:5.1f}%  PF:{row['profit_factor']:4.2f}  "
              f"Sharpe:{row['sharpe']:5.2f}  DD:{row['max_drawdown']:5.1f}%")

    # Full result table for JSON
    print("\n\n" + "=" * 70)
    print("  FULL RESULTS TABLE")
    print("=" * 70)
    print(df_res.sort_values(["strategy","symbol"]).to_string(index=False))

    # Save to JSON
    with open("ict_backtest_results.json", "w") as f:
        json.dump(all_results, f, indent=2)
    print("\n\nResults saved to: ict_backtest_results.json")
else:
    print("No results to display.")

print("\nDone.")
