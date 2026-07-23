"""
Admin endpoints: user management, model metrics, retraining, system stats.
All endpoints require is_admin=True.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import joblib
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import (
    AuditLog, IntradaySignal, Portfolio, Prediction, User, get_db,
)
from app.security import get_current_admin as _base_admin
from app.rate_limit import sliding_window_check
from app.services import prediction_service as preds

logger = logging.getLogger(__name__)
router = APIRouter()


# Rate-limited admin guard (60 req/min per admin). Shadowing the imported name
# means every endpoint below that Depends(get_current_admin) is limited without
# per-endpoint changes.
def get_current_admin(admin: User = Depends(_base_admin)) -> User:
    sliding_window_check(f"admin:{admin.id}", limit=60, per_seconds=60)
    return admin


# ============ Schemas ============
class RetrainRequest(BaseModel):
    symbol: str
    period: Optional[str] = "3y"
    lstm_epochs: Optional[int] = 8
    skip_lstm: bool = False
    skip_xgb: bool = False


# ============ User management ============
@router.get("/users")
def list_users(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    rows = db.query(User).all()
    return {
        "count": len(rows),
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "is_active": u.is_active,
                "is_admin": u.is_admin,
                "subscription_tier": u.subscription_tier,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "last_login": u.last_login.isoformat() if u.last_login else None,
            }
            for u in rows
        ],
    }


@router.patch("/users/{user_id}/toggle-active")
def toggle_active(user_id: int, admin: User = Depends(get_current_admin),
                  db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(404, "User not found")
    if u.id == admin.id:
        raise HTTPException(400, "Cannot toggle yourself")
    u.is_active = not u.is_active
    db.commit()
    return {"user_id": u.id, "is_active": u.is_active}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, admin: User = Depends(get_current_admin),
                db: Session = Depends(get_db)):
    if user_id == admin.id:
        raise HTTPException(400, "Cannot delete yourself")
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(404, "User not found")
    db.query(Portfolio).filter(Portfolio.user_id == user_id).delete()
    db.delete(u)
    db.commit()
    return {"deleted": user_id}


# ============ ML model dashboard ============
def _read_meta(symbol: str, kind: str) -> Optional[dict]:
    """Read meta dict for lstm or xgb."""
    model_dir = settings.MODEL_PATH
    if kind == "lstm":
        path = os.path.join(model_dir, f"lstm_{symbol}_meta.pkl")
        if os.path.exists(path):
            return joblib.load(path)
    elif kind == "xgb":
        path = os.path.join(model_dir, f"xgb_{symbol}.pkl")
        if os.path.exists(path):
            try:
                bundle = joblib.load(path)
                return bundle.get("meta")
            except Exception as e:
                logger.warning(f"failed to read xgb meta {symbol}: {e}")
    return None


@router.get("/models")
def models_overview(admin: User = Depends(get_current_admin)):
    """Full model metadata + metrics for every trained symbol."""
    out = []
    for sym in preds.SUPPORTED:
        present = preds.has_trained_models(sym)
        lstm_meta = _read_meta(sym, "lstm")
        xgb_meta = _read_meta(sym, "xgb")
        out.append({
            "symbol": sym,
            "lstm": {
                "trained": present["lstm"],
                "meta": lstm_meta,
            },
            "xgb": {
                "trained": present["xgb"],
                "meta": xgb_meta,
            },
        })
    return {"models": out, "model_dir": settings.MODEL_PATH}


@router.get("/models/{symbol}/metrics")
def model_metrics(symbol: str, admin: User = Depends(get_current_admin)):
    sym = symbol.upper()
    lstm_meta = _read_meta(sym, "lstm")
    xgb_meta = _read_meta(sym, "xgb")
    if not lstm_meta and not xgb_meta:
        raise HTTPException(404, f"No trained models for {sym}")
    return {
        "symbol": sym,
        "lstm": lstm_meta,
        "xgb": xgb_meta,
    }


@router.post("/models/retrain")
def retrain(req: RetrainRequest, background_tasks: BackgroundTasks,
            admin: User = Depends(get_current_admin)):
    sym = req.symbol.upper()

    def _run():
        try:
            if not req.skip_xgb:
                from app.training.train_xgboost import train_xgb_for_symbol
                logger.info(f"[admin retrain] {sym} XGB...")
                train_xgb_for_symbol(sym, period=req.period or "3y")
            if not req.skip_lstm:
                from app.training.train_lstm import train_lstm_for_symbol
                logger.info(f"[admin retrain] {sym} LSTM epochs={req.lstm_epochs}...")
                train_lstm_for_symbol(sym, period=req.period or "3y",
                                      epochs=req.lstm_epochs or 8)
            logger.info(f"[admin retrain] {sym} done")
        except Exception as e:
            logger.exception(f"[admin retrain] {sym} failed: {e}")

    background_tasks.add_task(_run)
    return {"status": "training_started", "symbol": sym,
            "skip_lstm": req.skip_lstm, "skip_xgb": req.skip_xgb}


# ============ System stats ============
@router.get("/stats")
def system_stats(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active == True).count()
    total_portfolios = db.query(Portfolio).count()
    total_predictions = db.query(Prediction).count()
    trained = preds.list_models()
    n_trained = sum(1 for m in trained if m["lstm"] or m["xgb"])

    return {
        "users": {"total": total_users, "active": active_users},
        "portfolios": total_portfolios,
        "predictions_logged": total_predictions,
        "ml_models": {
            "symbols_supported": len(preds.SUPPORTED),
            "symbols_trained": n_trained,
            "details": trained,
        },
    }


# ============ Signal management ============
@router.get("/signals")
def list_signals(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    outcome: Optional[str] = Query(None),
    symbol: Optional[str] = Query(None),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """List all signals (including hidden) for admin management."""
    q = db.query(IntradaySignal)
    if outcome:
        q = q.filter(IntradaySignal.outcome == outcome)
    if symbol:
        q = q.filter(IntradaySignal.symbol == symbol.upper())
    total = q.count()
    rows = q.order_by(IntradaySignal.generated_at.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "signals": [
            {
                "id": r.id, "symbol": r.symbol, "strategy": r.strategy,
                "signal": r.signal, "entry": r.entry, "sl": r.sl, "tp": r.tp,
                "confidence": r.confidence, "timeframe": r.timeframe,
                "kill_zone": r.kill_zone, "htf_bias": r.htf_bias,
                "generated_at": r.generated_at.isoformat() + "Z" if r.generated_at else None,
                "outcome": r.outcome, "pnl_r": r.pnl_r,
                "is_hidden": getattr(r, 'is_hidden', False),
            }
            for r in rows
        ],
    }


@router.patch("/signals/{signal_id}/hide")
def toggle_hide_signal(signal_id: int, admin: User = Depends(get_current_admin),
                       db: Session = Depends(get_db)):
    """Toggle hidden flag on a signal — hidden signals don't show on main site."""
    row = db.query(IntradaySignal).filter(IntradaySignal.id == signal_id).first()
    if not row:
        raise HTTPException(404, "Signal not found")
    row.is_hidden = not getattr(row, 'is_hidden', False)
    db.commit()
    return {"id": row.id, "symbol": row.symbol, "is_hidden": row.is_hidden}


@router.delete("/signals/{signal_id}")
def delete_signal(signal_id: int, admin: User = Depends(get_current_admin),
                  db: Session = Depends(get_db)):
    """Permanently delete a signal."""
    row = db.query(IntradaySignal).filter(IntradaySignal.id == signal_id).first()
    if not row:
        raise HTTPException(404, "Signal not found")
    db.delete(row)
    db.commit()
    return {"deleted": signal_id}


# ============ Audit logs ============
@router.get("/logs")
def list_logs(limit: int = Query(100, ge=1, le=1000),
              admin: User = Depends(get_current_admin),
              db: Session = Depends(get_db)):
    rows = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return {
        "count": len(rows),
        "logs": [
            {
                "id": r.id,
                "user_id": r.user_id,
                "action": r.action,
                "description": r.description,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }
