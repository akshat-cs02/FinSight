import { create } from 'zustand'
import { StockQuote, StockHistory, Prediction, NewsArticle, TechnicalIndicators } from '@/types'

interface MarketStore {
  // Stock data
  currentStock: StockQuote | null
  stockHistory: StockHistory | null
  prediction: Prediction | null
  technicalIndicators: TechnicalIndicators | null
  news: NewsArticle[]

  // UI state
  selectedSymbol: string
  selectedTimeframe: string
  isLoading: boolean
  error: string | null

  // Actions
  setCurrentStock: (stock: StockQuote | null) => void
  setStockHistory: (history: StockHistory | null) => void
  setPrediction: (prediction: Prediction | null) => void
  setTechnicalIndicators: (indicators: TechnicalIndicators | null) => void
  setNews: (news: NewsArticle[]) => void
  setSelectedSymbol: (symbol: string) => void
  setSelectedTimeframe: (timeframe: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useMarketStore = create<MarketStore>((set) => ({
  currentStock: null,
  stockHistory: null,
  prediction: null,
  technicalIndicators: null,
  news: [],
  selectedSymbol: 'AAPL',
  selectedTimeframe: '1y',
  isLoading: false,
  error: null,

  setCurrentStock: (stock: StockQuote | null) => set({ currentStock: stock }),
  setStockHistory: (history: StockHistory | null) => set({ stockHistory: history }),
  setPrediction: (prediction: Prediction | null) => set({ prediction }),
  setTechnicalIndicators: (indicators: TechnicalIndicators | null) =>
    set({ technicalIndicators: indicators }),
  setNews: (news: NewsArticle[]) => set({ news }),
  setSelectedSymbol: (symbol: string) => set({ selectedSymbol: symbol.toUpperCase() }),
  setSelectedTimeframe: (timeframe: string) => set({ selectedTimeframe: timeframe }),
  setLoading: (loading: boolean) => set({ isLoading: loading }),
  setError: (error: string | null) => set({ error }),
  reset: () =>
    set({
      currentStock: null,
      stockHistory: null,
      prediction: null,
      technicalIndicators: null,
      news: [],
      error: null,
    }),
}))
