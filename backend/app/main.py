"""
FinSight Backend — public API serving real market data, portfolio, news, indicators, reports.
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.database import init_db
from app.rate_limit import limiter
from app.api import (
    stocks, market_new, portfolio_new, news_new, reports, prediction,
    auth_new, admin_new, ws, forex, backtesting, signals, watchlist, platform, visitor,
)
from app.services.signal_service import background_signals_loop, resolve_signal_outcomes

# Content-Security-Policy: allow the TradingView advanced-chart script + frames.
_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https://s3.tradingview.com; "
    "frame-src https://www.tradingview.com https://s.tradingview.com; "
    "img-src 'self' data: https:; "
    "connect-src 'self' https: wss:; "
    "style-src 'self' 'unsafe-inline'"
)
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": _CSP,
}

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")
logger = logging.getLogger("finsight")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("DB initialized")
    # Kill all stale PENDING signals immediately — one raw SQL, instant
    try:
        from app.database import SessionLocal
        db = SessionLocal()
        from sqlalchemy import text
        result = db.execute(text("UPDATE intraday_signals SET outcome='EXPIRED', pnl_r=0.0 WHERE outcome='PENDING'"))
        db.commit()
        logger.info("Startup cleanup: %d PENDING signals marked EXPIRED", result.rowcount)
        db.close()
    except Exception as e:
        logger.error("Startup cleanup failed: %s", e)
    asyncio.create_task(background_signals_loop())
    logger.info("Background signal refresh loop started")
    yield


app = FastAPI(
    title="FinSight API",
    description="AI-Based Stock Market Analysis & Prediction Platform",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

# ── Rate limiting (slowapi) ──────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


# ── Security headers (applied to every response) ─────────────────────────────
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    for k, v in _SECURITY_HEADERS.items():
        response.headers.setdefault(k, v)
    # HSTS only over HTTPS (respect proxy's X-Forwarded-Proto for TLS termination).
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    if proto == "https":
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_CREDENTIALS,
    allow_methods=settings.CORS_METHODS,
    allow_headers=settings.CORS_HEADERS,
)


@app.exception_handler(SQLAlchemyError)
async def db_handler(request: Request, exc: SQLAlchemyError):
    logger.exception("DB error")
    return JSONResponse(status_code=500, content={"detail": "Database error"})


@app.get("/health")
def health():
    return {"status": "healthy", "service": "FinSight API", "version": "1.0.0"}


@app.get("/")
def root():
    return {"name": "FinSight API", "docs": "/api/docs"}


# Public real-data endpoints
app.include_router(stocks.router, prefix="/api/stocks", tags=["Stocks"])
app.include_router(market_new.router, prefix="/api/market", tags=["Market"])
app.include_router(portfolio_new.router, prefix="/api/portfolio", tags=["Portfolio"])
app.include_router(news_new.router, prefix="/api/news", tags=["News"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])
app.include_router(prediction.router, prefix="/api/prediction", tags=["AI Prediction"])
app.include_router(auth_new.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(admin_new.router, prefix="/api/admin", tags=["Admin"])
app.include_router(ws.router, prefix="/ws", tags=["WebSocket"])
app.include_router(forex.router, prefix="/api/forex", tags=["Forex"])
app.include_router(backtesting.router, prefix="/api/backtest", tags=["Backtesting"])
app.include_router(signals.router, prefix="/api/signals", tags=["Signals"])
app.include_router(watchlist.router, prefix="/api/watchlist", tags=["Watchlist"])
app.include_router(platform.router, prefix='/api/platform', tags=['Platform'])
app.include_router(visitor.router, prefix='/api/visitor', tags=['Visitor'])
