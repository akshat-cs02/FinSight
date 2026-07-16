"""
Watchlist service — CRUD operations for user watchlists and alert retrieval.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import yfinance as yf  # kept as fallback (used elsewhere in this module)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import IntradaySignal, WatchlistItem
from app.services import market_data_service as mds

logger = logging.getLogger(__name__)


def get_watchlist(user_id: int, db: Session) -> list[dict]:
    rows = db.query(WatchlistItem).filter(WatchlistItem.user_id == user_id).all()
    # One TradingView batch call for all watchlist prices (yfinance fallback
    # inside get_stock_quote). Warms the cache so lookups below are instant.
    mds.prefetch_quotes([r.symbol for r in rows])
    result = []
    for r in rows:
        item = {
            "id":       r.id,
            "symbol":   r.symbol,
            "added_at": r.added_at.isoformat() + "Z",
            "notes":    r.notes,
            "price":    None,
            "change_percent": None,
        }
        try:
            q = mds.get_stock_quote(r.symbol)
            item["price"]          = round(q["price"], 4) if q.get("price") is not None else None
            item["change_percent"] = round(q["change_percent"], 2) if q.get("change_percent") is not None else None
        except Exception:
            pass
        result.append(item)
    return result


def add_to_watchlist(user_id: int, symbol: str, notes: str | None, db: Session) -> dict:
    symbol = symbol.upper().strip()
    row = WatchlistItem(
        user_id  = user_id,
        symbol   = symbol,
        added_at = datetime.now(timezone.utc),
        notes    = notes,
    )
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
        return {"id": row.id, "symbol": row.symbol, "added_at": row.added_at.isoformat() + "Z", "notes": row.notes}
    except IntegrityError:
        db.rollback()
        existing = (
            db.query(WatchlistItem)
            .filter(WatchlistItem.user_id == user_id, WatchlistItem.symbol == symbol)
            .first()
        )
        return {"id": existing.id, "symbol": existing.symbol, "added_at": existing.added_at.isoformat() + "Z", "notes": existing.notes}


def remove_from_watchlist(user_id: int, symbol: str, db: Session) -> bool:
    symbol = symbol.upper().strip()
    row = (
        db.query(WatchlistItem)
        .filter(WatchlistItem.user_id == user_id, WatchlistItem.symbol == symbol)
        .first()
    )
    if row:
        db.delete(row)
        db.commit()
        return True
    return False


def get_watchlist_symbols(user_id: int, db: Session) -> list[str]:
    rows = db.query(WatchlistItem.symbol).filter(WatchlistItem.user_id == user_id).all()
    return [r.symbol for r in rows]


def get_watchlist_alerts(user_id: int, db: Session) -> list[dict]:
    """Return today's BUY/SELL signals for the user's watchlist symbols."""
    symbols = get_watchlist_symbols(user_id, db)
    if not symbols:
        return []

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = (
        db.query(IntradaySignal)
        .filter(
            IntradaySignal.symbol.in_(symbols),
            IntradaySignal.signal != "HOLD",
            IntradaySignal.generated_at >= today_start,
        )
        .order_by(IntradaySignal.confidence.desc())
        .all()
    )
    return [
        {
            "id":           r.id,
            "symbol":       r.symbol,
            "signal":       r.signal,
            "entry":        r.entry,
            "sl":           r.sl,
            "tp":           r.tp,
            "confidence":   r.confidence,
            "strategy":     r.strategy,
            "kill_zone":    r.kill_zone,
            "htf_bias":     r.htf_bias,
            "generated_at": r.generated_at.isoformat() + "Z",
            "outcome":      r.outcome,
        }
        for r in rows
    ]
