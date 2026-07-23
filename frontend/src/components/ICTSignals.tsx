import React, { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, RefreshCw, Shield } from 'lucide-react'
import api from '@/services/api'
import { formatPrice } from '@/utils/currency'
import { formatLocalTime } from '@/utils/timezone'

interface LiveSignal {
  symbol: string
  strategy: string
  signal: 'BUY' | 'SELL' | 'HOLD'
  price: number
  entry: number
  sl: number
  tp: number
  atr: number
  generated_at: string
}

interface LiveSignalsResponse {
  symbol: string
  signals: LiveSignal[]
  errors: { strategy: string; error: string }[]
  strategies_used: string[]
  source: string
}

const STRATEGY_LABELS: Record<string, { label: string; icon: string }> = {
  BOS_FVG:        { label: 'BOS + FVG',         icon: '📐' },
  CHOCH_FVG:      { label: 'CHoCH + FVG',        icon: '🔄' },
  MSS_OrderBlock: { label: 'MSS + Order Block',  icon: '🏛️' },
  LiqSweep_FVG:   { label: 'Liq. Sweep + FVG',  icon: '🌊' },
  SR_Bounce:      { label: 'S/R Bounce',         icon: '📊' },
  RSI_OTE:        { label: 'RSI + OTE',          icon: '🎯' },
  PriceAction:    { label: 'Price Action',       icon: '🕯️' },
  MA_FVG:         { label: 'MA Cross + FVG',     icon: '📈' },
}

interface TradeSelection {
  entry: number
  sl: number
  tp: number
  strategy: string
  side: 'BUY' | 'SELL'
}

interface Props {
  symbol: string
  currency?: string
  onTrade?: (t: TradeSelection) => void
}

export default function ICTSignals({ symbol, currency = 'USD', onTrade }: Props) {
  const [data, setData] = useState<LiveSignalsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await api.get<LiveSignalsResponse>(`/backtest/${symbol.toUpperCase()}/live_signals`)
      setData(res.data)
    } catch (e: any) {
      setErr(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [symbol])

  const signalColor = (s: string) =>
    s === 'BUY' ? 'text-emerald-400' : s === 'SELL' ? 'text-red-400' : 'text-gray-400'

  const signalBg = (s: string) =>
    s === 'BUY'  ? 'bg-emerald-500/10 border-emerald-500/30'
    : s === 'SELL' ? 'bg-red-500/10 border-red-500/30'
    : 'bg-gray-700/50 border-gray-600'

  return (
    <div className="card-layer rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--text)] flex items-center gap-2 font-display">
            <Shield size={18} className="text-gold" /> ICT/SMC Live Signals
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {data?.source === 'universe_top3'
              ? 'Top 3 strategies by avg Sharpe across 28-symbol universe'
              : 'Default ICT strategies (run Universe Rankings to personalise)'}
          </p>
        </div>
        <button onClick={load} disabled={loading}
                className="text-[var(--dim)] hover:text-[var(--text)] disabled:opacity-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {err && (
        <div className="text-red-300 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</div>
      )}

      {loading && !data && (
        <div className="text-gray-500 text-sm animate-pulse">Loading ICT signals…</div>
      )}

      {data && data.signals.length === 0 && !loading && (
        <div className="text-gray-500 text-sm">No signals generated — may need more data for this symbol.</div>
      )}

      {data && data.signals.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {data.signals.map((sig) => {
            const meta = STRATEGY_LABELS[sig.strategy] || { label: sig.strategy, icon: '📊' }
            const isLong = sig.signal === 'BUY'
            const isShort = sig.signal === 'SELL'
            const isHold = sig.signal === 'HOLD'
            const slDist = Math.abs(sig.sl - sig.entry)
            const tpDist = Math.abs(sig.tp - sig.entry)
            const rr = !isHold && slDist > 0 ? tpDist / slDist : null

            return (
              <div key={sig.strategy}
                   className={`border rounded-xl p-4 ${signalBg(sig.signal)}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-sm text-gray-400">{meta.icon} {meta.label}</div>
                    <div className={`text-2xl font-bold mt-1 flex items-center gap-1 ${signalColor(sig.signal)}`}>
                      {isLong  && <TrendingUp size={20} />}
                      {isShort && <TrendingDown size={20} />}
                      {isHold  && <Minus size={20} />}
                      {sig.signal}
                    </div>
                  </div>
                  {rr !== null && (
                    <div className="text-right">
                      <div className="text-xs text-gray-500">R:R</div>
                      <div className="text-sm font-bold text-[var(--text)]">1:{rr.toFixed(2)}</div>
                    </div>
                  )}
                </div>

                {sig.signal !== 'HOLD' && (
                  <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                    <div>
                      <div className="text-gray-500">Entry</div>
                      <div className="text-blue-300 font-semibold">{formatPrice(sig.entry, currency)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">SL</div>
                      <div className="text-red-400 font-semibold">{formatPrice(sig.sl, currency)}</div>
                      <div className="text-ink-500 text-xs">
                        {sig.entry ? `${(Math.abs(sig.sl - sig.entry) / sig.entry * 100).toFixed(1)}%` : ''}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">TP</div>
                      <div className="text-emerald-400 font-semibold">{formatPrice(sig.tp, currency)}</div>
                      <div className="text-ink-500 text-xs">
                        {sig.entry ? `${(Math.abs(sig.tp - sig.entry) / sig.entry * 100).toFixed(1)}%` : ''}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="text-xs text-ink-500">
                    ATR(14): {formatPrice(sig.atr, currency)} · {formatLocalTime(sig.generated_at)}
                  </div>
                  {!isHold && onTrade && (
                    <button
                      onClick={() => onTrade({ entry: sig.entry, sl: sig.sl, tp: sig.tp, strategy: sig.strategy, side: sig.signal as 'BUY' | 'SELL' })}
                      className={`text-xs px-2 py-1 rounded font-semibold transition ${
                        isLong ? 'bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300'
                               : 'bg-red-600/30 hover:bg-red-600/50 text-red-300'
                      }`}
                    >
                      Paper Trade
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {data?.errors && data.errors.length > 0 && (
        <div className="mt-3 text-xs text-ink-500">
          {data.errors.map((e) => (
            <div key={e.strategy}>{e.strategy}: {e.error}</div>
          ))}
        </div>
      )}
    </div>
  )
}
