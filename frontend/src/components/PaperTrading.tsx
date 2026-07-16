import React, { useEffect, useState, useCallback } from 'react'
import { TrendingUp, TrendingDown, Plus, Trash2, DollarSign, RefreshCw } from 'lucide-react'
import api from '@/services/api'
import { formatPrice } from '@/utils/currency'
import { formatLocalDateTime } from '@/utils/timezone'

const STORAGE_KEY = 'finsight_paper_portfolio'
const DEFAULT_CAPITAL = 10_000

interface PaperTrade {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  strategy: string
  entry: number
  sl: number
  tp: number
  qty: number        // units (1 share / 0.001 BTC / etc.)
  openedAt: string   // ISO string
  status: 'open' | 'closed'
  closePrice?: number
  closedAt?: string
  closeReason?: string
  pnl?: number
}

interface PaperPortfolio {
  capital: number
  trades: PaperTrade[]
}

function loadPortfolio(): PaperPortfolio {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { capital: DEFAULT_CAPITAL, trades: [] }
}

function savePortfolio(p: PaperPortfolio) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

interface Props {
  symbol: string
  currency?: string
  suggestedEntry?: number
  suggestedSl?: number
  suggestedTp?: number
  suggestedStrategy?: string
}

export default function PaperTrading({
  symbol,
  currency = 'USD',
  suggestedEntry,
  suggestedSl,
  suggestedTp,
  suggestedStrategy = '',
}: Props) {
  const [portfolio, setPortfolio] = useState<PaperPortfolio>(loadPortfolio)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    side: 'BUY' as 'BUY' | 'SELL',
    entry: suggestedEntry?.toFixed(4) ?? '',
    sl:    suggestedSl?.toFixed(4) ?? '',
    tp:    suggestedTp?.toFixed(4) ?? '',
    risk:  '2',    // % of capital to risk
    strategy: suggestedStrategy,
  })
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)

  // Update form when suggestions change (e.g. user clicks a different ICT signal)
  useEffect(() => {
    setForm(f => ({
      ...f,
      entry:    suggestedEntry?.toFixed(4) ?? f.entry,
      sl:       suggestedSl?.toFixed(4) ?? f.sl,
      tp:       suggestedTp?.toFixed(4) ?? f.tp,
      strategy: suggestedStrategy || f.strategy,
    }))
  }, [suggestedEntry, suggestedSl, suggestedTp, suggestedStrategy])

  const persist = useCallback((p: PaperPortfolio) => {
    setPortfolio(p)
    savePortfolio(p)
  }, [])

  // Fetch current price for symbols with open trades + the active symbol
  const refreshPrices = useCallback(async () => {
    const openSymbols = Array.from(new Set([
      symbol,
      ...portfolio.trades.filter(t => t.status === 'open').map(t => t.symbol),
    ]))
    setRefreshing(true)
    const updated: Record<string, number> = {}
    await Promise.all(openSymbols.map(async (sym) => {
      try {
        const res = await api.get<{ price: number }>(`/stocks/${sym}/quote`)
        updated[sym] = res.data.price
      } catch {}
    }))
    setPrices(p => ({ ...p, ...updated }))
    setRefreshing(false)
  }, [symbol, portfolio.trades])

  useEffect(() => { refreshPrices() }, [symbol])

  // Auto-close trades that have hit SL or TP
  useEffect(() => {
    const openTrades = portfolio.trades.filter(t => t.status === 'open')
    if (!openTrades.length) return

    let changed = false
    const updated = portfolio.trades.map(trade => {
      if (trade.status !== 'open') return trade
      const price = prices[trade.symbol]
      if (!price) return trade

      const hitSl = trade.side === 'BUY' ? price <= trade.sl : price >= trade.sl
      const hitTp = trade.side === 'BUY' ? price >= trade.tp : price <= trade.tp

      if (hitSl || hitTp) {
        changed = true
        const closePrice = hitTp ? trade.tp : trade.sl
        const rawPnl = trade.side === 'BUY'
          ? (closePrice - trade.entry) * trade.qty
          : (trade.entry - closePrice) * trade.qty
        return {
          ...trade,
          status: 'closed' as const,
          closePrice,
          closedAt: new Date().toISOString(),
          closeReason: hitTp ? 'TP' : 'SL',
          pnl: rawPnl,
        }
      }
      return trade
    })

    if (changed) {
      const closedPnl = updated
        .filter(t => t.status === 'closed' && t.pnl !== undefined && !portfolio.trades.find(o => o.id === t.id && o.status === 'closed'))
        .reduce((sum, t) => sum + (t.pnl ?? 0), 0)
      persist({ capital: portfolio.capital + closedPnl, trades: updated })
    }
  }, [prices])

  const openTrades  = portfolio.trades.filter(t => t.status === 'open')
  const closedTrades = portfolio.trades.filter(t => t.status === 'closed').slice(-30).reverse()

  const totalUnrealizedPnl = openTrades.reduce((sum, t) => {
    const price = prices[t.symbol]
    if (!price) return sum
    const pnl = t.side === 'BUY'
      ? (price - t.entry) * t.qty
      : (t.entry - price) * t.qty
    return sum + pnl
  }, 0)

  const totalRealizedPnl = portfolio.trades
    .filter(t => t.status === 'closed')
    .reduce((sum, t) => sum + (t.pnl ?? 0), 0)

  const winCount  = closedTrades.filter(t => (t.pnl ?? 0) > 0).length
  const lossCount = closedTrades.filter(t => (t.pnl ?? 0) <= 0).length
  const winRate   = closedTrades.length ? ((winCount / closedTrades.length) * 100).toFixed(0) : '—'

  function openTrade(e: React.FormEvent) {
    e.preventDefault()
    const entry = parseFloat(form.entry)
    const sl    = parseFloat(form.sl)
    const tp    = parseFloat(form.tp)
    const riskPct = Math.min(Math.max(parseFloat(form.risk) || 2, 0.5), 10)

    if (!entry || !sl || !tp || sl === entry) return

    const riskAmount = portfolio.capital * (riskPct / 100)
    const slDist = Math.abs(entry - sl)
    const qty = riskAmount / slDist

    const trade: PaperTrade = {
      id:       uid(),
      symbol,
      side:     form.side,
      strategy: form.strategy,
      entry,
      sl,
      tp,
      qty:      parseFloat(qty.toFixed(6)),
      openedAt: new Date().toISOString(),
      status:   'open',
    }

    persist({ ...portfolio, trades: [...portfolio.trades, trade] })
    setShowForm(false)
  }

  function closeTrade(trade: PaperTrade) {
    const price = prices[trade.symbol] ?? trade.entry
    const pnl = trade.side === 'BUY'
      ? (price - trade.entry) * trade.qty
      : (trade.entry - price) * trade.qty
    const updatedTrades = portfolio.trades.map(t =>
      t.id === trade.id
        ? { ...t, status: 'closed' as const, closePrice: price, closedAt: new Date().toISOString(), closeReason: 'Manual', pnl }
        : t
    )
    persist({ capital: portfolio.capital + pnl, trades: updatedTrades })
  }

  function resetPortfolio() {
    persist({ capital: DEFAULT_CAPITAL, trades: [] })
    setPrices({})
    setResetConfirm(false)
  }

  return (
    <div className="glass-card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <DollarSign size={18} className="text-blue-400" /> Paper Trading
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">Demo capital — no real money. Test ICT signals accuracy.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshPrices} disabled={refreshing}
                  className="text-gray-400 hover:text-white disabled:opacity-50" title="Refresh prices">
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowForm(!showForm)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-xs">
            <Plus size={13} /> Trade
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="bg-gray-700/60 rounded-lg p-3">
          <div className="text-xs text-gray-500">Capital</div>
          <div className="text-white font-bold">${portfolio.capital.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-gray-700/60 rounded-lg p-3">
          <div className="text-xs text-gray-500">Unrealized P&L</div>
          <div className={`font-bold ${totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totalUnrealizedPnl >= 0 ? '+' : ''}${totalUnrealizedPnl.toFixed(2)}
          </div>
        </div>
        <div className="bg-gray-700/60 rounded-lg p-3">
          <div className="text-xs text-gray-500">Realized P&L</div>
          <div className={`font-bold ${totalRealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totalRealizedPnl >= 0 ? '+' : ''}${totalRealizedPnl.toFixed(2)}
          </div>
        </div>
        <div className="bg-gray-700/60 rounded-lg p-3">
          <div className="text-xs text-gray-500">Win Rate</div>
          <div className="font-bold text-white">{winRate}{winRate !== '—' ? '%' : ''}</div>
          <div className="text-xs text-gray-600">{winCount}W / {lossCount}L</div>
        </div>
        <div className="bg-gray-700/60 rounded-lg p-3">
          <div className="text-xs text-gray-500">Open Trades</div>
          <div className="font-bold text-white">{openTrades.length}</div>
        </div>
      </div>

      {/* Trade entry form */}
      {showForm && (
        <form onSubmit={openTrade}
              className="bg-gray-700/50 border border-gray-600 rounded-xl p-4 space-y-3">
          <div className="text-sm font-semibold text-white">New Paper Trade — {symbol}</div>
          <div className="flex flex-wrap gap-3">
            {/* Side */}
            <div>
              <label className="text-xs text-gray-400 block mb-1">Direction</label>
              <div className="flex gap-1">
                {(['BUY', 'SELL'] as const).map(s => (
                  <button type="button" key={s} onClick={() => setForm(f => ({ ...f, side: s }))}
                          className={`px-3 py-1.5 text-xs rounded font-bold transition ${
                            form.side === s
                              ? s === 'BUY' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                              : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                          }`}>{s}</button>
                ))}
              </div>
            </div>
            {/* Entry */}
            <div>
              <label className="text-xs text-gray-400 block mb-1">Entry Price</label>
              <input type="number" step="any" required value={form.entry}
                     onChange={e => setForm(f => ({ ...f, entry: e.target.value }))}
                     className="bg-gray-600 border border-gray-500 rounded px-2 py-1.5 text-white text-xs w-28" />
            </div>
            {/* SL */}
            <div>
              <label className="text-xs text-gray-400 block mb-1">Stop Loss</label>
              <input type="number" step="any" required value={form.sl}
                     onChange={e => setForm(f => ({ ...f, sl: e.target.value }))}
                     className="bg-gray-600 border border-red-500/40 rounded px-2 py-1.5 text-red-300 text-xs w-28" />
            </div>
            {/* TP */}
            <div>
              <label className="text-xs text-gray-400 block mb-1">Take Profit</label>
              <input type="number" step="any" required value={form.tp}
                     onChange={e => setForm(f => ({ ...f, tp: e.target.value }))}
                     className="bg-gray-600 border border-emerald-500/40 rounded px-2 py-1.5 text-emerald-300 text-xs w-28" />
            </div>
            {/* Risk % */}
            <div>
              <label className="text-xs text-gray-400 block mb-1">Risk %</label>
              <input type="number" step="0.5" min="0.5" max="10" value={form.risk}
                     onChange={e => setForm(f => ({ ...f, risk: e.target.value }))}
                     className="bg-gray-600 border border-gray-500 rounded px-2 py-1.5 text-white text-xs w-16" />
            </div>
            {/* Strategy tag */}
            <div>
              <label className="text-xs text-gray-400 block mb-1">Strategy</label>
              <input type="text" value={form.strategy}
                     onChange={e => setForm(f => ({ ...f, strategy: e.target.value }))}
                     placeholder="e.g. BOS_FVG"
                     className="bg-gray-600 border border-gray-500 rounded px-2 py-1.5 text-white text-xs w-28" />
            </div>
          </div>
          {/* R:R preview */}
          {form.entry && form.sl && form.tp && parseFloat(form.sl) !== parseFloat(form.entry) && (
            <div className="text-xs text-gray-400">
              R:R{' '}
              <span className="text-white font-bold">
                1:{(Math.abs(parseFloat(form.tp) - parseFloat(form.entry)) / Math.abs(parseFloat(form.sl) - parseFloat(form.entry))).toFixed(2)}
              </span>
              {' · '}Risk amount:{' '}
              <span className="text-red-300 font-bold">
                ${(portfolio.capital * (parseFloat(form.risk) / 100)).toFixed(2)}
              </span>
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit"
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-white text-xs font-semibold">
              Open Trade
            </button>
            <button type="button" onClick={() => setShowForm(false)}
                    className="px-4 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-gray-300 text-xs">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Open trades */}
      {openTrades.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-400 mb-2">Open Positions</div>
          <div className="space-y-2">
            {openTrades.map(t => {
              const currentPrice = prices[t.symbol]
              const unrealizedPnl = currentPrice
                ? t.side === 'BUY'
                  ? (currentPrice - t.entry) * t.qty
                  : (t.entry - currentPrice) * t.qty
                : null
              const pnlPct = currentPrice
                ? ((currentPrice - t.entry) / t.entry * 100 * (t.side === 'BUY' ? 1 : -1))
                : null
              const slDistPct = Math.abs(t.sl - t.entry) / t.entry * 100
              const tpDistPct = Math.abs(t.tp - t.entry) / t.entry * 100
              const rr = slDistPct > 0 ? (tpDistPct / slDistPct) : 0

              return (
                <div key={t.id} className={`rounded-xl border p-3 ${
                  t.side === 'BUY' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                          t.side === 'BUY' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                        }`}>{t.side}</span>
                        <span className="text-white font-semibold text-sm">{t.symbol}</span>
                        {t.strategy && <span className="text-xs text-gray-500">{t.strategy}</span>}
                        <span className="text-xs text-gray-600">{formatLocalDateTime(t.openedAt)}</span>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs">
                        <div><span className="text-gray-500">Entry </span><span className="text-blue-300">{formatPrice(t.entry, currency)}</span></div>
                        <div><span className="text-gray-500">SL </span><span className="text-red-400">{formatPrice(t.sl, currency)}</span></div>
                        <div><span className="text-gray-500">TP </span><span className="text-emerald-400">{formatPrice(t.tp, currency)}</span></div>
                        <div><span className="text-gray-500">R:R </span><span className="text-white">1:{rr.toFixed(2)}</span></div>
                        <div><span className="text-gray-500">Qty </span><span className="text-white">{t.qty}</span></div>
                        {currentPrice && (
                          <div><span className="text-gray-500">Now </span><span className="text-white">{formatPrice(currentPrice, currency)}</span></div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {unrealizedPnl !== null && (
                        <div className="text-right">
                          <div className={`text-sm font-bold ${unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toFixed(2)}
                          </div>
                          <div className={`text-xs ${(pnlPct ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {(pnlPct ?? 0) >= 0 ? '+' : ''}{(pnlPct ?? 0).toFixed(2)}%
                          </div>
                        </div>
                      )}
                      <button onClick={() => closeTrade(t)} title="Close trade at market"
                              className="p-1.5 bg-gray-600 hover:bg-gray-500 rounded text-gray-300">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Trade history */}
      {closedTrades.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-400 mb-2">Trade History (last {closedTrades.length})</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-gray-300">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left pb-1.5 px-1">Symbol</th>
                  <th className="text-left pb-1.5 px-1">Side</th>
                  <th className="text-left pb-1.5 px-1">Strategy</th>
                  <th className="text-right pb-1.5 px-1">Entry</th>
                  <th className="text-right pb-1.5 px-1">Close</th>
                  <th className="text-right pb-1.5 px-1">P&L</th>
                  <th className="text-left pb-1.5 px-1">Reason</th>
                  <th className="text-left pb-1.5 px-1">Closed</th>
                </tr>
              </thead>
              <tbody>
                {closedTrades.map(t => (
                  <tr key={t.id} className="border-b border-gray-700/30 hover:bg-gray-700/20">
                    <td className="py-1.5 px-1 font-medium text-white">{t.symbol}</td>
                    <td className="py-1.5 px-1">
                      <span className={`px-1 rounded font-bold ${t.side === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>{t.side}</span>
                    </td>
                    <td className="py-1.5 px-1 text-gray-500">{t.strategy || '—'}</td>
                    <td className="py-1.5 px-1 text-right">{formatPrice(t.entry, currency)}</td>
                    <td className="py-1.5 px-1 text-right">{t.closePrice ? formatPrice(t.closePrice, currency) : '—'}</td>
                    <td className={`py-1.5 px-1 text-right font-bold ${(t.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(t.pnl ?? 0) >= 0 ? '+' : ''}${(t.pnl ?? 0).toFixed(2)}
                    </td>
                    <td className="py-1.5 px-1">
                      <span className={`px-1 text-xs rounded ${
                        t.closeReason === 'TP'     ? 'text-emerald-500' :
                        t.closeReason === 'SL'     ? 'text-red-500' :
                        t.closeReason === 'Manual' ? 'text-blue-400' :
                        'text-gray-500'
                      }`}>{t.closeReason}</span>
                    </td>
                    <td className="py-1.5 px-1 text-gray-600">{t.closedAt ? formatLocalDateTime(t.closedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reset */}
      <div className="flex items-center gap-2 pt-1 border-t border-gray-700">
        {!resetConfirm ? (
          <button onClick={() => setResetConfirm(true)}
                  className="text-xs text-gray-600 hover:text-red-400 transition">
            Reset portfolio
          </button>
        ) : (
          <>
            <span className="text-xs text-red-400">Reset to ${DEFAULT_CAPITAL.toLocaleString()}?</span>
            <button onClick={resetPortfolio}
                    className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-white">Yes, reset</button>
            <button onClick={() => setResetConfirm(false)}
                    className="text-xs px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-gray-300">Cancel</button>
          </>
        )}
      </div>
    </div>
  )
}
