import api from './api'
import { mapToTradingView } from '@/components/charts/TradingViewWidget'

export interface StockQuote {
  symbol: string
  name: string
  price: number
  change: number
  change_percent: number
  open: number
  high: number
  low: number
  previous_close: number
  volume: number
  market_cap?: number
  pe_ratio?: number
  dividend_yield?: number
  fifty_two_week_high?: number
  fifty_two_week_low?: number
  currency?: string
  exchange?: string
  timestamp: string
}

export interface HistoryPoint {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface HistoryResponse {
  symbol: string
  period: string
  interval: string
  currency?: string
  data: HistoryPoint[]
}

export interface IndicatorPoint { date: string; value: number }
export interface IndicatorsResponse {
  symbol: string
  period: string
  current_price: number
  signal: 'BUY' | 'SELL' | 'HOLD'
  latest: Record<string, number | null>
  series: Record<string, IndicatorPoint[]>
}

export interface SearchResult {
  symbol: string
  /** TradingView-formatted symbol (e.g. "NSE:RELIANCE"). When set, the chart uses
   *  this directly so it works for symbols yfinance can't resolve (indices, etc). */
  tv_symbol?: string
  name?: string
  exchange?: string
  type?: string
}

export const stockService = {
  getQuote: (symbol: string) =>
    api.get<StockQuote>(`/stocks/${symbol}`).then((r) => r.data),

  getHistory: (symbol: string, period = '1y') =>
    api.get<HistoryResponse>(`/stocks/${symbol}/history`, { params: { period } }).then((r) => r.data),

  getIndicators: (symbol: string, period = '6mo') =>
    api.get<IndicatorsResponse>(`/stocks/${symbol}/indicators`, { params: { period } }).then((r) => r.data),

  search: (q: string) =>
    api.get<{ query: string; results: SearchResult[] }>(`/stocks/search`, { params: { q } }).then((r) => r.data.results),
}

/**
 * Full TradingView chart URL for a symbol (opens the standalone chart in a new
 * tab). `interval` is a TradingView code: '1','5','15','60','D','W','M'.
 */
export function getTradingViewUrl(symbol: string, interval = 'D'): string {
  const tv = mapToTradingView(symbol)
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tv)}&interval=${interval}`
}
