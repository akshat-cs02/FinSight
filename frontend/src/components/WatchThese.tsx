import { useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import signalService, { BreakoutCandidate } from '@/services/signalService'

const REASON_COLORS: Record<string, string> = {
  'Near 52w high':   'bg-purple-500/20 text-purple-300',
  'Testing 52w high': 'bg-blue-500/20 text-blue-300',
  'ATR compression':  'bg-yellow-500/20 text-yellow-300',
  'Volatility coiling': 'bg-yellow-500/20 text-yellow-300',
  'Volume spike':     'bg-emerald-500/20 text-emerald-300',
  'Above-avg volume': 'bg-green-500/20 text-green-300',
  'Above EMA21':      'bg-indigo-500/20 text-indigo-300',
}

function ReasonChip({ reason }: { reason: string }) {
  const cls = REASON_COLORS[reason] ?? 'bg-[var(--raised)] text-[var(--dim)]'
  return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{reason}</span>
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1 bg-[var(--border)] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-[var(--dim)] w-7 text-right">{value}</span>
    </div>
  )
}

export default function WatchThese() {
  const [candidates, setCandidates] = useState<BreakoutCandidate[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    signalService.getBreakouts()
      .then(setCandidates)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!loading && candidates.length === 0) return null

  return (
    <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Eye size={18} className="text-gold" />
        <h2 className="text-lg font-semibold text-[var(--text)]">Watch These Stocks</h2>
        <span className="text-xs text-[var(--faint)]">Near breakout</span>
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 bg-[var(--raised)] animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {!loading && candidates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {candidates.map((c) => (
            <div key={c.symbol} className="card-layer rounded-xl p-3 space-y-2">
              <div className="flex items-start justify-between">
                <span className="font-bold text-[var(--text)] text-sm">{c.symbol}</span>
                <div className="text-right">
                  <div className="text-[var(--text)] text-sm font-medium">{c.price}</div>
                  <div className={`text-xs ${c.change_percent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {c.change_percent >= 0 ? '+' : ''}{c.change_percent.toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-[var(--faint)]">
                  <span>Technical</span>
                </div>
                <ScoreBar value={c.technical_score} color="bg-gold" />
              </div>

              <div className="flex flex-wrap gap-1">
                {(c.all_reasons ?? [c.reason]).slice(0, 2).map((r) => (
                  <ReasonChip key={r} reason={r} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
