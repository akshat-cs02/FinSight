"""
AI Prediction API.

GET  /api/prediction/{symbol}              → ensemble prediction + signal
GET  /api/prediction/{symbol}/history      → previous saved predictions
GET  /api/prediction/                      → status of all trained models
POST /api/prediction/train                 → retrain a symbol (admin-style, no auth in demo)
"""
from __future__ import annotations

import logging
import threading
from typing import List, Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import Prediction, User, get_db
from app.security import get_current_admin, get_current_user, get_optional_user
from app.services import prediction_service as preds
from app.services.spot_pricing import scale_prediction
from app.rate_limit import limiter
from app.services.signal_service import get_multi_horizon_prediction

logger = logging.getLogger(__name__)
router = APIRouter()

# A prediction is considered "still valid" for this long — within the window we
# reuse the same saved row instead of computing+saving a fresh near-identical one.
# This is the actual fix for "duplicate signals every few minutes": the old dedup
# compared only the new row's price against existing rows (±$0.10), which two
# concurrent requests (Dashboard widget + page widget firing on load) could both
# pass *before either had committed* — a classic check-then-act race. A per-symbol
# lock below serializes the check+insert, and widening dedup to "any row in the
# last N minutes" (no price comparison) closes the race for good.
PREDICTION_VALID_MINUTES = 30

_symbol_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _lock_for(symbol: str) -> threading.Lock:
    with _locks_guard:
        lock = _symbol_locks.get(symbol)
        if lock is None:
            lock = threading.Lock()
            _symbol_locks[symbol] = lock
        return lock


# ============ Schemas ============
class TrainRequest(BaseModel):
    symbol: str
    period: Optional[str] = "3y"
    lstm_epochs: Optional[int] = 8
    skip_lstm: bool = False
    skip_xgb: bool = False
    # Horizons to (re)train. Accepted for API compatibility with the
    # multi-horizon client. The intraday/short/mid/long horizons are computed
    # live from rule engines (no ML training), so only the "daily" AI models
    # (LSTM/XGB) are trainable here; other values are accepted and ignored.
    horizons: Optional[List[str]] = None


# ============ Endpoints ============
@router.get("")
@router.get("/")
def list_models():
    """Trained-model status for all supported symbols."""
    return {"supported_symbols": preds.SUPPORTED, "models": preds.list_models()}


@router.get("/{symbol}")
@limiter.limit("30/minute")
def get_prediction(
    symbol: str,
    request: Request,
    db: Session = Depends(get_db),
    persist: bool = Query(True),
    forecast_days: int = Query(7, ge=1, le=30),
    user: Optional[User] = Depends(get_optional_user),
):
    """Run AI prediction with N-day forecast. Persists per-user if authenticated."""
    try:
        result = preds.predict_stock(symbol.upper(), auto_train=True, forecast_days=forecast_days)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("predict_stock failed")
        raise HTTPException(status_code=500, detail=str(e))

    if persist:
        lock = _lock_for(result["symbol"])
        with lock:  # per-symbol lock prevents concurrent-request race conditions
            try:
                # Only save a new row when the SIGNAL direction changes.
                # Same signal (e.g. repeated SELL) = no new row, just return fresh numbers.
                # This keeps history clean: one entry per signal flip.
                last = (
                    db.query(Prediction)
                    .filter(Prediction.symbol == result["symbol"])
                    .order_by(Prediction.created_at.desc())
                    .first()
                )

                signal_changed = (last is None) or (last.signal != result["signal"])

                if signal_changed:
                    row = Prediction(
                        user_id=user.id if user else None,
                        symbol=result["symbol"],
                        current_price=result["current_price"],
                        predicted_price=result["predicted_price"],
                        change_percent=result["change_percent"],
                        confidence_score=result["confidence"],
                        signal=result["signal"],
                        trend_direction=result["trend"],
                        model_predictions=result["model_predictions"],
                        models_used=result["models_used"],
                        forecast_7day=result.get("forecast_7day"),
                    )
                    db.add(row)
                    db.commit()
                    db.refresh(row)
                    result["id"] = row.id
                    logger.info(f"[{result['symbol']}] signal changed to {result['signal']} — saved id={row.id}")
                else:
                    result["id"] = last.id
                    logger.debug(f"[{result['symbol']}] same signal ({result['signal']}) — no new row")
            except Exception as e:
                logger.warning(f"persist prediction failed: {e}")
                db.rollback()

    # Ensure timestamps have explicit UTC suffix so JS can parse them correctly
    result["generated_at"] = result.get("generated_at", "").replace(" ", "T")
    if result["generated_at"] and not result["generated_at"].endswith("Z"):
        result["generated_at"] += "Z"

    # Spot metals proxied to futures → present prices on the spot scale.
    # (DB history above keeps the native futures values.)
    result = scale_prediction(result)

    # Multi-horizon outlook (intraday/short/mid/long) from existing engines.
    # Added alongside the flat AI fields so existing consumers keep working;
    # failure-tolerant so the core prediction still returns if horizons error.
    try:
        mh = get_multi_horizon_prediction(result["symbol"])
        result["horizons"] = mh.get("horizons")
        result["overall"] = mh.get("overall")
        result["regime"] = mh.get("regime")
    except Exception as e:
        logger.warning(f"multi-horizon aggregation failed for {result['symbol']}: {e}")
        result["horizons"] = None

    return result


@router.get("/{symbol}/horizons")
def get_horizons(symbol: str, horizon: Optional[str] = Query(None, description="intraday|short|mid|long")):
    """
    Multi-horizon outlook only (no LSTM/XGB inference) — fast, 3-min cached.

    Optional `horizon` filters to a single block. Powers the tabbed
    Intraday / Short / Mid / Long UI without running the heavy AI models.
    """
    try:
        mh = get_multi_horizon_prediction(symbol.upper())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if horizon:
        block = (mh.get("horizons") or {}).get(horizon.lower())
        if block is None:
            raise HTTPException(status_code=404, detail=f"Unknown horizon '{horizon}'")
        return {"symbol": mh["symbol"], "horizon": horizon.lower(), **block,
                "regime": mh.get("regime"), "generated_at": mh.get("generated_at")}
    return mh


@router.get("/{symbol}/history")
def prediction_history(symbol: str, limit: int = Query(20, ge=1, le=100),
                       db: Session = Depends(get_db)):
    """
    Previous predictions for this symbol, newest first.
    Only returns entries where the signal CHANGED — consecutive same-signal rows
    (duplicates from before the dedup fix) are collapsed to the first occurrence.
    """
    # Fetch a larger window oldest-first so we can detect signal transitions
    raw = (
        db.query(Prediction)
        .filter(Prediction.symbol == symbol.upper())
        .order_by(Prediction.created_at.asc())
        .limit(limit * 10)
        .all()
    )

    # Walk forward in time, keep only the first row of each consecutive signal run
    transitions: list = []
    last_sig: str | None = None
    for r in raw:
        if r.signal != last_sig:
            transitions.append(r)
            last_sig = r.signal

    # Return newest-first, capped at limit
    transitions = transitions[-limit:][::-1]

    return {
        "symbol": symbol.upper(),
        "count": len(transitions),
        "history": [
            {
                "id": r.id,
                "current_price": r.current_price,
                "predicted_price": r.predicted_price,
                "change_percent": r.change_percent,
                "confidence": r.confidence_score,
                "signal": r.signal,
                "trend": r.trend_direction,
                "models_used": r.models_used,
                "created_at": (r.created_at.isoformat() + "Z") if r.created_at else None,
            }
            for r in transitions
        ],
    }


@router.post("/train")
def train_models(req: TrainRequest, background_tasks: BackgroundTasks,
                 admin: User = Depends(get_current_admin)):
    """Trigger training in background. Returns immediately."""
    symbol = req.symbol.upper()
    if symbol not in preds.SUPPORTED:
        # Allow training for any valid yfinance symbol — just log
        logger.info(f"Training {symbol} (not in SUPPORTED list)")

    def _train():
        try:
            if not req.skip_xgb:
                from app.training.train_xgboost import train_xgb_for_symbol
                logger.info(f"[{symbol}] training XGB...")
                train_xgb_for_symbol(symbol, period=req.period or "3y")
                logger.info(f"[{symbol}] XGB done")
            if not req.skip_lstm:
                from app.training.train_lstm import train_lstm_for_symbol
                logger.info(f"[{symbol}] training LSTM (epochs={req.lstm_epochs})...")
                train_lstm_for_symbol(symbol, period=req.period or "3y",
                                      epochs=req.lstm_epochs or 8)
                logger.info(f"[{symbol}] LSTM done")
        except Exception as e:
            logger.exception(f"training failed for {symbol}: {e}")

    background_tasks.add_task(_train)
    return {
        "status": "training_started",
        "symbol": symbol,
        "skip_lstm": req.skip_lstm,
        "skip_xgb": req.skip_xgb,
    }
