"""
Technical indicators — pure pandas/numpy (no pandas_ta dependency).
RSI, MACD, EMA, SMA, Bollinger Bands, ATR.
"""
import logging
import yfinance as yf
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

PERIOD_MAP = {
    "1mo": "1mo",
    "3mo": "3mo",
    "6mo": "6mo",
    "1y": "1y",
    "5y": "5y",
}


def _safe_last(series):
    try:
        v = series.dropna().iloc[-1]
        return float(v)
    except Exception:
        return None


def _safe_list(series, n=60):
    s = series.dropna().tail(n)
    return [{"date": idx.isoformat(), "value": float(v)} for idx, v in s.items()]


def _sma(close: pd.Series, length: int) -> pd.Series:
    return close.rolling(window=length).mean()


def _ema(close: pd.Series, length: int) -> pd.Series:
    return close.ewm(span=length, adjust=False).mean()


def _rsi(close: pd.Series, length: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)
    avg_gain = gain.ewm(alpha=1/length, min_periods=length).mean()
    avg_loss = loss.ewm(alpha=1/length, min_periods=length).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def _macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    ema_fast = _ema(close, fast)
    ema_slow = _ema(close, slow)
    macd_line = ema_fast - ema_slow
    signal_line = _ema(macd_line, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def _bollinger_bands(close: pd.Series, length: int = 20, std: int = 2):
    middle = _sma(close, length)
    rolling_std = close.rolling(window=length).std()
    upper = middle + (rolling_std * std)
    lower = middle - (rolling_std * std)
    return upper, middle, lower


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, length: int = 14) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs()
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1/length, min_periods=length).mean()


def calculate_indicators(symbol: str, period: str = "6mo") -> dict:
    if period not in PERIOD_MAP:
        period = "6mo"

    ticker = yf.Ticker(symbol)
    df = ticker.history(period=PERIOD_MAP[period])
    if df.empty:
        raise ValueError(f"No data for {symbol}")

    close = df["Close"]
    high = df["High"]
    low = df["Low"]

    sma_20 = _sma(close, 20)
    sma_50 = _sma(close, 50)
    sma_200 = _sma(close, 200) if len(close) >= 200 else None

    ema_12 = _ema(close, 12)
    ema_26 = _ema(close, 26)

    rsi_14 = _rsi(close, 14)

    macd_line, macd_signal, macd_hist = _macd(close)

    bb_upper, bb_middle, bb_lower = _bollinger_bands(close)

    current_price = float(close.iloc[-1])
    current_rsi = _safe_last(rsi_14)
    macd_hist_last = _safe_last(macd_hist)
    bb_upper_last = _safe_last(bb_upper)
    bb_lower_last = _safe_last(bb_lower)

    try:
        from app.services.prediction_service import _unified_signal, _compute_levels
        atr_series = _atr(high, low, close, 14)
        atr_last = float(atr_series.dropna().iloc[-1]) if not atr_series.dropna().empty else None
        signal, _, _ = _unified_signal(current_price, current_price, current_rsi,
                                       macd_hist_last, bb_upper_last, bb_lower_last)
        levels = _compute_levels(current_price, signal, atr_last)
    except Exception as e:
        logger.warning(f"unified signal in indicators failed: {e}")
        signal = "HOLD"
        atr_last = None
        levels = {"entry_price": None, "stop_loss": None, "take_profit": None, "risk_reward_ratio": None, "atr": None}

    return {
        "symbol": symbol,
        "period": period,
        "current_price": current_price,
        "signal": signal,
        "entry_price": levels["entry_price"],
        "stop_loss": levels["stop_loss"],
        "take_profit": levels["take_profit"],
        "risk_reward_ratio": levels["risk_reward_ratio"],
        "atr": levels["atr"],
        "latest": {
            "sma_20": _safe_last(sma_20),
            "sma_50": _safe_last(sma_50),
            "sma_200": _safe_last(sma_200) if sma_200 is not None else None,
            "ema_12": _safe_last(ema_12),
            "ema_26": _safe_last(ema_26),
            "rsi_14": current_rsi,
            "macd": _safe_last(macd_line),
            "macd_signal": _safe_last(macd_signal),
            "macd_histogram": _safe_last(macd_hist),
            "bollinger_upper": _safe_last(bb_upper),
            "bollinger_middle": _safe_last(bb_middle),
            "bollinger_lower": _safe_last(bb_lower),
        },
        "series": {
            "sma_20": _safe_list(sma_20),
            "sma_50": _safe_list(sma_50),
            "ema_12": _safe_list(ema_12),
            "rsi_14": _safe_list(rsi_14),
            "macd": _safe_list(macd_line),
            "macd_signal": _safe_list(macd_signal),
            "bollinger_upper": _safe_list(bb_upper),
            "bollinger_lower": _safe_list(bb_lower),
        },
    }
