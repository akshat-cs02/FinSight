"""
Spot-price estimation for commodities Yahoo only serves as futures.

Yahoo has no spot feed for gold/silver/etc., so the app proxies those symbols
to the futures contract (GC=F, SI=F, …) for OHLCV + signal generation. The
futures price sits a little off spot (the "basis"). To show the client a
spot-like number we anchor to the physically-backed ETF (GLD, SLV), whose NAV
≈ spot × ounces-per-share, and derive a spot/futures ratio.

That ratio is then applied UNIFORMLY to every price level (current, entry, SL,
TP, predicted, …). Because all levels scale by the same factor, the signal is
mathematically unchanged — %change, RSI, R:R, and BUY/SELL direction are
identical; only the absolute numbers shift down onto the spot scale.
"""
from __future__ import annotations

import logging
import time

logger = logging.getLogger(__name__)

# original spot symbol → (futures symbol, spot-tracking ETF, ETF→spot multiplier)
# multiplier = 1 / (ounces of metal per ETF share). It drifts ~0.4 %/yr from the
# ETF expense ratio — recalibrate roughly once a year.
_SPOT_PROXY: dict[str, tuple[str, str, float]] = {
    "XAUUSD":   ("GC=F", "GLD", 11.04),
    "XAUUSD=X": ("GC=F", "GLD", 11.04),
    "GOLD":     ("GC=F", "GLD", 11.04),
    "XAGUSD":   ("SI=F", "SLV", 1.139),
    "XAGUSD=X": ("SI=F", "SLV", 1.139),
    "SILVER":   ("SI=F", "SLV", 1.139),
}

# Front-month precious-metal basis is small; clamp to a realistic band so a bad
# ETF tick can never distort prices by more than ±1.5 %.
_FACTOR_MIN, _FACTOR_MAX = 0.985, 1.015

_factor_cache: dict[str, tuple[float, float]] = {}   # futures_sym → (factor, ts)
_FACTOR_TTL = 60.0  # seconds


def is_spot_proxy(symbol: str) -> bool:
    return symbol.upper().strip() in _SPOT_PROXY


def spot_factor(original_symbol: str, futures_price: float | None) -> float:
    """
    spot/futures conversion factor for a spot-requested commodity.

    Returns 1.0 for anything that isn't a proxied spot symbol, on any error,
    or when the futures price is missing — i.e. it never fabricates a shift.
    """
    key = (original_symbol or "").upper().strip()
    proxy = _SPOT_PROXY.get(key)
    if not proxy or not futures_price:
        return 1.0

    fut_sym, etf, mult = proxy
    now = time.monotonic()
    cached = _factor_cache.get(fut_sym)
    if cached and (now - cached[1]) < _FACTOR_TTL:
        return cached[0]

    factor = 1.0
    try:
        from app.services.market_data_service import get_stock_quote
        etf_price = float(get_stock_quote(etf)["price"])
        implied_spot = etf_price * mult
        raw = implied_spot / float(futures_price)
        factor = min(max(raw, _FACTOR_MIN), _FACTOR_MAX)
    except Exception as exc:
        logger.warning("spot_factor(%s) failed: %s", key, exc)
        factor = 1.0

    _factor_cache[fut_sym] = (factor, now)
    return factor


def scale_prices(original_symbol: str, data: dict, price_keys: list[str],
                 base_key: str = "price") -> dict:
    """
    Scale the given price fields of *data* from futures onto the spot scale,
    in place. `base_key` holds the futures price used to derive the factor.
    No-op (returns data unchanged) for non-proxied symbols.
    """
    if not is_spot_proxy(original_symbol):
        return data
    factor = spot_factor(original_symbol, data.get(base_key))
    if factor == 1.0:
        return data
    for k in price_keys:
        v = data.get(k)
        if isinstance(v, (int, float)):
            data[k] = round(v * factor, 4)
    return data


_PRED_SCALAR_KEYS = ["current_price", "predicted_price", "atr",
                     "entry_price", "stop_loss", "take_profit"]


def scale_prediction(result: dict) -> dict:
    """Scale a predict_stock() result (incl. nested forecast/model dicts) to spot."""
    sym = result.get("symbol", "")
    if not is_spot_proxy(sym):
        return result
    factor = spot_factor(sym, result.get("current_price"))
    if factor == 1.0:
        return result

    for k in _PRED_SCALAR_KEYS:
        v = result.get(k)
        if isinstance(v, (int, float)):
            result[k] = round(v * factor, 2)

    for dk in ("model_predictions", "model_predictions_raw"):
        d = result.get(dk)
        if isinstance(d, dict):
            result[dk] = {k: round(v * factor, 2) for k, v in d.items()
                          if isinstance(v, (int, float))}

    fc = result.get("forecast_7day")
    if isinstance(fc, list):
        for pt in fc:
            if isinstance(pt, dict) and isinstance(pt.get("price"), (int, float)):
                pt["price"] = round(pt["price"] * factor, 2)

    return result


def _current_futures_price(symbol: str) -> float | None:
    """Latest futures price for the proxied symbol (used to derive the factor)."""
    try:
        from app.services.market_data_service import get_stock_quote
        return float(get_stock_quote(symbol)["price"])
    except Exception:
        return None


def scale_terms(symbol: str, terms: dict) -> dict:
    """Scale short/mid/long term-signal price levels to spot, in place."""
    if not is_spot_proxy(symbol):
        return terms
    factor = spot_factor(symbol, _current_futures_price(symbol))
    if factor == 1.0:
        return terms
    for term in terms.values():
        if not isinstance(term, dict):
            continue
        for k in ("target_price", "stop_loss", "ema21", "ema55"):
            v = term.get(k)
            if isinstance(v, (int, float)):
                term[k] = round(v * factor, 2)
    return terms


def scale_ict_signals(symbol: str, payload: dict) -> dict:
    """Scale ICT live-signal price levels (entry/sl/tp/price) to spot, in place."""
    if not is_spot_proxy(symbol):
        return payload
    factor = spot_factor(symbol, _current_futures_price(symbol))
    if factor == 1.0:
        return payload
    for sig in payload.get("signals", []):
        if not isinstance(sig, dict):
            continue
        for k in ("price", "entry", "sl", "tp", "atr"):
            v = sig.get(k)
            if isinstance(v, (int, float)):
                sig[k] = round(v * factor, 2)
    return payload
