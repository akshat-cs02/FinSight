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
      <div className="flex justify-between items-center flex-wrap gap-3 animate-spring-in">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2 font-display">
            <Brain size={28} className="text-[#7C3AED]" /> AI Predictions
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">LSTM + XGBoost ensemble. Trained per symbol on Yahoo Finance data.</p>
        </div>
      </div>

      {/* Symbol selector */}
      <div className="card-accent-purple p-4 animate-spring-up stagger-1">
        <div className="flex flex-wrap gap-2">
          {(models || []).map((m) => (
            <button
              key={m.symbol}
              onClick={() => setSelected(m.symbol)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                selected === m.symbol ? 'bg-[#7C3AED]/20 text-white border-[#7C3AED]/40' :
                'bg-transparent text-gray-400 border-white/5 hover:text-white hover:bg-white/5'
              }`}>
              {m.symbol}
              {(m.lstm || m.xgb) ? (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[#00D4FF]" />
              ) : (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-gray-600" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Live TradingView chart */}
      <div className="card-flat p-3 animate-spring-up stagger-2">
        <div className="flex items-center justify-between px-1 pb-2">
          <h2 className="text-sm font-semibold text-gray-300">Live Chart — <span className="text-white">{selected}</span></h2>
          <span className="text-xs text-gray-500">TradingView</span>
        </div>
        <TradingViewWidget symbol={selected} height={420} />
      </div>

      {/* Live prediction */}
      <PredictionCard symbol={selected} />

      {/* Model management */}
      <div className="glass-card p-6 animate-spring-up stagger-3">
        <div className="section-header purple">
          <h2 className="section-header-title text-white flex items-center gap-2"><Cpu size={18} /> Model Status</h2>
        </div>
        {models === null && <div className="text-gray-500 text-sm">Loading…</div>}
        {models && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-white/5">
                  <th className="text-left py-2 px-2">Symbol</th>
                  <th className="text-center py-2 px-2">LSTM</th>
                  <th className="text-center py-2 px-2">XGBoost</th>
                  <th className="text-right py-2 px-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.symbol} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="py-2 px-2 text-white font-medium font-display">{m.symbol}</td>
                    <td className="py-2 px-2 text-center">
                      {m.lstm ? <CheckCircle2 className="inline text-purple-400" size={16} /> :
                               <Circle className="inline text-gray-500" size={16} />}
                    </td>
                    <td className="py-2 px-2 text-center">
                      {m.xgb ? <CheckCircle2 className="inline text-purple-400" size={16} /> :
                               <Circle className="inline text-gray-500" size={16} />}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <button
                        onClick={() => startTrain(m.symbol)}
                        disabled={training === m.symbol}
                        className="text-xs px-3 py-1 bg-[#7C3AED]/20 hover:bg-[#7C3AED]/30 disabled:opacity-50 rounded text-purple-300 inline-flex items-center gap-1 border border-[#7C3AED]/30 transition-colors"
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
            <label className="block text-xs text-gray-400 mb-1">Train any symbol</label>
            <input value={trainSym} onChange={(e) => setTrainSym(e.target.value.toUpperCase())}
                   placeholder="e.g. NVDA"
                   className="input-glow w-40 text-sm" />
          </div>
          <button onClick={() => startTrain(trainSym)} disabled={!trainSym || !!training}
                  className="btn-glow text-sm px-4 py-2 disabled:opacity-50">
            Train
          </button>
        </div>
      </div>

      {/* History */}
      <div className="glass-card p-6 animate-spring-up stagger-4">
        <div className="section-header cyan">
          <h2 className="section-header-title text-white">Prediction History — {selected}</h2>
        </div>
        {history.length === 0 ? (
          <div className="text-gray-500 text-sm py-3">No history yet for {selected}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-white/5">
                  <th className="text-left py-2 px-2">When</th>
                  <th className="text-right py-2 px-2">Current</th>
                  <th className="text-right py-2 px-2">Predicted</th>
                  <th className="text-right py-2 px-2">Δ %</th>
                  <th className="text-right py-2 px-2">Conf</th>
                  <th className="text-center py-2 px-2">Signal</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="py-2 px-2 text-gray-300">{formatLocalDateTime(h.created_at)}</td>
                    <td className="py-2 px-2 text-right"><PriceDisplay price={h.current_price} currency={guessCurrency(selected)} size="sm" /></td>
                    <td className="py-2 px-2 text-right"><PriceDisplay price={h.predicted_price} currency={guessCurrency(selected)} size="sm" color="default" /></td>
                    <td className={`py-2 px-2 text-right font-mono tabular-nums ${h.change_percent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {h.change_percent >= 0 ? '+' : ''}{h.change_percent.toFixed(2)}%
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums text-gray-300">{h.confidence.toFixed(0)}%</td>
                    <td className="py-2 px-2 text-center"><SignalBadge signal={h.signal} size="sm" /></td>
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
