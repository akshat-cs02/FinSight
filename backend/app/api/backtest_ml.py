"""
ML Model Backtesting API.

GET /api/backtest/ml/{symbol}  — walk-forward backtest of LSTM + XGBoost ensemble
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from app.services.backtest_service_ml import run_backtest_ml

logger = logging.getLogger(__name__)
router = APIRouter()

VALID_PERIODS = {"1y", "2y", "3y", "5y"}


@router.get("/ml/{symbol}")
def backtest_ml(
    symbol: str,
    period: str = Query("2y", description="Historical period: 1y | 2y | 3y | 5y"),
    walk_forward_windows: int = Query(5, ge=2, le=20, description="Number of walk-forward windows"),
    retrain: bool = Query(False, description="Retrain models before backtesting"),
):
    period = period.lower()
    if period not in VALID_PERIODS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid period '{period}'. Use: {', '.join(sorted(VALID_PERIODS))}",
        )

    try:
        return run_backtest_ml(
            symbol=symbol.upper(),
            period=period,
            walk_forward_windows=walk_forward_windows,
            retrain_on_each_window=retrain,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception(f"ML backtest failed for {symbol}")
        raise HTTPException(status_code=500, detail=str(e))
