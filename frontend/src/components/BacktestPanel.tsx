import React, { useEffect, useState } from 'react'
import { BarChart3, TrendingUp, TrendingDown, Activity, RefreshCw, AlertTriangle } from 'lucide-react'
import { predictionService, BacktestResult } from '@/services/predictionService'
import { formatPrice, guessCurrency } from '@/utils/currency'
import { Lift } from '@/components/ui/motion'

interface Props {
  symbol: string
}

export default function BacktestPanel({ symbol }: Props) {
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [period, setPeriod] = useState('2y')

  const cur = guessCurrency(symbol)

  const fetch = async (force = false) => {
    setLoading(true)
    setErr(null)
    try {
      const r = await predictionService.getBacktest(symbol, period, 5, force)
      setResult(r)
    } catch (e: any) {
      setErr(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetch()
  }, [symbol, period])

  if (err) return (
    <Lift className="card-layer rounded-xl p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="text-yellow-400 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-bold text-[var(--text)] mb-1">Backtest unavailable</h3>
          <p className="text-xs text-[var(--dim)]">{err}</p>
        </div>
      </div>
    </Lift>
  )

  if (loading) return (
    <Lift className="card-layer rounded-xl p-5">
      <div className="flex items-center gap-2 text-blue-300 animate-pulse">
        <Activity size={16} /> Running walk-forward backtest…
      </div>
    </Lift>
  )

  if (!result) return null

  const { model, summary, baselines, equity_curve, predictions_vs_actuals } = result
  const up = model.strategy_return >= 0

  return (
    <Lift className="bg-[var(--panel)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-blue-300 font-display">
          <BarChart3 size={16} /> ML Model Backtest — {symbol}
        </div>
        <div className="flex items-center gap-2">
          <select value={period} onChange={(e) => setPeriod(e.target.value)}
            className="bg-[var(--raised)] text-xs text-[var(--text)] rounded px-2 py-1 border border-[var(--border)]">
            <option value="1y">1 Year</option>
            <option value="2y">2 Years</option>
            <option value="3y">3 Years</option>
            <option value="5y">5 Years</option>
          </select>
          <button onClick={() => fetch(true)} disabled={loading} title="Refresh" className="text-[var(--dim)] hover:text-[var(--text)] disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Return" value={`${summary.total_return_pct.toFixed(1)}%`} tone={up ? 'text-emerald-400' : 'text-red-400'} />
        <MetricCard label="vs Buy/Hold" value={`${summary.benchmark_return_pct.toFixed(1)}%`} tone="text-[var(--dim)]" />
        <MetricCard label="Max DD" value={`${summary.max_drawdown_pct.toFixed(1)}%`} tone="text-red-400" />
        <MetricCard label="Sharpe" value={summary.sharpe_ratio.toFixed(2)} tone={summary.sharpe_ratio >= 1 ? 'text-emerald-400' : summary.sharpe_ratio >= 0 ? 'text-yellow-400' : 'text-red-400'} />
        <MetricCard label="Win Rate" value={`${(model.win_rate * 100).toFixed(0)}%`} tone="text-blue-300" />
        <MetricCard label="Dir. Accuracy" value={`${(model.directional_accuracy * 100).toFixed(0)}%`} tone="text-blue-300" />
        <MetricCard label="RMSE" value={model.rmse.toFixed(2)} tone="text-[var(--dim)]" />
        <MetricCard label="MAPE" value={`${model.mape.toFixed(1)}%`} tone={model.mape < 3 ? 'text-emerald-400' : model.mape < 6 ? 'text-yellow-400' : 'text-red-400'} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Trades" value={summary.total_trades.toString()} tone="text-[var(--text)]" />
        <MetricCard label="W / L" value={`${summary.winning_trades} / ${summary.losing_trades}`} tone="text-[var(--text)]" />
      </div>

      {equity_curve.length > 0 && (
        <div>
          <p className="text-xs text-[var(--dim)] mb-2">Equity Curve (strategy vs buy & hold)</p>
          <div className="bg-[var(--raised)] rounded-lg p-3">
            <MiniChart data={equity_curve} />
          </div>
        </div>
      )}

      <details className="bg-[var(--raised)] border border-[var(--border)] rounded-xl p-3">
        <summary className="text-xs text-[var(--dim)] cursor-pointer hover:text-[var(--text)]">Baseline comparison</summary>
        <div className="mt-2 space-y-1 text-xs">
          {Object.entries(baselines).map(([name, m]) => (
            <div key={name} className="flex justify-between text-[var(--dim)]">
              <span className="capitalize">{name.replace(/_/g, ' ')}</span>
              <span>RMSE {m.rmse.toFixed(2)} · MAE {m.mae.toFixed(2)} · MAPE {m.mape.toFixed(1)}% · R² {m.r2.toFixed(3)}</span>
            </div>
          ))}
        </div>
      </details>
    </Lift>
  )
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="bg-[var(--raised)] rounded-lg px-3 py-2">
      <div className="text-[10px] text-[var(--dim)] uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-semibold font-mono tabular-nums ${tone}`}>{value}</div>
    </div>
  )
}

function MiniChart({ data }: { data: { date: string; strategy: number; benchmark: number }[] }) {
  const W = 600, H = 120, pad = 4
  if (data.length < 2) return null

  const allVals = data.flatMap(d => [d.strategy, d.benchmark])
  const min = Math.min(...allVals), max = Math.max(...allVals)
  const span = max - min || 1

  const x = (i: number) => pad + (i / (data.length - 1)) * (W - 2 * pad)
  const y = (v: number) => H - pad - ((v - min) / span) * (H - 2 * pad)

  const strategyPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.strategy).toFixed(1)}`).join(' ')
  const benchmarkPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.benchmark).toFixed(1)}`).join(' ')

  const step = Math.max(1, Math.floor(data.length / 6))
  const xLabels = data.filter((_, i) => i % step === 0).map(d => d.date.slice(5))

  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full h-28" preserveAspectRatio="xMidYMid meet">
      <path d={strategyPath} fill="none" stroke="#3b82f6" strokeWidth={2} />
      <path d={benchmarkPath} fill="none" stroke="#6b7280" strokeWidth={1.5} strokeDasharray="4 3" />
      <text x={W - 60} y={14} fill="#3b82f6" fontSize={9}>Strategy</text>
      <text x={W - 60} y={26} fill="#6b7280" fontSize={9}>Buy & Hold</text>
      {xLabels.map((label, i) => (
        <text key={i} x={x(i * step)} y={H + 12} fill="#4b5563" fontSize={8} textAnchor="middle">{label}</text>
      ))}
    </svg>
  )
}
