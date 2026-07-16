import api from './api'

export interface ForecastPoint {
  day: number
  date: string
  price: number
}

export type HorizonKey = 'intraday' | 'short' | 'mid' | 'long'
export type HorizonDirection = 'up' | 'down' | 'neutral'

export interface HorizonPrediction {
  label: string
  timeframe: string
  direction: HorizonDirection
  confidence: number
  predicted_price: number | null
  entry_price: number | null
  stop_loss: number | null
  take_profit: number | null
  risk_reward_ratio: number | null
  rationale: string
  source: string
  fundamentals?: Record<string, number | null>
}

export interface MarketRegime {
  state: 'trending' | 'ranging' | 'volatile' | 'unknown'
  atr_ratio: number | null
  atr14?: number | null
  position_sizing: 'normal' | 'reduced'
}

export interface HorizonOverall {
  master_signal: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL'
  score: number
}

export interface MultiHorizon {
  symbol: string
  current_price: number | null
  horizons: Record<HorizonKey, HorizonPrediction>
  overall: HorizonOverall
  regime: MarketRegime
  generated_at: string
}

export interface Prediction {
  id?: number
  symbol: string
  current_price: number
  predicted_price: number
  change_percent: number
  confidence: number
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  signal: 'BUY' | 'SELL' | 'HOLD'
  rsi: number | null
  atr: number | null
  entry_price: number | null
  stop_loss: number | null
  take_profit: number | null
  risk_reward_ratio: number | null
  score_breakdown: Record<string, any>
  model_predictions: Record<string, number>
  models_used: string[]
  forecast_7day: ForecastPoint[]
  shap_values?: Record<string, number>
  currency?: string
  stale_models?: string[]
  model_predictions_raw?: Record<string, number>
  generated_at: string
  // Multi-horizon outlook (added alongside the flat AI fields).
  horizons?: Record<HorizonKey, HorizonPrediction> | null
  overall?: HorizonOverall
  regime?: MarketRegime
}

export interface PredictionHistoryRow {
  id: number
  current_price: number
  predicted_price: number
  change_percent: number
  confidence: number
  signal: string
  trend: string
  models_used: string[] | null
  created_at: string
}

export interface ModelStatus {
  symbol: string
  lstm: boolean
  xgb: boolean
}

export const predictionService = {
  getPrediction: (symbol: string) =>
    api.get<Prediction>(`/prediction/${symbol}`).then((r) => r.data),

  // Multi-horizon outlook only (no LSTM/XGB inference) — fast, 3-min cached.
  getHorizons: (symbol: string) =>
    api.get<MultiHorizon>(`/prediction/${symbol}/horizons`).then((r) => r.data),

  // Single horizon block. `horizon` = intraday | short | mid | long.
  getHorizon: (symbol: string, horizon: HorizonKey) =>
    api.get<HorizonPrediction & { symbol: string; horizon: HorizonKey; regime: MarketRegime; generated_at: string }>(
      `/prediction/${symbol}/horizons`, { params: { horizon } }
    ).then((r) => r.data),

  getHistory: (symbol: string, limit = 20) =>
    api.get<{ symbol: string; count: number; history: PredictionHistoryRow[] }>(
      `/prediction/${symbol}/history`,
      { params: { limit } }
    ).then((r) => r.data),

  listModels: () =>
    api.get<{ supported_symbols: string[]; models: ModelStatus[] }>('/prediction/').then((r) => r.data),

  trainModel: (symbol: string, lstm_epochs = 8) =>
    api.post('/prediction/train', { symbol, lstm_epochs }).then((r) => r.data),
}
