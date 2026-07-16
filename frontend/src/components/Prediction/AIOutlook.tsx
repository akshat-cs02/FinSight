import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brain, ArrowUp, ArrowDown } from 'lucide-react'
import { predictionService, Prediction } from '@/services/predictionService'
import { formatPrice, guessCurrency } from '@/utils/currency'
import { predCache } from '@/utils/predictionCache'
import SignalBadge from './SignalBadge'

/**
 * AI Market Outlook: fetches predictions for symbols that already have trained models.
 * Untrained symbols are skipped (no auto-train cascade on dashboard load).
 */
export default function AIOutlook() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Prediction[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const status = await predictionService.listModels()
        const trained = status.models.filter((m) => m.lstm || m.xgb).map((m) => m.symbol)
        if (trained.length === 0) {
          setItems([])
          return
        }
        const results = await Promise.allSettled(
          trained.slice(0, 6).map(async (s) => {
            // Use cache if fresh — avoids DB writes for repeated dashboard loads
            const cached = predCache.get(s)
            if (cached) return cached
            const data = await predictionService.getPrediction(s)
            predCache.set(s, data)
            return data
          })
        )
        const ok = results
          .filter((r): r is PromiseFulfilledResult<Prediction> => r.status === 'fulfilled')
          .map((r) => r.value)
        // Sort by confidence × abs(change) — "high conviction" moves first
        ok.sort((a, b) => (b.confidence * Math.abs(b.change_percent)) - (a.confidence * Math.abs(a.change_percent)))
        setItems(ok)
      } catch (e: any) {
        setErr(e.response?.data?.detail || e.message)
      }
    })()
  }, [])

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Brain size={18} className="text-blue-400" /> AI Market Outlook
        </h2>
        <button onClick={() => navigate('/predictions')} className="text-xs text-blue-400 hover:text-blue-300">
          Full model panel →
        </button>
      </div>

      {err && <div className="text-red-300 text-sm">{err}</div>}
      {items === null && !err && <div className="text-gray-500 text-sm animate-pulse">Loading AI predictions…</div>}
      {items && items.length === 0 && (
        <div className="text-gray-500 text-sm py-4 text-center">
          No trained models yet. Visit any stock page — it will train automatically on first request.
        </div>
      )}

      {items && items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((p) => {
            const up = p.change_percent >= 0
            return (
              <button
                key={p.symbol}
                onClick={() => navigate(`/stocks/${p.symbol}`)}
                className="text-left bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg p-4 transition"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-bold text-white">{p.symbol}</div>
                    <div className="text-xs text-gray-400">
                      {formatPrice(p.current_price, p.currency || guessCurrency(p.symbol))} → {formatPrice(p.predicted_price, p.currency || guessCurrency(p.symbol))}
                    </div>
                  </div>
                  <SignalBadge signal={p.signal} size="sm" />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className={`flex items-center gap-1 font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                    {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                    {Math.abs(p.change_percent).toFixed(2)}%
                  </span>
                  <span className="text-xs text-gray-400">conf {p.confidence.toFixed(0)}%</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
