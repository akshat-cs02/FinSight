import api from './api'

export interface IntradaySignal {
  id: number
  symbol: string
  strategy: string
  signal: 'BUY' | 'SELL' | 'HOLD'
  entry: number
  sl: number
  tp: number
  confidence: number
  timeframe: string
  kill_zone: string | null
  htf_bias: string | null
  generated_at: string
  outcome: 'PENDING' | 'TP_HIT' | 'SL_HIT' | 'EXPIRED'
  pnl_r: number | null
}

export interface DailyPnl {
  date: string
  pnl: number
  wins: number
  losses: number
  cumulative: number
}

export interface WinRateTrend {
  date: string
  win_rate: number
}

export interface PerformanceStats {
  total_signals: number
  tp_hit: number
  sl_hit: number
  expired: number
  win_rate: number
  avg_pnl_r: number
  daily_pnl: DailyPnl[]
  win_rate_trend: WinRateTrend[]
}

export interface TermSignal {
  signal: 'BUY' | 'SELL' | 'AVOID'
  confidence: number
  reason: string
  timeframe: string
  target_price: number | null
  stop_loss: number | null
  rsi?: number
  ema21?: number
  ema55?: number
  fundamentals?: Record<string, number | null>
}

export interface StockTermSignals {
  short: TermSignal
  mid: TermSignal
  long: TermSignal
}

export interface BreakoutCandidate {
  symbol: string
  price: number
  change_percent: number
  high_52w: number
  technical_score: number
  ai_score: number
  reason: string
  all_reasons: string[]
}

// ─── Consensus types ──────────────────────────────────────────────────────────
export type MasterSignal = 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL'

export interface ConsensusComponent {
  label: string
  signal: string       // BUY | SELL | NEUTRAL
  confidence: number
  weight: number       // 0-1
  weight_pct: number   // 0-100
  score: number        // -1 to +1
  contribution: number // -40 to +40 (score × weight × 100)
}

export interface ConsensusResult {
  symbol: string
  master_signal: MasterSignal
  master_score: number   // -100 to +100
  consensus_pct: number  // 0-100
  win_prob: number       // 0-1 — win-probability estimate used for sizing
  position_size_pct: number  // 0-5 — half-Kelly fraction, capped at 5% bankroll
  position_note: string      // human-readable hint ("Strong edge", "No edge", …)
  components: {
    ai:           ConsensusComponent
    ict:          ConsensusComponent
    technical:    ConsensusComponent
    fundamentals: ConsensusComponent
    liquidity:    ConsensusComponent
  }
  computed_at: string
}

const signalService = {
  async getIntraday(): Promise<IntradaySignal[]> {
    const res = await api.get('/signals/intraday')
    return res.data.signals ?? []
  },

  async getIntradayForSymbol(symbol: string): Promise<IntradaySignal | null> {
    const res = await api.get(`/signals/intraday/${symbol}`)
    if (res.data.signal === 'HOLD') return null
    return res.data
  },

  async getActivity(limit = 20): Promise<{ pending: IntradaySignal[]; resolved: IntradaySignal[] }> {
    const res = await api.get('/signals/activity', { params: { limit } })
    return { pending: res.data.pending ?? [], resolved: res.data.resolved ?? [] }
  },

  async getPerformance(days: 7 | 30 | 90 = 7): Promise<PerformanceStats> {
    const res = await api.get('/signals/performance', { params: { days } })
    return res.data
  },

  async getStockTerms(symbol: string): Promise<StockTermSignals> {
    const res = await api.get(`/signals/stock/${symbol}/terms`)
    return res.data
  },

  async getBreakouts(): Promise<BreakoutCandidate[]> {
    const res = await api.get('/signals/breakouts')
    return res.data.candidates ?? []
  },

  async getConsensus(symbol: string): Promise<ConsensusResult> {
    const res = await api.get(`/signals/consensus/${symbol}`)
    return res.data
  },
}

export default signalService
