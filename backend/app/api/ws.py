"""
WebSocket endpoint streaming live market quotes.

Client connects to `/ws/market?token=<jwt>&symbols=AAPL,MSFT&interval=5`.
Server pushes a JSON quote frame every `interval` seconds.

Security:
  • JWT is validated (when present) before the socket is accepted; an invalid
    token is rejected outright. Set WS_REQUIRE_AUTH=true to make auth mandatory
    (the bundled frontend ticker currently connects anonymously, so the default
    allows anonymous IP-keyed connections).
  • Connection caps: MAX_CONNECTIONS_PER_USER per identity, MAX_TOTAL total.
  • Rapid-reconnect throttle (exponential) to blunt reconnect storms / abuse.
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Set

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.config import settings
from app.security import decode_token
from app.services import market_data_service as mds

logger = logging.getLogger(__name__)
router = APIRouter()

DEFAULT_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "TSLA"]
MIN_INTERVAL = 3  # seconds (avoid hammering the data source)
MAX_INTERVAL = 60

MAX_CONNECTIONS_PER_USER = 50    # tighten to 1 for strict single-session policy
MAX_TOTAL_CONNECTIONS = 500

# WebSocket close codes.
_CLOSE_POLICY = 1008        # policy violation (auth required / invalid token)
_CLOSE_TRY_LATER = 1013     # try again later (capacity / throttled)


class ConnectionManager:
    def __init__(self):
        self.active: Set[WebSocket] = set()
        self.per_key: dict[str, int] = {}
        self.recent: dict[str, list] = {}   # key → recent connect timestamps

    def capacity_error(self, key: str) -> str | None:
        if len(self.active) >= MAX_TOTAL_CONNECTIONS:
            return "server at capacity"
        if self.per_key.get(key, 0) >= MAX_CONNECTIONS_PER_USER:
            return "too many connections for this user"
        return None

    def reconnect_backoff(self, key: str) -> float:
        """Exponential back-off (seconds) if a key reconnects too rapidly."""
        now = time.monotonic()
        hits = [t for t in self.recent.get(key, []) if now - t < 30]
        self.recent[key] = hits
        if len(hits) >= 5:                       # >4 connects in 30 s
            return float(min(2 ** (len(hits) - 4), 30))
        return 0.0

    async def connect(self, ws: WebSocket, key: str):
        await ws.accept()
        self.active.add(ws)
        self.per_key[key] = self.per_key.get(key, 0) + 1
        self.recent.setdefault(key, []).append(time.monotonic())
        logger.info("WS connected key=%s total=%d", key, len(self.active))

    def disconnect(self, ws: WebSocket, key: str):
        self.active.discard(ws)
        if key in self.per_key:
            self.per_key[key] = max(0, self.per_key[key] - 1)
        logger.info("WS disconnected key=%s total=%d", key, len(self.active))


manager = ConnectionManager()


def _resolve_identity(token: str | None, ws: WebSocket) -> tuple[str | None, bool]:
    """
    Return (key, ok). Validates the JWT when present. If a token is supplied but
    invalid → (None, False) so the caller rejects. Anonymous is allowed (keyed by
    client IP) unless WS_REQUIRE_AUTH is set.
    """
    if token:
        try:
            payload = decode_token(token)
            sub = payload.get("sub")
            if sub is not None:
                return f"user:{sub}", True
        except Exception:
            return None, False   # token provided but invalid → reject
    if getattr(settings, "WS_REQUIRE_AUTH", False):
        return None, False
    ip = ws.client.host if ws.client else "anon"
    return f"ip:{ip}", True


def _fetch_one_blocking(s: str) -> dict | None:
    try:
        q = mds.get_stock_quote(s)
        return {
            "symbol":         q["symbol"],
            "price":          q["price"],
            "change":         q["change"],
            "change_percent": q["change_percent"],
            "volume":         q["volume"],
        }
    except Exception as e:
        logger.warning(f"ws quote failed {s}: {e}")
        return None


async def _fetch_quotes_parallel(sym_list: list[str]) -> list[dict]:
    tasks = [asyncio.to_thread(_fetch_one_blocking, s) for s in sym_list]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [r for r in results if isinstance(r, dict)]


@router.websocket("/market")
async def market_socket(
    ws: WebSocket,
    token: str = Query(None),
    symbols: str = Query("AAPL,MSFT,GOOGL,TSLA"),
    interval: int = Query(5, ge=MIN_INTERVAL, le=MAX_INTERVAL),
):
    # ── 1. Authenticate (validate JWT when supplied) ─────────────────────────
    key, ok = _resolve_identity(token, ws)
    if not ok or key is None:
        await ws.close(code=_CLOSE_POLICY)
        return

    # ── 2. Reconnect throttle (exponential back-off) ─────────────────────────
    backoff = manager.reconnect_backoff(key)
    if backoff > 0:
        await ws.close(code=_CLOSE_TRY_LATER, reason=f"reconnecting too fast; retry in {backoff:.0f}s")
        return

    # ── 3. Connection caps (per-user + global) ───────────────────────────────
    cap_err = manager.capacity_error(key)
    if cap_err:
        await ws.close(code=_CLOSE_TRY_LATER, reason=cap_err)
        return

    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()] or DEFAULT_SYMBOLS

    await manager.connect(ws, key)
    try:
        quotes = await _fetch_quotes_parallel(sym_list)
        await ws.send_json({
            "type": "quote_update", "timestamp": _now_iso(),
            "quotes": quotes, "symbols": sym_list, "interval": interval,
        })
        while True:
            await asyncio.sleep(interval)
            quotes = await _fetch_quotes_parallel(sym_list)
            await ws.send_json({
                "type": "quote_update", "timestamp": _now_iso(), "quotes": quotes,
            })
    except WebSocketDisconnect:
        manager.disconnect(ws, key)
    except Exception as e:
        logger.exception(f"WS error: {e}")
        manager.disconnect(ws, key)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
