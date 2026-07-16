"""
News endpoints with sentiment analysis.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from app.services import news_service

router = APIRouter()


class SentimentRequest(BaseModel):
    text: str


@router.get("/")
@router.get("")
def get_news(limit: int = Query(20, ge=1, le=50)):
    return {"articles": news_service.get_general_news(limit)}


@router.get("/stock/{symbol}")
def get_stock_news(symbol: str, limit: int = Query(10, ge=1, le=30)):
    return {"symbol": symbol.upper(), "articles": news_service.get_stock_news(symbol.upper(), limit)}


@router.post("/sentiment/analyze")
def analyze(req: SentimentRequest):
    return news_service.analyze_text_sentiment(req.text)
