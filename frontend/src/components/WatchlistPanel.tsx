import React, { useEffect, useState } from 'react'
import { Star, X, Plus, Bell, Search } from 'lucide-react'
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
    <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Star size={18} className="text-gold" />
        <h2 className="text-lg font-semibold text-[var(--text)]">My Watchlist</h2>
        {items.length > 0 && (              <span className="text-xs text-[var(--dim)] bg-[var(--raised)] px-2 py-0.5 rounded-full">{items.length}</span>
        )}
      </div>

      {alerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {alerts.map((a) => (
            <div
              key={a.id}
              className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                a.signal === 'BUY' ? 'bg-emerald-950/30 border border-emerald-800/30' : 'bg-red-950/30 border border-red-800/30'
              }`}
            >
              <Bell size={12} className={a.signal === 'BUY' ? 'text-emerald-400' : 'text-red-400'} />
              <span className="text-white font-bold">{a.symbol}</span>
              <span className={a.signal === 'BUY' ? 'text-emerald-400' : 'text-red-400'}>
                {a.signal} signal
              </span>
              <span className="text-white/40">({a.strategy})</span>
              <span className="ml-auto text-white/40">Confidence {a.confidence.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2 bg-[var(--raised)] rounded-lg px-3 py-2">
          <Search size={13} className="text-[var(--faint)] shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Add symbol (e.g. AAPL)"
            className="flex-1 bg-transparent text-sm text-[var(--text)] placeholder-[var(--faint)] outline-none"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={!query.trim()}
          className="bg-gold hover:bg-gold-2 disabled:opacity-40 text-black rounded-lg px-3 py-2 transition-all duration-300 font-medium"
        >
          <Plus size={15} />
        </button>
      </div>

      {loading && items.length === 0 && (
        <div className="text-xs text-[var(--dim)] text-center py-4">Loading...</div>
      )}

      {!loading && items.length === 0 && (
        <div className="text-xs text-[var(--dim)] text-center py-4">
          Your watchlist is empty — add symbols above.
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <div
              key={item.symbol}
              className="flex items-center gap-1.5 bg-[var(--raised)] rounded-lg px-2.5 py-1.5 text-sm group"
            >
              <span
                className="text-[var(--text)] font-medium cursor-pointer hover:text-gold transition-all duration-300"
                onClick={() => onSearch?.(item.symbol)}
              >
                {item.symbol}
              </span>
              {item.price !== null && (
                <span className="text-xs text-[var(--dim)]">{item.price}</span>
              )}
              {item.change_percent !== null && (
                <span className={`text-xs font-medium ${item.change_percent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {item.change_percent >= 0 ? '+' : ''}{item.change_percent.toFixed(2)}%
                </span>
              )}
              <button
                onClick={() => handleRemove(item.symbol)}
                className="text-[var(--faint)] hover:text-red-400 transition-all duration-300 ml-0.5"
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
