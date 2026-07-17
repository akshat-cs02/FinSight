import React, { useEffect, useState } from 'react'
import { Plus, Trash2, Download, ChevronDown, ChevronRight } from 'lucide-react'
import { portfolioService, PortfolioSummary } from '@/services/portfolioService'
import PortfolioChart from '@/components/charts/PortfolioChart'
import TradingViewWidget from '@/components/charts/TradingViewWidget'
import PriceDisplay from '@/components/PriceDisplay'
import { formatPrice, guessCurrency } from '@/utils/currency'
import { API_URL } from '@/services/api'
import toast from 'react-hot-toast'

export default function PortfolioPage() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ symbol: '', quantity: '', purchase_price: '' })
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = () => {
    setErr(null)
    portfolioService.getSummary().then(setSummary).catch((e) => setErr(e.response?.data?.detail || e.message))
  }

  useEffect(() => { load() }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await portfolioService.addHolding({
        symbol: form.symbol.toUpperCase(),
        quantity: parseFloat(form.quantity),
        purchase_price: parseFloat(form.purchase_price),
      })
      toast.success(`Added ${form.symbol.toUpperCase()}`)
      setForm({ symbol: '', quantity: '', purchase_price: '' })
      setShowForm(false)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to add')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number, sym: string) => {
    if (!confirm(`Remove ${sym}?`)) return
    try {
      await portfolioService.deleteHolding(id)
      toast.success(`Removed ${sym}`)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to remove')
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 min-h-screen">
      <div className="flex justify-between items-center flex-wrap gap-3 animate-spring-in">
        <div>
          <h1 className="text-3xl font-bold text-white font-display">Portfolio</h1>
          <p className="text-gray-500 text-sm mt-0.5">Track your holdings and performance</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowForm(!showForm)}
                  className="btn-glow text-sm px-4 py-2">
            <Plus size={16} /> Add Holding
          </button>
          <a href={`${API_URL}/api/reports/portfolio/pdf`} target="_blank" rel="noopener"
             className="btn-ghost text-sm px-4 py-2">
            <Download size={16} /> PDF
          </a>
          <a href={`${API_URL}/api/reports/portfolio/csv`} target="_blank" rel="noopener"
             className="btn-ghost text-sm px-4 py-2">
            <Download size={16} /> CSV
          </a>
        </div>
      </div>

      {showForm && (
        <form onSubmit={add} className="card-accent-cyan p-4 flex flex-wrap gap-3 items-end animate-spring-up stagger-1">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Symbol</label>
            <input required value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                   placeholder="AAPL" className="input-glow w-32 uppercase" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Quantity</label>
            <input type="number" step="any" required value={form.quantity}
                   onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                   className="input-glow w-32" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Purchase Price</label>
            <input type="number" step="any" required value={form.purchase_price}
                   onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
                   className="input-glow w-32" />
          </div>
          <button disabled={busy} type="submit"
                  className="btn-glow text-sm px-4 py-2 disabled:opacity-50">
            {busy ? 'Adding…' : 'Save'}
          </button>
        </form>
      )}

      {err && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300">{err}</div>}
      {summary === null && !err && <div className="text-gray-500">Loading portfolio…</div>}

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-spring-up stagger-1">
            <div className="card-elevated p-5">
              <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">Total Invested</p>
              <PriceDisplay price={summary.total_invested} size="xl" color="default" />
            </div>
            <div className="card-elevated p-5">
              <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">Current Value</p>
              <PriceDisplay price={summary.total_value} size="xl" color="brand" animate />
            </div>
            <div className={`p-5 ${summary.total_gain_loss >= 0 ? 'card-accent-green' : 'card-accent-rose'}`}>
              <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">Total Gain/Loss</p>
              <PriceDisplay price={summary.total_gain_loss} size="xl" color={summary.total_gain_loss >= 0 ? 'gains' : 'losses'} showSign />
              <p className={`text-sm mt-0.5 ${summary.total_gain_loss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {summary.total_gain_loss_percent.toFixed(2)}%
              </p>
            </div>
            <div className={`p-5 ${summary.today_profit_loss >= 0 ? 'card-accent-green' : 'card-accent-rose'}`}>
              <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">Today's P/L</p>
              <PriceDisplay price={summary.today_profit_loss} size="xl" color={summary.today_profit_loss >= 0 ? 'gains' : 'losses'} showSign animate />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-spring-up stagger-2">
            <div className="card-flat p-6">
              <div className="section-header cyan">
                <h2 className="section-header-title text-white">Asset Allocation</h2>
              </div>
              <PortfolioChart data={summary.allocation} />
            </div>
            <div className="card-flat p-6">
              <div className="section-header purple">
                <h2 className="section-header-title text-white">Allocation Breakdown</h2>
              </div>
              {summary.allocation.length === 0 ? (
                <div className="text-gray-500 text-sm">No holdings yet</div>
              ) : (
                <div className="space-y-2">
                  {summary.allocation.map((a) => (
                    <div key={a.symbol} className="flex justify-between text-sm">
                      <span className="text-white font-medium">{a.symbol}</span>
                      <span className="text-gray-300">{formatPrice(a.value, guessCurrency(a.symbol), 2)} ({a.percentage.toFixed(1)}%)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="glass-card p-6 animate-spring-up stagger-3">
            <div className="section-header cyan">
              <h2 className="section-header-title text-white">Holdings</h2>
            </div>
            {summary.holdings.length === 0 ? (
              <div className="text-gray-500 text-sm py-6 text-center">No holdings. Click "Add Holding" to start.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-white/5">
                      <th className="text-left py-2 px-2">Symbol</th>
                      <th className="text-right py-2 px-2">Qty</th>
                      <th className="text-right py-2 px-2">Buy</th>
                      <th className="text-right py-2 px-2">Current</th>
                      <th className="text-right py-2 px-2">Value</th>
                      <th className="text-right py-2 px-2">P/L</th>
                      <th className="text-right py-2 px-2">P/L %</th>
                      <th className="py-2 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.holdings.map((h) => (
                      <React.Fragment key={h.id}>
                        <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                          <td className="py-2 px-2 text-white font-medium">
                            <button
                              onClick={() => setExpanded(expanded === h.id ? null : h.id)}
                              className="flex items-center gap-1 hover:text-blue-300 transition-colors"
                              title="Show live chart"
                            >
                              {expanded === h.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              {h.symbol}
                            </button>
                          </td>
                          <td className="py-2 px-2 text-right text-gray-300 font-mono tabular-nums">{h.quantity.toFixed(2)}</td>
                          <td className="py-2 px-2 text-right"><PriceDisplay price={h.purchase_price} currency={guessCurrency(h.symbol)} size="sm" /></td>
                          <td className="py-2 px-2 text-right"><PriceDisplay price={h.current_price} currency={guessCurrency(h.symbol)} size="sm" color="default" animate /></td>
                          <td className="py-2 px-2 text-right"><PriceDisplay price={h.current_value} currency={guessCurrency(h.symbol)} size="md" color="default" /></td>
                          <td className={`py-2 px-2 text-right`}>
                            <PriceDisplay price={h.gain_loss} currency={guessCurrency(h.symbol)} size="sm" color={h.gain_loss >= 0 ? 'gains' : 'losses'} showSign />
                          </td>
                          <td className={`py-2 px-2 text-right font-mono tabular-nums ${h.gain_loss_percent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {h.gain_loss_percent.toFixed(2)}%
                          </td>
                          <td className="py-2 px-2 text-right">
                            <button onClick={() => remove(h.id, h.symbol)} className="text-rose-400 hover:text-rose-300 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                        {expanded === h.id && (
                          <tr className="bg-black/20">
                            <td colSpan={8} className="p-3">
                              <TradingViewWidget symbol={h.symbol} height={340} compact />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
