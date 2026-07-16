/**
 * In-memory prediction cache with 5-minute TTL.
 *
 * Prevents multiple components on different pages (AIOutlook on Dashboard,
 * PredictionCard on StockDetails, Predictions page) from all calling
 * GET /api/prediction/{symbol} simultaneously and creating duplicate DB rows.
 *
 * Usage:
 *   import { predCache } from '@/utils/predictionCache'
 *   const cached = predCache.get('AAPL')
 *   if (!cached) { const data = await api.get(...); predCache.set('AAPL', data) }
 */

import { Prediction } from '@/services/predictionService'

const TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CacheEntry {
  data: Prediction
  expiresAt: number
}

class PredictionCache {
  private store = new Map<string, CacheEntry>()

  get(symbol: string): Prediction | null {
    const entry = this.store.get(symbol.toUpperCase())
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.store.delete(symbol.toUpperCase())
      return null
    }
    return entry.data
  }

  set(symbol: string, data: Prediction): void {
    this.store.set(symbol.toUpperCase(), {
      data,
      expiresAt: Date.now() + TTL_MS,
    })
  }

  /** Force-expire a symbol (e.g. after manual retrain) */
  invalidate(symbol: string): void {
    this.store.delete(symbol.toUpperCase())
  }

  invalidateAll(): void {
    this.store.clear()
  }
}

export const predCache = new PredictionCache()
