"""
Paper Trading Service — auto-places virtual trades on signals, resolves TP/SL.
"""
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.database import PaperAccount, PaperPosition, IntradaySignal

logger = logging.getLogger("tickerscope.paper")

# Config
DEFAULT_BALANCE = 10000.0
POSITION_SIZE_PCT = 2.0  # risk 2% of balance per trade
MAX_OPEN_POSITIONS = 10
MAX_LEVERAGE = 5.0        # never exceed 5:1 notional-to-equity
MIN_NOTIONAL = 50.0       # skip if notional < $50

# Fixed lot sizing: $10K = 0.1 lot (10,000 units for forex)
BASE_BALANCE = 10000.0
BASE_FOREX_LOT = 0.1       # 0.1 standard lot at $10K
FOREX_LOT_UNITS = 100000   # 1 standard lot = 100,000 units


def get_or_create_account(db: Session, user_id: str) -> PaperAccount:
    """Get or create a paper trading account for a user."""
    acct = db.query(PaperAccount).filter(PaperAccount.user_id == user_id).first()
    if not acct:
        acct = PaperAccount(
            user_id=user_id,
            balance=DEFAULT_BALANCE,
            initial_balance=DEFAULT_BALANCE,
        )
        db.add(acct)
        db.commit()
        db.refresh(acct)
        logger.info("Created paper account for user %s with $%.0f", user_id, DEFAULT_BALANCE)
    return acct


def place_paper_trade(db: Session, user_id: str, signal: IntradaySignal) -> PaperPosition | None:
    """Auto-place a paper trade when a new signal is generated."""
    acct = get_or_create_account(db, user_id)

    # Check max open positions
    open_count = db.query(PaperPosition).filter(
        PaperPosition.user_id == user_id,
        PaperPosition.status == "OPEN",
    ).count()
    if open_count >= MAX_OPEN_POSITIONS:
        return None

    # Check if already have a position on this signal
    if signal.id:
        existing = db.query(PaperPosition).filter(
            PaperPosition.user_id == user_id,
            PaperPosition.signal_id == signal.id,
        ).first()
        if existing:
            return None

    # Fixed lot sizing: scales with balance via compounding
    # $10K = 0.1 lot (10,000 units for forex), proportional to balance
    lot_multiplier = acct.balance / BASE_BALANCE
    base_lot = BASE_FOREX_LOT * lot_multiplier

    if symbol.endswith("=X"):
        # Forex pair: 1 lot = 100,000 units
        quantity = round(base_lot * FOREX_LOT_UNITS, 2)
    else:
        # Non-forex: equivalent notional ($10K per 0.1 lot)
        notional_per_lot = BASE_FOREX_LOT * FOREX_LOT_UNITS  # $10,000
        target_notional = notional_per_lot * lot_multiplier
        quantity = round(target_notional / signal.entry, 4) if signal.entry > 0 else 0

    if quantity <= 0:
        return None

    # Leverage cap: notional must not exceed MAX_LEVERAGE × balance
    notional = quantity * signal.entry
    max_notional = acct.balance * MAX_LEVERAGE
    if notional > max_notional:
        quantity = round(max_notional / signal.entry, 4) if signal.entry > 0 else 0
        notional = quantity * signal.entry

    # Skip if notional too small to be meaningful
    if notional < MIN_NOTIONAL:
        return None

    position = PaperPosition(
        user_id=user_id,
        signal_id=signal.id,
        symbol=signal.symbol,
        direction=signal.signal,
        entry_price=signal.entry,
        quantity=quantity,
        stop_loss=signal.sl,
        take_profit=signal.tp,
        status="OPEN",
    )
    db.add(position)
    db.commit()
    db.refresh(position)

    logger.info("Paper trade: %s %s %.2f units @ %.4f | SL=%.4f TP=%.4f | User=%s",
                signal.signal, signal.symbol, quantity, signal.entry,
                signal.sl, signal.tp, user_id)
    return position


def auto_trade_all_users(db: Session, signal: IntradaySignal):
    """Place paper trades for all users with paper accounts."""
    accounts = db.query(PaperAccount).all()
    for acct in accounts:
        try:
            place_paper_trade(db, acct.user_id, signal)
        except Exception as exc:
            logger.warning("Paper trade failed for user %s: %s", acct.user_id, exc)


def resolve_paper_positions(db: Session, symbol: str, df) -> int:
    """
    Resolve open paper positions for a symbol using OHLCV DataFrame.
    Only uses candle data AFTER the position's entry_time (avoids same-candle resolution).
    Returns number of positions closed.
    """
    import pandas as pd

    open_positions = db.query(PaperPosition).filter(
        PaperPosition.symbol == symbol,
        PaperPosition.status == "OPEN",
    ).all()

    if not open_positions:
        return 0

    # Ensure datetime index for filtering
    idx = df.index
    if not isinstance(idx, pd.DatetimeIndex):
        try:
            idx = pd.to_datetime(idx)
        except Exception:
            pass

    closed = 0
    now = datetime.now(timezone.utc)

    for pos in open_positions:
        risk = abs(pos.entry_price - pos.stop_loss)
        if risk <= 0:
            risk = pos.entry_price * 0.01

        # Filter: only use candles that closed AFTER the position was opened
        # This prevents same-candle resolution (signal and TP/SL on same candle)
        entry_dt = pos.entry_time
        if hasattr(entry_dt, 'tzinfo') and entry_dt.tzinfo is None:
            entry_dt = entry_dt.replace(tzinfo=timezone.utc)

        if isinstance(idx, pd.DatetimeIndex):
            # Only candles after entry_time (give 1 candle grace period)
            mask = idx > entry_dt
            if mask.sum() == 0:
                # No new candles since entry — don't resolve yet
                continue
            post_highs = df["high"].values[mask.values]
            post_lows = df["low"].values[mask.values]
        else:
            # Fallback: use all data (but this may cause same-candle issues)
            post_highs = df["high"].values
            post_lows = df["low"].values

        if pos.direction == "BUY":
            hit_tp = any(h >= pos.take_profit for h in post_highs)
            hit_sl = any(l <= pos.stop_loss for l in post_lows)
        else:
            hit_tp = any(l <= pos.take_profit for l in post_lows)
            hit_sl = any(h >= pos.stop_loss for h in post_highs)

        if hit_tp:
            # TP hit
            if pos.direction == "BUY":
                pnl = (pos.take_profit - pos.entry_price) * pos.quantity
            else:
                pnl = (pos.entry_price - pos.take_profit) * pos.quantity

            pos.status = "CLOSED_TP"
            pos.exit_price = pos.take_profit
            pos.exit_time = datetime.now(timezone.utc)
            pos.pnl = round(pnl, 2)
            pos.pnl_percent = round((pnl / (pos.entry_price * pos.quantity)) * 100, 2) if pos.entry_price * pos.quantity > 0 else 0

            # Update account
            acct = db.query(PaperAccount).filter(PaperAccount.user_id == pos.user_id).first()
            if acct:
                acct.balance += pnl
                acct.total_pnl += pnl
                acct.total_trades += 1
                acct.wins += 1
            closed += 1

        elif hit_sl:
            # SL hit
            if pos.direction == "BUY":
                pnl = (pos.stop_loss - pos.entry_price) * pos.quantity
            else:
                pnl = (pos.entry_price - pos.stop_loss) * pos.quantity

            pos.status = "CLOSED_SL"
            pos.exit_price = pos.stop_loss
            pos.exit_time = datetime.now(timezone.utc)
            pos.pnl = round(pnl, 2)
            pos.pnl_percent = round((pnl / (pos.entry_price * pos.quantity)) * 100, 2) if pos.entry_price * pos.quantity > 0 else 0

            # Update account
            acct = db.query(PaperAccount).filter(PaperAccount.user_id == pos.user_id).first()
            if acct:
                acct.balance += pnl
                acct.total_pnl += pnl
                acct.total_trades += 1
                acct.losses += 1
            closed += 1

        if closed:
            db.add(pos)

    if closed:
        db.commit()

    return closed


def get_account_summary(db: Session, user_id: str) -> dict:
    """Get paper trading account summary."""
    acct = get_or_create_account(db, user_id)

    open_positions = db.query(PaperPosition).filter(
        PaperPosition.user_id == user_id,
        PaperPosition.status == "OPEN",
    ).all()

    # Calculate unrealized P&L for open positions
    unrealized_pnl = 0.0
    for pos in open_positions:
        # Use entry price as approximation (real-time price would need market data)
        unrealized_pnl += pos.pnl

    return {
        "balance": round(acct.balance, 2),
        "initial_balance": acct.initial_balance,
        "total_pnl": round(acct.total_pnl, 2),
        "total_pnl_pct": round((acct.total_pnl / acct.initial_balance) * 100, 2) if acct.initial_balance > 0 else 0,
        "total_trades": acct.total_trades,
        "wins": acct.wins,
        "losses": acct.losses,
        "win_rate": round(acct.wins / acct.total_trades * 100, 1) if acct.total_trades > 0 else 0,
        "open_positions": len(open_positions),
    }


def get_positions(db: Session, user_id: str, status: str | None = None, limit: int = 50) -> list[dict]:
    """Get paper trading positions."""
    query = db.query(PaperPosition).filter(PaperPosition.user_id == user_id)
    if status:
        query = query.filter(PaperPosition.status == status)
    positions = query.order_by(PaperPosition.entry_time.desc()).limit(limit).all()

    return [
        {
            "id": p.id,
            "symbol": p.symbol,
            "direction": p.direction,
            "entry_price": p.entry_price,
            "quantity": p.quantity,
            "stop_loss": p.stop_loss,
            "take_profit": p.take_profit,
            "status": p.status,
            "entry_time": p.entry_time.isoformat() + "Z" if p.entry_time else None,
            "exit_time": p.exit_time.isoformat() + "Z" if p.exit_time else None,
            "exit_price": p.exit_price,
            "pnl": p.pnl,
            "pnl_percent": p.pnl_percent,
            "signal_id": p.signal_id,
        }
        for p in positions
    ]
