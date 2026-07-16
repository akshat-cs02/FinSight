"""
Signals API — Intraday ICT signals, performance stats, stock term signals, breakouts.

Endpoints:
  GET /api/signals/intraday                   — live signals for universe
  GET /api/signals/intraday/{symbol}          — signals for one symbol
  GET /api/signals/performance?days=7|30|90  — personal stats
  GET /api/signals/stock/{symbol}/terms       — short/mid/long term signals
  GET /api/signals/breakouts                  — Watch These Stocks
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.signal_service import (
    get_cached_signals,
    generate_intraday_signals,
    get_performance_stats,
    get_stock_term_signal,
    get_breakout_candidates,
    get_consensus_signal,
    SIGNAL_UNIVERSE,
)
from app.services.watchlist_service import get_watchlist_symbols
from app.services.spot_pricing import scale_terms

router = APIRouter()


@router.get("/intraday")
def get_intraday_signals(db: Session = Depends(get_db)):
    """Return cached intraday signals — instant response, refreshed in background."""
    sigs = get_cached_signals()
    return {"signals": sigs, "count": len(sigs)}


@router.get("/intraday/{symbol}")
def get_intraday_signal_for_symbol(symbol: str, db: Session = Depends(get_db)):
    """Generate and return a live signal for a single symbol."""
    signals = generate_intraday_signals(db, extra_symbols=[symbol.upper()])
    matching = [s for s in signals if s["symbol"] == symbol.upper()]
    if not matching:
        return {"symbol": symbol.upper(), "signal": "HOLD", "message": "No active signal"}
    return matching[0]


@router.get("/performance")
def get_signal_performance(
    days: int = Query(7, ge=1, le=90, description="Look-back window: 7, 30, or 90"),
    db: Session = Depends(get_db),
):
    """Return performance stats aggregated from all tracked signals."""
    stats = get_performance_stats(days=days, db=db)
    return stats


@router.get("/stock/{symbol}/terms")
def get_stock_terms(symbol: str):
    """Return short, mid, and long term signals for a stock symbol."""
    try:
        result = get_stock_term_signal(symbol.upper())
        # Spot metals proxied to futures → present price levels on the spot scale.
        return scale_terms(symbol.upper(), result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/breakouts")
def get_breakouts(db: Session = Depends(get_db)):
    """Return breakout candidates (Watch These Stocks)."""
    candidates = get_breakout_candidates(db)
    return {"candidates": candidates, "count": len(candidates)}


@router.get("/consensus/{symbol}")
def get_signal_consensus(symbol: str):
    """
    Unified weighted consensus for one symbol.

    Combines AI Prediction (30%), ICT Intraday (40%), Short-Term Technical (15%),
    Mid/Long-Term Fundamentals (10%), and Liquidity Sweep Bias (5%) into one
    master signal with a -100 … +100 score. Weights intentionally lean on the
    primary intraday engine plus a liquidity layer for ICT-style setups;
    fundamentals are weighted low because they only flip quarterly at best.

    First call may be slow (AI inference + term signals).
    Results cached 5 minutes.
    """
    try:
        return get_consensus_signal(symbol.upper())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
