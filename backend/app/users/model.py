"""
Unified user-record wrapper.

Both legacy SQLAlchemy rows and MongoDB documents expose the same
duck-typed read interface (`id`, `email`, `username`, `is_admin`,
`is_active`, `is_email_verified`, …). This module hides the source
behind one Lightweight Record so `auth_new` / `security` / routers
can be source-agnostic.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class UserRecord:
    """In-process user record returned by whichever store is active."""
    id: str                                  # stringified so Mongo ObjectId and SQL int both work
    email: str
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    hashed_password: str = ""
    is_admin: bool = False
    is_active: bool = True
    is_email_verified: bool = False
    profile_picture: Optional[str] = None
    phone: Optional[str] = None
    country: Optional[str] = None
    subscription_tier: str = "free"
    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    extra: dict = field(default_factory=dict)

    def public_dict(self) -> dict:
        return {
            "id":                self.id,
            "username":          self.username,
            "email":             self.email,
            "first_name":        self.first_name,
            "last_name":         self.last_name,
            "is_admin":          self.is_admin,
            "is_active":         self.is_active,
            "is_email_verified": self.is_email_verified,
            "profile_picture":   self.profile_picture,
            "phone":             self.phone,
            "country":           self.country,
            "subscription_tier": self.subscription_tier,
            "created_at":        self.created_at.isoformat() if self.created_at else "",
        }


def from_sqlalchemy(u) -> UserRecord:
    """Wrap a SQLAlchemy `User` row as a UserRecord."""
    return UserRecord(
        id=str(u.id),
        email=u.email,
        username=u.username,
        first_name=u.first_name,
        last_name=u.last_name,
        hashed_password=u.hashed_password,
        is_admin=bool(u.is_admin),
        is_active=bool(u.is_active),
        is_email_verified=bool(getattr(u, "is_email_verified", True)),
        profile_picture=getattr(u, "profile_picture", None),
        phone=getattr(u, "phone", None),
        country=getattr(u, "country", None),
        subscription_tier=u.subscription_tier or "free",
        created_at=u.created_at,
        last_login=getattr(u, "last_login", None),
    )


def from_mongo(doc: dict) -> UserRecord:
    """Wrap a Mongo `users` document as a UserRecord."""
    if doc is None:
        return None  # type: ignore
    return UserRecord(
        id=str(doc.get("_id") or doc.get("id")),
        email=doc.get("email", ""),
        username=doc.get("username"),
        first_name=doc.get("first_name"),
        last_name=doc.get("last_name"),
        hashed_password=doc.get("hashed_password", ""),
        is_admin=bool(doc.get("is_admin", False)),
        is_active=bool(doc.get("is_active", True)),
        is_email_verified=bool(doc.get("is_email_verified", False)),
        profile_picture=doc.get("profile_picture"),
        phone=doc.get("phone"),
        country=doc.get("country"),
        subscription_tier=doc.get("subscription_tier", "free"),
        created_at=doc.get("created_at"),
        last_login=doc.get("last_login"),
        extra={k: doc[k] for k in doc if k not in {
            "_id", "id", "email", "username", "first_name", "last_name",
            "hashed_password", "is_admin", "is_active", "is_email_verified",
            "profile_picture", "phone", "country", "subscription_tier",
            "created_at", "last_login",
        }},
    )
