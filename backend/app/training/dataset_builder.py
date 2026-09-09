"""
Dataset builder: fetch OHLCV + engineer features for ML models.

Base features (all numeric, ready for scaling):
    Price:      open, high, low, close, volume, daily_return
    Trend:      sma_20, sma_50, ema_20, ema_50
    Momentum:   rsi_14, macd, macd_signal, macd_hist
    Volatility: bb_upper, bb_middle, bb_lower, atr_14, volatility_20
    Strength:   trend_strength (close / sma_50)

Extended features (appended after the base set -- see EXTENDED_FEATURE_COLS):
    VWAP, volume profile (POC/VAH/VAL), OBV, MFI, Stoch K/D, ADX, CCI,
    Williams %R, Ichimoku (Tenkan/Kijun/Senkou A/B), Supertrend, PSAR,
    Keltner (upper/mid/lower), ATR trailing stop, prev-day H/L/C, session H/L,
    market regime (one-hot), and index correlation.

IMPORTANT: `FEATURE_COLS` stays APPEND-ONLY so previously-trained models (which
scaled the original 20 columns) keep loading. New training picks up the full
set via `build_dataset(..., extended=True)`.
"""
from __future__ import annotations

import logging
from typing import Tuple

import numpy as np
import pandas as pd
import yfinance as yf
from ta.trend import SMAIndicator, EMAIndicator, MACD, ADXIndicator, CCIIndicator, IchimokuIndicator, PSARIndicator
from ta.momentum import RSIIndicator, WilliamsRIndicator, StochasticOscillator
from ta.volatility import BollingerBands, AverageTrueRange, KeltnerChannel
from ta.volume import OnBalanceVolumeIndicator, MoneyFlowIndexIndicator

logger = logging.getLogger(__name__)

SUPPORTED_SYMBOLS = ["AAPL", "MSFT", "TSLA", "GOOGL", "RELIANCE.NS", "TCS.NS", "BTC-USD"]
PERIOD_MAP = {"1y": "1y", "3y": "3y", "5y": "5y"}

# -- Base feature set (unchanged order -- backwards compatible) ----------------
FEATURE_COLS = [
    "open", "high", "low", "close", "volume", "daily_return",
    "sma_20", "sma_50", "ema_20", "ema_50",
    "rsi_14", "macd", "macd_signal", "macd_hist",
    "bb_upper", "bb_middle", "bb_lower",
    "atr_14", "volatility_20", "trend_strength",
]

# -- Extended feature set (the 15 new groups + regime + correlation) ----------
EXTENDED_FEATURE_COLS = FEATURE_COLS + [
    "vwap",
    "vp_poc", "vp_vah", "vp_val",
    "obv",
    "mfi_14",
    "stoch_k", "stoch_d",
    "adx_14",
    "cci_20",
    "willr_14",
    "ichimoku_tenkan", "ichimoku_kijun", "ichimoku_senkou_a", "ichimoku_senkou_b",
    "supertrend", "supertrend_dir",
    "psar",
    "kc_upper", "kc_middle", "kc_lower",
    "atr_trailing_stop",
    "prev_high", "prev_low", "prev_close",
    "session_high", "session_low",
    "regime_trending", "regime_ranging", "regime_volatile",
    "index_corr_20",
]
TARGET_COL = "close"


def fetch_ohlcv(symbol: str, period: str = "3y") -> pd.DataFrame:
    """Fetch historical OHLCV via yfinance."""
    if period not in PERIOD_MAP:
        period = "3y"
    from app.services.market_data_service import resolve_symbol
    from app.services import tradingview_service as tv
    yf_symbol = resolve_symbol(symbol)
    df = tv.get_ohlcv_df(yf_symbol, period=PERIOD_MAP[period], interval="1d")
    if df.empty:
        raise ValueError(f"No data returned for {symbol}")
    df = df.rename(columns={"Open": "open", "High": "high", "Low": "low",
                            "Close": "close", "Volume": "volume"})
    df = df[["open", "high", "low", "close", "volume"]].copy()
    df.index = pd.to_datetime(df.index)
    return df


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add all engineered indicator features in-place and return cleaned DF."""
    df = df.copy()

    df["daily_return"] = df["close"].pct_change()

    df["sma_20"] = SMAIndicator(df["close"], window=20).sma_indicator()
    df["sma_50"] = SMAIndicator(df["close"], window=50).sma_indicator()
    df["ema_20"] = EMAIndicator(df["close"], window=20).ema_indicator()
    df["ema_50"] = EMAIndicator(df["close"], window=50).ema_indicator()

    df["rsi_14"] = RSIIndicator(df["close"], window=14).rsi()

    macd_ind = MACD(df["close"], window_slow=26, window_fast=12, window_sign=9)
    df["macd"] = macd_ind.macd()
    df["macd_signal"] = macd_ind.macd_signal()
    df["macd_hist"] = macd_ind.macd_diff()

    bb = BollingerBands(df["close"], window=20, window_dev=2)
    df["bb_upper"] = bb.bollinger_hband()
    df["bb_middle"] = bb.bollinger_mavg()
    df["bb_lower"] = bb.bollinger_lband()

    df["atr_14"] = AverageTrueRange(df["high"], df["low"], df["close"], window=14).average_true_range()
    df["volatility_20"] = df["daily_return"].rolling(20).std()
    df["trend_strength"] = df["close"] / df["sma_50"]

    return df


# -- Helpers for the extended feature set ------------------------------------
def _supertrend(high: pd.Series, low: pd.Series, close: pd.Series,
                length: int = 10, multiplier: float = 3.0) -> Tuple[pd.Series, pd.Series]:
    """Manual Supertrend implementation (not in `ta` library)."""
    hl2 = (high + low) / 2
    atr = AverageTrueRange(high, low, close, window=length).average_true_range()
    upper = hl2 + multiplier * atr
    lower = hl2 - multiplier * atr

    n = len(close)
    st = np.full(n, np.nan)
    direction = np.full(n, np.nan)  # 1 = up, -1 = down

    prev_st = 0.0
    prev_dir = -1

    for i in range(length, n):
        if np.isnan(upper.iloc[i]) or np.isnan(lower.iloc[i]):
            continue
        # Final bands adjust based on previous supertrend
        fu = upper.iloc[i]
        fl = lower.iloc[i]
        if not np.isnan(prev_st):
            if prev_dir == 1 and prev_st > lower.iloc[i]:
                fl = prev_st
            if prev_dir == -1 and prev_st < upper.iloc[i]:
                fu = prev_st

        if close.iloc[i] > fu:
            cur_st = fl
            cur_dir = 1
        elif close.iloc[i] < fl:
            cur_st = fu
            cur_dir = -1
        else:
            cur_st = prev_st if prev_st != 0 else fl
            cur_dir = prev_dir if prev_dir != -1 else -1

        st[i] = cur_st
        direction[i] = cur_dir
        prev_st = cur_st
        prev_dir = cur_dir

    return pd.Series(st, index=close.index), pd.Series(direction, index=close.index)


def engineer_extended_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add the 15 extended-feature groups + regime + index correlation."""
    df = df.copy()
    high, low, close, vol = df["high"], df["low"], df["close"], df["volume"]

    # 1. VWAP
    tp = (high + low + close) / 3
    df["vwap"] = (tp * vol).cumsum() / vol.cumsum().replace(0, np.nan)

    # 2. Volume Profile (POC / VAH / VAL over last 20 sessions)
    n = len(df)
    poc = np.full(n, np.nan)
    vah = np.full(n, np.nan)
    val = np.full(n, np.nan)
    highs, lows, closes, vols = (high.values, low.values, close.values, vol.values)
    for i in range(20, n):
        lo, hi = lows[i - 20:i].min(), highs[i - 20:i].max()
        if not np.isfinite(lo) or not np.isfinite(hi) or hi <= lo:
            continue
        edges = np.linspace(lo, hi, 25)
        centers = (edges[:-1] + edges[1:]) / 2
        hist = np.zeros(24)
        idx = np.clip(np.digitize(closes[i - 20:i], edges) - 1, 0, 23)
        for k, b in enumerate(idx):
            hist[b] += vols[i - 20 + k]
        if hist.sum() <= 0:
            continue
        poc_bin = int(hist.argmax())
        poc[i] = centers[poc_bin]
        target = hist.sum() * 0.70
        lo_b = hi_b = poc_bin
        captured = hist[poc_bin]
        while captured < target and (lo_b > 0 or hi_b < 23):
            down = hist[lo_b - 1] if lo_b > 0 else -1
            up = hist[hi_b + 1] if hi_b < 23 else -1
            if up >= down:
                hi_b += 1; captured += max(up, 0)
            else:
                lo_b -= 1; captured += max(down, 0)
        vah[i] = centers[hi_b]
        val[i] = centers[lo_b]
    df["vp_poc"], df["vp_vah"], df["vp_val"] = poc, vah, val

    # 3. OBV
    df["obv"] = OnBalanceVolumeIndicator(close, vol).on_balance_volume()

    # 4. MFI
    df["mfi_14"] = MoneyFlowIndexIndicator(high, low, close, vol, window=14).money_flow_index()

    # 5. Stochastic K / D
    stoch = StochasticOscillator(high, low, close, window=14, smooth_window=3)
    df["stoch_k"] = stoch.stoch()
    df["stoch_d"] = stoch.stoch_signal()

    # 6. ADX
    adx_ind = ADXIndicator(high, low, close, window=14)
    df["adx_14"] = adx_ind.adx()

    # 7. CCI
    df["cci_20"] = CCIIndicator(high, low, close, window=20).cci()

    # 8. Williams %R
    df["willr_14"] = WilliamsRIndicator(high, low, close, lbp=14).williams_r()

    # 9. Ichimoku Cloud
    try:
        ich = IchimokuIndicator(high, low, close, window1=9, window2=26, window3=52)
        df["ichimoku_tenkan"] = ich.ichimoku_conversion_line()
        df["ichimoku_kijun"] = ich.ichimoku_base_line()
        df["ichimoku_senkou_a"] = ich.ichimoku_a()
        df["ichimoku_senkou_b"] = ich.ichimoku_b()
    except Exception:
        for c in ("ichimoku_tenkan", "ichimoku_kijun", "ichimoku_senkou_a", "ichimoku_senkou_b"):
            df[c] = np.nan

    # 10. Supertrend (manual implementation)
    try:
        st_val, st_dir = _supertrend(high, low, close, length=10, multiplier=3.0)
        df["supertrend"] = st_val
        df["supertrend_dir"] = st_dir
    except Exception:
        df["supertrend"] = np.nan
        df["supertrend_dir"] = np.nan

    # 11. Parabolic SAR
    try:
        psar_ind = PSARIndicator(high, low, close)
        df["psar"] = psar_ind.psar()
    except Exception:
        df["psar"] = np.nan

    # 12. Keltner Channels
    try:
        kc = KeltnerChannel(high, low, close, window=20, window_atr=10, multiplier=2.0)
        df["kc_upper"] = kc.keltner_channel_hband()
        df["kc_middle"] = kc.keltner_channel_mband()
        df["kc_lower"] = kc.keltner_channel_lband()
    except Exception:
        df["kc_upper"] = df["kc_middle"] = df["kc_lower"] = np.nan

    # 13. ATR trailing stop (chandelier-style: close - 3*ATR)
    atr = df["atr_14"] if "atr_14" in df else AverageTrueRange(high, low, close, window=14).average_true_range()
    df["atr_trailing_stop"] = close - 3.0 * atr

    # 14. Previous day High / Low / Close
    df["prev_high"] = high.shift(1)
    df["prev_low"] = low.shift(1)
    df["prev_close"] = close.shift(1)

    # 15. Session High/Low
    df["session_high"] = high.rolling(4, min_periods=1).max()
    df["session_low"] = low.rolling(4, min_periods=1).min()

    # -- Market regime (one-hot) --
    adx_v = df["adx_14"]
    atr_200 = atr.rolling(200, min_periods=20).mean()
    volatile = atr > 1.5 * atr_200
    trending = (adx_v > 25) & ~volatile
    ranging = (adx_v < 20) & ~volatile
    df["regime_trending"] = trending.astype(float)
    df["regime_ranging"] = ranging.astype(float)
    df["regime_volatile"] = volatile.astype(float)

    return df


def _index_correlation(df: pd.DataFrame, symbol: str, window: int = 20) -> pd.Series:
    """Rolling 20-day return correlation with a reference index (NIFTY or SPY)."""
    ref = "^NSEI" if (symbol.upper().endswith(".NS") or symbol.upper().endswith(".BO")) else "^GSPC"
    try:
        from app.services import tradingview_service as tv
        idx = tv.get_ohlcv_df(ref, period="2y", interval="1d")
        idx_ret = idx["Close"].pct_change()
        idx_ret.index = pd.to_datetime(idx_ret.index)
        aligned = idx_ret.reindex(df.index, method="ffill")
        return df["daily_return"].rolling(window).corr(aligned)
    except Exception as e:
        logger.warning("index correlation failed for %s: %s", symbol, e)
        return pd.Series(np.nan, index=df.index)


def clean_dataset(df: pd.DataFrame, drop: bool = True) -> pd.DataFrame:
    """
    De-dupe, clip return outliers, and handle NaNs.

    Nan policy: forward-fill then back-fill (preserves rows that indicator
    warm-up would otherwise delete). `drop=True` still drops any residual NaNs
    at the very start where even bfill can't help.
    """
    df = df[~df.index.duplicated(keep="last")]
    if "daily_return" in df.columns:
        q1, q3 = df["daily_return"].quantile([0.01, 0.99])
        df["daily_return"] = df["daily_return"].clip(lower=q1, upper=q3)
    all_nan_cols = df.columns[df.isna().all()].tolist()
    if all_nan_cols:
        df = df.drop(columns=all_nan_cols)
    df = df.ffill().bfill()
    if drop:
        df = df.dropna()
    return df


def build_dataset(symbol: str, period: str = "3y", extended: bool = True) -> pd.DataFrame:
    """
    Full pipeline: fetch -> engineer -> (extended features) -> clean.

    `extended=True` (default) adds the 15 new feature groups + regime +
    correlation. Pass `extended=False` for the original 20-column set.
    """
    raw = fetch_ohlcv(symbol, period)
    feat = engineer_features(raw)
    if extended:
        feat = engineer_extended_features(feat)
        feat["index_corr_20"] = _index_correlation(feat, symbol, window=20)
    cleaned = clean_dataset(feat)
    logger.info(f"[{symbol}] dataset: {len(cleaned)} rows x {len(cleaned.columns)} cols")
    return cleaned


def build_xy_supervised(df: pd.DataFrame, horizon: int = 1,
                        feature_cols: list | None = None) -> Tuple[np.ndarray, np.ndarray, list]:
    """
    For XGBoost: each row -> next-day close.
    X = feature row(t), y = close(t + horizon).
    """
    cols = [c for c in (feature_cols or FEATURE_COLS) if c in df.columns]
    features = df[cols].copy()
    target = df[TARGET_COL].shift(-horizon)
    valid = ~target.isna()
    X = features[valid].to_numpy(dtype=np.float32)
    y = target[valid].to_numpy(dtype=np.float32)
    return X, y, cols


def build_sequences(arr: np.ndarray, target_arr: np.ndarray, seq_len: int = 60) -> Tuple[np.ndarray, np.ndarray]:
    """
    For LSTM: rolling window of seq_len timesteps -> predict next target value.
    """
    X, y = [], []
    for i in range(len(arr) - seq_len):
        X.append(arr[i : i + seq_len])
        y.append(target_arr[i + seq_len])
    return np.array(X, dtype=np.float32), np.array(y, dtype=np.float32)
