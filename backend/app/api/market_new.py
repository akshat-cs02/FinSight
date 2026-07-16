"""
Market overview endpoints (no auth - public market data).
"""
import logging
from fastapi import APIRouter, HTTPException, Query
from app.services import market_data_service as mds

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/summary")
def market_summary():
    return mds.get_market_summary()


_MARKETS = "ALL|US|INDIA|CRYPTO|FOREX|COMMODITIES"


@router.get("/trending")
def trending(market: str = Query("ALL", description=_MARKETS)):
    return {"market": market.upper(), "stocks": mds.get_trending_stocks(market)}


@router.get("/gainers")
def gainers(limit: int = Query(5, ge=1, le=20), market: str = Query("ALL", description=_MARKETS)):
    return {"stocks": mds.get_top_movers("gainers", limit, market)}


@router.get("/losers")
def losers(limit: int = Query(5, ge=1, le=20), market: str = Query("ALL", description=_MARKETS)):
    return {"stocks": mds.get_top_movers("losers", limit, market)}


@router.get("/status")
def market_status():
    return mds.is_market_open()


_OHLCV_INTERVAL_MAP = {
    "1":  "1m",  "5":  "5m",  "15": "15m", "30": "30m",
    "60": "1h",  "D":  "1d",  "W":  "1wk", "M":  "1mo",
}


@router.get("/ohlcv")
def get_ohlcv(
    symbol: str = Query(..., description="Ticker symbol"),
    interval: str = Query("D", description="Candle interval: 1,5,15,30,60,D,W,M"),
    limit: int = Query(500, ge=10, le=2000, description="Max candles"),
):
    import yfinance as yf

    yf_interval = _OHLCV_INTERVAL_MAP.get(interval, "1d")
    period_map = {
        "1m": "5d", "5m": "30d", "15m": "60d", "30m": "60d",
        "1h": "365d", "1d": "365d", "1wk": "365d", "1mo": "365d",
    }
    period = period_map.get(yf_interval, "365d")

    try:
        from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutTimeout

        # Map common index/misnamed tickers to the yfinance symbol that actually
        # carries data. NIFTY 50 is ^NSEI (not NIFTY.NS), SENSEX is ^BSESN, etc.
        _INDEX_ALIASES = {
            "NIFTY.NS": "^NSEI", "NIFTY50.NS": "^NSEI", "NIFTY_50.NS": "^NSEI", "NIFTY50": "^NSEI",
            "SENSEX.NS": "^BSESN", "SENSEX.BO": "^BSESN", "SENSEX": "^BSESN",
            "BANKNIFTY.NS": "^NSEBANK", "NIFTYBANK.NS": "^NSEBANK", "BANKNIFTY": "^NSEBANK",
            "NIFTYJR.NS": "^NSMIDCP", "NIFTY_NEXT_50.NS": "^NSMIDCP",
            "CNXIT.NS": "^CNXIT", "CNXAUTO.NS": "^CNXAUTO",
            "CNXFINANCE.NS": "^CNXFINANCE", "CNXPHARMA.NS": "^CNXPHARMA",
            "CNXMETAL.NS": "^CNXMETAL", "CNXENERGY.NS": "^CNXENERGY",
            "CNXFMCG.NS": "^CNXFMCG", "CNXREALTY.NS": "^CNXREALTY",
            "CNXINFRA.NS": "^CNXINFRA", "CNXPSUBANK.NS": "^CNXPSUBANK",
            "CNXMEDIA.NS": "^CNXMEDIA",
            "NIFTY_IND_DEFENCE.NS": "^CNXDEFENCE", "CNXDEFENCE.NS": "^CNXDEFENCE",
            "NIFTYMIDSML400.NS": "^NIFTY_MID_SMALL_400", "CNXMIDCAP.NS": "^CNXMIDCAP",
            "CNXSMALLCAP.NS": "^CNXSMALLCAP", "NIFTYSMLCAP250.NS": "^CNXSMLCAP250",
            "CNX500.NS": "^CNX500", "NIFTY_MID_SELECT.NS": "^CNX500",
            "NIFTYPVTBANK.NS": "^CNXPVTBANK",
            # Global indices that the search sometimes returns bare
            "NIFTY": "^NSEI", "BANKNIFTY": "^NSEBANK", "SENSEX": "^BSESN",
        }
        yf_symbol = _INDEX_ALIASES.get(symbol.upper(), symbol.upper())

        _exec = ThreadPoolExecutor(max_workers=1)
        _future = _exec.submit(
            yf.download, yf_symbol,
            period=period, interval=yf_interval, progress=False, auto_adjust=True
        )
        try:
            df = _future.result(timeout=20)
        except FutTimeout:
            raise HTTPException(status_code=504, detail=f"yfinance timeout for {symbol}")
        finally:
            _exec.shutdown(wait=False)

        if df is None or df.empty:
            raise HTTPException(status_code=404, detail=f"No OHLCV data for {symbol}")

        df.columns = [c[0].lower() if isinstance(c, tuple) else c.lower() for c in df.columns]
        df = df[["open", "high", "low", "close", "volume"]].tail(limit)

        candles = []
        for ts, row in df.iterrows():
            time_val = int(ts.timestamp()) if hasattr(ts, "timestamp") else str(ts)
            candles.append({
                "time":   time_val,
                "open":   round(float(row["open"]), 6),
                "high":   round(float(row["high"]), 6),
                "low":    round(float(row["low"]), 6),
                "close":  round(float(row["close"]), 6),
                "volume": int(row["volume"]) if row["volume"] else 0,
            })

        return {"symbol": symbol.upper(), "interval": interval, "candles": candles, "count": len(candles)}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("OHLCV fetch failed for %s: %s", symbol, e)
        raise HTTPException(status_code=500, detail=f"Failed to fetch OHLCV: {e}")
