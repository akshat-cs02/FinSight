import api from './api'
import type { StockQuote } from './stockService'

export interface MarketIndex {
  symbol: string
  name: string
  price: number
  change: number
  change_percent: number
}

export type MarketKey = 'ALL' | 'US' | 'INDIA' | 'CRYPTO' | 'FOREX' | 'COMMODITIES'

export interface ExchangeStatus {
  key?: MarketKey
  name: string
  is_open: boolean
  status: 'OPEN' | 'CLOSED'
  local_time: string
  next_open?: string          // ISO timestamp of next open (when closed)
  next_open_local?: string    // e.g. "Mon 09:15"
}

export interface MarketStatus {
  is_open: boolean
  status: 'OPEN' | 'CLOSED'
  markets?: ExchangeStatus[]
  next_open?: string | null   // soonest open across markets when all closed
  timestamp: string
}

export const dashboardService = {
  getMarketSummary: () =>
    api.get<{ indices: MarketIndex[]; timestamp: string }>('/market/summary').then((r) => r.data),

  getMarketStatus: () =>
    api.get<MarketStatus>('/market/status').then((r) => r.data),

  getTrending: (market: MarketKey = 'ALL') =>
    api.get<{ stocks: StockQuote[] }>('/market/trending', { params: { market } }).then((r) => r.data.stocks),

  getGainers: (limit = 5, market: MarketKey = 'ALL') =>
    api.get<{ stocks: StockQuote[] }>('/market/gainers', { params: { limit, market } }).then((r) => r.data.stocks),

  getLosers: (limit = 5, market: MarketKey = 'ALL') =>
    api.get<{ stocks: StockQuote[] }>('/market/losers', { params: { limit, market } }).then((r) => r.data.stocks),
}
