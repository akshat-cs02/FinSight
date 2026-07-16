import React, { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Brain, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react'
import {
  predictionService, Prediction,
  HorizonKey, HorizonPrediction, MarketRegime, HorizonOverall,
} from '@/services/predictionService'
import { formatPrice, guessCurrency } from '@/utils/currency'
import { predCache } from '@/utils/predictionCache'
import { formatLocalTime } from '@/utils/timezone'
import SignalBadge from './SignalBadge'
import ConfidenceMeter from './ConfidenceMeter'
import ForecastChart from './ForecastChart'

interface Props {
  symbol: string
  autoLoad?: boolean
  currency?: string
}

// ─── Direction visual config ────────────────────────────────────────────────
const DIR_CFG = {
  up:      { label: 'Bullish', text: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', stroke: '#10b981', Icon: TrendingUp },
  down:    { label: 'Bearish', text: 'text-red-400',     bg: 'bg-red-500/15',     border: 'border-red-500/40',     stroke: '#ef4444', Icon: TrendingDown },
  neutral: { label: 'Neutral', text: 'text-yellow-400',  bg: 'bg-yellow-500/15',  border: 'border-yellow-500/40',  stroke: '#eab308', Icon: Minus },
} as const

const HORIZON_ORDER: HorizonKey[] = ['intraday', 'short', 'mid', 'long']
const HORIZON_TABS: Record<HorizonKey, string> = {
  intraday: 'Intraday', short: 'Short-term', mid: 'Mid-term', long: 'Long-term',
}

// ─── Mini sparkline: smooth trajectory entry → predicted, with SL/TP guides ──
function Sparkline({ h }: { h: HorizonPrediction }) {
  const entry = h.entry_price
  const target = h.predicted_price ?? h.take_profit
  const cfg = DIR_CFG[h.direction]
  const W = 180, H = 44, pad = 4

  if (entry == null || target == null) {
    return <div className="h-11 flex items-center text-xs text-gray-600">No trajectory</div>
  }

  // Build a gentle curve from entry (left) to target (right).
  const vals = [entry, entry + (target - entry) * 0.45, entry + (target - entry) * 0.8, target]
  const guides = [h.stop_loss, h.take_profit].filter((v): v is number => v != null)
  const allV = [...vals, ...guides]
  const min = Math.min(...allV), max = Math.max(...allV)
  const span = max - min || 1
  const x = (i: number) => pad + (i / (vals.length - 1)) * (W - 2 * pad)
  const y = (v: number) => H - pad - ((v - min) / span) * (H - 2 * pad)
  const path = vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-11" preserveAspectRatio="none">
      {h.stop_loss != null && (
        <line x1={0} x2={W} y1={y(h.stop_loss)} y2={y(h.stop_loss)} stroke="#ef4444" strokeWidth={0.6} strokeDasharray="3 3" opacity={0.5} />
      )}
      {h.take_profit != null && (
        <line x1={0} x2={W} y1={y(h.take_profit)} y2={y(h.take_profit)} stroke="#10b981" strokeWidth={0.6} strokeDasharray="3 3" opacity={0.5} />
      )}
      <path d={path} fill="none" stroke={cfg.stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(vals.length - 1)} cy={y(target)} r={2.5} fill={cfg.stroke} />
    </svg>
  )
}

function Level({ label, value, cur, tone }: { label: string; value: number | null; cur: string; tone: string }) {
  return (
    <div className="bg-gray-900/50 rounded-lg px-2.5 py-1.5">
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-semibold ${tone}`}>{value != null ? formatPrice(value, cur) : '—'}</div>
    </div>
  )
}

// ─── Tabbed multi-horizon outlook ───────────────────────────────────────────
function HorizonTabs({ horizons, overall, regime, cur }: {
  horizons: Record<HorizonKey, HorizonPrediction>
  overall?: HorizonOverall
  regime?: MarketRegime
  cur: string
}) {
  const [active, setActive] = useState<HorizonKey>('intraday')
  const h = horizons[active]
  if (!h) return null
  const cfg = DIR_CFG[h.direction]

  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Activity size={15} className="text-blue-400" /> Multi-Horizon Outlook
        </div>
        {overall && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${DIR_CFG[overall.score > 0 ? 'up' : overall.score < 0 ? 'down' : 'neutral'].bg} ${DIR_CFG[overall.score > 0 ? 'up' : overall.score < 0 ? 'down' : 'neutral'].text}`}>
            Consensus: {overall.master_signal.replace('_', ' ')} ({overall.score > 0 ? '+' : ''}{overall.score})
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900/60 rounded-lg p-1">
        {HORIZON_ORDER.map((k) => {
          const hz = horizons[k]
          const kc = hz ? DIR_CFG[hz.direction] : DIR_CFG.neutral
          return (
            <button key={k} onClick={() => setActive(k)}
              className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition flex items-center justify-center gap-1 ${
                active === k ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full`} style={{ backgroundColor: kc.stroke }} />
              {HORIZON_TABS[k]}
            </button>
          )
        })}
      </div>

      {/* Active horizon body */}
      <div className={`rounded-lg border ${cfg.border} ${cfg.bg} p-3 space-y-3`}>
        <div className="flex items-center justify-between">
          <div>
            <div className={`flex items-center gap-1.5 font-bold ${cfg.text}`}>
              <cfg.Icon size={16} /> {cfg.label}
            </div>
            <div className="text-[11px] text-gray-400">{h.timeframe} · {h.source}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">Confidence</div>
            <div className={`text-lg font-bold ${cfg.text}`}>{h.confidence.toFixed(0)}%</div>
          </div>
        </div>

        <Sparkline h={h} />

        <div className="grid grid-cols-4 gap-1.5">
          <Level label="Entry" value={h.entry_price} cur={cur} tone="text-white" />
          <Level label="Stop" value={h.stop_loss} cur={cur} tone="text-red-400" />
          <Level label="Target" value={h.take_profit} cur={cur} tone="text-emerald-400" />
          <div className="bg-gray-900/50 rounded-lg px-2.5 py-1.5">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide">R:R</div>
            <div className="text-sm font-semibold text-blue-300">{h.risk_reward_ratio != null ? `1:${h.risk_reward_ratio}` : '—'}</div>
          </div>
        </div>

        {h.rationale && <p className="text-xs text-gray-400 leading-relaxed">{h.rationale}</p>}
      </div>

      {regime && regime.state !== 'unknown' && (
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          <span className={`px-2 py-0.5 rounded-full font-medium ${
            regime.state === 'volatile' ? 'bg-red-500/15 text-red-300' :
            regime.state === 'trending' ? 'bg-emerald-500/15 text-emerald-300' :
            'bg-gray-600/40 text-gray-300'
          }`}>{regime.state.toUpperCase()}</span>
          {regime.atr_ratio != null && <span>ATR {regime.atr_ratio}× baseline</span>}
          {regime.position_sizing === 'reduced' && <span className="text-yellow-400">· reduce position size</span>}
        </div>
      )}
    </div>
  )
}

export default function PredictionCard({ symbol, autoLoad = true, currency }: Props) {
  const [pred, setPred] = useState<Prediction | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const cur = currency || guessCurrency(symbol)

  const fetch = async (force = false) => {
    // Check cache first — avoids duplicate API calls across components
    if (!force) {
      const cached = predCache.get(symbol)
      if (cached) {
        setPred(cached)
        return
      }
    }
    setLoading(true)
    setErr(null)
    try {
      const r = await predictionService.getPrediction(symbol)
      predCache.set(symbol, r)
      setPred(r)
    } catch (e: any) {
      setErr(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (autoLoad) fetch()
  }, [symbol])

  if (err) return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6">
      <h3 className="text-red-300 font-bold mb-1">AI Prediction unavailable</h3>
      <p className="text-red-300/80 text-sm">{err}</p>
      <button onClick={() => fetch()} className="mt-3 text-xs px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 rounded text-red-200">Retry</button>
    </div>
  )

  if (!pred && loading) return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2 text-blue-300 animate-pulse">
        <Brain size={18} /> Running ensemble (LSTM + XGBoost)…
      </div>
    </div>
  )

  if (!pred) return (
    <div className="glass-card p-6">
      <button onClick={() => fetch()} className="text-blue-400 hover:text-blue-300 text-sm">Load AI prediction</button>
    </div>
  )

  const up = pred.change_percent >= 0

  return (
    <div className="bg-gradient-to-br from-blue-900/30 via-gray-800 to-purple-900/20 border border-blue-500/30 rounded-2xl p-6 space-y-5">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 text-sm text-blue-300 mb-1 font-display">
            <Brain size={16} /> AI Prediction — {pred.symbol}
          </div>
          <p className="text-xs text-gray-400">
            Ensemble of {pred.models_used.join(' + ').toUpperCase()} · Generated {formatLocalTime(pred.generated_at)}
          </p>
        </div>
        <button onClick={() => fetch(true)} disabled={loading} title="Refresh prediction" className="text-gray-400 hover:text-white disabled:opacity-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Stale model warning */}
      {pred.stale_models && pred.stale_models.length > 0 && (
        <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-yellow-300">
            <span className="font-semibold">Stale model detected: </span>
            {pred.stale_models.join(', ')} — predictions may not reflect recent price levels.{' '}
            <span className="text-yellow-400 underline cursor-pointer" onClick={() => window.location.href = '/predictions'}>
              Retrain on the AI panel →
            </span>
          </div>
        </div>
      )}

      {/* Multi-horizon outlook — Intraday / Short / Mid / Long tabs */}
      {pred.horizons && (
        <HorizonTabs horizons={pred.horizons} overall={pred.overall} regime={pred.regime} cur={cur} />
      )}

      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-gray-400">Current</p>
          <p className="text-2xl font-bold text-white">{formatPrice(pred.current_price, cur)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Predicted (next close)</p>
          <p className="text-2xl font-bold text-white">{formatPrice(pred.predicted_price, cur)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Change</p>
          <p className={`text-2xl font-bold flex items-center gap-1 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
            {up ? <ArrowUp size={20} /> : <ArrowDown size={20} />}
            {Math.abs(pred.change_percent).toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        <div className="md:col-span-2">
          <ConfidenceMeter confidence={pred.confidence} />
          <div className="flex gap-3 mt-2 text-xs text-gray-400 flex-wrap">
            {pred.rsi !== null && <span>RSI(14): <span className="text-white">{pred.rsi.toFixed(2)}</span></span>}
            {pred.atr !== null && <span>ATR(14): <span className="text-white">{formatPrice(pred.atr, cur)}</span></span>}
            {pred.risk_reward_ratio !== null && <span>R:R: <span className="text-white">1 : {pred.risk_reward_ratio}</span></span>}
          </div>
        </div>
        <div className="flex flex-col items-center md:items-end gap-2">
          <SignalBadge signal={pred.signal} size="lg" />
          <span className={`text-xs font-semibold ${
            pred.trend === 'BULLISH' ? 'text-emerald-400' :
            pred.trend === 'BEARISH' ? 'text-red-400' :
            'text-gray-400'
          }`}>{pred.trend}</span>
        </div>
      </div>

      {/* Trade plan: Entry / Stop Loss / Take Profit */}
      {pred.signal !== 'HOLD' && pred.entry_price !== null && (
        <div className="grid grid-cols-3 gap-3 bg-gray-900/50 border border-gray-700 rounded-xl p-4">
          <div>
            <p className="text-xs text-gray-400 mb-1">Entry Price (EP)</p>
            <p className="text-lg font-bold text-blue-300">{formatPrice(pred.entry_price!, cur)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Stop Loss (SL)</p>
            <p className="text-lg font-bold text-red-400">{formatPrice(pred.stop_loss!, cur)}</p>
            <p className="text-xs text-gray-500">
              {pred.stop_loss && pred.entry_price
                ? `${((Math.abs(pred.stop_loss - pred.entry_price) / pred.entry_price) * 100).toFixed(2)}% risk`
                : ''}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Take Profit (TP)</p>
            <p className="text-lg font-bold text-emerald-400">{formatPrice(pred.take_profit!, cur)}</p>
            <p className="text-xs text-gray-500">
              {pred.take_profit && pred.entry_price
                ? `${((Math.abs(pred.take_profit - pred.entry_price) / pred.entry_price) * 100).toFixed(2)}% target`
                : ''}
            </p>
          </div>
        </div>
      )}

      {/* Score breakdown */}
      {pred.score_breakdown && (
        <details className="bg-gray-900/50 border border-gray-700 rounded-xl p-3">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-white">
            Signal score breakdown (total: {pred.score_breakdown.total_score})
          </summary>
          <div className="mt-2 space-y-1 text-xs">
            {Object.entries(pred.score_breakdown).filter(([k]) => k !== 'total_score').map(([k, v]: [string, any]) => (
              <div key={k} className="flex justify-between text-gray-300">
                <span className="capitalize">{k.replace(/_/g, ' ')}</span>
                <span className={v.weight > 0 ? 'text-emerald-400' : v.weight < 0 ? 'text-red-400' : 'text-gray-500'}>
                  weight {v.weight > 0 ? '+' : ''}{v.weight}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Raw model predictions vs clipped ensemble */}
      {pred.model_predictions_raw && Object.keys(pred.model_predictions_raw).length > 0 && (
        <div className="bg-gray-900/40 rounded-lg px-3 py-2 text-xs text-gray-400 flex flex-wrap gap-4">
          {Object.entries(pred.model_predictions_raw).map(([model, rawPrice]) => {
            const clipped = pred.model_predictions?.[model]
            const wasClipped = clipped !== undefined && Math.abs(rawPrice - clipped) > 0.01
            const cur = guessCurrency(symbol)
            return (
              <span key={model}>
                <span className="uppercase font-semibold text-gray-300">{model}:</span>{' '}
                {wasClipped ? (
                  <>
                    <span className="line-through text-red-400/70">{formatPrice(rawPrice, cur, 2)}</span>
                    {' → '}
                    <span className="text-yellow-300">{formatPrice(clipped!, cur, 2)}</span>
                    <span className="text-yellow-500 ml-1">(clipped)</span>
                  </>
                ) : (
                  <span className="text-white">{formatPrice(rawPrice, cur, 2)}</span>
                )}
              </span>
            )
          })}
        </div>
      )}

      {/* SHAP feature importance */}
      {pred.shap_values && Object.keys(pred.shap_values).length > 0 && (
        <details className="bg-gray-900/50 border border-gray-700 rounded-xl p-3">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-white">
            XGBoost feature importance (SHAP)
          </summary>
          <div className="mt-2 space-y-1">
            {Object.entries(pred.shap_values)
              .sort(([, a], [, b]) => Math.abs(b as number) - Math.abs(a as number))
              .slice(0, 8)
              .map(([feat, val]) => {
                const v = val as number
                const pct = Math.abs(v) * 100
                return (
                  <div key={feat} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400 w-28 truncate">{feat.replace(/_/g, ' ')}</span>
                    <div className="flex-1 bg-gray-700 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${v >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(100, pct * 10)}%` }}
                      />
                    </div>
                    <span className={`w-14 text-right ${v >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {v >= 0 ? '+' : ''}{v.toFixed(3)}
                    </span>
                  </div>
                )
              })}
          </div>
        </details>
      )}

      <div>
        <p className="text-sm text-gray-400 mb-2">7-day forecast (LSTM recursive)</p>
        <ForecastChart
          symbol={symbol}
          currentPrice={pred.current_price}
          predictedPrice={pred.predicted_price}
          forecast={pred.forecast_7day || []}
        />
        {pred.model_predictions && (
          <div className="mt-2 flex gap-4 text-xs text-gray-400">
            {Object.entries(pred.model_predictions).map(([k, v]) => (
              <span key={k}><b className="uppercase">{k}</b>: {formatPrice(v, cur)}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
