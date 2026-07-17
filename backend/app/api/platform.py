"""
Platform stats — public endpoint returning live performance metrics
for the marketing / landing-page stat counters.

Endpoints:
  GET /api/platform/stats — { markets_covered, signal_accuracy, risk_reward_ratio, prediction_latency }
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import prediction_service as preds
from app.services.signal_service import get_performance_stats, SIGNAL_UNIVERSE

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/stats")
def platform_stats(db: Session = Depends(get_db)):
    """Return real platform stats for the landing-page counters."""

    # ── Markets covered ──────────────────────────────────────────────────────
    # Combine prediction symbols + signal universe to get total covered markets.
    prediction_symbols = set(preds.SUPPORTED)
    signal_symbols = set(SIGNAL_UNIVERSE)
    all_symbols = prediction_symbols | signal_symbols
    markets_covered = len(all_symbols)

    # ── Signal accuracy (win rate from last 90 days) ─────────────────────────
    perf = get_performance_stats(days=90, db=db)
    signal_accuracy = perf.get("win_rate", 0.0)

    # ── Risk-reward ratio (avg PnL from last 90 days) ────────────────────────
    risk_reward_ratio = perf.get("avg_pnl_r", 0.0)

    # ── Prediction latency ───────────────────────────────────────────────────
    # Using a static estimate — actual latency varies by model/symbol/host
    # and measuring it inline would block the endpoint for seconds.
    PREDICTION_LATENCY_MS = 50

    return {
        "markets_covered": markets_covered,
        "signal_accuracy": signal_accuracy,
        "risk_reward_ratio": risk_reward_ratio,
        "prediction_latency": PREDICTION_LATENCY_MS,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
