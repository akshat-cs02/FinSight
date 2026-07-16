"""
Shared slowapi rate limiter.

Lives in its own module so routers can import `limiter` without importing
`main` (which would create a circular import). Keyed by client IP by default;
authenticated routes can pass a per-user key via the decorator.
"""
import threading
import time

from fastapi import HTTPException
from slowapi import Limiter
from slowapi.util import get_remote_address

# ── Simple in-process sliding-window limiter (for dependency-based limits) ────
_windows: dict[str, list] = {}
_wlock = threading.Lock()


def sliding_window_check(key: str, limit: int, per_seconds: int = 60) -> None:
    """Raise HTTP 429 if `key` exceeds `limit` hits within `per_seconds`."""
    now = time.time()
    with _wlock:
        hits = [t for t in _windows.get(key, []) if now - t < per_seconds]
        if len(hits) >= limit:
            raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again shortly.")
        hits.append(now)
        _windows[key] = hits


def _user_or_ip(request):
    """Rate-limit key: authenticated user id when available, else client IP."""
    user = getattr(request.state, "user_id", None)
    if user is not None:
        return f"user:{user}"
    auth = request.headers.get("authorization", "")
    if auth:
        return f"tok:{auth[-24:]}"   # stable-ish per-token key without decoding
    return get_remote_address(request)


limiter = Limiter(key_func=get_remote_address, default_limits=[])
