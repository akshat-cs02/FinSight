"""
JWT authentication & user dependencies.

The user-record source is in `app.users.store`. It returns Mongo-backed
`UserRecord` when MONGO_URI is set, falling back to the legacy SQLAlchemy
`User` row otherwise. The shape is identical from this layer down.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.users import store as user_store
from app.users.model import UserRecord

logger = logging.getLogger(__name__)


# ============ token theft detection: device/network fingerprint ============
def token_fingerprint(user_agent: str | None, ip: str | None) -> str:
    """Short stable hash of (User-Agent + client IP) bound into the token."""
    raw = f"{user_agent or ''}|{ip or ''}".encode("utf-8", "ignore")
    return hashlib.sha256(raw).hexdigest()[:16]


def fingerprint_from_request(request: Optional[Request]) -> str:
    if request is None:
        return ""
    ua = request.headers.get("user-agent", "")
    ip = request.client.host if request.client else ""
    return token_fingerprint(ua, ip)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto",
                           bcrypt__rounds=settings.BCRYPT_LOG_ROUNDS)

"""`auto_error=False` lets us return Optional[User] for endpoints that
can run with or without auth (e.g. demo mode)."""
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)
oauth2_scheme_required = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# ============ password hashing ============
def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ============ JWT ============
def create_access_token(sub: int, expires_delta: Optional[timedelta] = None,
                        fingerprint: Optional[str] = None) -> str:
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    payload = {"sub": str(sub), "exp": expire, "type": "access"}
    if fingerprint:
        payload["fp"] = fingerprint          # bind token to the issuing device/network
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(sub: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {"sub": str(sub), "exp": expire, "type": "refresh"}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as e:
        logger.warning(f"JWT decode failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ============ user resolution ============
def _user_from_token(token: str, db: Session, request: Optional[Request] = None) -> UserRecord:
    payload = decode_token(token)
    sub = payload.get("sub")
    if sub is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    try:
        user_id = str(sub)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token subject")

    # Token-theft detection: if the token carries a device/network fingerprint,
    # compare it to the current request. Mismatch is logged; enforcement (hard
    # 401) is opt-in via ENFORCE_TOKEN_FINGERPRINT so legitimate IP/UA changes
    # (mobile networks, VPNs) don't lock users out unless you want strict mode.
    token_fp = payload.get("fp")
    if token_fp and request is not None:
        current_fp = fingerprint_from_request(request)
        if current_fp and current_fp != token_fp:
            logger.warning("Token fingerprint mismatch for user %s (possible token theft)", user_id)
            if getattr(settings, "ENFORCE_TOKEN_FINGERPRINT", False):
                raise HTTPException(status_code=401, detail="Token bound to a different device")

    user = user_store.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account disabled")
    return user


def _guest_user() -> UserRecord:
    """Anonymous demo visitor. Everyone shares the same id=0 namespace so
    watchlist/portfolio calls work without login — production turn-key swap
    is `REQUIRE_AUTH=1` plus real JWTs."""
    return UserRecord(
        id="0",
        email="guest@finsight.app",
        username="guest",
        first_name="Demo",
        subscription_tier="anonymous",
        is_admin=False,
        is_active=True,
    )


def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme_required),
    db: Session = Depends(get_db),
) -> UserRecord:
    """Auth is OPT-IN via REQUIRE_AUTH. With it off (demo mode) we let any
    visitor in as a guest so the dashboard, watchlist (per-guest scope) and
    portfolio all work without a login flow."""
    import os
    if os.environ.get("REQUIRE_AUTH", "0") == "1":
        if not token:
            raise HTTPException(status_code=401, detail="Missing bearer token")
        return _user_from_token(token, db, request)
    # Demo mode: accept valid token if present, otherwise return guest.
    if token:
        try:
            return _user_from_token(token, db, request)
        except HTTPException:
            pass
    return _guest_user()


def get_optional_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Optional[UserRecord]:
    """OPTIONAL auth. Returns None if no token. Same demo-mode policy."""
    import os
    if os.environ.get("REQUIRE_AUTH", "0") == "1":
        if not token:
            return None
        try:
            return _user_from_token(token, db, request)
        except HTTPException:
            return None
    if not token:
        return _guest_user()
    try:
        return _user_from_token(token, db, request)
    except HTTPException:
        return _guest_user()


def get_current_admin(user: UserRecord = Depends(get_current_user)) -> UserRecord:
    import os
    if os.environ.get("REQUIRE_AUTH", "0") == "1" and not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
