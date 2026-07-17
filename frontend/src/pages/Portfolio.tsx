import React, { useEffect, useRef, useState } from 'react'
import { Lift } from '@/components/ui/motion'
import { useScrollAnimation, useStaggerAnimation } from '@/hooks/useScrollAnimation'
import { Plus, Trash2, Download, ChevronDown, ChevronRight } from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { portfolioService, PortfolioSummary } from '@/services/portfolioService'
import PortfolioChart from '@/components/charts/PortfolioChart'
import TradingViewWidget from '@/components/charts/TradingViewWidget'
import PriceDisplay from '@/components/PriceDisplay'
import { guessCurrency } from '@/utils/currency'
import { API_URL } from '@/services/api'
import toast from 'react-hot-toast'

gsap.registerPlugin(ScrollTrigger)

export default function PortfolioPage() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ symbol: '', quantity: '', purchase_price: '' })
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  // Refs for GSAP
  const headerRef = useRef<HTMLDivElement>(null)
  const metricsRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableSectionElement>(null)
  const allocationRef = useRef<HTMLDivElement>(null)

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

  // GSAP: metrics stagger on mount
  useEffect(() => {
    if (!metricsRef.current || !summary) return
    const cards = metricsRef.current.querySelectorAll(':scope > div')
    gsap.fromTo(cards, { y: 20, opacity: 0, scale: 0.98 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, stagger: 0.07, ease: 'power3.out' })
  }, [summary])

  // GSAP: allocation chart animate on mount
  useEffect(() => {
    if (!allocationRef.current || !summary) return
    gsap.fromTo(allocationRef.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', delay: 0.2 })
  }, [summary])

  // GSAP: table rows stagger in
  useEffect(() => {
    if (!tableRef.current || !summary) return
    const rows = tableRef.current.querySelectorAll('tr')
    gsap.fromTo(rows, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.04, ease: 'power2.out' })
  }, [summary])

  // GSAP: ScrollTrigger for sections below the fold
  useEffect(() => {
    const sections = [chartRef.current].filter(Boolean)
    sections.forEach((section) => {
      if (!section) return
      gsap.fromTo(
        section,
        { y: 25, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out', scrollTrigger: { trigger: section, start: 'top 85%' } }
      )
    })
  }, [summary])

  const chartScrollRef = useScrollAnimation('fadeUp', { delay: 0.1 })
  const holdingsRef = useScrollAnimation('fadeUp', { delay: 0.15 })

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 min-h-screen">
      <div ref={headerRef} className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <div className="eyebrow">Portfolio Overview</div>
          <h1 className="text-3xl font-bold text-white font-display">Portfolio</h1>
          <p className="text-white/50 text-sm mt-0.5">Track your holdings and performance</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowForm(!showForm)}
                  className="bg-gold/10 text-gold hover:bg-gold/20 text-sm px-4 py-2 rounded-xl font-medium transition-all duration-300 flex items-center gap-1.5">
            <Plus size={16} /> Add Holding
          </button>
          <a href={`${API_URL}/api/reports/portfolio/pdf`} target="_blank" rel="noopener"
             className="text-white/50 hover:text-white/70 border border-white/5 hover:border-white/10 text-sm px-4 py-2 rounded-xl font-medium transition-all duration-300 flex items-center gap-1.5">
            <Download size={16} /> PDF
          </a>
          <a href={`${API_URL}/api/reports/portfolio/csv`} target="_blank" rel="noopener"
             className="text-white/50 hover:text-white/70 border border-white/5 hover:border-white/10 text-sm px-4 py-2 rounded-xl font-medium transition-all duration-300 flex items-center gap-1.5">
            <Download size={16} /> CSV
          </a>
        </div>
      </div>

      {showForm && (
        <Lift className="card-accent card-flat p-4 rounded-xl flex flex-wrap gap-3 items-end"><form onSubmit={add}>
          <div>
            <label className="block text-xs text-white/40 mb-1">Symbol</label>
            <input required value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                   placeholder="AAPL" className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/40 w-32 uppercase focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/20 transition-all duration-300" />
          </div>
          <div>
            <label className="block text-xs text-white/40 mb-1">Quantity</label>
            <input type="number" step="any" required value={form.quantity}
                   onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                   className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/40 w-32 focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/20 transition-all duration-300" />
          </div>
          <div>
            <label className="block text-xs text-white/40 mb-1">Purchase Price</label>
            <input type="number" step="any" required value={form.purchase_price}
                   onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
                   className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/40 w-32 focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/20 transition-all duration-300" />
          </div>
          <button disabled={busy} type="submit"
                  className="bg-gold/10 text-gold hover:bg-gold/20 disabled:opacity-50 text-sm px-4 py-2 rounded-xl font-medium transition-all duration-300 flex items-center gap-1.5">
            {busy ? 'Adding…' : 'Save'}
          </button>
        </form></Lift>
      )}

      {err && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300">{err}</div>}
      {summary === null && !err && <div className="text-white/50">Loading portfolio…</div>}

      {summary && (
        <>
          <div ref={metricsRef} className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Lift className="card-box p-5"><div>
              <div className="eyebrow">Total Invested</div>
              <PriceDisplay price={summary.total_invested} size="xl" color="default" />
            </div></Lift>
            <Lift className="card-accent card-surface2 p-5"><div>
              <div className="eyebrow">Current Value</div>
              <PriceDisplay price={summary.total_value} size="xl" color="brand" animate />
            </div></Lift>
            <Lift className="card p-5"><div>
              <div className="eyebrow">Total Gain/Loss</div>
              <PriceDisplay price={summary.total_gain_loss} size="xl" color={summary.total_gain_loss >= 0 ? 'gains' : 'losses'} showSign />
              <p className={`text-sm mt-0.5 ${summary.total_gain_loss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {summary.total_gain_loss_percent.toFixed(2)}%
              </p>
            </div></Lift>
            <Lift className="card-surface3 p-5"><div>
              <div className="eyebrow">Today's P/L</div>
              <PriceDisplay price={summary.today_profit_loss} size="xl" color={summary.today_profit_loss >= 0 ? 'gains' : 'losses'} showSign animate />
            </div></Lift>
          </div>

          <div ref={chartRef} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Lift className="card-accent card-surface2 p-5"><div ref={allocationRef}>
              <div className="eyebrow">Allocation</div>
              <h2 className="section-rule">Asset Allocation</h2>
              <PortfolioChart data={summary.allocation} />
            </div></Lift>
            <Lift className="card-accent card-surface2 p-5"><div>
              <div className="eyebrow">Breakdown</div>
              <h2 className="section-rule">Allocation Breakdown</h2>
              {summary.allocation.length === 0 ? (
                <div className="text-white/50 text-sm">No holdings yet</div>
              ) : (
                <div className="space-y-2">
                  {summary.allocation.map((a) => (
                    <div key={a.symbol} className="flex justify-between text-sm">
                      <span className="text-white/80 font-medium">{a.symbol}</span>
                      <span className="text-white/60">
                        <PriceDisplay price={a.value} currency={guessCurrency(a.symbol)} size="sm" />
                        {' '}({a.percentage.toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div></Lift>
          </div>

          <Lift className="card p-5"><div ref={holdingsRef as React.RefObject<HTMLDivElement>}>
            <div className="eyebrow">Holdings</div>
            <h2 className="section-rule">Holdings</h2>
            {summary.holdings.length === 0 ? (
              <div className="text-white/50 text-sm py-6 text-center">No holdings. Click "Add Holding" to start.</div>
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
                  <tbody ref={tableRef}>
                    {summary.holdings.map((h) => (
                      <React.Fragment key={h.id}>
                        <tr className="hover:bg-gold/5 transition-all duration-200">
                          <td className="font-medium">
                            <button
                              onClick={() => setExpanded(expanded === h.id ? null : h.id)}
                              className="flex items-center gap-1 text-white/80 hover:text-gold transition-all duration-300"
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
                            <button onClick={() => remove(h.id, h.symbol)} className="text-rose-400 hover:text-rose-300 transition-all duration-300">
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
          </div></Lift>
        </>
      )}
    </div>
  )
}
