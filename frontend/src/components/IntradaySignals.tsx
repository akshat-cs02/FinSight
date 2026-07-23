import React, { useEffect, useRef, useState } from 'react'
import { TrendingUp, TrendingDown, RefreshCw, Clock, Zap } from 'lucide-react'
import signalService, { IntradaySignal } from '@/services/signalService'
import type { MarketKey } from '@/services/dashboardService'
import { symbolInMarket, symbolDisplayName, MARKET_LABELS } from '@/utils/markets'

interface Props { market?: MarketKey }

function KillZoneBadge({ zone }: { zone: string | null }) {
  if (!zone || zone === 'NONE') return <span className="text-xs text-gray-500">Off-hours</span>
  const color = zone === 'LONDON' ? 'text-blue-400 bg-blue-400/10' : 'text-orange-400 bg-orange-400/10'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
      {zone === 'LONDON' ? 'London KZ' : 'NY KZ'}
    </span>
  )
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 75 ? 'bg-emerald-500' : value >= 60 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-[var(--dim)] w-8 text-right">{value.toFixed(0)}%</span>
    </div>
  )
}

export default function IntradaySignals({ market = 'ALL' }: Props) {
  const [allSignals, setAllSignals] = useState<IntradaySignal[]>([])
  const [loading, setLoading] = useState(false)      // only true on FIRST load / manual refresh
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  const sigKeyRef = useRef<string>('')               // signature of the last data we rendered

  // Filter the full signal set down to the selected market/asset class.
  const signals = allSignals.filter((s) => symbolInMarket(s.symbol, market))

  // `silent` background refreshes never toggle the loading spinner and only
  // re-render when the signal set actually changed — no 5-second UI flicker.
  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await signalService.getIntraday()
      const key = data.map((s) => `${s.symbol}:${s.signal}:${s.confidence}`).join('|')
      if (key !== sigKeyRef.current) {
        sigKeyRef.current = key
        setAllSignals(data)
        setLastUpdate(new Date().toLocaleTimeString())
      }
    } catch {
      // silently fail — stale data still shown
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    load(false)
    // Background refresh every 15s — silent (no spinner, no re-render unless data changed).
    const id = setInterval(() => load(true), 15000)
    return () => clearInterval(id)
  }, [])

  const currentHour = new Date().getUTCHours()
  const activeKZ = currentHour >= 7 && currentHour < 10 ? 'LONDON' : currentHour >= 13 && currentHour < 16 ? 'NY' : null
  const nextKZ = !activeKZ ? (currentHour < 7 ? `London opens at 07:00 UTC` : currentHour < 13 ? `NY opens at 13:00 UTC` : `London opens tomorrow at 07:00 UTC`) : null

  return (
    <div className="card-surface2 rounded-xl border border-[rgba(74,222,128,0.06)] p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-yellow-400" />
          <h2 className="text-lg font-semibold text-[var(--text)]">Intraday Signals</h2>
          {market !== 'ALL' && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium text-green-300 bg-green-500/10">
              {MARKET_LABELS[market]}
            </span>
          )}
          {activeKZ && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${activeKZ === 'LONDON' ? 'text-blue-400 bg-blue-400/10' : 'text-orange-400 bg-orange-400/10'}`}>
              {activeKZ} Kill Zone Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate &&          <span className="text-xs text-[rgba(74,222,128,0.4)]">Updated {lastUpdate}</span>}
          <button
            onClick={() => load(false)}
            disabled={loading}
            className="flex items-center gap-1 text-xs text-[var(--dim)] hover:text-[var(--text)] transition-colors"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Market bias mini-summary */}
      {signals.length > 0 && (() => {
        const bulls = signals.filter(s => s.signal === 'BUY').length
        const bears = signals.filter(s => s.signal === 'SELL').length
        const total = signals.length
        const bias = bulls > bears ? 'BULLISH' : bears > bulls ? 'BEARISH' : 'MIXED'
        const biasColor = bias === 'BULLISH' ? 'text-emerald-400' : bias === 'BEARISH' ? 'text-red-400' : 'text-yellow-400'
        const biasBarW = Math.round((bulls / total) * 100)
        return (
          <div className="mb-4 bg-[var(--raised)] rounded-lg p-3 flex items-center gap-4">
            <div className={`text-sm font-bold ${biasColor} w-20 flex-shrink-0`}>{bias}</div>
            <div className="flex-1 h-2 bg-red-900/50 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${biasBarW}%` }} />
            </div>
            <div className="text-xs text-[var(--dim)] flex-shrink-0">
              <span className="text-emerald-400 font-medium">{bulls} BUY</span>
              <span className="text-ink-500 mx-1">/</span>
              <span className="text-red-400 font-medium">{bears} SELL</span>
            </div>
          </div>
        )
      })()}

      {/* No signals state */}
      {!loading && signals.length === 0 && (
        <div className="text-center py-8 text-[var(--dim)]">
          <Clock size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">
            {market === 'ALL'
              ? 'No active signals right now.'
              : `No active ${MARKET_LABELS[market]} signals right now.`}
          </p>
          {allSignals.length > 0 && market !== 'ALL' && (
            <p className="text-xs mt-1">
              {allSignals.length} signal{allSignals.length > 1 ? 's' : ''} active in other markets — switch to “All”.
            </p>
          )}
          {allSignals.length === 0 && nextKZ && <p className="text-xs mt-1">{nextKZ}</p>}
        </div>
      )}

      {/* Signal grid */}
      {signals.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {signals.map((sig) => (
            <div
              key={sig.id}
              className={`rounded-lg border p-3 space-y-2 ${
                sig.signal === 'BUY'
                  ? 'border-emerald-800/60 bg-emerald-950/30'
                  : 'border-red-800/60 bg-red-950/30'
              }`}
            >
              {/* Symbol + direction */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-[var(--text)] text-sm">{symbolDisplayName(sig.symbol)}</span>
                  {symbolDisplayName(sig.symbol) !== sig.symbol && (
                    <span className="text-[10px] text-gray-500 ml-1.5">{sig.symbol}</span>
                  )}
                </div>
                <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                  sig.signal === 'BUY'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {sig.signal === 'BUY' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                  {sig.signal}
                </span>
              </div>

              {/* Levels */}
              <div className="grid grid-cols-3 gap-1 text-xs">
                <div>
                  <div className="text-[var(--faint)]">Entry</div>
                  <div className="text-[var(--text)] font-medium">{sig.entry}</div>
                </div>
                <div>
                  <div className="text-[var(--faint)]">SL</div>
                  <div className="text-red-400 font-medium">{sig.sl}</div>
                </div>
                <div>
                  <div className="text-[var(--faint)]">TP</div>
                  <div className="text-emerald-400 font-medium">{sig.tp}</div>
                </div>
              </div>

              {/* Confidence */}
              <ConfidenceBar value={sig.confidence} />

              {/* Meta */}
              <div className="flex items-center justify-between">
                <KillZoneBadge zone={sig.kill_zone} />
                {sig.htf_bias && sig.htf_bias !== 'NEUTRAL' && (
                  <span className={`text-xs ${sig.htf_bias === 'BULLISH' ? 'text-emerald-400' : 'text-red-400'}`}>
                    HTF {sig.htf_bias}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
