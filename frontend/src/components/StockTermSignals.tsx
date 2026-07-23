import React, { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, Calendar, CheckCircle2, AlertTriangle, MinusCircle } from 'lucide-react'
import signalService, { StockTermSignals as StockTermSignalsData, TermSignal, MasterSignal } from '@/services/signalService'

interface Props {
  symbol: string
  masterSignal?: MasterSignal   // passed from StockDetails when consensus is loaded
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sigDirection(s: string): 'bull' | 'bear' | 'neutral' {
  if (s === 'BUY')  return 'bull'
  if (s === 'SELL') return 'bear'
  return 'neutral'
}

function masterDirection(m: MasterSignal | undefined): 'bull' | 'bear' | 'neutral' {
  if (!m) return 'neutral'
  if (m === 'STRONG_BUY' || m === 'BUY')   return 'bull'
  if (m === 'STRONG_SELL' || m === 'SELL') return 'bear'
  return 'neutral'
}

// ─── Signal badge ─────────────────────────────────────────────────────────────
function SignalBadge({ signal }: { signal: 'BUY' | 'SELL' | 'AVOID' }) {
  if (signal === 'BUY')
    return (
      <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400">
        <TrendingUp size={11} /> BUY
      </span>
    )
  if (signal === 'SELL')
    return (
      <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-red-500/20 text-red-400">
        <TrendingDown size={11} /> SELL
      </span>
    )
  return (
    <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-gray-700 text-gray-400">
      <Minus size={11} /> AVOID
    </span>
  )
}

// ─── Consensus alignment pill ─────────────────────────────────────────────────
function AlignmentPill({ termSig, master }: { termSig: 'BUY' | 'SELL' | 'AVOID'; master?: MasterSignal }) {
  if (!master) return null
  const td = sigDirection(termSig)
  const md = masterDirection(master)
  if (td === 'neutral' || md === 'neutral') {
    return (
      <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-500">
        <MinusCircle size={9} /> Neutral
      </span>
    )
  }
  if (td === md) {
    return (
      <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-400">
        <CheckCircle2 size={9} /> Supports master
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-400">
      <AlertTriangle size={9} /> Timeframe divergence
    </span>
  )
}

// ─── Fundamental chip ─────────────────────────────────────────────────────────
function FundamentalChip({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === undefined) return null
  return (
    <div className="bg-gray-800 rounded px-2 py-1 text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xs font-medium text-[var(--text)]">{value}</div>
    </div>
  )
}

// ─── Term card ────────────────────────────────────────────────────────────────
function TermCard({
  title, timeframe, sig, loading, master,
}: {
  title: string
  timeframe: string
  sig: TermSignal | null
  loading: boolean
  master?: MasterSignal
}) {
  const borderColor =
    !sig            ? 'border-gray-700' :
    sig.signal === 'BUY'  ? 'border-emerald-800/60' :
    sig.signal === 'SELL' ? 'border-red-800/60'     : 'border-gray-700'

  const bgColor =
    !sig            ? '' :
    sig.signal === 'BUY'  ? 'bg-emerald-950/20' :
    sig.signal === 'SELL' ? 'bg-red-950/20'      : ''

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} bg-gray-900 p-4 flex flex-col gap-3`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-[var(--text)]">{title}</div>
          <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
            <Calendar size={10} /> {timeframe}
          </div>
        </div>
        {sig && !loading && (
          <AlignmentPill termSig={sig.signal} master={master} />
        )}
      </div>

      {loading && <div className="h-4 bg-gray-800 animate-pulse rounded w-20" />}

      {!loading && sig && (
        <>
          <div className="flex items-center justify-between">
            <SignalBadge signal={sig.signal} />
            <span className="text-xs text-gray-400">{sig.confidence.toFixed(0)}% confident</span>
          </div>

          {/* Confidence bar */}
          <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                sig.signal === 'BUY'  ? 'bg-emerald-500' :
                sig.signal === 'SELL' ? 'bg-red-500'     : 'bg-gray-600'
              }`}
              style={{ width: `${sig.confidence}%` }}
            />
          </div>

          <p className="text-xs text-gray-400 leading-relaxed">{sig.reason}</p>

          {/* Fundamentals chips (mid/long) */}
          {sig.fundamentals && Object.keys(sig.fundamentals).length > 0 && (
            <div className="grid grid-cols-2 gap-1.5">
              {sig.fundamentals.pe_ratio !== undefined && (
                <FundamentalChip label="P/E" value={sig.fundamentals.pe_ratio ?? '–'} />
              )}
              {sig.fundamentals.eps_growth !== undefined && (
                <FundamentalChip label="EPS Growth"
                  value={sig.fundamentals.eps_growth !== null ? `${sig.fundamentals.eps_growth}%` : '–'} />
              )}
              {sig.fundamentals.revenue_growth !== undefined && (
                <FundamentalChip label="Rev. Growth"
                  value={sig.fundamentals.revenue_growth !== null ? `${sig.fundamentals.revenue_growth}%` : '–'} />
              )}
              {sig.fundamentals.pb_ratio !== undefined && (
                <FundamentalChip label="P/B" value={sig.fundamentals.pb_ratio ?? '–'} />
              )}
              {sig.fundamentals.roe !== undefined && (
                <FundamentalChip label="ROE"
                  value={sig.fundamentals.roe !== null ? `${sig.fundamentals.roe}%` : '–'} />
              )}
              {sig.fundamentals.debt_equity !== undefined && (
                <FundamentalChip label="D/E" value={sig.fundamentals.debt_equity ?? '–'} />
              )}
              {sig.fundamentals.dividend_yield !== undefined && sig.fundamentals.dividend_yield !== null && (
                <FundamentalChip label="Dividend" value={`${sig.fundamentals.dividend_yield}%`} />
              )}
            </div>
          )}

          {/* Short-term key levels */}
          {sig.target_price && (
            <div className="flex gap-3 text-xs">
              <div>
                <span className="text-gray-500">Target </span>
                <span className="text-emerald-400 font-medium">{sig.target_price}</span>
              </div>
              {sig.stop_loss && (
                <div>
                  <span className="text-gray-500">SL </span>
                  <span className="text-red-400 font-medium">{sig.stop_loss}</span>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!loading && !sig && (
        <div className="text-xs text-gray-500">Analysis unavailable</div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function StockTermSignals({ symbol, masterSignal }: Props) {
  const [data, setData]       = useState<StockTermSignalsData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!symbol) return
    setLoading(true)
    signalService.getStockTerms(symbol)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [symbol])

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Outlook by Timeframe
        </h3>
        {masterSignal && (
          <span className="text-xs text-gray-500">
            Alignment shown vs <span className="text-white font-medium">
              {masterSignal.replace('_', ' ')}
            </span> master signal
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <TermCard title="Short Term"  timeframe="1 Week – 3 Months"  sig={data?.short ?? null} loading={loading} master={masterSignal} />
        <TermCard title="Mid Term"    timeframe="3 Months – 1 Year"  sig={data?.mid   ?? null} loading={loading} master={masterSignal} />
        <TermCard title="Long Term"   timeframe="1 Year+"            sig={data?.long  ?? null} loading={loading} master={masterSignal} />
      </div>
    </div>
  )
}
