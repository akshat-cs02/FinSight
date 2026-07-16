"""
Mailing-side service (transactional emails).

Free provider chosen: Resend (https://resend.com) — 100/day, 3000/month free.
Fallback: if no RESEND_API_KEY is configured, the service runs in DRY_RUN
mode and writes the rendered email to `data/outbox/` — saves to a file you
can open in a browser to see exactly what your user would receive.
"""
from __future__ import annotations

import html as _html
import logging
import os
import secrets
import smtplib
from dataclasses import dataclass
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

OUTBOX_DIR = Path(
    os.environ.get("FINSIGHT_OUTBOX_DIR",
                   str(Path(__file__).resolve().parents[3] / "data" / "outbox"))
)
OUTBOX_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class MessageSent:
    ok: bool
    provider: str
    message_id: Optional[str] = None
    error: Optional[str] = None


def _build_email_html(title: str, body_html: str, cta: Optional[tuple[str, str]] = None) -> str:
    """Return the standard FinSight transactional-email body."""
    cta_section = ""
    if cta:
        label, url = cta
        cta_section = f"""
        <tr>
          <td align="center" style="padding: 28px 0 8px 0;">
            <a href="{_html.escape(url)}"
               style="background:#2563eb;color:#ffffff;text-decoration:none;
                      padding:14px 28px;border-radius:8px;display:inline-block;
                      font-weight:600;font-family:-apple-system,Segoe UI,sans-serif">
              {_html.escape(label)}
            </a>
          </td>
        </tr>"""
    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#0b1220;font-family:-apple-system,Segoe UI,sans-serif">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="520"
             style="background:#0f1c34;border-radius:16px;padding:32px;color:#e2e8f0">
        <tr><td align="center" style="padding-bottom:18px;">
          <div style="display:inline-block;background:#2563eb;width:48px;height:48px;
                       line-height:48px;border-radius:12px;color:#fff;font-weight:700">FS</div>
        </td></tr>
        <tr><td align="center" style="font-size:24px;font-weight:700;color:#fff;
                                       padding-bottom:8px">{_html.escape(title)}</td></tr>
        <tr><td style="font-size:14px;line-height:1.6;color:#cbd5e1;padding:8px 0">{body_html}</td></tr>
        {cta_section}
        <tr><td style="font-size:11px;color:#64748b;padding-top:24px;border-top:1px solid #1e293b;
                       margin-top:24px">
          FinSight &middot; AI-Powered Markets &middot; {_html.escape(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"))}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


def _save_outbox(to: str, subject: str, html: str) -> str:
    """Persist to local file when no mail provider is configured."""
    safe = secrets.token_hex(4)
    fname = f"{int(datetime.now(timezone.utc).timestamp())}_{safe}_{_html.escape(to)}.html"
    fp = OUTBOX_DIR / fname
    fp.write_text(html, encoding="utf-8")
    logger.info("DRY_RUN email -> %s (saved to %s)", to, fp)
    return str(fp)


def _send_resend(to: str, subject: str, html: str) -> MessageSent:
    """POST to Resend's REST API. Free tier: 100/day, 3000/month, no card.
    Test sends visible at https://resend.com/emails — no delivery to real
    inboxes from the free dev sender."""
    import json
    import urllib.request

    api_key = os.environ.get("RESEND_API_KEY", "")
    if not api_key:
        return MessageSent(ok=False, provider="resend", error="RESEND_API_KEY not set")
    sender = os.environ.get("FINSIGHT_FROM_EMAIL", "FinSight <onboarding@resend.dev>")
    body = json.dumps({
        "from":    sender,
        "to":      [to],
        "subject": subject,
        "html":    html,
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.resend.com/emails", data=body, method="POST",
        headers={"Authorization": f"Bearer {api_key}",
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return MessageSent(ok=True, provider="resend", message_id=data.get("id"))
    except Exception as exc:
        return MessageSent(ok=False, provider="resend", error=str(exc))


def _send_smtp_fallback(to: str, subject: str, html: str) -> MessageSent:
    """Mail-server fallback (Gmail / SMTP) for local dev or alternative providers."""
    user     = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASS", "")
    host     = os.environ.get("SMTP_HOST", "")
    port     = int(os.environ.get("SMTP_PORT", "587"))
    if not (user and password and host):
        return MessageSent(ok=False, provider="none", error="No provider configured")
    msg = MIMEMultipart("alternative")
    msg["From"]    = user
    msg["To"]      = to
    msg["Subject"] = subject
    msg.attach(MIMEText(html, "html"))
    try:
        with smtplib.SMTP(host, port, timeout=15) as s:
            s.starttls()
            s.login(user, password)
            s.sendmail(user, [to], msg.as_string())
        return MessageSent(ok=True, provider="smtp")
    except Exception as exc:
        return MessageSent(ok=False, provider="smtp", error=str(exc))


def send_email(to: str, subject: str, html_body: str, cta: Optional[tuple[str, str]] = None) -> MessageSent:
    """Public entry point. Tries:
       1) Resend (transactional, free tier)
       2) SMTP fallback (Gmail / SendGrid / etc.)
       3) DRY_RUN outbox under `data/outbox/` for local dev.
    """
    full_html = _build_email_html(subject, html_body, cta)
    if os.environ.get("RESEND_API_KEY"):
        r = _send_resend(to, subject, full_html)
        if r.ok:
            return r
        logger.warning("Resend failed (%s); trying SMTP fallback", r.error)
        sm = _send_smtp_fallback(to, subject, full_html)
        if sm.ok:
            return sm
        logger.warning("SMTP also failed (%s); saving to outbox", sm.error)
    sm = _send_smtp_fallback(to, subject, full_html)
    if sm.ok:
        return sm
    fp = _save_outbox(to, subject, full_html)
    return MessageSent(ok=True, provider="outbox", message_id=fp)


def render_template(name: str, context: dict) -> tuple[str, str, Optional[tuple[str, str]]]:
    """Pick one of our built-in templates. Returns (subject, body_html, cta)."""
    if name == "verify_email":
        url = context.get("verify_url", "")
        return (
            "Verify your FinSight email",
            f"Hey {_html.escape(context.get('first_name') or 'there')}, "
            "tap the button below to confirm your email - it expires in 24 hours.",
            ("Verify email", url),
        )
    if name == "welcome":
        return (
            "Welcome to FinSight",
            f"You are in, {_html.escape(context.get('first_name') or 'trader')}! "
            "Your dashboard is live with real-time markets, ICT signals and an "
            "AI ensemble built on top of Yahoo Finance data.",
            ("Open dashboard", context.get("login_url", "https://finsight.app/dashboard")),
        )
    if name == "password_reset":
        return (
            "Reset your FinSight password",
            "Someone (hopefully you) asked for a password reset. The link "
            "below is valid for 1 hour.",
            ("Reset password", context.get("reset_url", "")),
        )
    if name == "trade_alert":
        return (
            f"[FinSight] {context.get('symbol', '')} {context.get('side', '')} signal",
            f"<strong>{context.get('side','?')}</strong> on "
            f"<strong>{_html.escape(context.get('symbol',''))}</strong><br>"
            f"Entry: <code>{context.get('entry','')}</code> &nbsp; "
            f"SL: <code>{context.get('sl','')}</code> &nbsp; "
            f"TP: <code>{context.get('tp','')}</code><br>"
            f"Kill-zone weight: {context.get('kz','')}x &middot; "
            f"Confidence: {context.get('confidence','')}%",
            ("Open trade", context.get("trade_url", "https://finsight.app")),
        )
    raise ValueError(f"unknown template {name}")
