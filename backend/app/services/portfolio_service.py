"""
Portfolio service with real persistence and live valuation.
"""
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.database import Portfolio, PortfolioStock, User
from app.services import market_data_service as mds

logger = logging.getLogger(__name__)

def _ensure_default_user(db: Session) -> int:
    """Fallback when auth disabled or user not provided — used only for guest mode."""
    user = db.query(User).filter(User.email == "demo@finsight.local").first()
    if not user:
        user = User(
            username="demo",
            email="demo@finsight.local",
            hashed_password="disabled",
            first_name="Demo",
            last_name="User",
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user.id


def _ensure_default_portfolio(db: Session, user_id: int) -> Portfolio:
    p = db.query(Portfolio).filter(Portfolio.user_id == user_id).first()
    if not p:
        p = Portfolio(user_id=user_id, name="My Portfolio", is_default=True)
        db.add(p)
        db.commit()
        db.refresh(p)
    return p


def list_holdings(db: Session, user_id: int = None) -> list:
    if user_id is None:
        user_id = _ensure_default_user(db)
    p = _ensure_default_portfolio(db, user_id)

    stocks = db.query(PortfolioStock).filter(PortfolioStock.portfolio_id == p.id).all()
    # Batch-warm all holding quotes in ONE TradingView call → the per-symbol
    # get_stock_quote() calls below become instant cache hits.
    mds.prefetch_quotes([s.symbol for s in stocks])
    result = []
    for s in stocks:
        try:
            quote = mds.get_stock_quote(s.symbol)
            current_price = quote["price"]
            current_value = current_price * s.quantity
            invested = s.purchase_price * s.quantity
            gain_loss = current_value - invested
            gain_loss_pct = (gain_loss / invested * 100) if invested else 0.0
        except Exception as e:
            logger.warning(f"price fetch failed {s.symbol}: {e}")
            current_price = s.purchase_price
            current_value = s.purchase_price * s.quantity
            gain_loss = 0.0
            gain_loss_pct = 0.0

        result.append({
            "id": s.id,
            "symbol": s.symbol,
            "quantity": s.quantity,
            "purchase_price": s.purchase_price,
            "current_price": current_price,
            "invested": s.purchase_price * s.quantity,
            "current_value": current_value,
            "gain_loss": gain_loss,
            "gain_loss_percent": gain_loss_pct,
            "purchase_date": s.purchase_date.isoformat() if s.purchase_date else None,
            "notes": s.notes,
        })
    return result


def add_holding(db: Session, symbol: str, quantity: float, purchase_price: float,
                purchase_date: datetime = None, notes: str = None, user_id: int = None) -> dict:
    if user_id is None:
        user_id = _ensure_default_user(db)
    p = _ensure_default_portfolio(db, user_id)

    # Verify symbol exists
    try:
        mds.get_stock_quote(symbol)
    except Exception:
        raise ValueError(f"Invalid symbol: {symbol}")

    stock = PortfolioStock(
        portfolio_id=p.id,
        symbol=symbol.upper(),
        quantity=quantity,
        purchase_price=purchase_price,
        purchase_date=purchase_date or datetime.now(timezone.utc),
        notes=notes,
    )
    db.add(stock)
    db.commit()
    db.refresh(stock)
    return {"id": stock.id, "symbol": stock.symbol, "quantity": stock.quantity}


def delete_holding(db: Session, stock_id: int, user_id: int = None) -> bool:
    if user_id is None:
        user_id = _ensure_default_user(db)
    p = _ensure_default_portfolio(db, user_id)
    stock = db.query(PortfolioStock).filter(
        PortfolioStock.id == stock_id, PortfolioStock.portfolio_id == p.id
    ).first()
    if not stock:
        return False
    db.delete(stock)
    db.commit()
    return True


def update_holding(db: Session, stock_id: int, quantity: float = None,
                   purchase_price: float = None, notes: str = None, user_id: int = None) -> bool:
    if user_id is None:
        user_id = _ensure_default_user(db)
    p = _ensure_default_portfolio(db, user_id)
    stock = db.query(PortfolioStock).filter(
        PortfolioStock.id == stock_id, PortfolioStock.portfolio_id == p.id
    ).first()
    if not stock:
        return False
    if quantity is not None:
        stock.quantity = quantity
    if purchase_price is not None:
        stock.purchase_price = purchase_price
    if notes is not None:
        stock.notes = notes
    db.commit()
    return True


def get_summary(db: Session, user_id: int = None) -> dict:
    """Live portfolio analytics."""
    holdings = list_holdings(db, user_id)
    total_invested = sum(h["invested"] for h in holdings)
    total_value = sum(h["current_value"] for h in holdings)
    total_gain_loss = total_value - total_invested
    total_gain_loss_pct = (total_gain_loss / total_invested * 100) if total_invested else 0.0

    today_pl = sum(
        (h["current_price"] - h["purchase_price"]) * h["quantity"] * 0  # placeholder for intraday calc
        for h in holdings
    )
    # Actual today's P/L: use change vs previous close
    today_pl = 0.0
    for h in holdings:
        try:
            q = mds.get_stock_quote(h["symbol"])
            today_pl += q["change"] * h["quantity"]
        except Exception:
            pass

    # Allocation
    allocation = []
    for h in holdings:
        pct = (h["current_value"] / total_value * 100) if total_value else 0.0
        allocation.append({"symbol": h["symbol"], "value": h["current_value"], "percentage": pct})

    return {
        "total_invested": total_invested,
        "total_value": total_value,
        "total_gain_loss": total_gain_loss,
        "total_gain_loss_percent": total_gain_loss_pct,
        "today_profit_loss": today_pl,
        "holdings_count": len(holdings),
        "allocation": allocation,
        "holdings": holdings,
    }
