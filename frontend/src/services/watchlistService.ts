import api from './api'
import { IntradaySignal } from './signalService'

export interface WatchlistItem {
  id: number
  symbol: string
  added_at: string
  notes: string | null
  price: number | null
  change_percent: number | null
}

const watchlistService = {
  async get(): Promise<WatchlistItem[]> {
    const res = await api.get('/watchlist')
    return res.data.watchlist ?? []
  },

  async add(symbol: string, notes?: string): Promise<WatchlistItem> {
    const res = await api.post('/watchlist', { symbol, notes: notes ?? null })
    return res.data
  },

  async remove(symbol: string): Promise<void> {
    await api.delete(`/watchlist/${symbol}`)
  },

  async getAlerts(): Promise<IntradaySignal[]> {
    const res = await api.get('/watchlist/alerts')
    return res.data.alerts ?? []
  },
}

export default watchlistService
