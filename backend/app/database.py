"""
Database configuration and initialization
"""

import logging
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean, Text, JSON, ForeignKey, UniqueConstraint, Index, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from datetime import datetime, timezone
import os

from app.config import settings

logger = logging.getLogger(__name__)


def _utcnow():
    """Timezone-aware UTC now — replaces `_utcnow` (deprecated in Py 3.12+)."""
    return datetime.now(timezone.utc)

# Database setup — echo=False suppresses connection-pool ROLLBACK noise.
# Set echo=settings.DEBUG only if you need raw SQL logging for debugging.
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {},
    echo=False,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Database Models
class User(Base):
    """User model"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True)
    email = Column(String(100), unique=True, index=True)
    hashed_password = Column(String(255))
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    is_email_verified = Column(Boolean, default=False)
    profile_picture = Column(String(500), nullable=True)
    phone = Column(String(20), nullable=True)
    country = Column(String(100), nullable=True)
    subscription_tier = Column(String(20), default="free")  # free, basic, premium
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
    last_login = Column(DateTime, nullable=True)
    # Email-verification + password-reset tokens (filled lazily by the auth flow).
    email_verification_token  = Column(String(128), nullable=True, index=True)
    email_verification_expires = Column(Float, nullable=True)
    password_reset_token     = Column(String(128), nullable=True, index=True)
    password_reset_expires   = Column(Float, nullable=True)
    last_login = Column(DateTime, nullable=True)

class Portfolio(Base):
    """Portfolio model"""
    __tablename__ = "portfolios"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    name = Column(String(100), default="My Portfolio")
    description = Column(Text, nullable=True)
    initial_investment = Column(Float, default=0.0)
    current_value = Column(Float, default=0.0)
    total_gain_loss = Column(Float, default=0.0)
    total_gain_loss_percent = Column(Float, default=0.0)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

class PortfolioStock(Base):
    """Portfolio stock holdings"""
    __tablename__ = "portfolio_stocks"

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, index=True)
    symbol = Column(String(20), index=True)
    quantity = Column(Float)
    purchase_price = Column(Float)
    purchase_date = Column(DateTime, default=_utcnow)
    current_price = Column(Float, nullable=True)
    current_value = Column(Float, nullable=True)
    gain_loss = Column(Float, nullable=True)
    gain_loss_percent = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

class StockData(Base):
    """Historical stock data"""
    __tablename__ = "stock_data"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), index=True)
    date = Column(DateTime, index=True)
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    volume = Column(Integer)
    adjusted_close = Column(Float, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

class Prediction(Base):
    """AI predictions"""
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    symbol = Column(String(20), index=True)
    predicted_date = Column(DateTime, nullable=True)
    current_price = Column(Float, nullable=True)
    predicted_price = Column(Float)
    change_percent = Column(Float, nullable=True)
    confidence_score = Column(Float)
    signal = Column(String(20))  # BUY, SELL, HOLD
    trend_direction = Column(String(20), nullable=True)  # BULLISH, BEARISH, NEUTRAL
    forecast_7day = Column(JSON, nullable=True)
    model_predictions = Column(JSON, nullable=True)
    models_used = Column(JSON, nullable=True)
    accuracy_metric = Column(Float, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

class News(Base):
    """Financial news"""
    __tablename__ = "news"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), index=True, nullable=True)
    title = Column(String(500))
    description = Column(Text, nullable=True)
    content = Column(Text, nullable=True)
    source = Column(String(100))
    url = Column(String(1000), unique=True)
    image_url = Column(String(1000), nullable=True)
    published_at = Column(DateTime)
    sentiment = Column(String(20), nullable=True)  # POSITIVE, NEGATIVE, NEUTRAL
    sentiment_score = Column(Float, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

class TechnicalIndicator(Base):
    """Technical indicators cache"""
    __tablename__ = "technical_indicators"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), index=True)
    date = Column(DateTime, index=True)
    sma_20 = Column(Float, nullable=True)
    sma_50 = Column(Float, nullable=True)
    sma_200 = Column(Float, nullable=True)
    ema_12 = Column(Float, nullable=True)
    ema_26 = Column(Float, nullable=True)
    rsi_14 = Column(Float, nullable=True)
    macd = Column(Float, nullable=True)
    macd_signal = Column(Float, nullable=True)
    macd_histogram = Column(Float, nullable=True)
    bollinger_upper = Column(Float, nullable=True)
    bollinger_middle = Column(Float, nullable=True)
    bollinger_lower = Column(Float, nullable=True)
    atr = Column(Float, nullable=True)
    vwap = Column(Float, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

class AuditLog(Base):
    """Audit logs for admin activities"""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    action = Column(String(100))
    description = Column(Text, nullable=True)
    ip_address = Column(String(50), nullable=True)
    user_agent = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=_utcnow, index=True)

class ModelMetrics(Base):
    """ML model performance metrics"""
    __tablename__ = "model_metrics"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), index=True)
    accuracy = Column(Float)
    rmse = Column(Float)
    mape = Column(Float)
    r2_score = Column(Float)
    precision = Column(Float, nullable=True)
    recall = Column(Float, nullable=True)
    f1_score = Column(Float, nullable=True)
    samples_count = Column(Integer)
    training_date = Column(DateTime)
    model_version = Column(String(50), default="1.0")

class WatchlistItem(Base):
    __tablename__ = "watchlist"

    id       = Column(Integer, primary_key=True, index=True)
    user_id  = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    symbol   = Column(String(30), nullable=False)
    added_at = Column(DateTime, default=_utcnow)
    notes    = Column(String(200), nullable=True)

    __table_args__ = (UniqueConstraint("user_id", "symbol"),)


class Visitor(Base):
    """Anonymous guest visitors — tracked by IP + UA fingerprint."""
    __tablename__ = "visitors"

    id              = Column(Integer, primary_key=True, index=True)
    # Random friendly name like "Falcon-Aurora-7821" so the user can see their
    # identity in popups even though they haven't signed up. Unique for collision safety.
    guest_username  = Column(String(60), unique=True, index=True, nullable=False)
    ip_address      = Column(String(64), index=True, nullable=True)
    user_agent      = Column(String(500), nullable=True)
    country         = Column(String(80), nullable=True)
    city            = Column(String(80), nullable=True)
    first_seen      = Column(DateTime, default=_utcnow, index=True)
    last_seen       = Column(DateTime, default=_utcnow, onupdate=_utcnow, index=True)
    page_views      = Column(Integer, default=1)
    # Token to identify the same browser across sessions (cookie / localStorage)
    visitor_token   = Column(String(80), unique=True, index=True, nullable=False)


class VisitorPageView(Base):
    """Track each page hit by a visitor — for traffic analytics."""
    __tablename__ = "visitor_page_views"

    id            = Column(Integer, primary_key=True, index=True)
    visitor_id    = Column(Integer, ForeignKey("visitors.id"), nullable=False, index=True)
    path          = Column(String(500), nullable=False, index=True)
    referer       = Column(String(500), nullable=True)
    duration_ms   = Column(Integer, nullable=True)
    viewed_at     = Column(DateTime, default=_utcnow, index=True)


class IntradaySignal(Base):
    __tablename__ = "intraday_signals"

    id           = Column(Integer, primary_key=True, index=True)
    symbol       = Column(String(30), nullable=False, index=True)
    strategy     = Column(String(50), nullable=False)
    signal       = Column(String(10), nullable=False)   # BUY/SELL/HOLD
    entry        = Column(Float, nullable=False)
    sl           = Column(Float, nullable=False)
    tp           = Column(Float, nullable=False)
    confidence   = Column(Float, default=0.0)
    timeframe    = Column(String(10), default="1H")
    kill_zone    = Column(String(20), nullable=True)    # LONDON/NY/NONE
    htf_bias     = Column(String(10), nullable=True)    # BULLISH/BEARISH/NEUTRAL
    generated_at = Column(DateTime, default=_utcnow, index=True)
    outcome      = Column(String(20), default="PENDING")  # TP_HIT/SL_HIT/EXPIRED/PENDING
    outcome_at   = Column(DateTime, nullable=True)
    pnl_r        = Column(Float, nullable=True)
    is_hidden    = Column(Boolean, default=False)  # Admin can hide signals from main site

    __table_args__ = (
        Index("ix_outcome_generated_at", "outcome", "generated_at"),
    )


def _auto_migrate():
    """Add missing columns to existing tables (safe to re-run)."""
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE intraday_signals ADD COLUMN is_hidden BOOLEAN DEFAULT 0"))
            conn.commit()
            logger.info("Migration: added is_hidden to intraday_signals")
        except Exception:
            pass  # Column already exists


def init_db():
    """Initialize database with all tables"""
    try:
        Base.metadata.create_all(bind=engine)
        # Create missing indexes (safe to re-run — CREATE INDEX IF NOT EXISTS in SQLite ≥3.33.0)
        with engine.connect() as conn:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_outcome_generated_at ON intraday_signals(outcome, generated_at)"))
            conn.commit()
        _auto_migrate()
        logger.info("Database tables created successfully")
        return True
    except Exception as e:
        logger.error(f"Failed to initialize database: {str(e)}")
        return False

def get_db() -> Session:
    """Dependency for getting database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
