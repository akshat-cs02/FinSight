"""
Technical indicators via `ta` library.
RSI, MACD, EMA, SMA, Bollinger Bands.
"""
import logging
import yfinance as yf
import pandas as pd
from ta.trend import SMAIndicator, EMAIndicator, MACD
from ta.momentum import RSIIndicator
from ta.volatility import BollingerBands, AverageTrueRange

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

    # SMA
    sma_20 = SMAIndicator(close, window=20).sma_indicator()
    sma_50 = SMAIndicator(close, window=50).sma_indicator()
    sma_200 = SMAIndicator(close, window=200).sma_indicator() if len(close) >= 200 else None

    # EMA
    ema_12 = EMAIndicator(close, window=12).ema_indicator()
    ema_26 = EMAIndicator(close, window=26).ema_indicator()

    # RSI
    rsi_14 = RSIIndicator(close, window=14).rsi()

    # MACD
    macd_ind = MACD(close, window_slow=26, window_fast=12, window_sign=9)
    macd_line = macd_ind.macd()
    macd_signal = macd_ind.macd_signal()
    macd_hist = macd_ind.macd_diff()

    # Bollinger Bands
    bb = BollingerBands(close, window=20, window_dev=2)
    bb_upper = bb.bollinger_hband()
    bb_middle = bb.bollinger_mavg()
    bb_lower = bb.bollinger_lband()

    current_price = float(close.iloc[-1])
    current_rsi = _safe_last(rsi_14)
    macd_hist_last = _safe_last(macd_hist) if macd_hist is not None else None
    bb_upper_last = _safe_last(bb_upper) if bb_upper is not None else None
    bb_lower_last = _safe_last(bb_lower) if bb_lower is not None else None

    # Use the same unified signal engine as the prediction service.
    try:
        from app.services.prediction_service import _unified_signal, _compute_levels
        atr_series = AverageTrueRange(high, low, close, window=14).average_true_range()
        atr_last = float(atr_series.dropna().iloc[-1]) if atr_series is not None and not atr_series.dropna().empty else None
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
            "macd": _safe_last(macd_line) if macd_line is not None else None,
            "macd_signal": _safe_last(macd_signal) if macd_signal is not None else None,
            "macd_histogram": _safe_last(macd_hist) if macd_hist is not None else None,
            "bollinger_upper": _safe_last(bb_upper) if bb_upper is not None else None,
            "bollinger_middle": _safe_last(bb_middle) if bb_middle is not None else None,
            "bollinger_lower": _safe_last(bb_lower) if bb_lower is not None else None,
        },
        "series": {
            "sma_20": _safe_list(sma_20),
            "sma_50": _safe_list(sma_50),
            "ema_12": _safe_list(ema_12),
            "rsi_14": _safe_list(rsi_14),
            "macd": _safe_list(macd_line) if macd_line is not None else [],
            "macd_signal": _safe_list(macd_signal) if macd_signal is not None else [],
            "bollinger_upper": _safe_list(bb_upper) if bb_upper is not None else [],
            "bollinger_lower": _safe_list(bb_lower) if bb_lower is not None else [],
        },
    }
