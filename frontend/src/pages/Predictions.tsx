import React, { useEffect, useRef, useState } from 'react'
import { Brain, Cpu, PlayCircle, CheckCircle2, Circle } from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { predictionService, ModelStatus, PredictionHistoryRow } from '@/services/predictionService'
import { predCache } from '@/utils/predictionCache'
import { formatLocalDateTime } from '@/utils/timezone'
import SEO from '@/components/SEO'
import PredictionCard from '@/components/Prediction/PredictionCard'
import SignalBadge from '@/components/Prediction/SignalBadge'
import TradingViewWidget from '@/components/charts/TradingViewWidget'
import PriceDisplay from '@/components/PriceDisplay'
import { guessCurrency } from '@/utils/currency'
import toast from 'react-hot-toast'

gsap.registerPlugin(ScrollTrigger)

export default function PredictionsPage() {
  const [models, setModels] = useState<ModelStatus[] | null>(null)
  const [selected, setSelected] = useState<string>('AAPL')
  const [history, setHistory] = useState<PredictionHistoryRow[]>([])
  const [training, setTraining] = useState<string | null>(null)
  const [trainSym, setTrainSym] = useState<string>('AAPL')

  // Refs for GSAP
  const mainRef = useRef<HTMLDivElement>(null)
  const modelRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<HTMLDivElement>(null)
  const symbolSelectorRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const predictionCardRef = useRef<HTMLDivElement>(null)
  const modelTableRef = useRef<HTMLTableSectionElement>(null)
  const historyTableRef = useRef<HTMLTableSectionElement>(null)

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

  // GSAP: symbol selector stagger
  useEffect(() => {
    if (!symbolSelectorRef.current || !models) return
    const btns = symbolSelectorRef.current.querySelectorAll('button')
    gsap.fromTo(btns, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, stagger: 0.03, ease: 'power2.out' })
  }, [models])

  // GSAP: chart draw-in
  useEffect(() => {
    if (!chartRef.current) return
    gsap.fromTo(chartRef.current, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', delay: 0.1 })
  }, [])

  // GSAP: prediction card entrance
  useEffect(() => {
    if (!predictionCardRef.current) return
    gsap.fromTo(predictionCardRef.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', delay: 0.15 })
  }, [])

  // GSAP: model table rows stagger
  useEffect(() => {
    if (!modelTableRef.current || !models) return
    const rows = modelTableRef.current.querySelectorAll('tr')
    gsap.fromTo(rows, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.04, ease: 'power2.out' })
  }, [models])

  // GSAP: history table rows stagger
  useEffect(() => {
    if (!historyTableRef.current || history.length === 0) return
    const rows = historyTableRef.current.querySelectorAll('tr')
    gsap.fromTo(rows, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.03, ease: 'power2.out' })
  }, [history])

  // GSAP: 3D tilt on prediction cards
  useEffect(() => {
    if (!predictionCardRef.current) return
    const card = predictionCardRef.current
    const onMove = (e: MouseEvent) => {
      const rect = card.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width - 0.5
      const y = (e.clientY - rect.top) / rect.height - 0.5
      gsap.to(card, { rotationX: -y * 8, rotationY: x * 8, transformPerspective: 800, duration: 0.4, ease: 'power2.out' })
    }
    const onLeave = () => {
      gsap.to(card, { rotationX: 0, rotationY: 0, duration: 0.5, ease: 'power2.out' })
    }
    card.addEventListener('mousemove', onMove)
    card.addEventListener('mouseleave', onLeave)
    return () => {
      card.removeEventListener('mousemove', onMove)
      card.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  // GSAP: SignalBadge pulse animation
  useEffect(() => {
    const badges = document.querySelectorAll('.signal-badge-pulse')
    badges.forEach((badge) => {
      gsap.to(badge, { scale: 1.05, duration: 1.5, ease: 'sine.inOut', yoyo: true, repeat: -1 })
    })
  }, [history])

  // GSAP: ScrollTrigger for model section and history
  useEffect(() => {
    const sections = [modelRef.current, historyRef.current].filter(Boolean)
    sections.forEach((section) => {
      if (!section) return
      gsap.fromTo(
        section,
        { y: 25, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out', scrollTrigger: { trigger: section, start: 'top 85%' } }
      )
    })
  }, [])

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 min-h-screen">
      <SEO
        title="AI Predictions"
        description="LSTM + XGBoost ensemble AI predictions for stock markets. Train models, view prediction history, and get buy/sell signals with confidence scores."
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'FinSight AI Predictions',
          description: 'AI-powered stock market predictions using LSTM and XGBoost models.',
        }}
      />
      <div ref={mainRef} className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text)] flex items-center gap-2 font-display">
            <Brain size={28} className="text-gold" /> Predictions
          </h1>
          <p className="text-[var(--dim)] text-sm mt-0.5">LSTM + XGBoost ensemble. Trained per symbol on Yahoo Finance data.</p>
        </div>
      </div>

      {/* Symbol selector */}
      <div ref={symbolSelectorRef} className="card p-2">
        <div className="flex flex-wrap gap-2">
          {(models || []).map((m) => (
            <button
              key={m.symbol}
              onClick={() => setSelected(m.symbol)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 flex items-center gap-1.5 ${
                selected === m.symbol
                  ? 'bg-gold/10 text-gold border border-gold/20 shadow-sm'
                  : 'text-[var(--dim)] hover:text-[var(--text)] hover:bg-[var(--raised)]'
              }`}>
              {m.symbol}
              {(m.lstm || m.xgb) ? (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold" />
              ) : (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/30" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Live TradingView chart */}
      <div ref={chartRef} className="card-surface2 p-3">
        <div className="flex items-center justify-between px-1 pb-2">
          <h2 className="text-sm font-semibold text-[var(--dim)]">Live Chart — <span className="text-[var(--text)]">{selected}</span></h2>
          <span className="text-xs text-[var(--dim)]">TradingView</span>
        </div>
        <TradingViewWidget symbol={selected} height={420} />
      </div>

      {/* Live prediction */}
      <div ref={predictionCardRef}>
        <PredictionCard symbol={selected} />
      </div>

      {/* Model management */}
      <div ref={modelRef} className="card-accent card p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-[3px] h-5 rounded-full bg-gold/60" />
          <h2 className="text-base font-bold text-[var(--text)] font-display tracking-tight flex items-center gap-2"><Cpu size={18} /> Model Status</h2>
        </div>
        {models === null && <div className="text-[var(--dim)] text-sm">Loading…</div>}
        {models && (
          <div className="overflow-x-auto">
            <table className="tbl table-base">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className="text-center">LSTM</th>
                  <th className="text-center">XGBoost</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody ref={modelTableRef}>
                {models.map((m) => (
                  <tr key={m.symbol} className="hover:bg-gold/5 transition-all duration-200">
                    <td className="font-medium font-display">{m.symbol}</td>
                    <td className="text-center">
                      {m.lstm ? <CheckCircle2 className="inline text-gold" size={16} /> :
                               <Circle className="inline text-[var(--faint)]" size={16} />}
                    </td>
                    <td className="text-center">
                      {m.xgb ? <CheckCircle2 className="inline text-gold" size={16} /> :
                               <Circle className="inline text-[var(--faint)]" size={16} />}
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => startTrain(m.symbol)}
                        disabled={training === m.symbol}
                        className="btn-accent text-xs px-3 py-1 disabled:opacity-50 inline-flex items-center gap-1"
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
            <label className="block text-xs text-[var(--dim)] mb-1">Train any symbol</label>
            <input value={trainSym} onChange={(e) => setTrainSym(e.target.value.toUpperCase())}
                   placeholder="e.g. NVDA"
                   className="input-glow w-40 text-sm" />
          </div>
          <button onClick={() => startTrain(trainSym)} disabled={!trainSym || !!training}
                  className="btn-accent text-sm px-4 py-2 disabled:opacity-50">
            Train
          </button>
        </div>
      </div>

      {/* History */}
      <div ref={historyRef} className="card-accent card-surface2 p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-[3px] h-5 rounded-full bg-gold/60" />
          <h2 className="text-base font-bold text-[var(--text)] font-display tracking-tight">Prediction History — {selected}</h2>
        </div>
        {history.length === 0 ? (
          <div className="text-[var(--dim)] text-sm py-3">No history yet for {selected}</div>
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
              <tbody ref={historyTableRef}>
                {history.map((h) => (
                  <tr key={h.id} className="hover:bg-gold/5 transition-all duration-200">
                    <td className="text-[var(--dim)]">{formatLocalDateTime(h.created_at)}</td>
                    <td className="text-right"><PriceDisplay price={h.current_price} currency={guessCurrency(selected)} size="sm" /></td>
                    <td className="text-right"><PriceDisplay price={h.predicted_price} currency={guessCurrency(selected)} size="sm" color="default" /></td>
                    <td className={`text-right font-mono tabular-nums ${h.change_percent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {h.change_percent >= 0 ? '+' : ''}{h.change_percent.toFixed(2)}%
                    </td>
                    <td className="text-right font-mono tabular-nums text-[var(--dim)]">{h.confidence.toFixed(0)}%</td>
                    <td className="text-center">
                      <span className="signal-badge-pulse inline-block">
                        <SignalBadge signal={h.signal} size="sm" />
                      </span>
                    </td>
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
