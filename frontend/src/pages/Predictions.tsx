import React, { useEffect, useState } from 'react'
import { Brain, Cpu, PlayCircle, CheckCircle2, Circle } from 'lucide-react'
import { predictionService, ModelStatus, PredictionHistoryRow } from '@/services/predictionService'
import { predCache } from '@/utils/predictionCache'
import { formatLocalDateTime } from '@/utils/timezone'
import PredictionCard from '@/components/Prediction/PredictionCard'
import SignalBadge from '@/components/Prediction/SignalBadge'
import TradingViewWidget from '@/components/charts/TradingViewWidget'
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
    predCache.invalidate(symbol)  // expire cache so next fetch is fresh post-train
    setTraining(symbol)
    try {
      await predictionService.trainModel(symbol, 6)
      toast.success(`Training started for ${symbol} (background, ~30-60s)`)
      // Poll status every 10s for 2 minutes
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
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-900 min-h-screen">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2 font-display">
            <Brain size={28} className="text-blue-400" /> AI Predictions
          </h1>
          <p className="text-gray-400 text-sm">LSTM + XGBoost ensemble. Trained per symbol on Yahoo Finance data.</p>
        </div>
      </div>

      {/* Symbol selector */}
      <div className="glass-card p-4">
        <div className="flex flex-wrap gap-2">
          {(models || []).map((m) => (
            <button
              key={m.symbol}
              onClick={() => setSelected(m.symbol)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                selected === m.symbol ? 'bg-blue-600 text-white border-blue-500' :
                'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
              }`}>
              {m.symbol}
              {(m.lstm || m.xgb) ? (
                <span className="ml-2 text-xs text-emerald-400">●</span>
              ) : (
                <span className="ml-2 text-xs text-gray-500">○</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Live TradingView chart for the selected symbol */}
      <div className="glass-card p-3">
        <div className="flex items-center justify-between px-1 pb-2">
          <h2 className="text-sm font-semibold text-gray-300">Live Chart — {selected}</h2>
          <span className="text-xs text-gray-500">Powered by TradingView</span>
        </div>
        <TradingViewWidget symbol={selected} height={420} />
      </div>

      {/* Live prediction */}
      <PredictionCard symbol={selected} />

      {/* Model management */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Cpu size={18} /> Model Status
        </h2>
        {models === null && <div className="text-gray-500 text-sm">Loading…</div>}
        {models && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-2 px-2">Symbol</th>
                  <th className="text-center py-2 px-2">LSTM</th>
                  <th className="text-center py-2 px-2">XGBoost</th>
                  <th className="text-right py-2 px-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.symbol} className="border-b border-gray-700">
                    <td className="py-2 px-2 text-white font-medium">{m.symbol}</td>
                    <td className="py-2 px-2 text-center">
                      {m.lstm ? <CheckCircle2 className="inline text-emerald-400" size={16} /> :
                                <Circle className="inline text-gray-500" size={16} />}
                    </td>
                    <td className="py-2 px-2 text-center">
                      {m.xgb ? <CheckCircle2 className="inline text-emerald-400" size={16} /> :
                                <Circle className="inline text-gray-500" size={16} />}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <button
                        onClick={() => startTrain(m.symbol)}
                        disabled={training === m.symbol}
                        className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-white inline-flex items-center gap-1"
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
                   className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm w-40 uppercase" />
          </div>
          <button onClick={() => startTrain(trainSym)} disabled={!trainSym || !!training}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded text-white text-sm">
            Train
          </button>
        </div>
      </div>

      {/* History */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-bold text-white mb-4">Prediction History — {selected}</h2>
        {history.length === 0 ? (
          <div className="text-gray-500 text-sm py-3">No history yet for {selected}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
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
                  <tr key={h.id} className="border-b border-gray-700">
                    <td className="py-2 px-2 text-gray-300">{formatLocalDateTime(h.created_at)}</td>
                    <td className="py-2 px-2 text-right text-gray-300">{formatPrice(h.current_price, guessCurrency(selected), 2)}</td>
                    <td className="py-2 px-2 text-right text-white">{formatPrice(h.predicted_price, guessCurrency(selected), 2)}</td>
                    <td className={`py-2 px-2 text-right ${h.change_percent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {h.change_percent >= 0 ? '+' : ''}{h.change_percent.toFixed(2)}%
                    </td>
                    <td className="py-2 px-2 text-right text-gray-300">{h.confidence.toFixed(0)}%</td>
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
