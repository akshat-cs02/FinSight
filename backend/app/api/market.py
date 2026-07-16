"""
Market data endpoints
"""

import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db, User, StockData
from app.schemas import StockQuote, StockHistoryResponse, HistoricalDataPoint, TrendingStock
from app.security import get_current_user
import yfinance as yf

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/search", response_model=StockQuote)
async def search_stock(symbol: str, current_user: User = Depends(get_current_user)):
    """
    Search and get stock quote
    """
    try:
        # Fetch from Yahoo Finance
        ticker = yf.Ticker(symbol.upper())
        info = ticker.info
        hist = ticker.history(period="1d")

        if hist.empty:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Stock symbol '{symbol}' not found"
            )

        latest = hist.iloc[-1]
        current_price = latest['Close']
        previous_close = info.get('previousClose', current_price)
        change = current_price - previous_close
        change_percent = (change / previous_close * 100) if previous_close != 0 else 0

        return StockQuote(
            symbol=symbol.upper(),
            price=float(current_price),
            change=float(change),
            change_percent=float(change_percent),
            open=float(latest['Open']),
            high=float(latest['High']),
            low=float(latest['Low']),
            volume=int(latest['Volume']),
            market_cap=info.get('marketCap'),
            pe_ratio=info.get('trailingPE'),
            dividend_yield=info.get('dividendYield'),
            fifty_two_week_high=info.get('fiftyTwoWeekHigh'),
            fifty_two_week_low=info.get('fiftyTwoWeekLow'),
            timestamp=hist.index[-1]
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching stock {symbol}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch stock data"
        )

@router.get("/quote/{symbol}", response_model=StockQuote)
async def get_quote(symbol: str, current_user: User = Depends(get_current_user)):
    """
    Get latest stock quote
    """
    return await search_stock(symbol, current_user)

@router.get("/history/{symbol}", response_model=StockHistoryResponse)
async def get_history(
    symbol: str,
    period: str = Query("1y", regex="^(1d|5d|1mo|3mo|6mo|1y|5y)$"),
    current_user: User = Depends(get_current_user)
):
    """
    Get historical stock data
    """
    try:
        ticker = yf.Ticker(symbol.upper())
        hist = ticker.history(period=period)

        if hist.empty:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No data found"
            )

        data = [
            HistoricalDataPoint(
                date=idx,
                open=float(row['Open']),
                high=float(row['High']),
                low=float(row['Low']),
                close=float(row['Close']),
                volume=int(row['Volume'])
            )
            for idx, row in hist.iterrows()
        ]

        return StockHistoryResponse(symbol=symbol.upper(), data=data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching history for {symbol}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch historical data"
        )

@router.get("/trending", response_model=List[TrendingStock])
async def get_trending(current_user: User = Depends(get_current_user)):
    """
    Get trending stocks
    """
    try:
        # Trending stocks (example data)
        trending_symbols = ["AAPL", "MSFT", "GOOGL", "TSLA", "AMZN", "NVDA"]

        trending_data = []
        for symbol in trending_symbols:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="1d")

            if not hist.empty:
                latest = hist.iloc[-1]
                previous_close = hist.iloc[-2]['Close'] if len(hist) > 1 else latest['Close']
                change_percent = ((latest['Close'] - previous_close) / previous_close * 100)

                trending_data.append(TrendingStock(
                    symbol=symbol,
                    price=float(latest['Close']),
                    change_percent=float(change_percent),
                    volume=int(latest['Volume']),
                    news_count=0
                ))

        return sorted(trending_data, key=lambda x: x.change_percent, reverse=True)

    except Exception as e:
        logger.error(f"Error fetching trending stocks: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch trending data"
        )

@router.get("/gainers", response_model=List[StockQuote])
async def get_top_gainers(limit: int = Query(10, ge=1, le=100), current_user: User = Depends(get_current_user)):
    """
    Get top gainer stocks
    """
    # Placeholder - In production, fetch from market data service
    return []

@router.get("/losers", response_model=List[StockQuote])
async def get_top_losers(limit: int = Query(10, ge=1, le=100), current_user: User = Depends(get_current_user)):
    """
    Get top loser stocks
    """
    # Placeholder - In production, fetch from market data service
    return []

@router.get("/crypto/overview")
async def get_crypto_overview(current_user: User = Depends(get_current_user)):
    """
    Get cryptocurrency market overview
    """
    try:
        crypto_tickers = ["BTC-USD", "ETH-USD", "XRP-USD", "BNB-USD", "SOL-USD"]
        crypto_data = []

        for ticker_str in crypto_tickers:
            ticker = yf.Ticker(ticker_str)
            hist = ticker.history(period="1d")

            if not hist.empty:
                latest = hist.iloc[-1]
                crypto_data.append({
                    "symbol": ticker_str,
                    "price": float(latest['Close']),
                    "volume": int(latest['Volume'])
                })

        return {"cryptos": crypto_data}

    except Exception as e:
        logger.error(f"Error fetching crypto data: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch cryptocurrency data"
        )

@router.get("/indices")
async def get_market_indices(current_user: User = Depends(get_current_user)):
    """
    Get market indices (S&P500, NASDAQ, etc.)
    """
    try:
        indices = {
            "^GSPC": "S&P 500",
            "^IXIC": "NASDAQ",
            "^DJI": "DOW JONES",
            "^VIX": "VIX"
        }

        data = {}
        for symbol, name in indices.items():
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="1d")

            if not hist.empty:
                latest = hist.iloc[-1]
                data[name] = float(latest['Close'])

        return {"indices": data}

    except Exception as e:
        logger.error(f"Error fetching indices: {str(e)}")
        return {"indices": {}}
