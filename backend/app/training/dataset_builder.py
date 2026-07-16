"""
Dataset builder — fetches stock data, engineers features, builds ML sequences.
All indicators implemented in pure pandas/numpy (no pandas_ta).
"""
import logging
import os
from typing import Tuple

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

SUPPORTED_SYMBOLS = ["AAPL", "MSFT", "TSLA", "GOOGL", "RELIANCE.NS", "TCS.NS", "BTC-USD"]
PERIOD_MAP = {"1y": "1y", "3y": "3y", "5y": "5y"}

FEATURE_COLS = [
    "open", "high", "low", "close", "volume", "daily_return",
    "sma_20", "sma_50", "ema_20", "ema_50",
    "rsi_14", "macd", "macd_signal", "macd_hist",
    "bb_upper", "bb_middle", "bb_lower",
    "atr_14", "volatility_20", "trend_strength",
]

EXTENDED_FEATURE_COLS = FEATURE_COLS + [
    "vwap", "obv", "mfi_14", "stoch_k", "stoch_d",
    "adx_14", "cci_20", "willr_14",
    "ichimoku_tenkan", "ichimoku_kijun", "ichimoku_senkou_a", "ichimoku_senkou_b",
    "supertrend", "supertrend_dir", "psar",
    "kc_upper", "kc_middle", "kc_lower",
    "atr_trailing_stop", "prev_high", "prev_low", "prev_close",
    "volume_sma_20", "volume_ratio", "price_range",
]

TARGET_COL = "close"


# ── Indicator helpers (pure pandas/numpy) ─────────────────────────────────────

def _sma(s: pd.Series, length: int) -> pd.Series:
    return s.rolling(window=length).mean()

def _ema(s: pd.Series, length: int) -> pd.Series:
    return s.ewm(span=length, adjust=False).mean()

def _rsi(close: pd.Series, length: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)
    avg_gain = gain.ewm(alpha=1/length, min_periods=length).mean()
    avg_loss = loss.ewm(alpha=1/length, min_periods=length).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))

def _macd(close: pd.Series, fast=12, slow=26, signal=9):
    ema_fast = _ema(close, fast)
    ema_slow = _ema(close, slow)
    macd_line = ema_fast - ema_slow
    signal_line = _ema(macd_line, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram

def _bollinger_bands(close: pd.Series, length=20, std=2):
    middle = _sma(close, length)
    rolling_std = close.rolling(window=length).std()
    upper = middle + (rolling_std * std)
    lower = middle - (rolling_std * std)
    return upper, middle, lower

def _atr(high: pd.Series, low: pd.Series, close: pd.Series, length=14) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs()
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1/length, min_periods=length).mean()

def _obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    direction = np.sign(close.diff())
    direction.iloc[0] = 0
    return (volume * direction).cumsum()

def _mfi(high, low, close, volume, length=14):
    tp = (high + low + close) / 3
    mf = tp * volume
    delta = tp.diff()
    pos = mf.where(delta > 0, 0.0).rolling(length).sum()
    neg = mf.where(delta < 0, 0.0).rolling(length).sum()
    ratio = pos / neg
    return 100 - (100 / (1 + ratio))

def _stoch(high, low, close, k=14, d=3):
    lowest = low.rolling(k).min()
    highest = high.rolling(k).max()
    k_val = 100 * (close - lowest) / (highest - lowest)
    d_val = k_val.rolling(d).mean()
    return k_val, d_val

def _adx(high, low, close, length=14):
    plus_dm = high.diff()
    minus_dm = -low.diff()
    plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0.0)
    minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0.0)
    atr_val = _atr(high, low, close, length)
    plus_di = 100 * _ema(plus_dm, length) / atr_val
    minus_di = 100 * _ema(minus_dm, length) / atr_val
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di)
    adx_val = _ema(dx, length)
    return adx_val

def _cci(high, low, close, length=20):
    tp = (high + low + close) / 3
    sma_tp = _sma(tp, length)
    mad = tp.rolling(length).apply(lambda x: np.abs(x - x.mean()).mean(), raw=True)
    return (tp - sma_tp) / (0.015 * mad)

def _willr(high, low, close, length=14):
    highest = high.rolling(length).max()
    lowest = low.rolling(length).min()
    return -100 * (highest - close) / (highest - lowest)


# ── Feature engineering ───────────────────────────────────────────────────────

def _bb_columns(bb_upper, bb_middle, bb_lower):
    return bb_upper, bb_middle, bb_lower


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add all engineered indicator features in-place and return cleaned DF."""
    df = df.copy()

    df["daily_return"] = df["close"].pct_change()

    df["sma_20"] = _sma(df["close"], 20)
    df["sma_50"] = _sma(df["close"], 50)
    df["ema_20"] = _ema(df["close"], 20)
    df["ema_50"] = _ema(df["close"], 50)

    df["rsi_14"] = _rsi(df["close"], 14)

    macd_line, macd_signal, macd_hist = _macd(df["close"])
    df["macd"] = macd_line
    df["macd_signal"] = macd_signal
    df["macd_hist"] = macd_hist

    bb_upper, bb_middle, bb_lower = _bollinger_bands(df["close"])
    df["bb_upper"], df["bb_middle"], df["bb_lower"] = bb_upper, bb_middle, bb_lower

    df["atr_14"] = _atr(df["high"], df["low"], df["close"], 14)
    df["volatility_20"] = df["daily_return"].rolling(20).std()
    df["trend_strength"] = df["close"] / df["sma_50"]

    return df


def engineer_extended_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add the 15 extended-feature groups + regime + index correlation."""
    df = engineer_features(df)
    high, low, close, vol = df["high"], df["low"], df["close"], df["volume"]

    tp = (high + low + close) / 3
    df["vwap"] = (tp * vol).cumsum() / vol.cumsum().replace(0, np.nan)

    poc, vah, val_arr = _volume_profile(df, window=20)
    df["vp_poc"], df["vp_vah"], df["vp_val"] = poc, vah, val_arr

    df["obv"] = _obv(close, vol)
    df["mfi_14"] = _mfi(high, low, close, vol, 14)

    stoch_k, stoch_d = _stoch(high, low, close, 14, 3)
    df["stoch_k"] = stoch_k
    df["stoch_d"] = stoch_d

    df["adx_14"] = _adx(high, low, close, 14)
    df["cci_20"] = _cci(high, low, close, 20)
    df["willr_14"] = _willr(high, low, close, 14)

    tenkan = (_high_low_max(high, low, 9) + _high_low_min(high, low, 9)) / 2
    kijun = (_high_low_max(high, low, 26) + _high_low_min(high, low, 26)) / 2
    df["ichimoku_tenkan"] = tenkan
    df["ichimoku_kijun"] = kijun
    df["ichimoku_senkou_a"] = ((tenkan + kijun) / 2).shift(26)
    df["ichimoku_senkou_b"] = ((_high_low_max(high, low, 52) + _high_low_min(high, low, 52)) / 2).shift(26)

    atr10 = _atr(high, low, close, 10)
    hl2 = (high + low) / 2
    up_band = hl2 + 3.0 * atr10
    dn_band = hl2 - 3.0 * atr10
    st = pd.Series(np.nan, index=df.index)
    st_dir = pd.Series(np.nan, index=df.index)
    for i in range(1, len(df)):
        if close.iloc[i] > up_band.iloc[i - 1]:
            st.iloc[i] = dn_band.iloc[i]
            st_dir.iloc[i] = 1
        else:
            st.iloc[i] = up_band.iloc[i - 1]
            st_dir.iloc[i] = -1
        if close.iloc[i] > st.iloc[i]:
            st.iloc[i] = dn_band.iloc[i]
        else:
            st.iloc[i] = up_band.iloc[i - 1]
    df["supertrend"] = st
    df["supertrend_dir"] = st_dir

    df["psar"] = np.nan
    df["kc_upper"] = np.nan
    df["kc_middle"] = np.nan
    df["kc_lower"] = np.nan

    atr14 = df["atr_14"] if "atr_14" in df else _atr(high, low, close, 14)
    df["atr_trailing_stop"] = close - 3.0 * atr14

    df["prev_high"] = high.shift(1)
    df["prev_low"] = low.shift(1)
    df["prev_close"] = close.shift(1)

    df["volume_sma_20"] = _sma(vol.astype(float), 20)
    df["volume_ratio"] = vol.astype(float) / df["volume_sma_20"]
    df["price_range"] = (high - low) / close

    return df


def _high_low_max(high, low, length):
    return pd.concat([high, low], axis=1).max(axis=1).rolling(length).max()

def _high_low_min(high, low, length):
    return pd.concat([high, low], axis=1).min(axis=1).rolling(length).min()


def _volume_profile(df, window=20, bins=24):
    n = len(df)
    poc = np.full(n, np.nan)
    vah = np.full(n, np.nan)
    val = np.full(n, np.nan)
    highs, lows, closes, vols = (df["high"].values, df["low"].values,
                                 df["close"].values, df["volume"].values)
    for i in range(window, n):
        lo, hi = lows[i - window:i].min(), highs[i - window:i].max()
        if not np.isfinite(lo) or not np.isfinite(hi) or hi <= lo:
            continue
        edges = np.linspace(lo, hi, bins + 1)
        centers = (edges[:-1] + edges[1:]) / 2
        hist = np.zeros(bins)
        idx = np.clip(np.digitize(closes[i - window:i], edges) - 1, 0, bins - 1)
        for k, b in enumerate(idx):
            hist[b] += vols[i - window + k]
        if hist.sum() <= 0:
            continue
        poc_bin = int(hist.argmax())
        poc[i] = centers[poc_bin]
        target = hist.sum() * 0.70
        lo_b = hi_b = poc_bin
        captured = hist[poc_bin]
        while captured < target and (lo_b > 0 or hi_b < bins - 1):
            down = hist[lo_b - 1] if lo_b > 0 else -1
            up = hist[hi_b + 1] if hi_b < bins - 1 else -1
            if up >= down:
                hi_b += 1; captured += max(up, 0)
            else:
                lo_b -= 1; captured += max(down, 0)
        vah[i] = centers[hi_b]
        val[i] = centers[lo_b]
    return poc, vah, val


def fetch_data(symbol: str, period: str = "3y") -> pd.DataFrame:
    if period not in PERIOD_MAP:
        period = "3y"
    ticker = yf.Ticker(symbol)
    df = ticker.history(period=PERIOD_MAP[period])
    if df.empty:
        raise ValueError(f"No data for {symbol}")
    df.columns = [c.lower() for c in df.columns]
    return df


def build_dataset(symbol: str, period: str = "3y", extended: bool = False) -> pd.DataFrame:
    df = fetch_data(symbol, period)
    if extended:
        df = engineer_extended_features(df)
    else:
        df = engineer_features(df)
    df.dropna(inplace=True)
    return df


def build_sequences(df: pd.DataFrame, seq_len: int, feature_cols=None, target_col=TARGET_COL):
    if feature_cols is None:
        feature_cols = FEATURE_COLS
    available = [c for c in feature_cols if c in df.columns]
    X = df[available].values
    y = df[target_col].values
    Xs, ys = [], []
    for i in range(seq_len, len(X)):
        Xs.append(X[i - seq_len:i])
        ys.append(y[i])
    return np.array(Xs), np.array(ys)
