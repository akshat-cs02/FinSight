"""
Guest-visitor tracking — ping / register anonymous visitors so we know
how many people use the app even without signing up.

Endpoints:
  POST /api/visitor/ping   — register or update a visitor (called on every page load)
  POST /api/visitor/claim  — claim a guest account to a registered user (optional future)
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db, Visitor, VisitorPageView

logger = logging.getLogger(__name__)
router = APIRouter()

_GUEST_ADJECTIVES = [
  "Falcon","Swift","Eagle","Bold","Calm","Crimson","Dawn","Ember","Frost",
  "Ghost","Hawk","Ivy","Jade","Keen","Lunar","Misty","Noble","Onyx","Pulse",
  "Quest","Raven","Sage","Titan","Unity","Vivid","Wild","Zen","Arc","Blaze",
]
_GUEST_NOUNS = [
  "Aurora","Breeze","Canyon","Drift","Echo","Flux","Glade","Haven","Iris",
  "Junction","Kite","Loom","Meadow","Nexus","Orbit","Pinnacle","Quarry",
  "Ridge","Summit","Tide","Valley","Wander","Zenith","Atlas","Crest","Delta",
]

def _random_guest_name() -> str:
    import random
    adj = random.choice(_GUEST_ADJECTIVES)
    noun = random.choice(_GUEST_NOUNS)
    num = random.randint(1000, 9999)
    return f"{adj}{noun}{num}"

def _visitor_token() -> str:
    return uuid.uuid4().hex[:16]


@router.post("/ping")
def ping_visitor(
    request: Request,
    token: Optional[str] = None,
    guest_username: Optional[str] = None,
    path: Optional[str] = "/",
    referer: Optional[str] = None,
    db: Session = Depends(get_db),
):
    # Try to find existing visitor by token
    visitor = None
    if token:
        visitor = db.query(Visitor).filter(Visitor.visitor_token == token).first()

    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "0.0.0.0").split(",")[0].strip()
    ua = request.headers.get("user-agent", "")

    if visitor:
        visitor.last_seen = datetime.now(timezone.utc)
        visitor.page_views = Visitor.page_views + 1
        visitor.ip_address = ip
        visitor.user_agent = ua
    else:
        name = guest_username or _random_guest_name()
        # Ensure unique username
        while db.query(Visitor).filter(Visitor.guest_username == name).first():
            name = _random_guest_name()
        visitor = Visitor(
            guest_username=name,
            ip_address=ip,
            user_agent=ua,
            visitor_token=token or _visitor_token(),
        )
        db.add(visitor)

    db.flush()

    # Log page view
    pv = VisitorPageView(
        visitor_id=visitor.id,
        path=path or "/",
        referer=referer,
    )
    db.add(pv)
    db.commit()
    db.refresh(visitor)

    return {
        "visitor_token": visitor.visitor_token,
        "guest_username": visitor.guest_username,
        "ip_address": visitor.ip_address,
        "first_seen": visitor.first_seen.isoformat() if visitor.first_seen else None,
        "page_views": visitor.page_views,
    }


@router.get("/me")
def get_visitor(
    request: Request,
    token: Optional[str] = None,
    db: Session = Depends(get_db),
):
    from fastapi.responses import JSONResponse
    if not token:
        return JSONResponse(status_code=400, content={"detail": "No visitor token provided"})
    visitor = db.query(Visitor).filter(Visitor.visitor_token == token).first()
    if not visitor:
        return JSONResponse(status_code=404, content={"detail": "Visitor not found"})

    return {
        "visitor_token": visitor.visitor_token,
        "guest_username": visitor.guest_username,
        "ip_address": visitor.ip_address,
        "user_agent": visitor.user_agent,
        "first_seen": visitor.first_seen.isoformat() if visitor.first_seen else None,
        "last_seen": visitor.last_seen.isoformat() if visitor.last_seen else None,
        "page_views": visitor.page_views,
    }
