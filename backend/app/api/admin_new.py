"""
Admin endpoints: user management, model metrics, retraining, system stats.
All endpoints require is_admin=True.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import joblib
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Body
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
    if str(user_id) == admin.id:
        raise HTTPException(400, "Cannot toggle yourself")
    u.is_active = not u.is_active
    db.commit()
    return {"user_id": u.id, "is_active": u.is_active}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, admin: User = Depends(get_current_admin),
                db: Session = Depends(get_db)):
    if str(user_id) == admin.id:
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


# ============ Database Dashboard ============
# All registered SQLAlchemy models → introspect at startup
from app.database import (
    Base, PortfolioStock, StockData, News, TechnicalIndicator,
    ModelMetrics, WatchlistItem, Visitor, VisitorPageView, SessionLocal,
)

_TABLE_MAP: dict[str, type] = {
    "users":              User,
    "portfolios":         Portfolio,
    "portfolio_stocks":   PortfolioStock,
    "stock_data":         StockData,
    "predictions":        Prediction,
    "news":               News,
    "technical_indicators": TechnicalIndicator,
    "audit_logs":         AuditLog,
    "model_metrics":      ModelMetrics,
    "watchlist":          WatchlistItem,
    "visitors":           Visitor,
    "visitor_page_views": VisitorPageView,
    "intraday_signals":   IntradaySignal,
}


def _row_to_dict(row) -> dict:
    """Convert a SQLAlchemy row to a JSON-safe dict."""
    d = {}
    for col in row.__table__.columns:
        val = getattr(row, col.name)
        if val is None:
            d[col.name] = None
        elif hasattr(val, "isoformat"):
            d[col.name] = val.isoformat()
        else:
            d[col.name] = val
    return d


@router.get("/database/tables")
def db_tables(admin: User = Depends(get_current_admin)):
    """Return every table name with its row count — the database overview."""
    session = SessionLocal()
    try:
        tables = []
        for name, model in _TABLE_MAP.items():
            try:
                count = session.query(model).count()
            except Exception:
                count = 0
            cols = [c.name for c in model.__table__.columns]
            tables.append({"name": name, "rows": count, "columns": cols})
        total_rows = sum(t["rows"] for t in tables)
        return {"tables": tables, "total_tables": len(tables), "total_rows": total_rows}
    finally:
        session.close()


@router.get("/database/table/{table_name}")
def db_table_rows(
    table_name: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None, description="Search across all text columns"),
    sort_by: Optional[str] = Query(None, description="Column name to sort by"),
    sort_dir: str = Query("desc", description="asc or desc"),
    admin: User = Depends(get_current_admin),
):
    """Return paginated rows from any table with optional search & sort."""
    model = _TABLE_MAP.get(table_name)
    if not model:
        raise HTTPException(404, f"Unknown table: {table_name}. Available: {list(_TABLE_MAP.keys())}")

    session = SessionLocal()
    try:
        q = session.query(model)

        # Search across all string/text columns
        if search:
            from sqlalchemy import or_
            text_cols = [c for c in model.__table__.columns
                         if c.type.__class__.__name__ in ("String", "Text")]
            if text_cols:
                like = f"%{search}%"
                q = q.filter(or_(*[c.ilike(like) for c in text_cols]))

        total = q.count()

        # Sort
        if sort_by and hasattr(model, sort_by):
            col = getattr(model, sort_by)
            q = q.order_by(col.desc() if sort_dir == "desc" else col.asc())
        else:
            # Default: sort by id desc if present, else first column
            if hasattr(model, "id"):
                q = q.order_by(model.id.desc())

        # Paginate
        rows = q.offset((page - 1) * per_page).limit(per_page).all()

        columns = [c.name for c in model.__table__.columns]
        return {
            "table": table_name,
            "columns": columns,
            "rows": [_row_to_dict(r) for r in rows],
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page,
        }
    finally:
        session.close()


@router.get("/database/summary")
def db_summary(admin: User = Depends(get_current_admin)):
    """High-level database health summary — sizes, row counts, recent activity."""
    session = SessionLocal()
    try:
        from datetime import datetime, timedelta, timezone

        tables = []
        for name, model in _TABLE_MAP.items():
            try:
                count = session.query(model).count()
            except Exception:
                count = 0
            tables.append({"name": name, "rows": count})

        # Recent activity (last 7 days)
        week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        recent_users = 0
        try:
            recent_users = session.query(User).filter(User.created_at >= week_ago).count()
        except Exception:
            pass

        recent_signals = 0
        try:
            recent_signals = session.query(IntradaySignal).filter(
                IntradaySignal.generated_at >= week_ago
            ).count()
        except Exception:
            pass

        recent_predictions = 0
        try:
            recent_predictions = session.query(Prediction).filter(
                Prediction.created_at >= week_ago
            ).count()
        except Exception:
            pass

        return {
            "tables": tables,
            "total_tables": len(tables),
            "total_rows": sum(t["rows"] for t in tables),
            "activity_7d": {
                "new_users": recent_users,
                "signals_generated": recent_signals,
                "predictions_made": recent_predictions,
            },
        }
    finally:
        session.close()


# ────────────────────────────────────────────────────────────────────────────
# Database CRUD — Create / Update / Delete rows from any managed table
# ────────────────────────────────────────────────────────────────────────────

# Columns that should NEVER be editable through the generic DB editor
_READONLY_COLS = {"id", "created_at", "updated_at"}


def _get_model_or_404(table_name: str):
    model = _TABLE_MAP.get(table_name)
    if not model:
        raise HTTPException(404, f"Unknown table: {table_name}. Available: {list(_TABLE_MAP.keys())}")
    return model


def _coerce_value(col, raw):
    """Coerce a raw JSON value to the Python type expected by the column."""
    if raw is None:
        return None
    if col.type.__class__.__name__ == "Boolean":
        return bool(raw)
    if col.type.__class__.__name__ in ("Integer", "Float"):
        try:
            return type(col.type.python_type)(raw) if hasattr(col.type, 'python_type') else raw
        except (ValueError, TypeError):
            return raw
    return raw


@router.post("/database/table/{table_name}")
def db_create_row(
    table_name: str,
    data: dict = Body(..., description="Column name → value map (skip id / auto-generated cols)"),
    admin: User = Depends(get_current_admin),
):
    """Insert a new row into any managed table."""
    model = _get_model_or_404(table_name)
    cols = {c.name: c for c in model.__table__.columns}

    session = SessionLocal()
    try:
        row_data = {}
        for col_name, raw_val in data.items():
            if col_name in _READONLY_COLS:
                continue  # skip auto-managed columns
            if col_name not in cols:
                raise HTTPException(400, f"Column '{col_name}' does not exist in {table_name}")
            row_data[col_name] = _coerce_value(cols[col_name], raw_val)

        row = model(**row_data)
        session.add(row)
        session.commit()
        session.refresh(row)
        return {"ok": True, "row": _row_to_dict(row)}
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        logger.warning("db_create_row failed: %s", e)
        raise HTTPException(400, str(e))
    finally:
        session.close()


@router.put("/database/table/{table_name}/{row_id}")
def db_update_row(
    table_name: str,
    row_id: int,
    data: dict = Body(..., description="Column name → new value map"),
    admin: User = Depends(get_current_admin),
):
    """Update an existing row by its primary key (assumes 'id' column)."""
    model = _get_model_or_404(table_name)
    cols = {c.name: c for c in model.__table__.columns}

    session = SessionLocal()
    try:
        row = session.query(model).filter(model.id == row_id).first()
        if not row:
            raise HTTPException(404, f"Row {row_id} not found in {table_name}")

        for col_name, raw_val in data.items():
            if col_name in _READONLY_COLS:
                continue
            if col_name not in cols:
                raise HTTPException(400, f"Column '{col_name}' does not exist in {table_name}")
            setattr(row, col_name, _coerce_value(cols[col_name], raw_val))

        session.commit()
        session.refresh(row)
        return {"ok": True, "row": _row_to_dict(row)}
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        logger.warning("db_update_row failed: %s", e)
        raise HTTPException(400, str(e))
    finally:
        session.close()


@router.delete("/database/table/{table_name}/{row_id}")
def db_delete_row(
    table_name: str,
    row_id: int,
    admin: User = Depends(get_current_admin),
):
    """Delete a row by its primary key (assumes 'id' column)."""
    model = _get_model_or_404(table_name)

    session = SessionLocal()
    try:
        row = session.query(model).filter(model.id == row_id).first()
        if not row:
            raise HTTPException(404, f"Row {row_id} not found in {table_name}")
        session.delete(row)
        session.commit()
        return {"ok": True, "deleted": row_id, "table": table_name}
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        logger.warning("db_delete_row failed: %s", e)
        raise HTTPException(400, str(e))
    finally:
        session.close()
