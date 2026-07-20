import React, { useEffect, useState, type ReactNode } from 'react'
import { TrendingUp, TrendingDown, CheckCircle, XCircle, Clock, Zap } from 'lucide-react'
import signalService, { IntradaySignal } from '@/services/signalService'

export default function SignalActivity() {
  const [pending, setPending] = useState<IntradaySignal[]>([])
  const [resolved, setResolved] = useState<IntradaySignal[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const data = await signalService.getActivity(20)
      setPending(data.pending)
      setResolved(data.resolved)
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 20000)
    return () => clearInterval(id)
  }, [])

  const all = [...pending, ...resolved].slice(0, 30)

  if (loading && all.length === 0) {
    return (
      <div className="bg-[#141414] rounded-xl border border-white/5 p-5">
        <div className="h-32 flex items-center justify-center text-white/30 text-sm">Loading activity...</div>
      </div>
    )
  }

  const tpCount = resolved.filter((s) => s.outcome === 'TP_HIT').length
  const slCount = resolved.filter((s) => s.outcome === 'SL_HIT').length
  const activeCount = pending.length

  return (
    <div className="bg-[#141414] rounded-xl border border-white/5 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-gold" />
          <h2 className="text-lg font-semibold text-white">Signal Activity</h2>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/40">
          <span className="flex items-center gap-1"><Clock size={11} /> Live</span>
        </div>
      </div>

      {/* Mini stats bar */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-white/[0.03] rounded-lg px-3 py-2 text-center border border-white/5">
          <div className="text-lg font-bold text-gold">{activeCount}</div>
          <div className="text-[10px] text-white/40">Active</div>
        </div>
        <div className="bg-white/[0.03] rounded-lg px-3 py-2 text-center border border-white/5">
          <div className="text-lg font-bold text-emerald-400">{tpCount}</div>
          <div className="text-[10px] text-white/40">TP Hit</div>
        </div>
        <div className="bg-white/[0.03] rounded-lg px-3 py-2 text-center border border-white/5">
          <div className="text-lg font-bold text-rose-400">{slCount}</div>
          <div className="text-[10px] text-white/40">SL Hit</div>
        </div>
      </div>

      {/* Activity feed */}
      <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1 scrollbar-thin">
        {all.length === 0 && (
          <div className="text-center py-6 text-white/30 text-sm">
            No signal activity yet — signals generate every 6s in the background.
          </div>
        )}
        {all.map((sig) => (
          <SignalRow key={`${sig.id}-${sig.outcome}`} signal={sig} />
        ))}
      </div>
    </div>
  )
}

function SignalRow({ signal }: { signal: IntradaySignal }) {
  const isBuy = signal.signal === 'BUY'
  const Icon = isBuy ? TrendingUp : TrendingDown
  const iconColor = isBuy ? 'text-emerald-400' : 'text-rose-400'

  let outcomeBadge: ReactNode = null
  if (signal.outcome === 'PENDING') {
    outcomeBadge = (
      <span className="flex items-center gap-1 text-[10px] text-yellow-400/70">
        <Clock size={10} /> Pending
      </span>
    )
  } else if (signal.outcome === 'TP_HIT') {
    outcomeBadge = (
      <span className="flex items-center gap-1 text-[10px] text-emerald-400">
        <CheckCircle size={10} /> TP +{signal.pnl_r?.toFixed(1)}R
      </span>
    )
  } else if (signal.outcome === 'SL_HIT') {
    outcomeBadge = (
      <span className="flex items-center gap-1 text-[10px] text-rose-400">
        <XCircle size={10} /> SL -1R
      </span>
    )
  } else {
    outcomeBadge = (
      <span className="text-[10px] text-white/30">Expired</span>
    )
  }

  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs ${
        signal.outcome === 'TP_HIT'
          ? 'bg-emerald-950/20 border border-emerald-800/15'
          : signal.outcome === 'SL_HIT'
          ? 'bg-rose-950/20 border border-rose-800/15'
          : 'bg-white/[0.02] border border-white/5'
      }`}
    >
      <Icon size={14} className={`${iconColor} shrink-0`} />
      <span className="font-semibold text-white/80 min-w-[60px]">{signal.symbol}</span>
      <span className={`text-[10px] font-medium ${iconColor} min-w-[30px]`}>
        {isBuy ? 'BUY' : 'SELL'}
      </span>
      <div className="ml-auto flex items-center gap-2">{outcomeBadge}</div>
    </div>
  )
}
