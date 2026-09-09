"""
Authentication API: register, login, OTP login, refresh, verify-email, forgot/reset password,
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
import random
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
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


# ── OTP Store (in-memory, thread-safe) ───────────────────────────────────────
_otp_store: dict[str, dict] = {}  # {email: {"otp": "123456", "expires_at": float, "attempts": int}}
_otp_lock = threading.Lock()
OTP_EXPIRY_SECONDS = 300   # 5 minutes
OTP_MAX_ATTEMPTS = 5       # max wrong attempts per OTP
OTP_RATE_LIMIT = 3         # max OTPs sent per email per 10 minutes
OTP_RATE_WINDOW = 600      # 10 minutes
_OTP_LAST_CLEANUP = [0.0]  # mutable ref for closure

def _cleanup_otp_store():
    """Remove expired OTP entries to prevent memory leak. Runs at most once per 60s."""
    now = time.time()
    if now - _OTP_LAST_CLEANUP[0] < 60:
        return
    _OTP_LAST_CLEANUP[0] = now
    expired = [k for k, v in _otp_store.items() if now > v.get("expires_at", 0)]
    for k in expired:
        _otp_store.pop(k, None)


def _generate_otp() -> str:
    """Generate a 6-digit OTP."""
    return f"{random.randint(0, 999999):06d}"


def _store_otp(email: str, otp: str) -> None:
    """Store OTP with expiry. Rate-limited."""
    _cleanup_otp_store()
    now = time.time()
    with _otp_lock:
        entry = _otp_store.get(email)
        # Rate limit: check how many OTPs sent in window
        if entry and "send_times" in entry:
            recent = [t for t in entry["send_times"] if now - t < OTP_RATE_WINDOW]
            if len(recent) >= OTP_RATE_LIMIT:
                raise HTTPException(429, "Too many OTP requests. Wait a few minutes.")
            entry["send_times"] = recent + [now]
        else:
            _otp_store[email] = {"send_times": [now]}

        _otp_store[email]["otp"] = otp
        _otp_store[email]["expires_at"] = now + OTP_EXPIRY_SECONDS
        _otp_store[email]["attempts"] = 0


def _verify_otp(email: str, otp: str) -> bool:
    """Verify OTP. Returns True if valid."""
    with _otp_lock:
        entry = _otp_store.get(email)
        if not entry:
            return False
        if time.time() > entry.get("expires_at", 0):
            _otp_store.pop(email, None)
            return False
        if entry.get("attempts", 0) >= OTP_MAX_ATTEMPTS:
            _otp_store.pop(email, None)
            return False
        entry["attempts"] = entry.get("attempts", 0) + 1
        return entry.get("otp") == otp


def _consume_otp(email: str) -> None:
    """Remove OTP after successful verification."""
    with _otp_lock:
        _otp_store.pop(email, None)


def _otp_email_html(otp: str) -> str:
    """Render OTP email body."""
    return (
        f"Your TickerScope login code is:<br><br>"
        f"<div style='font-size:32px;font-weight:700;letter-spacing:8px;color:#2563eb;"
        f"background:#1e293b;padding:16px 24px;border-radius:8px;text-align:center;"
        f"font-family:monospace'>{otp}</div><br>"
        f"This code expires in 5 minutes. Do not share it with anyone."
    )


def _send_otp_email(email: str, otp: str) -> None:
    """Send OTP via email (background task)."""
    html = _otp_email_html(otp)
    result = send_email(email, "Your TickerScope Login Code", html)
    if result.ok:
        logger.info("OTP email sent to %s via %s (id=%s)", email, result.provider, result.message_id)
    else:
        logger.error("OTP email FAILED for %s: %s", email, result.error)


def _email_provider_configured() -> bool:
    """Check if any email provider is set up."""
    return bool(os.environ.get("RESEND_API_KEY")) or bool(os.environ.get("SMTP_HOST"))


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

    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain an uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain a lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain a digit")
        return v


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


def _issue_tokens(user: UserRecord, request: Optional[Request], response: Optional[Response] = None, verify: bool = True) -> TokenOut:
    fp = fingerprint_from_request(request) or None
    access  = create_access_token(user.id, fingerprint=fp)
    refresh = create_refresh_token(user.id)
    user_store.touch_last_login(user.id)

    # Set httpOnly cookies for tokens (XSS-safe: JS cannot read these)
    if response:
        is_prod = settings.is_production()
        response.set_cookie(
            key="tickerscope_access",
            value=access,
            httponly=True,
            secure=is_prod,
            samesite="none",
            max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            path="/",
        )
        response.set_cookie(
            key="tickerscope_refresh",
            value=refresh,
            httponly=True,
            secure=is_prod,
            samesite="none",
            max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
            path="/api/auth/refresh",
        )

    return TokenOut(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserOut.from_record(user).model_dump(),
    )


# ============ Routes ============
@router.post("/register", status_code=201)
@limiter.limit("5/minute")
async def register(req: RegisterIn, request: Request, background: BackgroundTasks):
    """Register new account — sends OTP to email. Account stays inactive until OTP verified."""
    email_norm = req.email.lower().strip()
    username   = (req.username or email_norm.split("@")[0]).lower().strip()

    # Password complexity validation
    pwd = req.password
    if len(pwd) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if not re.search(r"[A-Z]", pwd):
        raise HTTPException(400, "Password must contain an uppercase letter")
    if not re.search(r"[a-z]", pwd):
        raise HTTPException(400, "Password must contain a lowercase letter")
    if not re.search(r"\d", pwd):
        raise HTTPException(400, "Password must contain a digit")

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
    logger.info("Registered user %s admin=%s (awaiting OTP verification)", email_norm, is_admin)

    # Always send OTP for email verification
    otp = _generate_otp()
    _store_otp(email_norm, otp)
    background.add_task(_send_otp_email, email_norm, otp)

    resp = {"ok": True, "email": email_norm, "message": "OTP sent. Verify to activate account."}
    return resp


class RegisterVerifyIn(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6)


@router.post("/register/verify", response_model=TokenOut)
@limiter.limit("10/minute")
async def register_verify(req: RegisterVerifyIn, request: Request, response: Response):
    """Verify registration OTP — activates account and returns tokens."""
    email_norm = req.email.lower().strip()

    if not _verify_otp(email_norm, req.otp):
        raise HTTPException(401, "Invalid or expired OTP.")

    _consume_otp(email_norm)

    user = user_store.get_user_by_email(email_norm)
    if not user:
        raise HTTPException(400, "Account not found.")

    # Mark email as verified
    user_store.mark_email_verified(email_norm)

    logger.info("Email verified for %s", email_norm)
    return _issue_tokens(user, request, response)


async def _make_user_if_enabled():
    """Tiny helper to keep register() async (so we can support async Mongo)."""
    return None


@router.post("/login", response_model=TokenOut)
@limiter.limit("5/minute")
async def login(req: LoginIn, request: Request, response: Response):
    user = user_store.get_user_by_email(req.email.lower().strip())
    if not user or not user.hashed_password or not pwd_context.verify(req.password[:72], user.hashed_password):
        raise HTTPException(401, "Invalid email or password.")
    if not user.is_active:
        raise HTTPException(403, "This account has been disabled. Please contact support.")
    if not getattr(user, "is_email_verified", False):
        raise HTTPException(403, "Email not verified. Please verify your email first.")
    return _issue_tokens(user, request, response)


@router.post("/login/form", response_model=TokenOut)
@limiter.limit("5/minute")
async def login_form(request: Request, response: Response, form: OAuth2PasswordRequestForm = Depends()):
    user = user_store.get_user_by_email(form.username.lower().strip())
    if (not user) and _USERNAME_RE.match(form.username):
        user = user_store.get_user_by_username(form.username.strip())
    if not user or not user.hashed_password or not pwd_context.verify(form.password[:72], user.hashed_password):
        raise HTTPException(401, "Invalid credentials.")
    if not user.is_active:
        raise HTTPException(403, "This account has been disabled.")
    if not getattr(user, "is_email_verified", False):
        raise HTTPException(403, "Email not verified.")
    return _issue_tokens(user, request, response)


# ============ OTP Login ============
class OtpSendIn(BaseModel):
    email: EmailStr


class OtpVerifyIn(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6)


@router.post("/otp/send")
@limiter.limit("5/minute")
async def otp_send(request: Request, req: OtpSendIn, background: BackgroundTasks):
    """Send OTP to existing user's email for login."""
    email_norm = req.email.lower().strip()

    user = user_store.get_user_by_email(email_norm)
    if not user:
        raise HTTPException(404, "No account found. Please register first.")

    if not user.is_active:
        raise HTTPException(403, "Account disabled.")

    if not getattr(user, "is_email_verified", False):
        raise HTTPException(403, "Email not verified. Please register and verify first.")

    otp = _generate_otp()
    try:
        _store_otp(email_norm, otp)
    except HTTPException:
        raise

    background.add_task(_send_otp_email, email_norm, otp)

    logger.info("OTP sent to %s", email_norm)
    resp = {"ok": True, "email": email_norm}
    return resp


@router.post("/otp/verify", response_model=TokenOut)
@limiter.limit("10/minute")
async def otp_verify(request: Request, req: OtpVerifyIn, response: Response):
    """Verify OTP and log in existing user."""
    email_norm = req.email.lower().strip()

    if not _verify_otp(email_norm, req.otp):
        raise HTTPException(401, "Invalid or expired OTP.")

    _consume_otp(email_norm)

    user = user_store.get_user_by_email(email_norm)
    if not user:
        raise HTTPException(401, "Account not found.")

    if not user.is_active:
        raise HTTPException(403, "Account disabled.")

    if not getattr(user, "is_email_verified", False):
        raise HTTPException(403, "Email not verified.")

    return _issue_tokens(user, request, response)


@router.post("/refresh", response_model=TokenOut)
def refresh(request: Request, response: Response, token: Optional[str] = None):
    # Accept token from body param or httpOnly cookie
    if not token:
        token = request.cookies.get("tickerscope_refresh")
    if not token:
        raise HTTPException(401, "Missing refresh token.")
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as e:
        raise HTTPException(401, "Invalid refresh token.")
    if payload.get("type") != "refresh":
        raise HTTPException(401, "Wrong token type.")
    user = user_store.get_user_by_id(str(payload.get("sub")))
    if not user or not user.is_active:
        raise HTTPException(401, "Account not found or inactive.")
    new_access = create_access_token(user.id)
    new_refresh = create_refresh_token(user.id)

    # Update httpOnly cookies
    is_prod = settings.is_production()
    response.set_cookie(
        key="tickerscope_access", value=new_access, httponly=True, secure=is_prod,
        samesite="none", max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, path="/",
    )
    response.set_cookie(
        key="tickerscope_refresh", value=new_refresh, httponly=True, secure=is_prod,
        samesite="none", max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400, path="/api/auth/refresh",
    )

    return TokenOut(
        access_token=new_access,
        refresh_token=new_refresh,
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
    pwd = req.new_password
    if len(pwd) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if not re.search(r"[A-Z]", pwd):
        raise HTTPException(400, "Password must contain an uppercase letter")
    if not re.search(r"[a-z]", pwd):
        raise HTTPException(400, "Password must contain a lowercase letter")
    if not re.search(r"\d", pwd):
        raise HTTPException(400, "Password must contain a digit")
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
    """Required auth. Reads JWT from cookie or Authorization header."""
    # Try Authorization header first, then httpOnly cookie
    token = None
    creds = request.headers.get("authorization", "")
    if creds.lower().startswith("bearer "):
        token = creds.split(" ", 1)[1]
    if not token:
        token = request.cookies.get("tickerscope_access")
    if not token:
        raise HTTPException(401, "Missing authentication token")
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
async def logout(response: Response):
    # Clear httpOnly cookies
    response.delete_cookie("tickerscope_access", path="/")
    response.delete_cookie("tickerscope_refresh", path="/api/auth/refresh")
    return {"ok": True}


# ============ Google OAuth ============
class GoogleAuthIn(BaseModel):
    credential: str  # Google ID token


@router.post("/google", response_model=TokenOut)
@limiter.limit("10/minute")
async def google_login(req: GoogleAuthIn, request: Request, response: Response):
    """Login or register via Google Identity Services ID token."""
    import httpx

    # Verify the ID token with Google
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": req.credential},
            )
            if resp.status_code != 200:
                raise HTTPException(401, "Invalid Google token.")
            google_data = resp.json()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Google token verification failed: %s", exc)
        raise HTTPException(502, "Failed to verify Google token.")

    # Validate audience
    expected_aud = settings.GOOGLE_CLIENT_ID
    if expected_aud and google_data.get("aud") != expected_aud:
        raise HTTPException(401, "Google token audience mismatch.")

    email = google_data.get("email", "").lower().strip()
    if not email:
        raise HTTPException(400, "Google account has no email.")

    # Check if user exists
    user = user_store.get_user_by_email(email)

    if not user:
        # Auto-register: create new account
        first_name = google_data.get("given_name", "")
        last_name = google_data.get("family_name", "")
        username = email.split("@")[0]
        # Ensure username is unique
        base_username = username
        counter = 1
        while user_store.get_user_by_username(username):
            username = f"{base_username}{counter}"
            counter += 1

        user = await user_store.create_user(
            email=email,
            password_hash="",  # No password for Google accounts
            username=username,
            first_name=first_name,
            last_name=last_name,
            is_admin=False,
        )
        # Mark email as verified (Google already verified it)
        user_store.mark_email_verified(email)
        logger.info("Auto-registered Google user: %s", email)

    return _issue_tokens(user, request, response)


@router.get("/google/callback")
async def google_callback(code: str = "", state: str = "", request: Request = None):
    """OAuth callback — Google redirects here with auth code. Exchange for tokens, redirect to dashboard."""
    from fastapi.responses import RedirectResponse
    import httpx

    frontend_base = state or "https://tickerscope.xyz"

    if not code:
        return RedirectResponse(url=f"{frontend_base}/app.html?error=no_code")

    # Exchange auth code for tokens
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            token_resp = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET", ""),
                    "grant_type": "authorization_code",
                    "redirect_uri": "https://api.tickerscope.xyz/api/auth/google/callback",
                },
            )
            if token_resp.status_code != 200:
                logger.error("Google token exchange failed: %s %s", token_resp.status_code, token_resp.text[:200])
                return RedirectResponse(url=f"{frontend_base}/app.html?error=token_exchange_failed")
            tokens = token_resp.json()
    except Exception as exc:
        logger.error("Google callback error: %s", exc)
        return RedirectResponse(url=f"{frontend_base}/app.html?error=callback_exception")

    id_token = tokens.get("id_token")
    if not id_token:
        return RedirectResponse(url=f"{frontend_base}/app.html?error=no_id_token")

    # Verify the ID token
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            verify_resp = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": id_token},
            )
            if verify_resp.status_code != 200:
                return RedirectResponse(url=f"{frontend_base}/app.html?error=invalid_id_token")
            google_data = verify_resp.json()
    except Exception as exc:
        logger.error("Google ID token verification failed: %s", exc)
        return RedirectResponse(url=f"{frontend_base}/app.html?error=verify_failed")

    email = google_data.get("email", "").lower().strip()
    if not email:
        return RedirectResponse(url=f"{frontend_base}/app.html?error=no_email")

    # Find or create user
    user = user_store.get_user_by_email(email)

    if not user:
        first_name = google_data.get("given_name", "")
        last_name = google_data.get("family_name", "")
        username = email.split("@")[0]
        base_username = username
        counter = 1
        while user_store.get_user_by_username(username):
            username = f"{base_username}{counter}"
            counter += 1

        user = await user_store.create_user(
            email=email,
            password_hash="",
            username=username,
            first_name=first_name,
            last_name=last_name,
            is_admin=False,
        )
        user_store.mark_email_verified(email)
        logger.info("Auto-registered Google user via callback: %s", email)

    redirect_resp = RedirectResponse(url=f"{frontend_base}/app.html", status_code=302)
    _issue_tokens(user, request, redirect_resp)
    return redirect_resp
