"""
Watchlist API — User favorites with alert notifications.

Endpoints:
  GET    /api/watchlist            — list watchlist (auth required)
  POST   /api/watchlist            — add symbol (auth required)
  DELETE /api/watchlist/{symbol}   — remove symbol (auth required)
  GET    /api/watchlist/alerts     — today's signals on watchlist (auth required)
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.security import get_current_user
from app.services.watchlist_service import (
    get_watchlist,
    add_to_watchlist,
    remove_from_watchlist,
    get_watchlist_alerts,
)

router = APIRouter()


class AddWatchlistBody(BaseModel):
    symbol: str
    notes: Optional[str] = None


@router.get("")
def list_watchlist(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return {"watchlist": get_watchlist(int(current_user.id), db)}


@router.post("")
def add_symbol(
    body: AddWatchlistBody,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = add_to_watchlist(int(current_user.id), body.symbol, body.notes, db)
    return item


@router.delete("/{symbol}")
def remove_symbol(
    symbol: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    removed = remove_from_watchlist(int(current_user.id), symbol, db)
    if not removed:
        raise HTTPException(status_code=404, detail="Symbol not in watchlist")
    return {"removed": symbol.upper()}


@router.get("/alerts")
def watchlist_alerts(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    alerts = get_watchlist_alerts(int(current_user.id), db)
    return {"alerts": alerts, "count": len(alerts)}
