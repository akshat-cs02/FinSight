"""
Dataset builder: fetch OHLCV + engineer features for ML models.

Base features (all numeric, ready for scaling):
    Price:      open, high, low, close, volume, daily_return
    Trend:      sma_20, sma_50, ema_20, ema_50
    Momentum:   rsi_14, macd, macd_signal, macd_hist
    Volatility: bb_upper, bb_middle, bb_lower, atr_14, volatility_20
    Strength:   trend_strength (close / sma_50)

Extended features (appended after the base set — see EXTENDED_FEATURE_COLS):
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

try:
    import pandas_ta as ta
    PANDAS_TA_AVAILABLE = True
except ImportError:
    PANDAS_TA_AVAILABLE = False

logger = logging.getLogger(__name__)

SUPPORTED_SYMBOLS = ["AAPL", "MSFT", "TSLA", "GOOGL", "RELIANCE.NS", "TCS.NS", "BTC-USD"]
PERIOD_MAP = {"1y": "1y", "3y": "3y", "5y": "5y"}

# ── Base feature set (unchanged order — backwards compatible) ─────────────────
FEATURE_COLS = [
    "open", "high", "low", "close", "volume", "daily_return",
    "sma_20", "sma_50", "ema_20", "ema_50",
    "rsi_14", "macd", "macd_signal", "macd_hist",
    "bb_upper", "bb_middle", "bb_lower",
    "atr_14", "volatility_20", "trend_strength",
]

# ── Extended feature set (the 15 new groups + regime + correlation) ───────────
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
    # Map spot/TradingView tickers (XAUUSD=X, USOIL, …) to a symbol that
    # actually returns data (futures proxy for spot metals/oil).
    from app.services.market_data_service import resolve_symbol
    from app.services import tradingview_service as tv
    yf_symbol = resolve_symbol(symbol)
    # Route through the TradingView service (TV-first when enabled, yfinance
    # fallback) — returns a yfinance-shaped DataFrame.
    df = tv.get_ohlcv_df(yf_symbol, period=PERIOD_MAP[period], interval="1d")
    if df.empty:
        raise ValueError(f"No data returned for {symbol}")
    df = df.rename(columns={"Open": "open", "High": "high", "Low": "low",
                            "Close": "close", "Volume": "volume"})
    df = df[["open", "high", "low", "close", "volume"]].copy()
    df.index = pd.to_datetime(df.index)
    return df


def _bb_columns(bb: pd.DataFrame) -> Tuple[pd.Series, pd.Series, pd.Series]:
    upper = middle = lower = None
    for c in bb.columns:
        if c.startswith("BBU_"):
            upper = bb[c]
        elif c.startswith("BBM_"):
            middle = bb[c]
        elif c.startswith("BBL_"):
            lower = bb[c]
    return upper, middle, lower


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add all engineered indicator features in-place and return cleaned DF."""
    if not PANDAS_TA_AVAILABLE:
        raise ImportError("pandas_ta is not installed. Technical indicators are unavailable.")
    df = df.copy()

    df["daily_return"] = df["close"].pct_change()

    df["sma_20"] = ta.sma(df["close"], length=20)
    df["sma_50"] = ta.sma(df["close"], length=50)
    df["ema_20"] = ta.ema(df["close"], length=20)
    df["ema_50"] = ta.ema(df["close"], length=50)

    df["rsi_14"] = ta.rsi(df["close"], length=14)

    macd = ta.macd(df["close"], fast=12, slow=26, signal=9)
    df["macd"] = macd["MACD_12_26_9"]
    df["macd_signal"] = macd["MACDs_12_26_9"]
    df["macd_hist"] = macd["MACDh_12_26_9"]

    bb = ta.bbands(df["close"], length=20, std=2)
    upper, middle, lower = _bb_columns(bb)
    df["bb_upper"], df["bb_middle"], df["bb_lower"] = upper, middle, lower

    df["atr_14"] = ta.atr(df["high"], df["low"], df["close"], length=14)
    df["volatility_20"] = df["daily_return"].rolling(20).std()
    df["trend_strength"] = df["close"] / df["sma_50"]

    return df


# ── Helpers for the extended feature set ──────────────────────────────────────
def _first_col(frame, prefix: str):
    """First column of a pandas_ta result frame whose name starts with prefix."""
    if frame is None:
        return None
    if isinstance(frame, pd.Series):
        return frame
    for c in frame.columns:
        if c.startswith(prefix):
            return frame[c]
    return frame.iloc[:, 0] if frame.shape[1] else None


def _volume_profile(df: pd.DataFrame, window: int = 20, bins: int = 24):
    """
    Rolling Volume-Profile POC / VAH / VAL over the last `window` sessions.
    POC = price bin with the most volume; VA = 70% of volume around POC.
    """
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
        # Value area: expand outward from POC until ≥70% of volume captured.
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


def engineer_extended_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add the 15 extended-feature groups + regime + index correlation."""
    df = df.copy()
    high, low, close, vol = df["high"], df["low"], df["close"], df["volume"]

    # 1. VWAP (cumulative typical-price × volume / cumulative volume)
    tp = (high + low + close) / 3
    df["vwap"] = (tp * vol).cumsum() / vol.cumsum().replace(0, np.nan)

    # 2. Volume Profile (POC / VAH / VAL over last 20 sessions)
    poc, vah, val = _volume_profile(df, window=20)
    df["vp_poc"], df["vp_vah"], df["vp_val"] = poc, vah, val

    # 3. OBV
    df["obv"] = ta.obv(close, vol)

    # 4. MFI
    df["mfi_14"] = ta.mfi(high, low, close, vol, length=14)

    # 5. Stochastic K / D
    stoch = ta.stoch(high, low, close, k=14, d=3)
    df["stoch_k"] = _first_col(stoch, "STOCHk")
    df["stoch_d"] = _first_col(stoch, "STOCHd")

    # 6. ADX
    adx = ta.adx(high, low, close, length=14)
    df["adx_14"] = _first_col(adx, "ADX")

    # 7. CCI
    df["cci_20"] = ta.cci(high, low, close, length=20)

    # 8. Williams %R
    df["willr_14"] = ta.willr(high, low, close, length=14)

    # 9. Ichimoku Cloud
    try:
        ich, _ = ta.ichimoku(high, low, close)
        df["ichimoku_tenkan"] = _first_col(ich, "ITS")
        df["ichimoku_kijun"] = _first_col(ich, "IKS")
        df["ichimoku_senkou_a"] = _first_col(ich, "ISA")
        df["ichimoku_senkou_b"] = _first_col(ich, "ISB")
    except Exception:
        for c in ("ichimoku_tenkan", "ichimoku_kijun", "ichimoku_senkou_a", "ichimoku_senkou_b"):
            df[c] = np.nan

    # 10. Supertrend
    try:
        st = ta.supertrend(high, low, close, length=10, multiplier=3.0)
        df["supertrend"] = _first_col(st, "SUPERT_")
        df["supertrend_dir"] = _first_col(st, "SUPERTd_")
    except Exception:
        df["supertrend"] = np.nan
        df["supertrend_dir"] = np.nan

    # 11. Parabolic SAR
    try:
        psar = ta.psar(high, low, close)
        long_ = _first_col(psar, "PSARl")
        short_ = _first_col(psar, "PSARs")
        df["psar"] = long_.combine_first(short_) if long_ is not None and short_ is not None else _first_col(psar, "PSAR")
    except Exception:
        df["psar"] = np.nan

    # 12. Keltner Channels (pandas_ta names them KCUe/KCBe/KCLe)
    try:
        kc = ta.kc(high, low, close, length=20, scalar=2.0)
        up = _first_col(kc, "KCU")
        mid = _first_col(kc, "KCB")
        lo = _first_col(kc, "KCL")
        df["kc_upper"] = up if up is not None else np.nan
        df["kc_middle"] = mid if mid is not None else np.nan
        df["kc_lower"] = lo if lo is not None else np.nan
    except Exception:
        df["kc_upper"] = df["kc_middle"] = df["kc_lower"] = np.nan

    # 13. ATR trailing stop (chandelier-style: close − 3·ATR)
    atr = df["atr_14"] if "atr_14" in df else ta.atr(high, low, close, length=14)
    df["atr_trailing_stop"] = close - 3.0 * atr

    # 14. Previous day High / Low / Close
    df["prev_high"] = high.shift(1)
    df["prev_low"] = low.shift(1)
    df["prev_close"] = close.shift(1)

    # 15. Session High/Low — on daily bars, a 4-bar rolling window (~"last 4h"
    #     proxy for daily data; on intraday data this is the true 4-hour window).
    df["session_high"] = high.rolling(4, min_periods=1).max()
    df["session_low"] = low.rolling(4, min_periods=1).min()

    # ── Market regime (one-hot): trending / ranging / volatile ────────────────
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

    CRITICAL: columns that are 100% NaN (e.g. VWAP / volume-profile on forex
    or index tickers where Yahoo reports volume=0) are dropped BEFORE ffill —
    otherwise bfill can't fill them and final dropna() would delete every row
    of the dataset, making prediction impossible for those symbols.
    """
    df = df[~df.index.duplicated(keep="last")]
    if "daily_return" in df.columns:
        q1, q3 = df["daily_return"].quantile([0.01, 0.99])
        df["daily_return"] = df["daily_return"].clip(lower=q1, upper=q3)
    # Drop fully-NaN columns first — ffill/bfill can't rescue them, and they
    # would otherwise poison every row when dropna() runs at the end.
    all_nan_cols = df.columns[df.isna().all()].tolist()
    if all_nan_cols:
        df = df.drop(columns=all_nan_cols)
    # forward-fill then back-fill instead of dropping every warm-up row
    df = df.ffill().bfill()
    if drop:
        df = df.dropna()
    return df


def build_dataset(symbol: str, period: str = "3y", extended: bool = True) -> pd.DataFrame:
    """
    Full pipeline: fetch → engineer → (extended features) → clean.

    `extended=True` (default) adds the 15 new feature groups + regime +
    correlation. Pass `extended=False` for the original 20-column set.
    """
    raw = fetch_ohlcv(symbol, period)
    feat = engineer_features(raw)
    if extended:
        feat = engineer_extended_features(feat)
        feat["index_corr_20"] = _index_correlation(feat, symbol, window=20)
    cleaned = clean_dataset(feat)
    logger.info(f"[{symbol}] dataset: {len(cleaned)} rows × {len(cleaned.columns)} cols")
    return cleaned


def build_xy_supervised(df: pd.DataFrame, horizon: int = 1,
                        feature_cols: list | None = None) -> Tuple[np.ndarray, np.ndarray, list]:
    """
    For XGBoost: each row → next-day close.
    X = feature row(t), y = close(t + horizon).

    `feature_cols` defaults to the base FEATURE_COLS; pass EXTENDED_FEATURE_COLS
    (intersected with df.columns) to train on the full feature set.
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
    For LSTM: rolling window of seq_len timesteps → predict next target value.
    arr: shape (T, n_features) — feature matrix (already scaled).
    target_arr: shape (T,) — target series (already scaled or raw, your choice).
    """
    X, y = [], []
    for i in range(len(arr) - seq_len):
        X.append(arr[i : i + seq_len])
        y.append(target_arr[i + seq_len])
    return np.array(X, dtype=np.float32), np.array(y, dtype=np.float32)
