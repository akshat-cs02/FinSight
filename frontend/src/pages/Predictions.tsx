import React, { useEffect, useState } from 'react'
import { Brain, Cpu, PlayCircle, CheckCircle2, Circle } from 'lucide-react'
import { predictionService, ModelStatus, PredictionHistoryRow } from '@/services/predictionService'
import { predCache } from '@/utils/predictionCache'
import { formatLocalDateTime } from '@/utils/timezone'
import PredictionCard from '@/components/Prediction/PredictionCard'
import SignalBadge from '@/components/Prediction/SignalBadge'
import TradingViewWidget from '@/components/charts/TradingViewWidget'
import PriceDisplay from '@/components/PriceDisplay'
import { formatPrice, guessCurrency } from '@/utils/currency'
import toast from 'react-hot-toast'

export default function PredictionsPage() {
  const [models, setModels] = useState<ModelStatus[] | null>(null)
  const [selected, setSelected] = useState<string>('AAPL')
  const [history, setHistory] = useState<PredictionHistoryRow[]>([])
  const [training, setTraining] = useState<string | null>(null)
  const [trainSym, setTrainSym] = useState<string>('AAPL')

  const loadStatus = async () => {
    const r = await predictionService.listModels()
    setModels(r.models)
  }

  const loadHistory = async (sym: string) => {
    try {
      const r = await predictionService.getHistory(sym, 20)
      setHistory(r.history)
    } catch {
      setHistory([])
    }
  }

  useEffect(() => { loadStatus() }, [])
  useEffect(() => { loadHistory(selected) }, [selected])

  const startTrain = async (symbol: string) => {
    predCache.invalidate(symbol)
    setTraining(symbol)
    try {
      await predictionService.trainModel(symbol, 6)
      toast.success(`Training started for ${symbol} (background, ~30-60s)`)
      let tries = 0
      const id = setInterval(async () => {
        tries++
        await loadStatus()
        if (tries >= 12) clearInterval(id)
      }, 10000)
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Train failed')
    } finally {
      setTimeout(() => setTraining(null), 2000)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 min-h-screen">
      <div className="flex justify-between items-center flex-wrap gap-3 animate-spring-up stagger-0">
        <div>
          <h1 className="text-3xl font-bold text-ink-800 flex items-center gap-2 font-display">
            <Brain size={28} className="text-purple-400" /> AI Predictions
          </h1>
          <p className="text-ink-500 text-sm mt-0.5">LSTM + XGBoost ensemble. Trained per symbol on Yahoo Finance data.</p>
        </div>
      </div>

      {/* Symbol selector */}
      <div className="p-1 card-layer rounded-xl animate-spring-up stagger-1">
        <div className="flex flex-wrap gap-2">
          {(models || []).map((m) => (
            <button
              key={m.symbol}
              onClick={() => setSelected(m.symbol)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                selected === m.symbol
                  ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20 shadow-sm'
                  : 'text-ink-500 hover:text-ink-700 hover:bg-white/[0.03]'
              }`}>
              {m.symbol}
              {(m.lstm || m.xgb) ? (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#00D4FF]" />
              ) : (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-ink-400" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Live TradingView chart */}
      <div className="card-layer card-flat p-3 animate-spring-up stagger-2">
        <div className="flex items-center justify-between px-1 pb-2">
          <h2 className="text-sm font-semibold text-ink-600">Live Chart — <span className="text-ink-800">{selected}</span></h2>
          <span className="text-xs text-ink-500">TradingView</span>
        </div>
        <TradingViewWidget symbol={selected} height={420} />
      </div>

      {/* Live prediction */}
      <PredictionCard symbol={selected} />

      {/* Model management */}
      <div className="card-layer rounded-xl p-5 animate-spring-up stagger-3">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-[3px] h-5 rounded-full bg-purple-400/60" />
          <h2 className="text-base font-bold text-ink-800 font-display tracking-tight flex items-center gap-2"><Cpu size={18} /> Model Status</h2>
        </div>
        {models === null && <div className="text-ink-500 text-sm">Loading…</div>}
        {models && (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className="text-center">LSTM</th>
                  <th className="text-center">XGBoost</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.symbol}>
                    <td className="font-medium font-display">{m.symbol}</td>
                    <td className="text-center">
                      {m.lstm ? <CheckCircle2 className="inline text-purple-400" size={16} /> :
                               <Circle className="inline text-ink-500" size={16} />}
                    </td>
                    <td className="text-center">
                      {m.xgb ? <CheckCircle2 className="inline text-purple-400" size={16} /> :
                               <Circle className="inline text-ink-500" size={16} />}
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => startTrain(m.symbol)}
                        disabled={training === m.symbol}
                        className="btn-purple text-xs px-3 py-1 disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        <PlayCircle size={12} /> {training === m.symbol ? 'Started…' : 'Retrain'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Train custom symbol */}
        <div className="mt-4 flex gap-2 items-end">
          <div>
            <label className="block text-xs text-ink-500 mb-1">Train any symbol</label>
            <input value={trainSym} onChange={(e) => setTrainSym(e.target.value.toUpperCase())}
                   placeholder="e.g. NVDA"
                   className="input-glow w-40 text-sm" />
          </div>
          <button onClick={() => startTrain(trainSym)} disabled={!trainSym || !!training}
                  className="btn-purple text-sm px-4 py-2 disabled:opacity-50">
            Train
          </button>
        </div>
      </div>

      {/* History */}
      <div className="card-layer rounded-xl p-5 animate-spring-up stagger-4">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-[3px] h-5 rounded-full bg-purple-400/60" />
          <h2 className="text-base font-bold text-ink-800 font-display tracking-tight">Prediction History — {selected}</h2>
        </div>
        {history.length === 0 ? (
          <div className="text-ink-500 text-sm py-3">No history yet for {selected}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>When</th>
                  <th className="text-right">Current</th>
                  <th className="text-right">Predicted</th>
                  <th className="text-right">Δ %</th>
                  <th className="text-right">Conf</th>
                  <th className="text-center">Signal</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="text-ink-600">{formatLocalDateTime(h.created_at)}</td>
                    <td className="text-right"><PriceDisplay price={h.current_price} currency={guessCurrency(selected)} size="sm" /></td>
                    <td className="text-right"><PriceDisplay price={h.predicted_price} currency={guessCurrency(selected)} size="sm" color="default" /></td>
                    <td className={`text-right font-mono tabular-nums ${h.change_percent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {h.change_percent >= 0 ? '+' : ''}{h.change_percent.toFixed(2)}%
                    </td>
                    <td className="text-right font-mono tabular-nums text-ink-600">{h.confidence.toFixed(0)}%</td>
                    <td className="text-center"><SignalBadge signal={h.signal} size="sm" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
