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

export interface ConfidenceInterval {
  lower: number
  upper: number
  level: number
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
  model_version?: string
  confidence_interval?: [number, number, number] | { lower: number; upper: number; level: number }
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

export interface BacktestMetrics {
  rmse: number
  mae: number
  mape: number
  r2: number
  directional_accuracy: number
  signal_accuracy: number
  strategy_return: number
  benchmark_return: number
  max_drawdown: number
  win_rate: number
}

export interface BaselineMetrics {
  rmse: number
  mae: number
  mape: number
  r2: number
}

export interface EquityPoint {
  date: string
  strategy: number
  benchmark: number
}

export interface PredictedVsActual {
  date: string
  predicted: number
  actual: number
}

export interface SignalEntry {
  date: string
  signal: string
  confidence: number
}

export interface BacktestSummary {
  total_trades: number
  winning_trades: number
  losing_trades: number
  total_return_pct: number
  benchmark_return_pct: number
  max_drawdown_pct: number
  sharpe_ratio: number
  calmar_ratio: number
}

export interface BacktestResult {
  symbol: string
  period: string
  status: string
  cached: boolean
  generated_at: string
  model: BacktestMetrics
  baselines: Record<string, BaselineMetrics>
  equity_curve: EquityPoint[]
  predictions_vs_actuals: PredictedVsActual[]
  signals: SignalEntry[]
  summary: BacktestSummary
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

  getBacktest: (symbol: string, period = '2y', walkForwardWindows = 5, retrain = false) =>
    api.get<BacktestResult>(`/backtest/ml/${symbol}`, {
      params: { period, walk_forward_windows: walkForwardWindows, retrain },
    }).then((r) => r.data),
}
