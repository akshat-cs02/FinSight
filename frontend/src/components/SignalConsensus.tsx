/**
 * SignalConsensus — unified master signal card.
 *
 * Shows:
 *  • One master badge (Strong Buy → Strong Sell)
 *  • A 5-zone score meter with a position needle
 *  • Per-component breakdown: AI (30%), ICT (40%), Technical (15%),
 *    Fundamentals (10%), Liquidity Sweep Bias (5%)
 *  • Kelly-fraction position-size hint (half-Kelly, capped at 5% bankroll)
 */
import React from 'react'
import { Brain, Zap, TrendingUp, BarChart2, RefreshCw, Info, DollarSign } from 'lucide-react'
import type { ConsensusResult, MasterSignal } from '@/services/signalService'

// ─── Master-signal visual config ─────────────────────────────────────────────
const MASTER_CFG: Record<MasterSignal, {
  label: string
  color: string        // text + border
  bg: string           // card background tint
  barColor: string     // fill for the needle zones
  dot: string          // needle dot colour
}> = {
  STRONG_BUY:  { label: 'Strong Buy',  color: 'text-emerald-300', bg: 'bg-emerald-950/40 border-emerald-700/50', barColor: 'bg-emerald-600', dot: 'bg-emerald-400' },
  BUY:         { label: 'Buy',         color: 'text-emerald-400', bg: 'bg-emerald-950/20 border-emerald-800/40', barColor: 'bg-emerald-500', dot: 'bg-emerald-400' },
  NEUTRAL:     { label: 'Neutral',     color: 'text-gray-300',    bg: 'bg-gray-800/50 border-gray-700/50',       barColor: 'bg-gray-500',    dot: 'bg-gray-400'    },
  SELL:        { label: 'Sell',        color: 'text-red-400',     bg: 'bg-red-950/20 border-red-800/40',         barColor: 'bg-red-500',     dot: 'bg-red-400'     },
  STRONG_SELL: { label: 'Strong Sell', color: 'text-red-300',     bg: 'bg-red-950/40 border-red-700/50',         barColor: 'bg-red-600',     dot: 'bg-red-400'     },
}

const COMPONENT_ICONS: Record<string, React.ReactNode> = {
  ai:           <Brain size={13} />,
  ict:          <Zap size={13} />,
  technical:    <TrendingUp size={13} />,
  fundamentals: <BarChart2 size={13} />,
  liquidity:    <DollarSign size={13} />,
}

// ─── Signal chip ──────────────────────────────────────────────────────────────
function SignalChip({ signal }: { signal: string }) {
  if (signal === 'BUY')
    return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">BUY</span>
  if (signal === 'SELL')
    return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">SELL</span>
  return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">NEUTRAL</span>
}

// ─── Score meter (5-zone gradient bar + needle) ───────────────────────────────
function ScoreMeter({ score }: { score: number }) {
  // score: -100 to +100 → pct: 0 to 100
  const pct = Math.round(((score + 100) / 200) * 100)

  const ZONES = [
    { label: 'Strong Sell', w: 22.5, color: 'bg-red-800' },
    { label: 'Sell',        w: 17.5, color: 'bg-red-500' },
    { label: 'Neutral',     w: 20,   color: 'bg-gray-600' },
    { label: 'Buy',         w: 17.5, color: 'bg-emerald-500' },
    { label: 'Strong Buy',  w: 22.5, color: 'bg-emerald-700' },
  ]

  return (
    <div>
      {/* Zone bar */}
      <div className="relative h-3 flex rounded-full overflow-visible mb-1">
        {ZONES.map((z, i) => (
          <div
            key={i}
            className={`${z.color} ${i === 0 ? 'rounded-l-full' : ''} ${i === ZONES.length - 1 ? 'rounded-r-full' : ''}`}
            style={{ width: `${z.w}%` }}
          />
        ))}
        {/* Needle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-5 rounded-sm bg-white shadow-lg border border-gray-400 z-10"
          style={{ left: `${Math.min(Math.max(pct, 2), 98)}%` }}
        />
      </div>
      {/* Zone labels */}
      <div className="flex justify-between text-[10px] text-gray-600 px-0.5">
        <span>Strong Sell</span>
        <span>Sell</span>
        <span>Neutral</span>
        <span>Buy</span>
        <span>Strong Buy</span>
      </div>
    </div>
  )
}

// ─── Contribution bar for a single component ─────────────────────────────────
function ContributionBar({ contribution, weightPct }: { contribution: number; weightPct: number }) {
  // contribution: -weightPct to +weightPct
  const maxAbs = weightPct      // e.g. 40 for AI
  const isPos  = contribution >= 0
  const filled = Math.round(Math.min(Math.abs(contribution) / maxAbs, 1) * 100)

  return (
    <div className="flex items-center gap-1.5 flex-1">
      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isPos ? 'bg-emerald-500' : 'bg-red-500'}`}
          style={{ width: `${filled}%` }}
        />
      </div>
      <span className={`text-xs font-medium w-12 text-right tabular-nums ${isPos ? 'text-emerald-400' : contribution < 0 ? 'text-red-400' : 'text-gray-500'}`}>
        {contribution > 0 ? '+' : ''}{contribution.toFixed(1)}
      </span>
    </div>
  )
}

// ─── Skeleton while loading ───────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="glass-card p-5 space-y-4 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-5 w-40 bg-gray-700 rounded" />
        <div className="h-8 w-28 bg-gray-700 rounded-full" />
      </div>
      <div className="h-3 bg-gray-700 rounded-full" />
      <div className="space-y-2">
        {[40, 35, 15, 10].map(w => (
          <div key={w} className="flex items-center gap-3">
            <div className="h-3 w-48 bg-gray-700 rounded" />
            <div className="flex-1 h-1.5 bg-gray-700 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  result: ConsensusResult | null
  loading?: boolean
  onRefresh?: () => void
}

export default function SignalConsensus({ result, loading, onRefresh }: Props) {
  if (loading && !result) return <Skeleton />
  if (!result) return null

  const cfg        = MASTER_CFG[result.master_signal] ?? MASTER_CFG.NEUTRAL
  const compKeys   = ['ai', 'ict', 'technical', 'fundamentals', 'liquidity'] as const
  const scoreLabel = result.master_score > 0 ? `+${result.master_score}` : `${result.master_score}`
  const sizePct    = result.position_size_pct ?? 0
  const winProb    = result.win_prob ?? 0
  const sizeColor  = sizePct >= 3 ? 'text-emerald-400'
                    : sizePct >= 0.5 ? 'text-amber-400'
                    : 'text-gray-500'

  return (
    <div className={`rounded-2xl border p-5 space-y-4 ${cfg.bg}`}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-gray-400 mb-1 font-medium uppercase tracking-wider">
            Signal Consensus
          </div>
          <div className={`text-3xl font-black tracking-tight ${cfg.color}`}>
            {cfg.label}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
            <span>Score <span className={`font-bold ${cfg.color}`}>{scoreLabel}</span> / 100</span>
            <span>·</span>
            <span>{result.consensus_pct.toFixed(0)}% weight aligned</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Consensus % ring badge */}
          <div className="relative w-16 h-16 flex-shrink-0">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#374151" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke={result.master_score >= 0 ? '#10b981' : '#ef4444'}
                strokeWidth="3"
                strokeDasharray={`${result.consensus_pct} ${100 - result.consensus_pct}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-sm font-black leading-none ${cfg.color}`}>
                {result.consensus_pct.toFixed(0)}%
              </span>
            </div>
          </div>
          {onRefresh && (
            <button onClick={onRefresh} disabled={loading}
              className="text-gray-500 hover:text-gray-300 transition-colors" title="Refresh consensus">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
      </div>

      {/* ── Score meter ─────────────────────────────────────────────────────── */}
      <ScoreMeter score={result.master_score} />

      {/* ── Component breakdown ─────────────────────────────────────────────── */}
      <div className="space-y-2.5">
        <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">
          Contribution breakdown
        </div>
        {compKeys.map(key => {
          const c = result.components[key]
          if (!c) return null
          return (
            <div key={key} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 w-48 flex-shrink-0">
                <span className="text-gray-500">{COMPONENT_ICONS[key]}</span>
                <span className="text-xs text-gray-300 truncate">{c.label}</span>
                <span className="text-xs text-gray-600 ml-auto flex-shrink-0">{c.weight_pct}%</span>
              </div>
              <SignalChip signal={c.signal} />
              <ContributionBar contribution={c.contribution} weightPct={c.weight_pct} />
            </div>
          )
        })}
      </div>

      {/* ── Position sizing (Kelly half-fraction, capped at 5%) ────────────── */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-900/40 border border-gray-700/50">
        <DollarSign size={14} className={`mt-0.5 flex-shrink-0 ${sizeColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400">Half-Kelly position</span>
            <span className={`font-bold tabular-nums ${sizeColor}`}>
              {sizePct.toFixed(2)}%
            </span>
            <span className="text-gray-500">of bankroll</span>
          </div>
          {result.position_note && (
            <p className="text-[10px] text-gray-500 mt-0.5 truncate">{result.position_note}</p>
          )}
          {sizePct > 0 && (
            <p className="text-[10px] text-gray-600 mt-0.5">
              Win prob ≈ {(winProb * 100).toFixed(0)}% at 2:1 R:R · f = (p·b−q)/b, half-fraction.
            </p>
          )}
        </div>
      </div>

      {/* ── Disclaimer ──────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-1.5 pt-1 border-t border-gray-700/50">
        <Info size={11} className="text-gray-600 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-gray-600 leading-relaxed">
          Timeframe divergence is normal — short-term SELL + long-term BUY means the asset is pulling back within an uptrend.
          The master signal reflects the weighted balance, not a prediction guarantee.
        </p>
      </div>
    </div>
  )
}
