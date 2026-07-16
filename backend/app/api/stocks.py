"""
Real stock data endpoints (no auth required for read-only data).
"""
from fastapi import APIRouter, HTTPException, Query
from app.services import market_data_service as mds
from app.services.spot_pricing import scale_prices

router = APIRouter()

# Quote fields that carry a price and should be scaled onto the spot scale.
_QUOTE_PRICE_KEYS = [
    "price", "open", "high", "low", "previous_close", "change",
    "fifty_two_week_high", "fifty_two_week_low",
]

VALID_HISTORY_PERIODS = {
    "1m", "2m", "5m", "15m", "30m", "1h",
    "1d", "5d", "1mo", "3mo", "6mo", "1y", "5y",
}

VALID_INDICATOR_PERIODS = {"1mo", "3mo", "6mo", "1y", "5y"}


@router.get("/search")
def search(q: str = Query(..., min_length=1)):
    return {"query": q, "results": mds.search_symbol(q)}


@router.get("/{symbol}")
def get_stock(symbol: str):
    try:
        quote = mds.get_stock_quote(symbol.upper())
        # Spot metals proxied to futures → present prices on the spot scale.
        return scale_prices(symbol.upper(), dict(quote), _QUOTE_PRICE_KEYS)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{symbol}/history")
def get_history(symbol: str, period: str = Query("1y")):
    if period not in VALID_HISTORY_PERIODS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid period '{period}'. Valid options: {', '.join(sorted(VALID_HISTORY_PERIODS))}",
        )
    try:
        return mds.get_historical_data(symbol.upper(), period)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{symbol}/indicators")
def get_indicators(symbol: str, period: str = Query("6mo")):
    """RSI, MACD, EMA, SMA, Bollinger Bands using pandas-ta."""
    if period not in VALID_INDICATOR_PERIODS:
        period = "6mo"
    try:
        from app.services.indicators_service import calculate_indicators
        return calculate_indicators(symbol.upper(), period)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
