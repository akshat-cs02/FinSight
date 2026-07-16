import { create } from 'zustand'
import { stockService, StockQuote, IndicatorsResponse } from '@/services/stockService'
import { newsService, NewsArticle } from '@/services/newsService'
import signalService, { ConsensusResult } from '@/services/signalService'

interface CacheEntry<T> {
  data: T
  fetchedAt: number
  loading: boolean
}

interface StockCacheState {
  quotes: Record<string, CacheEntry<StockQuote>>
  indicators: Record<string, CacheEntry<IndicatorsResponse>>
  news: Record<string, CacheEntry<NewsArticle[]>>
  consensus: Record<string, CacheEntry<ConsensusResult>>

  getQuote: (symbol: string) => Promise<StockQuote>
  getIndicators: (symbol: string, period?: string) => Promise<IndicatorsResponse>
  getNews: (symbol: string, limit?: number) => Promise<NewsArticle[]>
  getConsensus: (symbol: string) => Promise<ConsensusResult>

  prefetchQuote: (symbol: string) => Promise<StockQuote>
  refreshIndicators: (symbol: string, period?: string) => Promise<IndicatorsResponse>
  refreshNews: (symbol: string, limit?: number) => Promise<NewsArticle[]>
  refreshConsensus: (symbol: string) => Promise<ConsensusResult>

  invalidate: (symbol: string) => void
}

const QUOTE_TTL = 30_000         // 30 s — quote refreshes fast
const INDICATORS_TTL = 5 * 60_000  // 5 min — indicators are stable
const NEWS_TTL = 5 * 60_000        // 5 min
const CONSENSUS_TTL = 5 * 60_000   // 5 min

function isFresh<T>(entry: CacheEntry<T> | undefined, ttl: number): boolean {
  if (!entry) return false
  if (entry.loading) return false
  return Date.now() - entry.fetchedAt < ttl
}

export const useStockCache = create<StockCacheState>((set, get) => ({
  quotes: {},
  indicators: {},
  news: {},
  consensus: {},

  getQuote: async (symbol) => {
    const sym = symbol.toUpperCase()
    const cached = get().quotes[sym]
    if (isFresh(cached, QUOTE_TTL)) {
      // Kick off a background refresh but return immediately
      get().prefetchQuote(sym)
      return cached!.data
    }
    return get().prefetchQuote(sym)
  },

  getIndicators: async (symbol, period = '6mo') => {
    const sym = symbol.toUpperCase()
    const cached = get().indicators[sym]
    if (isFresh(cached, INDICATORS_TTL)) return cached!.data
    return get()._fetchIndicators(sym, period)
  },

  getNews: async (symbol, limit = 6) => {
    const sym = symbol.toUpperCase()
    const cached = get().news[sym]
    if (isFresh(cached, NEWS_TTL)) return cached!.data
    return get()._fetchNews(sym, limit)
  },

  getConsensus: async (symbol) => {
    const sym = symbol.toUpperCase()
    const cached = get().consensus[sym]
    if (isFresh(cached, CONSENSUS_TTL)) return cached!.data
    return get()._fetchConsensus(sym)
  },

  prefetchQuote: (symbol) => {
    const sym = symbol.toUpperCase()
    return get()._fetchQuote(sym)
  },

  refreshIndicators: (symbol, period = '6mo') => {
    const sym = symbol.toUpperCase()
    return get()._fetchIndicators(sym, period)
  },

  refreshNews: (symbol, limit = 6) => {
    const sym = symbol.toUpperCase()
    return get()._fetchNews(sym, limit)
  },

  refreshConsensus: (symbol) => {
    const sym = symbol.toUpperCase()
    return get()._fetchConsensus(sym)
  },

  invalidate: (symbol) => {
    const sym = symbol.toUpperCase()
    set((s) => ({
      quotes: { ...s.quotes, [sym]: undefined as any },
      indicators: { ...s.indicators, [sym]: undefined as any },
      news: { ...s.news, [sym]: undefined as any },
      consensus: { ...s.consensus, [sym]: undefined as any },
    }))
  },

  _fetchQuote: async (symbol: string) => {
    const cur = get().quotes[symbol]
    if (cur?.loading) return cur.data
    set((s) => ({
      quotes: {
        ...s.quotes,
        [symbol]: { data: cur?.data ?? ({} as StockQuote), fetchedAt: cur?.fetchedAt ?? 0, loading: true },
      },
    }))
    try {
      const data = await stockService.getQuote(symbol)
      set((s) => ({
        quotes: { ...s.quotes, [symbol]: { data, fetchedAt: Date.now(), loading: false } },
      }))
      return data
    } catch (e) {
      set((s) => ({
        quotes: {
          ...s.quotes,
          [symbol]: { data: (cur?.data ?? ({} as StockQuote)) as StockQuote, fetchedAt: cur?.fetchedAt ?? 0, loading: false },
        },
      }))
      throw e
    }
  },

  _fetchIndicators: async (symbol: string, period = '6mo') => {
    const cur = get().indicators[symbol]
    set((s) => ({
      indicators: {
        ...s.indicators,
        [symbol]: { data: cur?.data ?? ({} as IndicatorsResponse), fetchedAt: cur?.fetchedAt ?? 0, loading: true },
      },
    }))
    try {
      const data = await stockService.getIndicators(symbol, period)
      set((s) => ({
        indicators: { ...s.indicators, [symbol]: { data, fetchedAt: Date.now(), loading: false } },
      }))
      return data
    } catch (e) {
      set((s) => ({
        indicators: {
          ...s.indicators,
          [symbol]: { data: (cur?.data ?? ({} as IndicatorsResponse)) as IndicatorsResponse, fetchedAt: cur?.fetchedAt ?? 0, loading: false },
        },
      }))
      throw e
    }
  },

  _fetchNews: async (symbol: string, limit = 6) => {
    const cur = get().news[symbol]
    set((s) => ({
      news: {
        ...s.news,
        [symbol]: { data: cur?.data ?? [], fetchedAt: cur?.fetchedAt ?? 0, loading: true },
      },
    }))
    try {
      const data = await newsService.getStockNews(symbol, limit)
      set((s) => ({
        news: { ...s.news, [symbol]: { data, fetchedAt: Date.now(), loading: false } },
      }))
      return data
    } catch (e) {
      set((s) => ({
        news: { ...s.news, [symbol]: { data: cur?.data ?? [], fetchedAt: cur?.fetchedAt ?? 0, loading: false } },
      }))
      throw e
    }
  },

  _fetchConsensus: async (symbol: string) => {
    const cur = get().consensus[symbol]
    set((s) => ({
      consensus: {
        ...s.consensus,
        [symbol]: { data: cur?.data ?? ({} as ConsensusResult), fetchedAt: cur?.fetchedAt ?? 0, loading: true },
      },
    }))
    try {
      const data = await signalService.getConsensus(symbol)
      set((s) => ({
        consensus: { ...s.consensus, [symbol]: { data, fetchedAt: Date.now(), loading: false } },
      }))
      return data
    } catch (e) {
      set((s) => ({
        consensus: {
          ...s.consensus,
          [symbol]: { data: (cur?.data ?? ({} as ConsensusResult)) as ConsensusResult, fetchedAt: cur?.fetchedAt ?? 0, loading: false },
        },
      }))
      throw e
    }
  },
}))

export function useQuote(symbol: string) {
  const entry = useStockCache((s) => s.quotes[symbol.toUpperCase()])
  return { data: entry?.data, loading: entry?.loading, fetchedAt: entry?.fetchedAt }
}

export function useIndicators(symbol: string) {
  const entry = useStockCache((s) => s.indicators[symbol.toUpperCase()])
  return { data: entry?.data, loading: entry?.loading, fetchedAt: entry?.fetchedAt }
}

export function useNews(symbol: string) {
  const entry = useStockCache((s) => s.news[symbol.toUpperCase()])
  return { data: entry?.data, loading: entry?.loading, fetchedAt: entry?.fetchedAt }
}

export function useConsensus(symbol: string) {
  const entry = useStockCache((s) => s.consensus[symbol.toUpperCase()])
  return { data: entry?.data, loading: entry?.loading, fetchedAt: entry?.fetchedAt }
}
