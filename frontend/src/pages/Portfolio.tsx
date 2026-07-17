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
      <div className="flex justify-between items-center flex-wrap gap-3 anim-up delay-0">
        <div>
          <div className="eyebrow">Portfolio Overview</div>
          <h1 className="text-3xl font-bold text-ink-800 font-display">Portfolio</h1>
          <p className="text-ink-500 text-sm mt-0.5">Track your holdings and performance</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowForm(!showForm)}
                  className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-sm px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-1.5">
            <Plus size={16} /> Add Holding
          </button>
          <a href={`${API_URL}/api/reports/portfolio/pdf`} target="_blank" rel="noopener"
             className="text-ink-500 hover:text-ink-700 border border-white/5 hover:border-white/10 text-sm px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-1.5">
            <Download size={16} /> PDF
          </a>
          <a href={`${API_URL}/api/reports/portfolio/csv`} target="_blank" rel="noopener"
             className="text-ink-500 hover:text-ink-700 border border-white/5 hover:border-white/10 text-sm px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-1.5">
            <Download size={16} /> CSV
          </a>
        </div>
      </div>

      {showForm && (
        <form onSubmit={add} className="card-accent emerald card-flat p-4 rounded-xl flex flex-wrap gap-3 items-end anim-up delay-1">
          <div>
            <label className="block text-xs text-ink-500 mb-1">Symbol</label>
            <input required value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                   placeholder="AAPL" className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-ink-800 placeholder-ink-400 w-32 uppercase focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all" />
          </div>
          <div>
            <label className="block text-xs text-ink-500 mb-1">Quantity</label>
            <input type="number" step="any" required value={form.quantity}
                   onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                   className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-ink-800 placeholder-ink-400 w-32 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all" />
          </div>
          <div>
            <label className="block text-xs text-ink-500 mb-1">Purchase Price</label>
            <input type="number" step="any" required value={form.purchase_price}
                   onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
                   className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-ink-800 placeholder-ink-400 w-32 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all" />
          </div>
          <button disabled={busy} type="submit"
                  className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 text-sm px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-1.5">
            {busy ? 'Adding…' : 'Save'}
          </button>
        </form>
      )}

      {err && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300">{err}</div>}
      {summary === null && !err && <div className="text-ink-500">Loading portfolio…</div>}

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 anim-up delay-1">
            <div className="card-box p-5">
              <div className="eyebrow">Total Invested</div>
              <PriceDisplay price={summary.total_invested} size="xl" color="default" />
            </div>
            <div className="card-accent emerald card-surface2 p-5">
              <div className="eyebrow">Current Value</div>
              <PriceDisplay price={summary.total_value} size="xl" color="brand" animate />
            </div>
            <div className={`card p-5 ${summary.total_gain_loss >= 0 ? 'card-accent-left emerald' : 'card-accent-left rose'}`}>
              <div className="eyebrow">Total Gain/Loss</div>
              <PriceDisplay price={summary.total_gain_loss} size="xl" color={summary.total_gain_loss >= 0 ? 'gains' : 'losses'} showSign />
              <p className={`text-sm mt-0.5 ${summary.total_gain_loss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {summary.total_gain_loss_percent.toFixed(2)}%
              </p>
            </div>
            <div className={`card-surface3 p-5 ${summary.today_profit_loss >= 0 ? 'card-accent-left emerald' : 'card-accent-left rose'}`}>
              <div className="eyebrow">Today's P/L</div>
              <PriceDisplay price={summary.today_profit_loss} size="xl" color={summary.today_profit_loss >= 0 ? 'gains' : 'losses'} showSign animate />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 anim-up delay-2">
            <div className="card-accent purple card-surface2 p-5">
              <div className="eyebrow">Allocation</div>
              <h2 className="section-rule emerald">Asset Allocation</h2>
              <PortfolioChart data={summary.allocation} />
            </div>
            <div className="card-accent purple card-surface2 p-5">
              <div className="eyebrow">Breakdown</div>
              <h2 className="section-rule emerald">Allocation Breakdown</h2>
              {summary.allocation.length === 0 ? (
                <div className="text-ink-500 text-sm">No holdings yet</div>
              ) : (
                <div className="space-y-2">
                  {summary.allocation.map((a) => (
                    <div key={a.symbol} className="flex justify-between text-sm">
                      <span className="text-ink-800 font-medium">{a.symbol}</span>
                      <span className="text-ink-600">
                        <PriceDisplay price={a.value} currency={guessCurrency(a.symbol)} size="sm" />
                        {' '}({a.percentage.toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card p-5 anim-up delay-3">
            <div className="eyebrow">Holdings</div>
            <h2 className="section-rule emerald">Holdings</h2>
            {summary.holdings.length === 0 ? (
              <div className="text-ink-500 text-sm py-6 text-center">No holdings. Click "Add Holding" to start.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Buy</th>
                      <th className="text-right">Current</th>
                      <th className="text-right">Value</th>
                      <th className="text-right">P/L</th>
                      <th className="text-right">P/L %</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.holdings.map((h) => (
                      <React.Fragment key={h.id}>
                        <tr>
                          <td className="font-medium">
                            <button
                              onClick={() => setExpanded(expanded === h.id ? null : h.id)}
                              className="flex items-center gap-1 text-ink-800 hover:text-emerald-300 transition-colors"
                              title="Show live chart"
                            >
                              {expanded === h.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              {h.symbol}
                            </button>
                          </td>
                          <td className="text-right font-mono tabular-nums">{h.quantity.toFixed(2)}</td>
                          <td className="text-right"><PriceDisplay price={h.purchase_price} currency={guessCurrency(h.symbol)} size="sm" /></td>
                          <td className="text-right"><PriceDisplay price={h.current_price} currency={guessCurrency(h.symbol)} size="sm" color="default" animate /></td>
                          <td className="text-right"><PriceDisplay price={h.current_value} currency={guessCurrency(h.symbol)} size="md" color="default" /></td>
                          <td className="text-right">
                            <PriceDisplay price={h.gain_loss} currency={guessCurrency(h.symbol)} size="sm" color={h.gain_loss >= 0 ? 'gains' : 'losses'} showSign />
                          </td>
                          <td className={`text-right font-mono tabular-nums ${h.gain_loss_percent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {h.gain_loss_percent.toFixed(2)}%
                          </td>
                          <td className="text-right">
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
