"""
Broker API — MT5 live auto-trading bridge.

User-facing (JWT auth, browser):
  POST   /api/broker/connect          — create broker account, returns API token (shown once)
  GET    /api/broker/accounts         — list my accounts
  GET    /api/broker/status?account_id — account + heartbeat status
  POST   /api/broker/{acct_id}/arm    — allow gateway to execute signals
  POST   /api/broker/{acct_id}/disarm — stop auto-trading (kill switch)
  PUT    /api/broker/accounts/{acct_id} — update risk/allowlist/mode
  DELETE /api/broker/accounts/{acct_id}
  GET    /api/broker/orders          — execution log
  GET    /api/broker/mappings         — symbol map
  PUT    /api/broker/mappings/{symbol}

Gateway-facing (x-broker-token):
  POST   /api/broker/heartbeat        — gateway liveness + account status
  GET    /api/broker/pending           — armed config + pending orders to execute
  POST   /api/broker/orders/report     — report PLACED/FILLED/CLOSED/REJECTED
"""
from datetime import datetime, timezone
import hashlib
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import (
    BrokerAccount, BrokerOrder, BrokerSymbolMap,
    SessionLocal, get_db, _utcnow,
)
from app.rate_limit import limiter
from app.security import get_current_user
from app.services import broker_service

logger = logging.getLogger("tickerscope.broker.api")
router = APIRouter()


# ── Request schemas ───────────────────────────────────────────────────────────
class ConnectRequest(BaseModel):
    name: str = "MT5 Account"
    account_login: str | None = None
    server: str | None = None
    mode: str = "DRY_RUN"                 # DRY_RUN / LIVE
    default_lot: float = 0.1
    max_lot: float = 0.5
    max_positions: int = 5
    daily_loss_limit: float = 10.0
    allowlist: list[str] = []             # [] or ["ALL"] == all symbols


class UpdateAccountRequest(BaseModel):
    name: str | None = None
    account_login: str | None = None
    server: str | None = None
    mode: str | None = None
    default_lot: float | None = None
    max_lot: float | None = None
    max_positions: int | None = None
    daily_loss_limit: float | None = None
    allowlist: list[str] | None = None


class MappingRequest(BaseModel):
    mt5_symbol: str
    enabled: bool = True
    note: str | None = None


class OrderReportRequest(BaseModel):
    order_id: int
    status: str                            # PLACED/FILLED/CLOSED/REJECTED/CANCELLED
    mt5_ticket: str | None = None
    fill_price: float | None = None
    close_price: float | None = None
    pnl: float | None = None
    error: str | None = None
    reported_at: str | None = None


# ── Auth helpers ──────────────────────────────────────────────────────────────
def _account_from_token(request: Request, db: Session | None = None) -> BrokerAccount:
    """Gateway auth: x-broker-token header -> broker account.

    Loads via the caller's session (db) when provided so subsequent mutations
    are visible to that session's commit; otherwise uses a throwaway session.
    """
    token = request.headers.get("x-broker-token")
    if not token:
        raise HTTPException(status_code=401, detail="Missing broker token")
    h = broker_service.hash_token(token)
    owns = db is None
    if owns:
        db = SessionLocal()
    try:
        acct = db.query(BrokerAccount).filter(BrokerAccount.api_token_hash == h).first()
    finally:
        if owns:
            db.close()
    if not acct:
        raise HTTPException(status_code=401, detail="Invalid broker token")
    return acct


# ── User endpoints ────────────────────────────────────────────────────────────
@router.post("/connect")
def connect_account(cfg: ConnectRequest, user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Create a broker connector. Returns the API token ONCE — store it in the gateway."""
    token = broker_service.generate_token()
    acct = BrokerAccount(
        user_id=str(user.id),
        name=cfg.name,
        platform="MT5",
        account_login=cfg.account_login,
        server=cfg.server,
        mode="LIVE" if cfg.mode.upper() == "LIVE" else "DRY_RUN",
        armed=False,
        status="DISCONNECTED",
        api_token_hash=broker_service.hash_token(token),
        default_lot=cfg.default_lot,
        max_lot=cfg.max_lot,
        max_positions=cfg.max_positions,
        daily_loss_limit=cfg.daily_loss_limit,
        allowlist=cfg.allowlist or [],
    )
    db.add(acct)
    db.commit()
    db.refresh(acct)
    broker_service.seed_symbol_mappings(db)
    logger.info("Broker account %d connected for user %s", acct.id, user.id)
    return {"account": broker_service.account_payload(acct), "api_token": token}


@router.get("/accounts")
def list_accounts(user=Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(BrokerAccount).filter(BrokerAccount.user_id == str(user.id)).all()
    return {"accounts": [broker_service.account_payload(r) for r in rows]}


@router.get("/status")
def account_status(
    account_id: int = Query(..., description="Broker account id"),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    acct = _owned_for(user, account_id, db)
    payload = broker_service.account_payload(acct)
    allowed_by = len(acct.allowlist or []) == 0 or "ALL" in (acct.allowlist or [])
    payload["scope"] = "ALL_SYMBOLS" if allowed_by else len(acct.allowlist or [])
    return payload


def _owned_for(user, account_id: int, db: Session) -> BrokerAccount:
    acct = db.query(BrokerAccount).filter(BrokerAccount.id == account_id).first()
    if not acct:
        raise HTTPException(status_code=404, detail="Broker account not found")
    if str(acct.user_id) != str(user.id):
        raise HTTPException(status_code=403, detail="Not your broker account")
    return acct


@router.post("/{acct_id}/arm")
def arm_account(acct_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    acct = _owned_for(user, acct_id, db)
    acct.armed = True
    db.commit()
    logger.info("Broker account %d ARMED", acct_id)
    return {"message": "Auto-trading armed", "account": broker_service.account_payload(acct)}


@router.post("/{acct_id}/disarm")
def disarm_account(acct_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    acct = _owned_for(user, acct_id, db)
    acct.armed = False
    db.commit()
    logger.info("Broker account %d DISARMED (kill switch)", acct_id)
    return {"message": "Auto-trading disarmed", "account": broker_service.account_payload(acct)}


@router.put("/accounts/{acct_id}")
def update_account(
    acct_id: int,
    cfg: UpdateAccountRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    acct = _owned_for(user, acct_id, db)
    for field, val in cfg.model_dump(exclude_unset=True).items():
        if val is not None:
            setattr(acct, field, val)
    db.commit()
    return {"message": "Broker account updated", "account": broker_service.account_payload(acct)}


@router.delete("/accounts/{acct_id}")
def delete_account(acct_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    acct = _owned_for(user, acct_id, db)
    db.query(BrokerOrder).filter(BrokerOrder.broker_account_id == acct_id).delete()
    db.delete(acct)
    db.commit()
    logger.info("Broker account %d deleted", acct_id)
    return {"message": "Broker account deleted"}


@router.get("/orders")
def list_orders(
    account_id: int = Query(...),
    limit: int = Query(50, ge=1, le=200),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _owned_for(user, account_id, db)
    rows = broker_service.account_orders(db, account_id, limit)
    return {"orders": [broker_service.order_summary(o) for o in rows]}


@router.get("/mappings")
def list_mappings(user=Depends(get_current_user), db: Session = Depends(get_db)):
    broker_service.seed_symbol_mappings(db)
    rows = db.query(BrokerSymbolMap).order_by(BrokerSymbolMap.symbol).all()
    return {"mappings": [
        {"symbol": r.symbol, "mt5_symbol": r.mt5_symbol, "enabled": r.enabled, "note": r.note}
        for r in rows
    ]}


@router.put("/mappings/{symbol}")
def update_mapping(symbol: str, cfg: MappingRequest,
                   user=Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.query(BrokerSymbolMap).filter(BrokerSymbolMap.symbol == symbol.upper()).first()
    if not row:
        row = BrokerSymbolMap(symbol=symbol.upper())
        db.add(row)
    row.mt5_symbol = cfg.mt5_symbol
    row.enabled = cfg.enabled
    row.note = cfg.note
    db.commit()
    return {"symbol": row.symbol, "mt5_symbol": row.mt5_symbol, "enabled": row.enabled}


# ── Gateway endpoints (token-authed, higher rate limits) ─────────────────────
@router.post("/heartbeat")
@limiter.limit("120/minute")
def heartbeat(request: Request, db: Session = Depends(get_db)):
    acct = _account_from_token(request, db)
    acct.status = "CONNECTED"
    acct.last_heartbeat = _utcnow()
    if request.client:
        acct.gateway_ip = request.client.host
    db.commit()
    return {"ok": True, "account_id": acct.id, "armed": acct.armed,
            "heartbeat_at": acct.last_heartbeat.isoformat() + "Z"}


@router.get("/pending")
@limiter.limit("120/minute")
def pending(request: Request, db: Session = Depends(get_db)):
    acct = _account_from_token(request, db)
    rows = broker_service.pending_orders(db, acct.id, limit=50)
    return {
        "account": broker_service.account_payload(acct),
        "orders": [broker_service.order_summary(o) for o in rows],
        "now": datetime.now(timezone.utc).isoformat() + "Z",
    }


@router.post("/orders/report")
@limiter.limit("120/minute")
def orders_report(request: Request, payload: OrderReportRequest, db: Session = Depends(get_db)):
    acct = _account_from_token(request, db)
    try:
        order = broker_service.apply_order_report(
            db, acct.id, payload.order_id,
            payload.model_dump(exclude_unset=True),
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"ok": True, "order": broker_service.order_summary(order)}