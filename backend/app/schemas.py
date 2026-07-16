"""
Pydantic schemas for request/response validation
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel, EmailStr, Field


def _utcnow():
    """Timezone-aware UTC now — replaces deprecated `datetime.utcnow`."""
    return datetime.now(timezone.utc)

# ==================== Authentication Schemas ====================
class RegisterRequest(BaseModel):
    """User registration request"""
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8)
    first_name: Optional[str] = None
    last_name: Optional[str] = None

class LoginRequest(BaseModel):
    """User login request"""
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    """Token response"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

class UserResponse(BaseModel):
    """User response"""
    id: int
    username: str
    email: str
    first_name: Optional[str]
    last_name: Optional[str]
    is_admin: bool
    subscription_tier: str
    created_at: datetime
    profile_picture: Optional[str] = None

    class Config:
        from_attributes = True

# ==================== Market Data Schemas ====================
class StockQuote(BaseModel):
    """Stock quote data"""
    symbol: str
    price: float
    change: float
    change_percent: float
    open: float
    high: float
    low: float
    volume: int
    market_cap: Optional[float]
    pe_ratio: Optional[float]
    dividend_yield: Optional[float]
    fifty_two_week_high: Optional[float]
    fifty_two_week_low: Optional[float]
    timestamp: datetime

class HistoricalDataPoint(BaseModel):
    """Historical data point"""
    date: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int

class StockHistoryResponse(BaseModel):
    """Stock history response"""
    symbol: str
    data: List[HistoricalDataPoint]

class TrendingStock(BaseModel):
    """Trending stock"""
    symbol: str
    price: float
    change_percent: float
    volume: int
    news_count: Optional[int]

# ==================== Prediction Schemas ====================
class PredictionRequest(BaseModel):
    """Prediction request"""
    symbol: str
    days: int = Field(1, ge=1, le=30)

class PredictionResponse(BaseModel):
    """Prediction response"""
    symbol: str
    predicted_price: float
    confidence_score: float
    signal: str  # BUY, SELL, HOLD
    trend_direction: str
    forecast_7day: Optional[List[float]]
    accuracy_metric: Optional[float]

class AccuracyMetrics(BaseModel):
    """Model accuracy metrics"""
    symbol: str
    accuracy: float
    rmse: float
    mape: float
    r2_score: float
    precision: Optional[float]
    recall: Optional[float]
    f1_score: Optional[float]

# ==================== Portfolio Schemas ====================
class PortfolioStockRequest(BaseModel):
    """Add stock to portfolio request"""
    symbol: str
    quantity: float
    purchase_price: float
    purchase_date: Optional[datetime] = None
    notes: Optional[str] = None

class PortfolioStockResponse(BaseModel):
    """Portfolio stock response"""
    id: int
    symbol: str
    quantity: float
    purchase_price: float
    current_price: Optional[float]
    current_value: Optional[float]
    gain_loss: Optional[float]
    gain_loss_percent: Optional[float]
    purchase_date: datetime

    class Config:
        from_attributes = True

class PortfolioResponse(BaseModel):
    """Portfolio response"""
    id: int
    name: str
    initial_investment: float
    current_value: float
    total_gain_loss: float
    total_gain_loss_percent: float
    stocks: List[PortfolioStockResponse]
    created_at: datetime

    class Config:
        from_attributes = True

class AssetAllocation(BaseModel):
    """Asset allocation"""
    symbol: str
    value: float
    percentage: float

# ==================== News & Sentiment Schemas ====================
class NewsArticle(BaseModel):
    """News article"""
    id: Optional[int]
    title: str
    description: Optional[str]
    content: Optional[str]
    source: str
    url: str
    image_url: Optional[str]
    published_at: datetime
    sentiment: Optional[str]
    sentiment_score: Optional[float]

class SentimentAnalysisRequest(BaseModel):
    """Sentiment analysis request"""
    text: str

class SentimentAnalysisResponse(BaseModel):
    """Sentiment analysis response"""
    sentiment: str  # POSITIVE, NEGATIVE, NEUTRAL
    confidence_score: float
    text: str

class StockSentiment(BaseModel):
    """Stock sentiment"""
    symbol: str
    overall_sentiment: str
    sentiment_score: float
    positive_articles: int
    negative_articles: int
    neutral_articles: int
    latest_articles: List[NewsArticle]

# ==================== Technical Indicators Schemas ====================
class TechnicalIndicators(BaseModel):
    """Technical indicators"""
    symbol: str
    date: datetime
    sma_20: Optional[float]
    sma_50: Optional[float]
    sma_200: Optional[float]
    ema_12: Optional[float]
    ema_26: Optional[float]
    rsi_14: Optional[float]
    macd: Optional[float]
    macd_signal: Optional[float]
    macd_histogram: Optional[float]
    bollinger_upper: Optional[float]
    bollinger_middle: Optional[float]
    bollinger_lower: Optional[float]
    atr: Optional[float]
    vwap: Optional[float]

# ==================== Admin Schemas ====================
class UserManagementResponse(BaseModel):
    """User management response"""
    id: int
    username: str
    email: str
    is_active: bool
    is_admin: bool
    subscription_tier: str
    created_at: datetime
    last_login: Optional[datetime]

    class Config:
        from_attributes = True

class AuditLogResponse(BaseModel):
    """Audit log response"""
    id: int
    user_id: Optional[int]
    action: str
    description: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class SystemStats(BaseModel):
    """System statistics"""
    total_users: int
    active_users: int
    total_portfolios: int
    total_predictions: int
    model_accuracy: float
    last_data_update: datetime

# ==================== Report Schemas ====================
class ReportGenerationRequest(BaseModel):
    """Report generation request"""
    type: str  # pdf, csv
    portfolio_id: Optional[int] = None
    symbol: Optional[str] = None
    include_predictions: bool = True
    include_charts: bool = True

class ReportResponse(BaseModel):
    """Report response"""
    id: int
    filename: str
    type: str
    file_url: str
    created_at: datetime
    file_size: int

# ==================== Dashboard Schemas ====================
class DashboardMetrics(BaseModel):
    """Dashboard metrics"""
    portfolio_value: float
    today_profit_loss: float
    today_profit_loss_percent: float
    total_portfolios: int
    total_investments: int
    prediction_confidence: float

class DashboardData(BaseModel):
    """Complete dashboard data"""
    metrics: DashboardMetrics
    trending_stocks: List[TrendingStock]
    top_gainers: List[StockQuote]
    top_losers: List[StockQuote]
    latest_news: List[NewsArticle]
    portfolio_summary: Optional[PortfolioResponse]

# ==================== Error Response ====================
class ErrorResponse(BaseModel):
    """Error response"""
    detail: str
    error_code: Optional[str] = None
    timestamp: datetime = Field(default_factory=_utcnow)

# ==================== Pagination ====================
class PaginationParams(BaseModel):
    """Pagination parameters"""
    skip: int = Field(0, ge=0)
    limit: int = Field(100, ge=1, le=1000)

class PaginatedResponse(BaseModel):
    """Paginated response"""
    total: int
    skip: int
    limit: int
    data: List[Any]
