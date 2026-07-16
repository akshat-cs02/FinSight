"""
MongoDB connection layer (pymongo + motor).

Acts as a drop-in for the existing SQLAlchemy session — any code that touches
user data (auth, watchlist, portfolio, alerts, paper-trades) reads/writes via
the `db` helper here.

Why MongoDB for FinSight
------------------------
* Document model maps cleanly to user profile, watchlist items, paper-trades
  and signal alerts — no rigid schema migrations to run on every release.
* Atlas M0 free forever tier = 512 MB, more than enough for 1k users (4–7 KB
  per account plus ~3 KB per watchlist/portfolio row).
* TTL indexes on `email_verifications`, `sms_otps`, `signal_alerts` keep the
  collection tidy without extra cron work.
* The trading-core (signals, prediction, news) keeps yfinance as the source of
  truth — Mongo is for user-scoped data only, not market data.
"""
from __future__ import annotations

import logging
import os
import threading
from typing import Optional

logger = logging.getLogger(__name__)

_client: Optional["MongoClient"] = None  # type: ignore[valid-type]
_client_lock = threading.Lock()

# Lazy pymongo import — the module must import without pymongo installed so
# the rest of the app (SQLite fallback) works. Functions that need Mongo call
# _get_pymongo() which raises a clear ImportError if the package is absent.
_pymongo_available: bool | None = None


def _get_pymongo():
    """Lazy-import pymongo. Raise ImportError with a helpful message if missing."""
    global _pymongo_available
    try:
        import pymongo
        _pymongo_available = True
        return pymongo
    except ImportError:
        _pymongo_available = False
        raise ImportError(
            "pymongo is not installed. Install it with: pip install pymongo motor\n"
            "Or set DATABASE_URL to a SQLite/postgres URL to skip MongoDB."
        )


def _build_uri() -> Optional[str]:
    """Compose the MongoDB URI from settings, supporting either a full URI
    or the user/password/host parts liberally used in Atlas connect strings."""
    s = getattr(os.environ, "MONGODB_URI", "") or ""
    if s:
        return s
    # Fallback for local dev: spin up a docker / native mongo on 27017.
    return os.environ.get("MONGO_URI", "mongodb://localhost:27017")


def get_client():
    """Return the singleton Mongo client (thread-safe)."""
    global _client
    if _client is not None:
        return _client
    with _client_lock:
        if _client is not None:
            return _client
        uri = _build_uri()
        if not uri:
            raise RuntimeError("MONGODB_URI / MONGO_URI not set")
        pm = _get_pymongo()
        # serverSelectionTimeoutMS=5 keeps startup fast even if Atlas is offline.
        _client = pm.MongoClient(uri, serverSelectionTimeoutMS=5000, appname="finsight")
        # ping to surface credential / network issues early (logged, not fatal)
        try:
            _client.admin.command("ping")
            logger.info("MongoDB connection OK")
        except Exception as exc:
            logger.warning("MongoDB ping failed at startup (will retry on first request): %s", exc)
        return _client


def get_db():
    """Return the primary FinSight database handle."""
    name = os.environ.get("MONGO_DB_NAME", "finsight")
    return get_client()[name]


def col(name: str):
    return get_db()[name]


# ─── Index bootstrap (idempotent) ────────────────────────────────────────────
def ensure_indexes() -> None:
    """Create indexes the first time the app boots. Safe to call repeatedly."""
    if os.environ.get("MONGO_SKIP_INDEX_BOOTSTRAP", "0") == "1":
        return
    try:
        db = get_db()
        # users — email is unique for login; mobile is sparse
        db["users"].create_index("email", unique=True)
        db["users"].create_index("username", unique=True, sparse=True)
        db["users"].create_index("mobile_e164", unique=True, sparse=True)
        db["users"].create_index("email_verification_token")
        db["users"].create_index("password_reset_token")
        # otps / verifications
        db["email_verifications"].create_index("expires_at", expireAfterSeconds=0)
        db["email_verifications"].create_index("token_hash")
        db["sms_otps"].create_index("expires_at", expireAfterSeconds=0)
        db["sms_otps"].create_index([("mobile_e164", 1), ("purpose", 1)])
        # watchlist, portfolio, alerts
        db["watchlists"].create_index([("user_id", 1), ("symbol", 1)], unique=True)
        db["watchlists"].create_index("user_id")
        db["portfolios"].create_index("user_id")
        db["signal_alerts"].create_index([("user_id", 1), ("created_at", -1)])
        db["signal_alerts"].create_index("expires_at", expireAfterSeconds=0)
        db["paper_trades"].create_index([("user_id", 1), ("status", 1)])
        db["paper_trades"].create_index("created_at")
        logger.info("Mongo indexes ensured")
    except Exception as exc:
        logger.warning("ensure_indexes skipped: %s", exc)


def shutdown() -> None:
    global _client
    if _client is not None:
        try:
            _client.close()
        except Exception:
            pass
        _client = None
