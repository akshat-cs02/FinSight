import React, { useEffect, useState } from 'react'
import { Plus, Trash2, Download, ChevronDown, ChevronRight } from 'lucide-react'
import { portfolioService, PortfolioSummary } from '@/services/portfolioService'
import PortfolioChart from '@/components/charts/PortfolioChart'
import TradingViewWidget from '@/components/charts/TradingViewWidget'
import { formatPrice, guessCurrency } from '@/utils/currency'
import { API_URL } from '@/services/api'
import toast from 'react-hot-toast'

export default function PortfolioPage() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ symbol: '', quantity: '', purchase_price: '' })
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)  // holding id whose chart is open

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
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-900 min-h-screen">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="text-3xl font-bold text-white font-display">Portfolio</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowForm(!showForm)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm">
            <Plus size={16} /> Add Holding
          </button>
          <a href={`${API_URL}/api/reports/portfolio/pdf`} target="_blank" rel="noopener"
             className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm">
            <Download size={16} /> PDF
          </a>
          <a href={`${API_URL}/api/reports/portfolio/csv`} target="_blank" rel="noopener"
             className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm">
            <Download size={16} /> CSV
          </a>
        </div>
      </div>

      {showForm && (
        <form onSubmit={add} className="glass-card p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Symbol</label>
            <input required value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                   placeholder="AAPL" className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white w-32 uppercase" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Quantity</label>
            <input type="number" step="any" required value={form.quantity}
                   onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                   className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white w-32" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Purchase Price</label>
            <input type="number" step="any" required value={form.purchase_price}
                   onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
                   className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white w-32" />
          </div>
          <button disabled={busy} type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded text-white">
            {busy ? 'Adding…' : 'Save'}
          </button>
        </form>
      )}

      {err && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300">{err}</div>}
      {summary === null && !err && <div className="text-gray-500">Loading portfolio…</div>}

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-spring-up stagger-1">
            <div className="glass-card p-5">
              <p className="text-gray-400 text-sm">Total Invested</p>
              <p className="text-2xl font-bold text-white font-mono">{formatPrice(summary.total_invested, 'USD', 2)}</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-gray-400 text-sm">Current Value</p>
              <p className="text-2xl font-bold text-white font-mono">{formatPrice(summary.total_value, 'USD', 2)}</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-gray-400 text-sm">Total Gain/Loss</p>
              <p className={`text-2xl font-bold ${summary.total_gain_loss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {summary.total_gain_loss >= 0 ? '+' : ''}{formatPrice(summary.total_gain_loss, 'USD', 2)}
              </p>
              <p className={`text-sm ${summary.total_gain_loss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {summary.total_gain_loss_percent.toFixed(2)}%
              </p>
            </div>
            <div className="glass-card p-5">
              <p className="text-gray-400 text-sm">Today's P/L</p>
              <p className={`text-2xl font-bold ${summary.today_profit_loss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {summary.today_profit_loss >= 0 ? '+' : ''}{formatPrice(summary.today_profit_loss, 'USD', 2)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="glass-card p-6">
              <h2 className="text-lg font-bold text-white mb-4">Asset Allocation</h2>
              <PortfolioChart data={summary.allocation} />
            </div>
            <div className="glass-card p-6">
              <h2 className="text-lg font-bold text-white mb-4">Allocation Breakdown</h2>
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

          <div className="glass-card p-6">
            <h2 className="text-lg font-bold text-white mb-4">Holdings</h2>
            {summary.holdings.length === 0 ? (
              <div className="text-gray-500 text-sm py-6 text-center">No holdings. Click "Add Holding" to start.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700">
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
                        <tr className="border-b border-gray-700 hover:bg-gray-700/30">
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
                          <td className="py-2 px-2 text-right text-gray-300">{h.quantity.toFixed(2)}</td>
                          <td className="py-2 px-2 text-right text-gray-300">{formatPrice(h.purchase_price, guessCurrency(h.symbol), 2)}</td>
                          <td className="py-2 px-2 text-right text-gray-300">{formatPrice(h.current_price, guessCurrency(h.symbol), 2)}</td>
                          <td className="py-2 px-2 text-right text-white">{formatPrice(h.current_value, guessCurrency(h.symbol), 2)}</td>
                          <td className={`py-2 px-2 text-right ${h.gain_loss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {h.gain_loss >= 0 ? '+' : ''}{formatPrice(h.gain_loss, guessCurrency(h.symbol), 2)}
                          </td>
                          <td className={`py-2 px-2 text-right ${h.gain_loss_percent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {h.gain_loss_percent.toFixed(2)}%
                          </td>
                          <td className="py-2 px-2 text-right">
                            <button onClick={() => remove(h.id, h.symbol)} className="text-red-400 hover:text-red-300">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                        {expanded === h.id && (
                          <tr className="bg-gray-900/40">
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
