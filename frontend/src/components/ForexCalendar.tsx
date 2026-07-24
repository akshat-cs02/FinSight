import React, { useEffect, useState } from 'react'
import { Calendar, TrendingUp, RefreshCw, Shield, Wifi, WifiOff } from 'lucide-react'
import { forexService, EconomicEvent, ForexPair } from '@/services/forexService'

const IMPACT_COLORS: Record<string, string> = {
  High:   'bg-red-500/20 text-red-300 border-red-500/30',
  Medium: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  Low:    'bg-gray-500/20 text-gray-400 border-gray-600',
}

const IMPACT_DOTS: Record<string, string> = {
  High:   'bg-red-500',
  Medium: 'bg-orange-400',
  Low:    'bg-gray-500',
}

const COUNTRY_FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  CAD: '🇨🇦', AUD: '🇦🇺', NZD: '🇳🇿', CHF: '🇨🇭',
  CNY: '🇨🇳', INR: '🇮🇳',
}

function formatEventDate(isoStr: string): string {
  try {
    const d = new Date(isoStr)
    if (isNaN(d.getTime())) return isoStr
    const now = new Date()
    const diffDays = Math.round((d.getTime() - now.getTime()) / 86400000)
    const dayLabel =
      diffDays === 0 ? 'Today' :
      diffDays === 1 ? 'Tomorrow' :
      diffDays === -1 ? 'Yesterday' :
      d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

    const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
    return `${dayLabel} · ${timeStr}`
  } catch {
    return isoStr
  }
}

function isNewsHigh(ev: EconomicEvent): boolean {
  return ev.impact === 'High' || ev.impact === 'Medium'
}

export default function ForexCalendar() {
  const [events, setEvents] = useState<EconomicEvent[] | null>(null)
  const [pairs, setPairs] = useState<ForexPair[] | null>(null)
  const [source, setSource] = useState<string>('')
  const [impactFilter, setImpactFilter] = useState<string>('High')
  const [loading, setLoading] = useState(false)
  const [calError, setCalError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setCalError(null)
    try {
      const [cal, rates] = await Promise.all([
        forexService.getCalendar(impactFilter || undefined, undefined, 30),
        forexService.getRates(),
      ])
      setEvents(cal.events)
      setSource(cal.source || '')
      setPairs(rates.pairs)
    } catch (e: any) {
      setCalError(e.response?.data?.detail || e.message || 'Failed to load calendar')
      setEvents([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [impactFilter])

  const isLive = source === 'ForexFactory'
  const isBuiltIn = source === 'Built-in Schedule'

  return (
    <div className="card-layer rounded-xl p-6 space-y-5">

      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Calendar size={20} className="text-blue-400" />
          <h2 className="text-lg font-bold text-[var(--text)] font-display">Forex & Economic Calendar</h2>
        </div>
        <div className="flex items-center gap-3">
          {source && (
            <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${
              isLive
                ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                : 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10'
            }`}>
              {isLive
                ? <><Wifi size={10} /> ForexFactory Live</>
                : <><WifiOff size={10} /> Built-in Schedule</>
              }
            </div>
          )}
          <button onClick={load} disabled={loading} title="Refresh"
                  className="text-[var(--dim)] hover:text-[var(--text)] disabled:opacity-40 transition">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Built-in schedule notice */}
      {isBuiltIn && (
        <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2">
          <Shield size={14} className="text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-300">
            Live ForexFactory feed unavailable — showing built-in recurring event schedule
            (NFP, CPI, FOMC, PMI, etc.). Dates are approximate; verify exact times before trading.
          </p>
        </div>
      )}

      {/* News blackout notice */}
      <div className="flex items-center gap-2 text-xs text-orange-300 bg-orange-500/5 border border-orange-500/20 rounded-lg px-3 py-2">
        <Shield size={12} className="flex-shrink-0" />
        <span>
          <strong>News Filter Active in Backtesting:</strong> High &amp; Medium impact events are automatically
          excluded from trade entries (±30 min window). This significantly reduces false signals.
        </span>
      </div>

      {/* Major Forex Rates */}
      {pairs && pairs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} className="text-emerald-400" />
            <span className="text-xs text-[var(--dim)] uppercase tracking-wide font-semibold">Major Pairs · Live Rates</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {pairs.slice(0, 8).map((p) => (
              <div key={p.pair} className="bg-[var(--raised)] rounded-lg p-2.5 border border-[var(--border)] hover:border-[var(--border-2)] transition">
                <p className="text-xs text-[var(--dim)]">{p.pair}</p>
                <p className="text-[var(--text)] font-bold text-sm">{p.rate.toFixed(4)}</p>
                <p className={`text-xs font-medium ${p.change_percent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {p.change_percent >= 0 ? '▲' : '▼'} {Math.abs(p.change_percent).toFixed(3)}%
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendar section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-[var(--dim)] font-semibold uppercase tracking-wide">
            Upcoming Events
          </span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-[var(--dim)] mr-1">Impact:</span>
            {['High', 'Medium', 'Low', ''].map((imp) => (
              <button
                key={imp || 'all'}
                onClick={() => setImpactFilter(imp)}
                className={`px-2 py-1 text-xs rounded border transition ${
                  impactFilter === imp
                    ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                    : 'border-[var(--border)] bg-[var(--raised)] text-[var(--dim)] hover:bg-[var(--surface-3)]'
                }`}
              >
                {imp === 'High' ? '🔴 High' : imp === 'Medium' ? '🟠 Med' : imp === 'Low' ? '⚪ Low' : 'All'}
              </button>
            ))}
          </div>
        </div>

        {calError && (
          <div className="text-red-400 text-sm py-2">{calError}</div>
        )}

        {events === null && !calError && (
          <div className="text-[var(--dim)] text-sm animate-pulse">Loading calendar…</div>
        )}

        {events && events.length === 0 && !calError && (
          <div className="text-[var(--dim)] text-sm py-4 text-center">No events matching current filter.</div>
        )}

        {events && events.length > 0 && (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {events.map((ev, i) => (
              <div key={i} className={`flex items-start gap-3 rounded-lg p-3 border transition ${
                isNewsHigh(ev)
                  ? 'bg-red-500/5 border-red-500/20 hover:bg-red-500/10'
                  : 'bg-[var(--raised)] border-[var(--border)] hover:bg-[var(--surface-3)]'
              }`}>
                {/* Impact dot */}
                <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${IMPACT_DOTS[ev.impact] || 'bg-gray-500'}`} />

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <span className="text-[var(--text)] text-sm font-medium">{ev.title}</span>
                      <span className="ml-2 text-xs font-bold text-blue-400">
                        {COUNTRY_FLAGS[ev.country] || ''} {ev.country}
                      </span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded border flex-shrink-0 ${IMPACT_COLORS[ev.impact] || ''}`}>
                      {ev.impact}
                    </span>
                  </div>

                  <p className="text-xs text-[var(--dim)] mt-0.5">{formatEventDate(ev.date)}</p>

                  {(ev.forecast || ev.previous || ev.actual) && (
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-[var(--faint)]">
                      {ev.forecast && (
                        <span>Forecast: <span className="text-[var(--text)] font-medium">{ev.forecast}</span></span>
                      )}
                      {ev.previous && (
                        <span>Prev: <span className="text-[var(--text)]">{ev.previous}</span></span>
                      )}
                      {ev.actual && (
                        <span>Actual: <span className={
                          ev.actual !== ev.forecast ? 'text-yellow-400 font-semibold' : 'text-[var(--text)]'
                        }>{ev.actual}</span></span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-[var(--faint)] flex items-center gap-1">
        <Calendar size={10} />
        Source: {source || 'Loading…'} · High-impact events can cause significant price gaps — avoid trading during NFP, CPI, FOMC releases.
      </p>
    </div>
  )
}
