"""
TickerScope Backend — public API serving real market data, portfolio, news, indicators, reports.
"""
import asyncio
import logging
import os
import secrets
import httpx
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
    backtest_ml, paper_trading,
)
from app.services.signal_service import background_signals_loop, resolve_signal_outcomes
from app.services.market_data_service import background_data_warming_loop

# Content-Security-Policy: allow the TradingView advanced-chart script + frames.
_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https://s3.tradingview.com; "
    "frame-src https://www.tradingview.com https://s.tradingview.com; "
    "frame-ancestors 'none'; "
    "img-src 'self' data: https:; "
    "connect-src 'self' https: wss:; "
    "style-src 'self' 'unsafe-inline'; "
    "upgrade-insecure-requests"
)
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": _CSP,
}

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")
logger = logging.getLogger("tickerscope")


async def _keep_alive_loop():
    """Self-ping /health every 5 seconds to prevent Render free-tier sleep."""
    base = os.environ.get("FINSIGHT_PUBLIC_URL", "http://127.0.0.1:8000")
    url = f"{base.rstrip('/')}/health"
    async with httpx.AsyncClient(timeout=10) as client:
        while True:
            await asyncio.sleep(5)
            try:
                r = await client.get(url)
                logger.debug("Keep-alive ping %s -> %s", url, r.status_code)
            except Exception as exc:
                logger.warning("Keep-alive ping failed: %s", exc)


_bg_tasks: list[asyncio.Task] = []

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("DB initialized")
    _bg_tasks.append(asyncio.create_task(background_signals_loop()))
    logger.info("Background signal refresh loop started")
    _bg_tasks.append(asyncio.create_task(_keep_alive_loop()))
    logger.info("Keep-alive loop started (every 5s)")
    _bg_tasks.append(asyncio.create_task(background_data_warming_loop()))
    logger.info("Background data warming loop started (every 5s)")
    yield
    # Graceful shutdown: cancel all background tasks
    for t in _bg_tasks:
        t.cancel()
    await asyncio.gather(*_bg_tasks, return_exceptions=True)
    logger.info("Background tasks stopped")


app = FastAPI(
    title="TickerScope API",
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
        response.headers[k] = v
    # HSTS only over HTTPS (respect proxy's X-Forwarded-Proto for TLS termination).
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    if proto == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    return response


# ── CSRF double-submit cookie protection ─────────────────────────────────────
_CSRF_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
_CSRF_EXEMPT_PATHS = {"/health", "/api/docs", "/api/redoc", "/api/openapi.json",
    "/api/auth/login", "/api/auth/register", "/api/auth/register/verify", "/api/auth/refresh",
    "/api/auth/forgot-password", "/api/auth/reset-password", "/api/auth/otp/send", "/api/auth/otp/verify",
    "/auth/login", "/auth/register", "/auth/register/verify", "/auth/refresh",
    "/auth/forgot-password", "/auth/reset-password", "/auth/otp/send", "/auth/otp/verify",
    "/api/auth/google", "/auth/google",
    "/api/auth/google/callback", "/auth/google/callback",
    "/api/admin/models/retrain", "/admin/models/retrain",
    "/api/admin/models/retrain/all", "/admin/models/retrain/all"}

@app.middleware("http")
async def csrf_protection(request: Request, call_next):
    # Validate CSRF on state-changing requests (skip safe methods and exempt paths)
    if request.method not in _CSRF_SAFE_METHODS and request.url.path not in _CSRF_EXEMPT_PATHS:
        cookie_token = request.cookies.get("csrf_token", "")
        header_token = request.headers.get("x-csrf-token", "")
        # Skip if no cookie was set yet (first request) or token matches
        if cookie_token and cookie_token != header_token:
            return JSONResponse(status_code=403, content={"detail": "CSRF token mismatch"})
    response = await call_next(request)
    # Always set csrf_token cookie if not present
    if "csrf_token" not in request.cookies:
        token = secrets.token_hex(32)
        response.set_cookie(
            key="csrf_token", value=token,
            httponly=False, secure=True, samesite="none", max_age=86400, path="/",
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
    from app.services.market_data_service import get_warming_stats
    return {
        "status": "healthy",
        "service": "TickerScope API",
        "version": "1.0.0",
        "data_warming": get_warming_stats(),
    }


@app.get("/")
def root():
    return {"name": "TickerScope API", "docs": "/api/docs"}


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
app.include_router(backtest_ml.router, prefix='/api/backtest', tags=['ML Backtesting'])
app.include_router(paper_trading.router, prefix="/api/paper", tags=["Paper Trading"])
