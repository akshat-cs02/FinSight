import React, { useEffect, useState } from 'react'
import { Star, X, Plus, TrendingUp, TrendingDown, Bell, Search } from 'lucide-react'
import watchlistService, { WatchlistItem } from '@/services/watchlistService'
import { IntradaySignal } from '@/services/signalService'
import toast from 'react-hot-toast'

interface Props {
  onSearch?: (symbol: string) => void
}

export default function WatchlistPanel({ onSearch }: Props) {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [alerts, setAlerts] = useState<IntradaySignal[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try {
      const [wl, al] = await Promise.all([watchlistService.get(), watchlistService.getAlerts()])
      setItems(wl)
      setAlerts(al)
    } catch {
      // silently ignore — user may not be logged in
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const handleAdd = async () => {
    const sym = query.trim().toUpperCase()
    if (!sym) return
    try {
      await watchlistService.add(sym)
      setQuery('')
      toast.success(`${sym} added to watchlist`)
      refresh()
    } catch {
      toast.error('Could not add symbol — are you logged in?')
    }
  }

  const handleRemove = async (symbol: string) => {
    try {
      await watchlistService.remove(symbol)
      setItems((prev) => prev.filter((i) => i.symbol !== symbol))
      toast.success(`${symbol} removed`)
    } catch {
      toast.error('Failed to remove')
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Star size={18} className="text-yellow-400" />
        <h2 className="text-lg font-semibold text-white">My Watchlist</h2>
        {items.length > 0 && (
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{items.length}</span>
        )}
      </div>

      {/* Alert banners */}
      {alerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {alerts.map((a) => (
            <div
              key={a.id}
              className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                a.signal === 'BUY' ? 'bg-emerald-950/50 border border-emerald-800/50' : 'bg-red-950/50 border border-red-800/50'
              }`}
            >
              <Bell size={12} className={a.signal === 'BUY' ? 'text-emerald-400' : 'text-red-400'} />
              <span className="text-white font-bold">{a.symbol}</span>
              <span className={a.signal === 'BUY' ? 'text-emerald-400' : 'text-red-400'}>
                {a.signal} signal
              </span>
              <span className="text-gray-400">({a.strategy})</span>
              <span className="ml-auto text-gray-400">Confidence {a.confidence.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Add input */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
          <Search size={13} className="text-gray-500 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Add symbol (e.g. AAPL)"
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={!query.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg px-3 py-2 transition-colors"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Watchlist chips */}
      {loading && items.length === 0 && (
        <div className="text-xs text-gray-500 text-center py-4">Loading...</div>
      )}

      {!loading && items.length === 0 && (
        <div className="text-xs text-gray-500 text-center py-4">
          Your watchlist is empty — add symbols above.
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <div
              key={item.symbol}
              className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-2.5 py-1.5 text-sm group"
            >
              <span
                className="text-white font-medium cursor-pointer hover:text-indigo-400 transition-colors"
                onClick={() => onSearch?.(item.symbol)}
              >
                {item.symbol}
              </span>
              {item.price !== null && (
                <span className="text-xs text-gray-400">{item.price}</span>
              )}
              {item.change_percent !== null && (
                <span className={`text-xs font-medium ${item.change_percent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {item.change_percent >= 0 ? '+' : ''}{item.change_percent.toFixed(2)}%
                </span>
              )}
              <button
                onClick={() => handleRemove(item.symbol)}
                className="text-gray-600 hover:text-red-400 transition-colors ml-0.5"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
