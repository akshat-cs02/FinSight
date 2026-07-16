"""
Portfolio endpoints — REQUIRES authentication.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import User, get_db
from app.security import get_current_user
from app.services import portfolio_service as ps

router = APIRouter()


class HoldingCreate(BaseModel):
    symbol: str
    quantity: float
    purchase_price: float
    purchase_date: Optional[datetime] = None
    notes: Optional[str] = None


class HoldingUpdate(BaseModel):
    quantity: Optional[float] = None
    purchase_price: Optional[float] = None
    notes: Optional[str] = None


@router.get("/summary")
def summary(user = Depends(get_current_user), db: Session = Depends(get_db)):
    return ps.get_summary(db, user_id=int(user.id))


@router.get("/holdings")
def list_holdings(user = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"holdings": ps.list_holdings(db, user_id=int(user.id))}


@router.post("/holdings")
def add_holding(req: HoldingCreate,
                user = Depends(get_current_user),
                db: Session = Depends(get_db)):
    try:
        return ps.add_holding(db, req.symbol, req.quantity, req.purchase_price,
                              req.purchase_date, req.notes, user_id=int(user.id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/holdings/{stock_id}")
def delete_holding(stock_id: int,
                   user = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    if not ps.delete_holding(db, stock_id, user_id=int(user.id)):
        raise HTTPException(404, "Holding not found")
    return {"deleted": True, "id": stock_id}


@router.patch("/holdings/{stock_id}")
def update_holding(stock_id: int, req: HoldingUpdate,
                   user = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    if not ps.update_holding(db, stock_id, req.quantity, req.purchase_price,
                             req.notes, user_id=int(user.id)):
        raise HTTPException(404, "Holding not found")
    return {"updated": True, "id": stock_id}
