"""
News sentiment analysis endpoints
"""

import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db, User, News
from app.schemas import NewsArticle, SentimentAnalysisResponse, StockSentiment, SentimentAnalysisRequest
from app.security import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/latest", response_model=List[NewsArticle])
async def get_latest_news(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get latest financial news
    """
    try:
        news = db.query(News).order_by(News.published_at.desc()).limit(limit).all()

        return [
            NewsArticle(
                id=n.id,
                title=n.title,
                description=n.description,
                content=n.content,
                source=n.source,
                url=n.url,
                image_url=n.image_url,
                published_at=n.published_at,
                sentiment=n.sentiment,
                sentiment_score=n.sentiment_score
            )
            for n in news
        ]

    except Exception as e:
        logger.error(f"Error fetching news: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch news"
        )

@router.get("/{symbol}", response_model=StockSentiment)
async def get_stock_sentiment(
    symbol: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get sentiment analysis for a stock
    """
    try:
        news_articles = db.query(News).filter(
            News.symbol == symbol.upper()
        ).all()

        positive = sum(1 for n in news_articles if n.sentiment == "POSITIVE")
        negative = sum(1 for n in news_articles if n.sentiment == "NEGATIVE")
        neutral = sum(1 for n in news_articles if n.sentiment == "NEUTRAL")

        total = positive + negative + neutral
        overall_sentiment_score = ((positive - negative) / total * 100) if total > 0 else 0

        if overall_sentiment_score > 10:
            overall_sentiment = "POSITIVE"
        elif overall_sentiment_score < -10:
            overall_sentiment = "NEGATIVE"
        else:
            overall_sentiment = "NEUTRAL"

        return StockSentiment(
            symbol=symbol.upper(),
            overall_sentiment=overall_sentiment,
            sentiment_score=overall_sentiment_score,
            positive_articles=positive,
            negative_articles=negative,
            neutral_articles=neutral,
            latest_articles=[
                NewsArticle(
                    id=n.id,
                    title=n.title,
                    description=n.description,
                    content=n.content,
                    source=n.source,
                    url=n.url,
                    image_url=n.image_url,
                    published_at=n.published_at,
                    sentiment=n.sentiment,
                    sentiment_score=n.sentiment_score
                )
                for n in news_articles[:5]
            ]
        )

    except Exception as e:
        logger.error(f"Error getting sentiment for {symbol}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get sentiment data"
        )

@router.post("/analyze", response_model=SentimentAnalysisResponse)
async def analyze_sentiment(
    request: SentimentAnalysisRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Analyze sentiment of custom text
    """
    try:
        from textblob import TextBlob

        # Simple sentiment analysis using TextBlob
        blob = TextBlob(request.text)
        polarity = blob.sentiment.polarity

        if polarity > 0.1:
            sentiment = "POSITIVE"
        elif polarity < -0.1:
            sentiment = "NEGATIVE"
        else:
            sentiment = "NEUTRAL"

        # Normalize confidence to 0-1 range
        confidence = abs(polarity)

        return SentimentAnalysisResponse(
            sentiment=sentiment,
            confidence_score=confidence,
            text=request.text
        )

    except Exception as e:
        logger.error(f"Error analyzing sentiment: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to analyze sentiment"
        )

@router.get("/market/overview")
async def get_market_sentiment(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get overall market sentiment
    """
    try:
        all_news = db.query(News).all()

        positive = sum(1 for n in all_news if n.sentiment == "POSITIVE")
        negative = sum(1 for n in all_news if n.sentiment == "NEGATIVE")
        neutral = sum(1 for n in all_news if n.sentiment == "NEUTRAL")

        total = positive + negative + neutral or 1

        return {
            "overall_sentiment": "POSITIVE" if positive > negative else "NEGATIVE" if negative > positive else "NEUTRAL",
            "positive_percentage": (positive / total) * 100,
            "negative_percentage": (negative / total) * 100,
            "neutral_percentage": (neutral / total) * 100,
            "total_articles": total,
            "bullish_bias": (positive - negative) / total * 100
        }

    except Exception as e:
        logger.error(f"Error getting market sentiment: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get sentiment overview"
        )
