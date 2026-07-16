"""
User store. Mongo primary, SQLite fallback. A single set of CRUD functions
let `auth_new` / `routers` ignore the backend.

To enable Mongo: set `MONGODB_URI` in env (or `MONGO_URI=mongodb://localhost:27017`).
Without it the store uses the legacy SQLAlchemy `User` row from `app.database`.
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from typing import Optional

from app.db.mongo import col
from .model import UserRecord, from_mongo, from_sqlalchemy

logger = logging.getLogger(__name__)
_ALGO = None


def _mongo_enabled() -> bool:
    """
    Only enable Mongo if an env var is explicitly set.
    Without it, use SQLite — the default return from _build_uri()
    ("mongodb://localhost:27017") is NOT sufficient because most
    dev machines don't run a local Mongo instance.
    """
    import os
    if os.environ.get("MONGODB_URI") or os.environ.get("MONGO_URI"):
        try:
            from app.db.mongo import _build_uri
            return bool(_build_uri())
        except Exception:
            return False
    return False


async def create_user(*, email: str, password_hash: str,
                      username: Optional[str] = None,
                      first_name: Optional[str] = None,
                      last_name: Optional[str] = None,
                      is_admin: bool = False,
                      phone: Optional[str] = None,
                      country: Optional[str] = None) -> UserRecord:
    """Create a user in Mongo (preferred) or SQL (legacy fallback)."""
    if _mongo_enabled():
        doc = {
            "email":             email.lower().strip(),
            "username":          (username or "").lower().strip() or None,
            "first_name":        first_name,
            "last_name":         last_name,
            "hashed_password":   password_hash,
            "is_admin":          bool(is_admin),
            "is_active":         True,
            "is_email_verified": False,
            "phone":             phone,
            "country":           country,
            "subscription_tier": "free",
            "created_at":        datetime.now(timezone.utc),
            "last_login":        None,
            "email_verification_token":  None,
            "password_reset_token":       None,
            "password_reset_expires":    None,
        }
        result = col("users").insert_one(doc)
        doc["_id"] = result.inserted_id
        logger.info("Created user %s (admin=%s) in Mongo", email, is_admin)
        return from_mongo(doc)
    # Pure SQL fallback (using SQLAlchemy User row).
    from app.database import User
    user = User(
        username=username,
        email=email,
        hashed_password=password_hash,
        first_name=first_name,
        last_name=last_name,
        is_active=True,
        is_admin=is_admin,
        subscription_tier="free",
    )
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        db.add(user)
        db.commit()
        db.refresh(user)
        return from_sqlalchemy(user)
    finally:
        db.close()


def get_user_by_email(email: str) -> Optional[UserRecord]:
    if _mongo_enabled():
        doc = col("users").find_one({"email": email.lower().strip()})
        return from_mongo(doc) if doc else None
    from app.database import User, SessionLocal
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == email).first()
        return from_sqlalchemy(u) if u else None
    finally:
        db.close()


def get_user_by_username(username: str) -> Optional[UserRecord]:
    if _mongo_enabled():
        doc = col("users").find_one({"username": username.lower().strip()})
        return from_mongo(doc) if doc else None
    from app.database import User, SessionLocal
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.username == username).first()
        return from_sqlalchemy(u) if u else None
    finally:
        db.close()


def get_user_by_id(user_id: str) -> Optional[UserRecord]:
    if _mongo_enabled():
        doc = col("users").find_one({"id": user_id}) or col("users").find_one({"_id": user_id})
        if not doc:
            try:
                from bson import ObjectId
                doc = col("users").find_one({"_id": ObjectId(user_id)})
            except Exception:
                pass
        return from_mongo(doc) if doc else None
    from app.database import User, SessionLocal
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == int(user_id)).first()
        return from_sqlalchemy(u) if u else None
    finally:
        db.close()


def set_verification_token(email: str, token_hash: str, ttl_seconds: int = 24 * 3600) -> None:
    expires_at = datetime.now(timezone.utc).timestamp() + ttl_seconds
    if _mongo_enabled():
        col("users").update_one(
            {"email": email.lower().strip()},
            {"$set": {"email_verification_token": {"hash": token_hash, "expires_at": expires_at}}},
        )
        return
    # SQL: extend the User row with a column (lazy addition)
    from sqlalchemy import text
    from app.database import User, SessionLocal
    db = SessionLocal()
    try:
        row = db.query(User).filter(User.email == email).first()
        if row:
            row.email_verification_token = token_hash
            row.email_verification_expires = datetime.now(timezone.utc).timestamp() + ttl_seconds
            db.commit()
    finally:
        db.close()


def mark_email_verified(email: str) -> None:
    if _mongo_enabled():
        col("users").update_one(
            {"email": email.lower().strip()},
            {"$set": {"is_email_verified": True, "email_verification_token": None}},
        )
        return
    from app.database import User, SessionLocal
    db = SessionLocal()
    try:
        row = db.query(User).filter(User.email == email).first()
        if row:
            row.is_email_verified = True
            row.email_verification_token = None
            db.commit()
    finally:
        db.close()


def set_password_reset_token(email: str, token_hash: str, ttl_seconds: int = 3600) -> None:
    expires_at = datetime.now(timezone.utc).timestamp() + ttl_seconds
    if _mongo_enabled():
        col("users").update_one(
            {"email": email.lower().strip()},
            {"$set": {"password_reset_token": {"hash": token_hash, "expires_at": expires_at}}},
        )
        return
    from app.database import User, SessionLocal
    db = SessionLocal()
    try:
        row = db.query(User).filter(User.email == email).first()
        if row:
            row.password_reset_token = token_hash
            row.password_reset_expires = expires_at
            db.commit()
    finally:
        db.close()


def consume_password_reset_token(email: str, new_hash: str) -> bool:
    if _mongo_enabled():
        doc = col("users").find_one({"email": email.lower().strip()})
        if not doc or not doc.get("password_reset_token"):
            return False
        if doc["password_reset_token"].get("expires_at", 0) < datetime.now(timezone.utc).timestamp():
            return False
        col("users").update_one(
            {"email": email.lower().strip()},
            {"$set": {"hashed_password": new_hash, "password_reset_token": None}},
        )
        return True
    from app.database import User, SessionLocal
    db = SessionLocal()
    try:
        row = db.query(User).filter(User.email == email).first()
        if not row or not row.password_reset_token:
            return False
        if row.password_reset_expires < datetime.now(timezone.utc).timestamp():
            return False
        row.hashed_password = new_hash
        row.password_reset_token = None
        db.commit()
        return True
    finally:
        db.close()


def touch_last_login(user_id: str) -> None:
    now = datetime.now(timezone.utc)
    if _mongo_enabled():
        col("users").update_one({"id": user_id}, {"$set": {"last_login": now}})
        try:
            from bson import ObjectId
            col("users").update_one({"_id": ObjectId(user_id)}, {"$set": {"last_login": now}})
        except Exception:
            pass
        return
    from app.database import User, SessionLocal
    db = SessionLocal()
    try:
        row = db.query(User).filter(User.id == int(user_id)).first()
        if row:
            row.last_login = now
            db.commit()
    finally:
        db.close()


def generate_secure_token() -> str:
    """URL-safe random token (used for verification/reset; we hash before storing)."""
    return secrets.token_urlsafe(32)
