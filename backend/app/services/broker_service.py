"""
Broker Service — MT5 live auto-trading integration layer.

Creates broker account tokens, auto-creates execution orders when signals fire,
resolves MT5 symbol mappings, and serves the gateway's pending-work queue.
The gateway (mt5_gateway.py, running on the MT5 Windows VPS) polls
GET /api/broker/pending and reports fills back via POST /api/broker/orders/report.
"""
import hashlib
import logging
import secrets

from sqlalchemy.orm import Session

from app.database import BrokerAccount, BrokerOrder, BrokerSymbolMap, IntradaySignal

logger = logging.getLogger("tickerscope.broker")

ALL_MARKER = "ALL"

# Default TickerScope -> MT5 symbol mappings. Users should verify these against
# their broker's symbol list and edit via PUT /api/broker/mappings/CL=F.
DEFAULT_MAPPINGS = {
    "CL=F":     {"mt5": "USOIL",    "note": "WTI crude — verify broker symbol"},
    "NQ=F":     {"mt5": "USTEC100", "note": "US Tech 100 — verify broker symbol"},
    "ES=F":     {"mt5": "US500",    "note": "S&P 500 — verify broker symbol"},
    "GC=F":     {"mt5": "XAUUSD",   "note": "Gold vs USD — verify broker symbol"},
    "EURUSD=X": {"mt5": "EURUSD",   "note": "Forex — verify broker symbol"},
    "GBPUSD=X": {"mt5": "GBPUSD",   "note": "Forex — verify broker symbol"},
}

ORDER_LIVE = ("PENDING", "PLACED", "FILLED", "OPEN")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8", "ignore")).hexdigest()


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def seed_symbol_mappings(db: Session) -> int:
    """Idempotently seed default symbol mappings. Returns count added."""
    added = 0
    for sym, cfg in DEFAULT_MAPPINGS.items():
        existing = db.query(BrokerSymbolMap).filter(BrokerSymbolMap.symbol == sym).first()
        if not existing:
            db.add(BrokerSymbolMap(symbol=sym, mt5_symbol=cfg["mt5"], note=cfg["note"]))
            added += 1
    if added:
        db.commit()
        logger.info("Seeded %d broker symbol mappings", added)
    return added


def resolve_mt5_symbol(db: Session, symbol: str) -> str:
    row = db.query(BrokerSymbolMap).filter(
        BrokerSymbolMap.symbol == symbol,
        BrokerSymbolMap.enabled == True,
    ).first()
    return row.mt5_symbol if row else symbol


def is_allowed(account: BrokerAccount, symbol: str) -> bool:
    allowlist = account.allowlist or []
    if not allowlist or ALL_MARKER in allowlist:
        return True
    return symbol in allowlist


def open_position_count(db: Session, account_id: int) -> int:
    return db.query(BrokerOrder).filter(
        BrokerOrder.broker_account_id == account_id,
        BrokerOrder.status.in_(ORDER_LIVE),
    ).count()


def create_broker_orders_for_signal(db: Session, signal: IntradaySignal) -> int:
    """Auto-create PENDING execution orders for all armed broker accounts."""
    if not signal or signal.signal not in ("BUY", "SELL"):
        return 0
    accounts = db.query(BrokerAccount).filter(BrokerAccount.armed == True).all()
    created = 0
    for acct in accounts:
        if acct.user_id == "0":            # guests never trade live
            continue
        if not is_allowed(acct, signal.symbol):
            continue
        existing = db.query(BrokerOrder).filter(
            BrokerOrder.broker_account_id == acct.id,
            BrokerOrder.signal_id == signal.id,
        ).first()
        if existing:
            continue
        if open_position_count(db, acct.id) >= acct.max_positions:
            continue
        lot = max((acct.default_lot or 0.1), 0.01)
        if acct.max_lot and lot > acct.max_lot:
            lot = acct.max_lot
        order = BrokerOrder(
            user_id=acct.user_id,
            broker_account_id=acct.id,
            signal_id=signal.id,
            symbol=signal.symbol,
            mt5_symbol=resolve_mt5_symbol(db, signal.symbol),
            direction=signal.signal,
            lot=lot,
            entry=signal.entry,
            sl=signal.sl,
            tp=signal.tp,
            status="PENDING",
        )
        db.add(order)
        created += 1
    if created:
        db.commit()
        logger.info("Created %d broker order(s) for %s (%s)", created, signal.symbol, signal.signal)
    return created


def pending_orders(db: Session, account_id: int, limit: int = 50):
    return db.query(BrokerOrder).filter(
        BrokerOrder.broker_account_id == account_id,
        BrokerOrder.status == "PENDING",
    ).order_by(BrokerOrder.created_at.asc()).limit(limit).all()


def account_orders(db: Session, account_id: int, limit: int = 50):
    return db.query(BrokerOrder).filter(
        BrokerOrder.broker_account_id == account_id,
    ).order_by(BrokerOrder.created_at.desc()).limit(limit).all()


def order_summary(o: BrokerOrder) -> dict:
    return {
        "id": o.id,
        "signal_id": o.signal_id,
        "symbol": o.symbol,
        "mt5_symbol": o.mt5_symbol,
        "direction": o.direction,
        "lot": o.lot,
        "entry": o.entry,
        "sl": o.sl,
        "tp": o.tp,
        "status": o.status,
        "mt5_ticket": o.mt5_ticket,
        "fill_price": o.fill_price,
        "close_price": o.close_price,
        "pnl": o.pnl,
        "error": o.error,
        "created_at": o.created_at.isoformat() + ("Z" if o.created_at else ""),
        "updated_at": o.updated_at.isoformat() + ("Z" if o.updated_at else ""),
    }


def apply_order_report(db: Session, account_id: int, order_id: int, payload: dict) -> BrokerOrder | None:
    """Apply a gateway report on an order. Idempotent per transition."""
    order = db.query(BrokerOrder).filter(
        BrokerOrder.id == order_id,
        BrokerOrder.broker_account_id == account_id,
    ).first()
    if not order:
        raise KeyError(f"order {order_id} not found for account {account_id}")

    status = (payload.get("status") or "").upper()
    ticket = payload.get("mt5_ticket")
    now_rpt = payload.get("reported_at")

    if status == "PLACED" and order.status == "PENDING":
        order.status = "PLACED"
        if ticket:
            order.mt5_ticket = str(ticket)
    elif status == "FILLED" and order.status in ("PLACED", "PENDING"):
        order.status = "FILLED"
        if ticket:
            order.mt5_ticket = str(ticket)
        if payload.get("fill_price") is not None:
            order.fill_price = float(payload["fill_price"])
    elif status == "REJECTED" and order.status == "PENDING":
        order.status = "REJECTED"
        order.error = payload.get("error") or "Broker rejected order"
    elif status == "CLOSED" and order.status in ("FILLED", "PLACED", "OPEN"):
        order.status = "CLOSED"
        if payload.get("close_price") is not None:
            order.close_price = float(payload["close_price"])
        if payload.get("pnl") is not None:
            order.pnl = float(payload["pnl"])
    elif status == "CANCELLED" and order.status == "PENDING":
        order.status = "CANCELLED"
    else:
        # Already transitioned — treat as idempotent no-op.
        return order

    db.commit()
    db.refresh(order)
    logger.info("Broker order %s -> %s (ticket=%s)", order_id, status, ticket)
    return order


def account_payload(acct: BrokerAccount) -> dict:
    return {
        "id": acct.id,
        "name": acct.name,
        "platform": acct.platform,
        "account_login": acct.account_login,
        "server": acct.server,
        "mode": acct.mode,
        "armed": acct.armed,
        "status": acct.status,
        "default_lot": acct.default_lot,
        "max_lot": acct.max_lot,
        "max_positions": acct.max_positions,
        "daily_loss_limit": acct.daily_loss_limit,
        "allowlist": acct.allowlist or [ALL_MARKER],
        "last_heartbeat": acct.last_heartbeat.isoformat() + "Z" if acct.last_heartbeat else None,
        "gateway_ip": acct.gateway_ip,
        "created_at": acct.created_at.isoformat() + ("Z" if acct.created_at else ""),
    }