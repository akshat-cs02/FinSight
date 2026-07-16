"""
Professional ICT/SMC Intraday Backtest
======================================
Timeframe : 1H bars (ICT's intended entry TF)
HTF Bias  : Daily chart BOS direction
Kill Zones: London (07-10 UTC), New York (13-16 UTC)
Period    : Maximum 1H history yfinance provides (~2 years)
Risk      : 1% per trade, ATR SL, 2R TP
Symbols   : 6 Forex + 2 Crypto + 4 Commodities

Strategies tested:
  A) London_Sweep_OB    -- Asian range sweep + BOS + Order Block (classic ICT)
  B) KZ_FVG            -- Kill Zone Fair Value Gap fill with HTF bias
  C) MSS_OB            -- Market Structure Shift (CHOCH on 1H) + OB entry
  D) OTE_Pullback      -- BOS confirmed, enter at 62-79% Fib retracement (OTE)
  E) Hybrid_A_B        -- London_Sweep_OB OR KZ_FVG, whichever fires first
"""

import warnings, sys, io
warnings.filterwarnings("ignore")
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import numpy as np
import pandas as pd
import yfinance as yf
import json
from datetime import datetime

RISK_PCT  = 0.01
INIT_EQ   = 10_000.0
ATR_SL    = 1.5      # SL = 1.5 x ATR
RR        = 2.0      # TP = SL x 2
SWING_LB  = 3        # bars each side for swing detection (tighter on 1H)
MIN_ATR   = 0.0002   # minimum ATR as fraction (filters choppy no-volatility bars)

# Kill zones in UTC hours
LONDON_OPEN  = (7,  10)
NY_OPEN      = (13, 16)

SYMBOLS = {
    "EURUSD": "EURUSD=X",
    "GBPUSD": "GBPUSD=X",
    "USDJPY": "USDJPY=X",
    "AUDUSD": "AUDUSD=X",
    "USDCAD": "USDCAD=X",
    "NZDUSD": "NZDUSD=X",
    "BTCUSD": "BTC-USD",
    "ETHUSD": "ETH-USD",
    "GOLD":   "GC=F",
    "SILVER": "SI=F",
    "USOIL":  "CL=F",
    "UKOIL":  "BZ=F",
}

# ─────────────────────────────────────
# INDICATOR HELPERS
# ─────────────────────────────────────

def _atr(h, l, c, p=14):
    tr = pd.concat([h-l, (h-c.shift()).abs(), (l-c.shift()).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1/p, adjust=False).mean()

def _ema(s, span):
    return s.ewm(span=span, adjust=False).mean()

def _rsi(c, p=14):
    d = c.diff()
    g = d.clip(lower=0).ewm(alpha=1/p, adjust=False).mean()
    l = (-d.clip(upper=0)).ewm(alpha=1/p, adjust=False).mean()
    return 100 - 100/(1 + g/l.replace(0, np.nan))

def _swing_highs(h, lb=SWING_LB):
    sh = pd.Series(False, index=h.index)
    v  = h.values
    for i in range(lb, len(v)-lb):
        w = v[i-lb:i+lb+1]
        if v[i] == w.max() and list(w).count(v[i]) == 1:
            sh.iloc[i] = True
    return sh

def _swing_lows(l, lb=SWING_LB):
    sl = pd.Series(False, index=l.index)
    v  = l.values
    for i in range(lb, len(v)-lb):
        w = v[i-lb:i+lb+1]
        if v[i] == w.min() and list(w).count(v[i]) == 1:
            sl.iloc[i] = True
    return sl

def _in_kill_zone(dt):
    """True if the bar opens in London or NY kill zone (UTC hour)."""
    try:
        h = dt.hour
    except Exception:
        return False
    return (LONDON_OPEN[0] <= h < LONDON_OPEN[1]) or (NY_OPEN[0] <= h < NY_OPEN[1])

def _kill_zone_name(dt):
    try:
        h = dt.hour
    except Exception:
        return "NONE"
    if LONDON_OPEN[0] <= h < LONDON_OPEN[1]:
        return "LONDON"
    if NY_OPEN[0] <= h < NY_OPEN[1]:
        return "NY"
    return "NONE"

# ─────────────────────────────────────
# HTF BIAS FROM DAILY DATA
# ─────────────────────────────────────

def get_htf_bias_series(daily_df):
    """
    Returns a Series aligned to daily dates with value 1 (bull), -1 (bear), 0 (neutral).
    Logic: last BOS direction on daily chart.
    """
    h, l, c = daily_df["High"], daily_df["Low"], daily_df["Close"]
    sh = _swing_highs(h, lb=5)
    sl = _swing_lows(l, lb=5)
    ema21 = _ema(c, 21)
    ema55 = _ema(c, 55)

    bias = pd.Series(0, index=daily_df.index)
    last_bias = 0
    last_sh = None
    last_sl = None

    for i in range(20, len(daily_df)):
        if sh.iloc[i]:
            last_sh = h.iloc[i]
        if sl.iloc[i]:
            last_sl = l.iloc[i]

        # BOS up: close above last swing high
        if last_sh and c.iloc[i] > last_sh and ema21.iloc[i] > ema55.iloc[i]:
            last_bias = 1
            last_sh = None
        # BOS down: close below last swing low
        elif last_sl and c.iloc[i] < last_sl and ema21.iloc[i] < ema55.iloc[i]:
            last_bias = -1
            last_sl = None

        bias.iloc[i] = last_bias

    return bias

# ─────────────────────────────────────
# ASIAN RANGE DETECTION
# For a given 1H bar, find the Asian session high/low for that day
# Asian session = 00:00-07:00 UTC
# ─────────────────────────────────────

def build_asian_ranges(df_1h):
    """Returns dict: date -> (asian_high, asian_low)"""
    ranges = {}
    df = df_1h.copy()
    try:
        df.index = pd.to_datetime(df.index, utc=True)
        df.index = df.index.tz_convert("UTC")
    except Exception:
        pass

    for date, group in df.groupby(df.index.date):
        asian = group[(group.index.hour >= 0) & (group.index.hour < 7)]
        if len(asian) >= 2:
            ranges[date] = (asian["High"].max(), asian["Low"].min())
    return ranges

# ─────────────────────────────────────
# STRATEGY A: LONDON SWEEP + BOS + ORDER BLOCK
# The classic ICT setup that actually works
# ─────────────────────────────────────

def strategy_london_sweep_ob(df_1h, htf_bias_map, asian_ranges):
    """
    1. Wait for London Kill Zone (07-10 UTC)
    2. Asian session range formed (00-07 UTC)
    3. Price sweeps below Asian low (bull setup) or above Asian high (bear)
    4. Close back inside Asian range = stop hunt confirmed
    5. BOS on 1H above last swing high (bull) or below last swing low (bear)
    6. Last opposing candle before BOS = Order Block
    7. Enter at 50% of OB on next bar, SL beyond OB, TP = 2R
    8. Intraday exit: close at 15:00 UTC if not stopped
    HTF filter: Daily bias must confirm direction
    """
    signals = []
    o, h, l, c = df_1h["Open"], df_1h["High"], df_1h["Low"], df_1h["Close"]
    atr14 = _atr(h, l, c)
    rsi14 = _rsi(c)
    sh = _swing_highs(h)
    sl = _swing_lows(l)

    last_sh_val = None
    last_sl_val = None

    # Normalize index to UTC for kill zone check
    idx = df_1h.index
    try:
        idx_utc = pd.DatetimeIndex(idx).tz_localize("UTC") if idx.tzinfo is None else pd.DatetimeIndex(idx).tz_convert("UTC")
    except Exception:
        idx_utc = pd.DatetimeIndex(idx)

    for i in range(20, len(df_1h)-1):
        bar_time = idx_utc[i]
        bar_date = bar_time.date() if hasattr(bar_time, 'date') else None

        if sh.iloc[i]:
            last_sh_val = (i, h.iloc[i])
        if sl.iloc[i]:
            last_sl_val = (i, l.iloc[i])

        kz = _kill_zone_name(bar_time)
        if kz == "NONE":
            continue

        atr_val = atr14.iloc[i]
        if atr_val < MIN_ATR * c.iloc[i]:
            continue  # too choppy

        # HTF bias
        if bar_date and bar_date in htf_bias_map:
            htf = htf_bias_map[bar_date]
        else:
            htf = 0
        if htf == 0:
            continue  # no clear daily bias

        # Asian range for today
        asian = asian_ranges.get(bar_date, None)
        if asian is None:
            asian_high, asian_low = None, None
        else:
            asian_high, asian_low = asian

        entry_price = o.iloc[i+1]

        # ── BULLISH: price swept below Asian low, closed back above, HTF bull ──
        if (htf == 1 and asian_low is not None
                and l.iloc[i] < asian_low          # swept below Asian low
                and c.iloc[i] > asian_low            # closed back above = stop hunt done
                and last_sh_val is not None
                and c.iloc[i] > last_sh_val[1]       # BOS: close above last swing high
                and rsi14.iloc[i] < 70):

            # Find last bearish (red) candle before the BOS = Order Block
            ob_idx = None
            for j in range(i-1, max(last_sh_val[0]-1, i-15), -1):
                if j >= 0 and c.iloc[j] < o.iloc[j]:
                    ob_idx = j
                    break

            if ob_idx is not None:
                ob_h = h.iloc[ob_idx]
                ob_l = l.iloc[ob_idx]
                ob_mid = (ob_h + ob_l) / 2
                # Entry only if price is near the OB zone
                if ob_l * 0.998 <= entry_price <= ob_h * 1.002:
                    sl_price = ob_l - atr_val * 0.5
                    risk = entry_price - sl_price
                    if risk > 0:
                        signals.append({
                            "idx": i+1, "direction": 1,
                            "entry": entry_price,
                            "sl": sl_price,
                            "tp": entry_price + risk * RR,
                            "atr": atr_val,
                            "kz": kz,
                            "strategy": "London_Sweep_OB",
                        })
                        last_sh_val = None

        # ── BEARISH: price swept above Asian high, closed back below, HTF bear ──
        if (htf == -1 and asian_high is not None
                and h.iloc[i] > asian_high
                and c.iloc[i] < asian_high
                and last_sl_val is not None
                and c.iloc[i] < last_sl_val[1]
                and rsi14.iloc[i] > 30):

            ob_idx = None
            for j in range(i-1, max(last_sl_val[0]-1, i-15), -1):
                if j >= 0 and c.iloc[j] > o.iloc[j]:
                    ob_idx = j
                    break

            if ob_idx is not None:
                ob_h = h.iloc[ob_idx]
                ob_l = l.iloc[ob_idx]
                if ob_l * 0.998 <= entry_price <= ob_h * 1.002:
                    sl_price = ob_h + atr_val * 0.5
                    risk = sl_price - entry_price
                    if risk > 0:
                        signals.append({
                            "idx": i+1, "direction": -1,
                            "entry": entry_price,
                            "sl": sl_price,
                            "tp": entry_price - risk * RR,
                            "atr": atr_val,
                            "kz": kz,
                            "strategy": "London_Sweep_OB",
                        })
                        last_sl_val = None

    return signals


# ─────────────────────────────────────
# STRATEGY B: KILL ZONE FVG
# Kill zone + HTF bias + FVG fill + BOS already done
# ─────────────────────────────────────

def strategy_kz_fvg(df_1h, htf_bias_map):
    """
    1. Kill zone only (London OR NY)
    2. HTF daily bias confirmed
    3. BOS already occurred (trending environment)
    4. FVG exists in the direction of bias (gap on 1H bars)
    5. Current price retracing into FVG midpoint
    6. RSI not extended
    7. Enter, SL beyond FVG, TP = 2R
    """
    signals = []
    o, h, l, c = df_1h["Open"], df_1h["High"], df_1h["Low"], df_1h["Close"]
    atr14  = _atr(h, l, c)
    ema21  = _ema(c, 21)
    rsi14  = _rsi(c)
    sh     = _swing_highs(h)
    sl     = _swing_lows(l)

    try:
        idx_utc = pd.DatetimeIndex(df_1h.index).tz_localize("UTC") if df_1h.index.tzinfo is None else pd.DatetimeIndex(df_1h.index).tz_convert("UTC")
    except Exception:
        idx_utc = pd.DatetimeIndex(df_1h.index)

    last_sh_val = None
    last_sl_val = None
    bos_bull = False
    bos_bear = False

    for i in range(10, len(df_1h)-1):
        bar_time = idx_utc[i]
        bar_date = bar_time.date() if hasattr(bar_time, "date") else None

        if sh.iloc[i]:
            last_sh_val = (i, h.iloc[i])
        if sl.iloc[i]:
            last_sl_val = (i, l.iloc[i])

        # Track BOS
        if last_sh_val and c.iloc[i] > last_sh_val[1]:
            bos_bull = True
            bos_bear = False
        if last_sl_val and c.iloc[i] < last_sl_val[1]:
            bos_bear = True
            bos_bull = False

        kz = _kill_zone_name(bar_time)
        if kz == "NONE":
            continue

        atr_val = atr14.iloc[i]
        if atr_val < MIN_ATR * c.iloc[i]:
            continue

        htf = htf_bias_map.get(bar_date, 0) if bar_date else 0
        if htf == 0:
            continue

        if i < 2:
            continue

        entry_price = o.iloc[i+1]

        # ── BULLISH FVG: gap between bar[i-2].high and bar[i].low ──
        if (htf == 1 and bos_bull
                and h.iloc[i-2] < l.iloc[i]        # bullish imbalance
                and rsi14.iloc[i] < 65
                and c.iloc[i] > ema21.iloc[i]):
            fvg_low  = h.iloc[i-2]
            fvg_high = l.iloc[i]
            fvg_mid  = (fvg_low + fvg_high) / 2
            gap_pct  = (fvg_high - fvg_low) / c.iloc[i]
            if gap_pct > 0.0002:   # meaningful gap
                # Enter on retrace into FVG
                if fvg_low * 0.999 <= entry_price <= fvg_mid * 1.001:
                    sl_price = fvg_low - atr_val * 0.5
                    risk = entry_price - sl_price
                    if risk > 0:
                        signals.append({
                            "idx": i+1, "direction": 1,
                            "entry": entry_price,
                            "sl": sl_price,
                            "tp": entry_price + risk * RR,
                            "atr": atr_val,
                            "kz": kz,
                            "strategy": "KZ_FVG",
                        })

        # ── BEARISH FVG: gap down between bar[i-2].low and bar[i].high ──
        if (htf == -1 and bos_bear
                and l.iloc[i-2] > h.iloc[i]
                and rsi14.iloc[i] > 35
                and c.iloc[i] < ema21.iloc[i]):
            fvg_high = l.iloc[i-2]
            fvg_low  = h.iloc[i]
            fvg_mid  = (fvg_low + fvg_high) / 2
            gap_pct  = (fvg_high - fvg_low) / c.iloc[i]
            if gap_pct > 0.0002:
                if fvg_mid * 0.999 <= entry_price <= fvg_high * 1.001:
                    sl_price = fvg_high + atr_val * 0.5
                    risk = sl_price - entry_price
                    if risk > 0:
                        signals.append({
                            "idx": i+1, "direction": -1,
                            "entry": entry_price,
                            "sl": sl_price,
                            "tp": entry_price - risk * RR,
                            "atr": atr_val,
                            "kz": kz,
                            "strategy": "KZ_FVG",
                        })

    return signals


# ─────────────────────────────────────
# STRATEGY C: MSS (Market Structure Shift) + OB
# First CHOCH on 1H after extended move = high-probability reversal
# ─────────────────────────────────────

def strategy_mss_ob(df_1h, htf_bias_map):
    """
    MSS = first structural break opposite to recent trend (CHOCH).
    After 5+ bars making lower lows, first higher high = MSS = enter long.
    Filter: HTF bias must align.
    """
    signals = []
    o, h, l, c = df_1h["Open"], df_1h["High"], df_1h["Low"], df_1h["Close"]
    atr14 = _atr(h, l, c)
    rsi14 = _rsi(c)

    try:
        idx_utc = pd.DatetimeIndex(df_1h.index).tz_localize("UTC") if df_1h.index.tzinfo is None else pd.DatetimeIndex(df_1h.index).tz_convert("UTC")
    except Exception:
        idx_utc = pd.DatetimeIndex(df_1h.index)

    sh_marks = _swing_highs(h)
    sl_marks = _swing_lows(l)
    prev_sh = None
    curr_sh = None
    prev_sl = None
    curr_sl = None

    for i in range(20, len(df_1h)-1):
        if sh_marks.iloc[i]:
            prev_sh = curr_sh
            curr_sh = (i, h.iloc[i])
        if sl_marks.iloc[i]:
            prev_sl = curr_sl
            curr_sl = (i, l.iloc[i])

        bar_time = idx_utc[i]
        bar_date = bar_time.date() if hasattr(bar_time, "date") else None
        kz = _kill_zone_name(bar_time)
        if kz == "NONE":
            continue

        atr_val = atr14.iloc[i]
        if atr_val < MIN_ATR * c.iloc[i]:
            continue

        htf = htf_bias_map.get(bar_date, 0) if bar_date else 0
        if htf == 0:
            continue

        entry_price = o.iloc[i+1]

        # ── BULL MSS: new swing high > prev swing high (downtrend broken on 1H) ──
        if (htf == 1
                and prev_sh is not None and curr_sh is not None
                and curr_sh[1] > prev_sh[1]
                and c.iloc[i] > curr_sh[1]
                and rsi14.iloc[i] > 45 and rsi14.iloc[i] < 70):
            # OB: last red candle before the MSS swing high
            ob_idx = None
            for j in range(curr_sh[0]-1, max(prev_sh[0], curr_sh[0]-20), -1):
                if j >= 0 and c.iloc[j] < o.iloc[j]:
                    ob_idx = j
                    break
            if ob_idx is not None:
                ob_h = h.iloc[ob_idx]
                ob_l = l.iloc[ob_idx]
                if ob_l * 0.998 <= entry_price <= ob_h * 1.002:
                    sl_price = ob_l - atr_val * 0.3
                    risk = entry_price - sl_price
                    if risk > 0:
                        signals.append({
                            "idx": i+1, "direction": 1,
                            "entry": entry_price,
                            "sl": sl_price,
                            "tp": entry_price + risk * RR,
                            "atr": atr_val,
                            "kz": kz,
                            "strategy": "MSS_OB",
                        })

        # ── BEAR MSS: new swing low < prev swing low ──
        if (htf == -1
                and prev_sl is not None and curr_sl is not None
                and curr_sl[1] < prev_sl[1]
                and c.iloc[i] < curr_sl[1]
                and rsi14.iloc[i] < 55 and rsi14.iloc[i] > 30):
            ob_idx = None
            for j in range(curr_sl[0]-1, max(prev_sl[0], curr_sl[0]-20), -1):
                if j >= 0 and c.iloc[j] > o.iloc[j]:
                    ob_idx = j
                    break
            if ob_idx is not None:
                ob_h = h.iloc[ob_idx]
                ob_l = l.iloc[ob_idx]
                if ob_l * 0.998 <= entry_price <= ob_h * 1.002:
                    sl_price = ob_h + atr_val * 0.3
                    risk = sl_price - entry_price
                    if risk > 0:
                        signals.append({
                            "idx": i+1, "direction": -1,
                            "entry": entry_price,
                            "sl": sl_price,
                            "tp": entry_price - risk * RR,
                            "atr": atr_val,
                            "kz": kz,
                            "strategy": "MSS_OB",
                        })

    return signals


# ─────────────────────────────────────
# STRATEGY D: OTE (Optimal Trade Entry) PULLBACK
# BOS confirmed → wait for 62-79% Fib retracement in kill zone
# ─────────────────────────────────────

def strategy_ote(df_1h, htf_bias_map):
    """
    ICT's OTE: After BOS, price pulls back to 62-79% of the last impulse leg.
    This is the "discount" (for longs) or "premium" (for shorts) zone.
    Enter at OTE, SL below the swing low of the impulse, TP = new high.
    """
    signals = []
    o, h, l, c = df_1h["Open"], df_1h["High"], df_1h["Low"], df_1h["Close"]
    atr14  = _atr(h, l, c)
    rsi14  = _rsi(c)
    sh_marks = _swing_highs(h)
    sl_marks = _swing_lows(l)

    try:
        idx_utc = pd.DatetimeIndex(df_1h.index).tz_localize("UTC") if df_1h.index.tzinfo is None else pd.DatetimeIndex(df_1h.index).tz_convert("UTC")
    except Exception:
        idx_utc = pd.DatetimeIndex(df_1h.index)

    last_sh = None
    last_sl = None
    impulse_high = None
    impulse_low  = None
    bos_direction = 0

    for i in range(20, len(df_1h)-1):
        if sh_marks.iloc[i]:
            last_sh = (i, h.iloc[i])
        if sl_marks.iloc[i]:
            last_sl = (i, l.iloc[i])

        # Detect BOS and record impulse leg
        if (last_sh and last_sl
                and c.iloc[i] > last_sh[1]
                and bos_direction != 1):
            bos_direction = 1
            impulse_low  = last_sl[1] if last_sl else None
            impulse_high = last_sh[1]

        if (last_sh and last_sl
                and c.iloc[i] < last_sl[1]
                and bos_direction != -1):
            bos_direction = -1
            impulse_high = last_sh[1] if last_sh else None
            impulse_low  = last_sl[1]

        bar_time = idx_utc[i]
        bar_date = bar_time.date() if hasattr(bar_time, "date") else None
        kz = _kill_zone_name(bar_time)
        if kz == "NONE":
            continue

        atr_val = atr14.iloc[i]
        if atr_val < MIN_ATR * c.iloc[i]:
            continue

        htf = htf_bias_map.get(bar_date, 0) if bar_date else 0
        if htf == 0:
            continue

        entry_price = o.iloc[i+1]

        # ── BULL OTE: bos bullish, pull back to 62-79% of last impulse up ──
        if (bos_direction == 1 and htf == 1
                and impulse_high is not None and impulse_low is not None):
            leg = impulse_high - impulse_low
            if leg > 0:
                ote_low  = impulse_high - leg * 0.79   # 79% retracement
                ote_high = impulse_high - leg * 0.62   # 62% retracement
                if (ote_low <= entry_price <= ote_high
                        and rsi14.iloc[i] < 60
                        and c.iloc[i] > impulse_low):
                    sl_price = impulse_low - atr_val * 0.3
                    risk = entry_price - sl_price
                    if risk > 0 and risk < atr_val * 5:   # sanity check SL not too wide
                        signals.append({
                            "idx": i+1, "direction": 1,
                            "entry": entry_price,
                            "sl": sl_price,
                            "tp": entry_price + risk * RR,
                            "atr": atr_val,
                            "kz": kz,
                            "strategy": "OTE_Pullback",
                        })
                        bos_direction = 0   # reset — wait for next BOS

        # ── BEAR OTE: bos bearish, pull back to 62-79% of last impulse down ──
        if (bos_direction == -1 and htf == -1
                and impulse_high is not None and impulse_low is not None):
            leg = impulse_high - impulse_low
            if leg > 0:
                ote_low  = impulse_low + leg * 0.62
                ote_high = impulse_low + leg * 0.79
                if (ote_low <= entry_price <= ote_high
                        and rsi14.iloc[i] > 40
                        and c.iloc[i] < impulse_high):
                    sl_price = impulse_high + atr_val * 0.3
                    risk = sl_price - entry_price
                    if risk > 0 and risk < atr_val * 5:
                        signals.append({
                            "idx": i+1, "direction": -1,
                            "entry": entry_price,
                            "sl": sl_price,
                            "tp": entry_price - risk * RR,
                            "atr": atr_val,
                            "kz": kz,
                            "strategy": "OTE_Pullback",
                        })
                        bos_direction = 0

    return signals


# ─────────────────────────────────────
# SIMULATOR
# Intraday: check bar's high/low for SL/TP hit, else exit at bar close
# Max hold: same session only (forcibly close 3 hours after entry or at 15:00 UTC)
# ─────────────────────────────────────

def simulate(df, signals, risk_pct=RISK_PCT):
    equity       = INIT_EQ
    equity_curve = [equity]
    trades       = []
    h_arr = df["High"].values
    l_arr = df["Low"].values
    c_arr = df["Close"].values

    for sig in signals:
        i = sig["idx"]
        if i >= len(df):
            continue
        entry  = sig["entry"]
        sl     = sig["sl"]
        tp     = sig["tp"]
        dirn   = sig["direction"]
        risk_amt = equity * risk_pct
        sl_dist  = abs(entry - sl)
        if sl_dist < 1e-10:
            continue
        pos_size = risk_amt / sl_dist

        # Simulate next 1-3 bars (kill zone session, max 3 hours)
        exit_price = None
        for k in range(i, min(i+4, len(df))):
            bh, bl, bc = h_arr[k], l_arr[k], c_arr[k]
            if dirn == 1:
                if bl <= sl:
                    exit_price = sl; break
                if bh >= tp:
                    exit_price = tp; break
            else:
                if bh >= sl:
                    exit_price = sl; break
                if bl <= tp:
                    exit_price = tp; break
        if exit_price is None:
            exit_price = c_arr[min(i+3, len(df)-1)]   # session close

        pnl_pts = (exit_price - entry) * dirn
        pnl_usd = pnl_pts * pos_size
        equity += pnl_usd
        equity_curve.append(equity)
        trades.append({
            "entry": entry, "exit": exit_price, "sl": sl, "tp": tp,
            "direction": "LONG" if dirn==1 else "SHORT",
            "pnl": pnl_usd, "win": pnl_usd > 0,
            "kz": sig.get("kz","?"),
        })

    return trades, np.array(equity_curve)


# ─────────────────────────────────────
# METRICS
# ─────────────────────────────────────

def metrics(trades, eq_curve, symbol, strategy):
    if not trades:
        return None
    pnls   = [t["pnl"] for t in trades]
    wins   = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]

    win_rate = len(wins)/len(trades)*100
    pf = (sum(wins) / abs(sum(losses))) if losses and sum(losses) != 0 else min(sum(wins)/0.01, 99.99)
    pf = min(pf, 99.99)
    total_ret = (eq_curve[-1]/eq_curve[0]-1)*100

    peak = eq_curve[0]; max_dd = 0
    for e in eq_curve:
        if e > peak: peak = e
        dd = (peak-e)/peak*100
        if dd > max_dd: max_dd = dd

    rets = np.diff(eq_curve)/eq_curve[:-1]
    sharpe = (rets.mean()/rets.std()*np.sqrt(252*6)) if len(rets)>1 and rets.std()>0 else 0.0

    avg_win  = np.mean(wins)        if wins   else 0
    avg_loss = abs(np.mean(losses)) if losses else 0
    exp      = (win_rate/100*avg_win) - ((1-win_rate/100)*avg_loss)

    london_trades = [t for t in trades if t.get("kz")=="LONDON"]
    ny_trades     = [t for t in trades if t.get("kz")=="NY"]
    lwr = len([t for t in london_trades if t["win"]])/max(len(london_trades),1)*100
    nwr = len([t for t in ny_trades     if t["win"]])/max(len(ny_trades),    1)*100

    return {
        "symbol": symbol, "strategy": strategy,
        "trades": len(trades), "win_rate": round(win_rate,1),
        "pf": round(pf,2), "total_ret": round(total_ret,1),
        "max_dd": round(max_dd,1), "sharpe": round(sharpe,2),
        "avg_win": round(avg_win,2), "avg_loss": round(avg_loss,2),
        "expectancy": round(exp,2),
        "london_trades": len(london_trades), "london_wr": round(lwr,1),
        "ny_trades":     len(ny_trades),     "ny_wr":     round(nwr,1),
        "final_eq": round(eq_curve[-1],2),
    }


# ─────────────────────────────────────
# MAIN
# ─────────────────────────────────────

STRATEGIES = {
    "London_Sweep_OB": lambda df1h, bias, asian: strategy_london_sweep_ob(df1h, bias, asian),
    "KZ_FVG":          lambda df1h, bias, asian: strategy_kz_fvg(df1h, bias),
    "MSS_OB":          lambda df1h, bias, asian: strategy_mss_ob(df1h, bias),
    "OTE_Pullback":    lambda df1h, bias, asian: strategy_ote(df1h, bias),
}

all_results  = []
print("="*78)
print("  FINSIGHT ICT PRO BACKTEST  |  1H Bars + Kill Zones + HTF Bias")
print("  Symbols: 12 | Strategies: 4 | Risk: 1% | RR: 2.0 | EOD exit")
print("="*78)

for label, ticker in SYMBOLS.items():
    print(f"\n[{label}]  {ticker}")

    # 1H data
    try:
        raw1h = yf.download(ticker, period="730d", interval="1h",
                            auto_adjust=True, progress=False)
        if isinstance(raw1h.columns, pd.MultiIndex):
            raw1h.columns = raw1h.columns.get_level_values(0)
        df1h = raw1h[["Open","High","Low","Close"]].dropna()
        if len(df1h) < 200:
            print(f"  Not enough 1H data ({len(df1h)} bars), skipping")
            continue
        print(f"  1H bars : {len(df1h)}  ({df1h.index[0].date()} -> {df1h.index[-1].date()})")
    except Exception as e:
        print(f"  1H fetch error: {e}"); continue

    # Daily data for HTF bias
    try:
        raw_d = yf.download(ticker, start="2021-01-01", end="2026-06-29",
                            interval="1d", auto_adjust=True, progress=False)
        if isinstance(raw_d.columns, pd.MultiIndex):
            raw_d.columns = raw_d.columns.get_level_values(0)
        df_daily = raw_d[["Open","High","Low","Close"]].dropna()
        bias_series = get_htf_bias_series(df_daily)
        # Build date -> bias dict
        bias_map = {}
        for dt, b in bias_series.items():
            try:
                d = dt.date() if hasattr(dt, "date") else dt
                bias_map[d] = int(b)
            except Exception:
                pass
        print(f"  Daily bars: {len(df_daily)}")
    except Exception as e:
        print(f"  Daily fetch error: {e}"); continue

    # Asian range
    asian_ranges = build_asian_ranges(df1h)

    # Run all strategies
    for strat_name, strat_fn in STRATEGIES.items():
        try:
            sigs = strat_fn(df1h, bias_map, asian_ranges)
            if not sigs:
                print(f"  {strat_name:20s}: 0 signals")
                continue
            trades, eq = simulate(df1h, sigs)
            m = metrics(trades, eq, label, strat_name)
            if not m:
                continue
            all_results.append(m)
            tag = "**" if m["win_rate"] >= 60 else "  "
            print(f"  {tag}{strat_name:20s}| WR:{m['win_rate']:5.1f}% "
                  f"| PF:{m['pf']:5.2f} | DD:{m['max_dd']:5.1f}% "
                  f"| Sharpe:{m['sharpe']:5.2f} | Trades:{m['trades']:4d} "
                  f"| Ret:{m['total_ret']:+6.1f}%  "
                  f"[LON WR:{m['london_wr']:.0f}% | NY WR:{m['ny_wr']:.0f}%]")
        except Exception as e:
            print(f"  {strat_name} error: {e}")

# ─────────────────────────────────────
# AGGREGATE SUMMARY
# ─────────────────────────────────────
df_res = pd.DataFrame(all_results)
if not df_res.empty:
    print("\n\n" + "="*78)
    print("  AGGREGATE (avg across all symbols that had signals)")
    print("="*78)
    agg = df_res.groupby("strategy").agg(
        symbols=("symbol","count"),
        avg_trades=("trades","mean"),
        avg_wr=("win_rate","mean"),
        avg_pf=("pf","mean"),
        avg_ret=("total_ret","mean"),
        avg_dd=("max_dd","mean"),
        avg_sharpe=("sharpe","mean"),
        avg_exp=("expectancy","mean"),
        avg_lon_wr=("london_wr","mean"),
        avg_ny_wr=("ny_wr","mean"),
    ).round(2).sort_values("avg_sharpe", ascending=False)
    print(agg.to_string())

    print("\n\n" + "="*78)
    print("  BEST PER SYMBOL")
    print("="*78)
    best = df_res.sort_values("sharpe", ascending=False).groupby("symbol").first().reset_index()
    for _, r in best.iterrows():
        print(f"  {r['symbol']:8s}  {r['strategy']:20s}  WR:{r['win_rate']:5.1f}%  "
              f"PF:{r['pf']:5.2f}  Sharpe:{r['sharpe']:5.2f}  "
              f"DD:{r['max_dd']:5.1f}%  Trades:{r['trades']:4d}")

    with open("ict_pro_results.json","w") as f:
        json.dump(all_results, f, indent=2)
    print("\nSaved -> ict_pro_results.json")

print("\nDone.")
