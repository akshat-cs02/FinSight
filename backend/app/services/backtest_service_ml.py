"""
Service layer for ML model backtesting.

Orchestrates backtesting engine, caching, and error handling.
"""
from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional

from app.config import settings
from app.ml.backtesting import run_ml_backtest

logger = logging.getLogger(__name__)

_cache: dict[str, tuple[dict, float]] = {}
CACHE_TTL = 3600.0


def _cache_key(symbol: str, period: str, windows: int) -> str:
    return f"{symbol.upper()}:{period}:{windows}"


def get_cached_backtest(symbol: str, period: str, windows: int) -> Optional[dict]:
    key = _cache_key(symbol, period, windows)
    entry = _cache.get(key)
    if entry and (time.monotonic() - entry[1]) < CACHE_TTL:
        result = dict(entry[0])
        result["cached"] = True
        return result
    return None


def set_cached_backtest(symbol: str, period: str, windows: int, result: dict):
    key = _cache_key(symbol, period, windows)
    _cache[key] = (result, time.monotonic())


def run_backtest_ml(
    symbol: str,
    period: str = "2y",
    walk_forward_windows: int = 5,
    retrain_on_each_window: bool = False,
    use_cache: bool = True,
) -> dict:
    symbol = symbol.upper()
    if use_cache:
        cached = get_cached_backtest(symbol, period, walk_forward_windows)
        if cached:
            logger.info(f"Returning cached backtest for {symbol}")
            return cached

    if retrain_on_each_window:
        logger.info(f"Retrain flag set for {symbol} — training models first")
        try:
            from app.training.train_xgboost import train_xgb_for_symbol
            train_xgb_for_symbol(symbol, period=period)
        except Exception as e:
            logger.warning(f"Pre-backtest training failed for {symbol}: {e}")

    result = run_ml_backtest(
        symbol=symbol,
        period=period,
        walk_forward_windows=walk_forward_windows,
    )

    if use_cache:
        set_cached_backtest(symbol, period, walk_forward_windows, result)

    return result
