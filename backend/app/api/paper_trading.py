"""
Paper Trading API — virtual demo trading with auto-placed signal trades.

Endpoints:
  GET  /api/paper/account              — account summary (balance, P&L, win rate)
  GET  /api/paper/positions?status=OPEN — list positions
  GET  /api/paper/history              — closed positions with P&L
  POST /api/paper/reset                — reset account to initial balance
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.security import get_current_user
from app.services.paper_trading_service import (
    get_or_create_account,
    get_account_summary,
    get_positions,
)

router = APIRouter()


@router.get("/account")
def account_summary(user=Depends(get_current_user), db: Session = Depends(get_db)):
    return get_account_summary(db, str(user.id))


@router.get("/positions")
def list_positions(
    status: str = Query(None),
    limit: int = Query(50, ge=1, le=200),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_positions(db, str(user.id), status=status, limit=limit)


@router.get("/history")
def trade_history(
    limit: int = Query(50, ge=1, le=200),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_positions(db, str(user.id), status=None, limit=limit)


@router.post("/reset")
def reset_account(user=Depends(get_current_user), db: Session = Depends(get_db)):
    from app.database import PaperAccount, PaperPosition
    uid = str(user.id)
    # Delete all positions
    db.query(PaperPosition).filter(PaperPosition.user_id == uid).delete()
    # Reset account
    acct = db.query(PaperAccount).filter(PaperAccount.user_id == uid).first()
    if acct:
        acct.balance = acct.initial_balance
        acct.total_pnl = 0.0
        acct.total_trades = 0
        acct.wins = 0
        acct.losses = 0
    else:
        acct = PaperAccount(user_id=uid, balance=10000.0, initial_balance=10000.0)
        db.add(acct)
    db.commit()
    return {"message": "Account reset", "balance": acct.balance}
