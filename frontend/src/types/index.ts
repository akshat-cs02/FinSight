// User types
export interface User {
  id: number
  username: string
  email: string
  first_name?: string
  last_name?: string
  is_admin: boolean
  subscription_tier: string
  created_at: string
  profile_picture?: string
}

export interface AuthState {
  user: User | null
  access_token: string | null
  refresh_token: string | null
  is_authenticated: boolean
  is_loading: boolean
}

// Market data types
export interface StockQuote {
  symbol: string
  price: number
  change: number
  change_percent: number
  open: number
  high: number
  low: number
  volume: number
  market_cap?: number
  pe_ratio?: number
  dividend_yield?: number
  fifty_two_week_high?: number
  fifty_two_week_low?: number
  timestamp: string
}

export interface HistoricalDataPoint {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface StockHistory {
  symbol: string
  data: HistoricalDataPoint[]
}

// Prediction types
export interface Prediction {
  symbol: string
  predicted_price: number
  confidence_score: number
  signal: 'BUY' | 'SELL' | 'HOLD'
  trend_direction: 'UP' | 'DOWN' | 'NEUTRAL'
  forecast_7day?: number[]
  accuracy_metric?: number
}

// Portfolio types
export interface PortfolioStock {
  id: number
  symbol: string
  quantity: number
  purchase_price: number
  current_price?: number
  current_value?: number
  gain_loss?: number
  gain_loss_percent?: number
  purchase_date: string
}

export interface Portfolio {
  id: number
  name: string
  initial_investment: number
  current_value: number
  total_gain_loss: number
  total_gain_loss_percent: number
  stocks: PortfolioStock[]
  created_at: string
}

// News types
export interface NewsArticle {
  id?: number
  title: string
  description?: string
  content?: string
  source: string
  url: string
  image_url?: string
  published_at: string
  sentiment?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'
  sentiment_score?: number
}

// Sentiment types
export interface StockSentiment {
  symbol: string
  overall_sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'
  sentiment_score: number
  positive_articles: number
  negative_articles: number
  neutral_articles: number
  latest_articles: NewsArticle[]
}

// Technical indicators
export interface TechnicalIndicators {
  symbol: string
  date: string
  sma_20?: number
  sma_50?: number
  sma_200?: number
  ema_12?: number
  ema_26?: number
  rsi_14?: number
  macd?: number
  macd_signal?: number
  macd_histogram?: number
  bollinger_upper?: number
  bollinger_middle?: number
  bollinger_lower?: number
  atr?: number
  vwap?: number
}

// API Response types
export interface ApiResponse<T> {
  data: T
  message?: string
  status: number
}

export interface ApiError {
  detail: string
  error_code?: string
  timestamp: string
}

// Dashboard types
export interface DashboardMetrics {
  portfolio_value: number
  today_profit_loss: number
  today_profit_loss_percent: number
  total_portfolios: number
  total_investments: number
  prediction_confidence: number
}

// Timeframe options
export type Timeframe = '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '5y'

// Tab types
export interface Tab {
  id: string
  label: string
  icon?: React.ReactNode
}
