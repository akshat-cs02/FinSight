"""
Authentication API: register, login, refresh, verify-email, forgot/reset password,
logout, me.

User records live in MongoDB when MONGODB_URI is set, otherwise in SQLite (the
existing `app.database.User` rows) - so the platform keeps working for local dev
without a Mongo instance.

Email verification is **off in dev** by default (FINDSIGHT_VERIFY_EMAIL=false).
When enabled, the `email_verifications` collection holds expired tokens via TTL
index, and Resend (https://resend.com — 100 emails/day free) sends the
verification + reset links. SMTP and an offline `data/outbox/` fallback cover
local testing.
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field

from app.config import settings
from app.rate_limit import limiter
from app.security import (
    create_access_token, create_refresh_token, decode_token,
    fingerprint_from_request,
)
from app.services.comm.email_service import render_template, send_email
from app.users import store as user_store
from app.users.model import UserRecord

logger = logging.getLogger(__name__)
router = APIRouter()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto",
                           bcrypt__rounds=settings.BCRYPT_LOG_ROUNDS)


def _hash_token(raw: str) -> str:
    """We store SHA-256(token) in DB so even with read access the raw token
    cannot be replayed."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# ============ Schemas ============
_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{3,32}$")


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    username: Optional[str] = Field(default=None, max_length=32)
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    admin_key: Optional[str] = None


class LoginIn(BaseModel):
    email: str
    password: str


class VerifyIn(BaseModel):
    token: str


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=72)


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict


class UserOut(BaseModel):
    id: str
    username: Optional[str]
    email: EmailStr
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_admin: bool
    is_active: bool
    is_email_verified: bool
    subscription_tier: str
    created_at: str

    @classmethod
    def from_record(cls, u: UserRecord) -> "UserOut":
        return cls(
            id=u.id, username=u.username, email=u.email, first_name=u.first_name,
            last_name=u.last_name, is_admin=u.is_admin, is_active=u.is_active,
            is_email_verified=getattr(u, "is_email_verified", False),
            subscription_tier=u.subscription_tier or "free",
            created_at=u.created_at.isoformat() if u.created_at else "",
        )


def _pwd_hash(plain: str) -> str:
    return pwd_context.hash(plain[:72])


def _lookup_by_token_field(token: str, field: str) -> Optional[UserRecord]:
    """Lookup a user via an emailed token field (verify or reset)."""
    h = _hash_token(token)
    if user_store._mongo_enabled():
        from app.db.mongo import col
        for f in (field,):
            doc = col("users").find_one({f + ".hash": h})
            if doc:
                sub = doc.get(f) or {}
                if sub.get("expires_at", 0) > datetime.now(timezone.utc).timestamp():
                    return user_store.from_mongo(doc)
        return None
    # SQLite fallback
    from app.database import User, SessionLocal
    db = SessionLocal()
    try:
        if field == "email_verification":
            row = db.query(User).filter(User.email_verification_token == h).first()
        else:
            row = db.query(User).filter(User.password_reset_token == h).first()
        return user_store.from_sqlalchemy(row) if row else None
    finally:
        db.close()


# ============ Helpers ============
def _send_verify_email_bg(email: str, raw_token: str, first_name: Optional[str]):
    base = os.environ.get("FINSIGHT_PUBLIC_URL", "http://localhost:3000")
    url = f"{base}/auth/verify-email?token={raw_token}"
    subject, body, cta = render_template("verify_email", {
        "first_name": first_name or "trader", "verify_url": url,
    })
    send_email(email, subject, body, cta)


def _send_reset_email_bg(email: str, raw_token: str):
    base = os.environ.get("FINSIGHT_PUBLIC_URL", "http://localhost:3000")
    url = f"{base}/auth/reset-password?token={raw_token}"
    subject, body, cta = render_template("password_reset", {"reset_url": url})
    send_email(email, subject, body, cta)


def _send_welcome_email_bg(email: str, first_name: Optional[str]):
    subject, body, cta = render_template("welcome", {"first_name": first_name or "trader"})
    send_email(email, subject, body, cta)


def _issue_tokens(user: UserRecord, request: Optional[Request], verify: bool = True) -> TokenOut:
    fp = fingerprint_from_request(request) or None
    access  = create_access_token(user.id, fingerprint=fp)
    refresh = create_refresh_token(user.id)
    user_store.touch_last_login(user.id)
    return TokenOut(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserOut.from_record(user).model_dump(),
    )


# ============ Routes ============
@router.post("/register", response_model=TokenOut, status_code=201)
@limiter.limit("5/minute")
async def register(req: RegisterIn, request: Request, background: BackgroundTasks):
    email_norm = req.email.lower().strip()
    username   = (req.username or email_norm.split("@")[0]).lower().strip()

    # Validation
    if not _USERNAME_RE.match(username):
        raise HTTPException(400, "Username must be 3–32 chars [a-z0-9_.-]")
    if user_store.get_user_by_email(email_norm):
        raise HTTPException(400, "An account with this email already exists.")
    if user_store.get_user_by_username(username):
        raise HTTPException(400, "That username is already taken.")

    is_admin = bool(req.admin_key and req.admin_key == settings.ADMIN_API_KEY)
    user = await user_store.create_user(
        email=email_norm, password_hash=_pwd_hash(req.password),
        username=username, first_name=req.first_name, last_name=req.last_name,
        is_admin=is_admin,
    )
    logger.info("Registered user %s admin=%s", email_norm, is_admin)

    # Email verification (if enabled)
    verify_enabled = os.environ.get("FINSIGHT_VERIFY_EMAIL", "0") == "1"
    if verify_enabled:
        token = user_store.generate_secure_token()
        h = _hash_token(token)
        user_store.set_verification_token(email_norm, h, ttl_seconds=24 * 3600)
        background.add_task(_send_verify_email_bg, email_norm, token, req.first_name)
        # In verify flow the tokens are issued AFTER the user clicks the email link
        return TokenOut(access_token="", refresh_token="", expires_in=0,
                        user=UserOut.from_record(user).model_dump())

    background.add_task(_send_welcome_email_bg, email_norm, req.first_name)
    return _issue_tokens(user, request)


async def _make_user_if_enabled():
    """Tiny helper to keep register() async (so we can support async Mongo)."""
    return None


@router.post("/login", response_model=TokenOut)
@limiter.limit("5/minute")
async def login(req: LoginIn, request: Request):
    user = user_store.get_user_by_email(req.email.lower().strip())
    if not user or not pwd_context.verify(req.password[:72], user.hashed_password):
        raise HTTPException(401, "Invalid email or password.")
    if not user.is_active:
        raise HTTPException(403, "This account has been disabled. Please contact support.")
    return _issue_tokens(user, request)


@router.post("/login/form", response_model=TokenOut)
@limiter.limit("5/minute")
async def login_form(request: Request, form: OAuth2PasswordRequestForm = Depends()):
    user = user_store.get_user_by_email(form.username.lower().strip())
    if (not user) and _USERNAME_RE.match(form.username):
        user = user_store.get_user_by_username(form.username.strip())
    if not user or not pwd_context.verify(form.password[:72], user.hashed_password):
        raise HTTPException(401, "Invalid credentials.")
    return _issue_tokens(user, request)


@router.post("/refresh", response_model=TokenOut)
def refresh(token: str):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as e:
        raise HTTPException(401, "Invalid refresh token.")
    if payload.get("type") != "refresh":
        raise HTTPException(401, "Wrong token type.")
    user = user_store.get_user_by_id(str(payload.get("sub")))
    if not user or not user.is_active:
        raise HTTPException(401, "Account not found or inactive.")
    return TokenOut(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserOut.from_record(user).model_dump(),
    )


# ----------- Email verification -----------
@router.get("/verify-email")
async def verify_email(token: str, background: BackgroundTasks):
    user = _lookup_by_token_field(token, "email_verification")
    if not user:
        raise HTTPException(400, "Invalid or expired verification token.")
    if not user.is_email_verified:
        user_store.mark_email_verified(user.email)
    background.add_task(_send_welcome_email_bg, user.email, user.first_name)
    return {
        "ok": True, "email": user.email,
        "user": UserOut.from_record(user).model_dump(),
    }


@router.post("/verify-email/resend")
@limiter.limit("3/minute")
async def resend_verification(request: Request, email: EmailStr, background: BackgroundTasks):
    user = user_store.get_user_by_email(email)
    if not user:
        return {"ok": True}  # don't leak which emails exist
    if getattr(user, "is_email_verified", False):
        return {"ok": True, "already_verified": True}
    token = user_store.generate_secure_token()
    h = _hash_token(token)
    user_store.set_verification_token(email, h)
    background.add_task(_send_verify_email_bg, email, token, user.first_name)
    return {"ok": True}


# ----------- Password reset -----------
@router.post("/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(request: Request, req: ForgotIn, background: BackgroundTasks):
    """Always returns 200 — never disclose whether an email is registered."""
    user = user_store.get_user_by_email(req.email)
    if user:
        token = user_store.generate_secure_token()
        h = _hash_token(token)
        user_store.set_password_reset_token(req.email, h, ttl_seconds=3600)
        background.add_task(_send_reset_email_bg, req.email, token)
    return {"ok": True}


@router.post("/reset-password")
async def reset_password(req: ResetIn):
    user = _lookup_by_token_field(req.token, "password_reset")
    if not user:
        raise HTTPException(400, "Invalid or expired reset token.")
    ok = user_store.consume_password_reset_token(user.email, _pwd_hash(req.new_password))
    if not ok:
        raise HTTPException(400, "Token expired, please request a new one.")
    return {"ok": True, "email": user.email}


# ----------- Current user -----------
@router.get("/me")
async def me(request: Request):
    """Required auth. Reads JWT, returns the active user record."""
    creds = request.headers.get("authorization", "")
    if not creds.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = creds.split(" ", 1)[1]
    payload = decode_token(token)
    user_id = payload.get("sub")
    user = user_store.get_user_by_id(str(user_id))
    if not user or not user.is_active:
        raise HTTPException(401, "Account not found or inactive.")
    if (fp := payload.get("fp")) and (cur := fingerprint_from_request(request)):
        if cur != fp and getattr(settings, "ENFORCE_TOKEN_FINGERPRINT", False):
            raise HTTPException(401, "Token bound to a different device.")
    return UserOut.from_record(user).model_dump()


@router.post("/logout")
async def logout():
    # Stateless JWT — client discards token. (Future: server-side token blacklist.)
    return {"ok": True}
