import React, { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, ColorType, type IChartApi } from 'lightweight-charts'
import { ExternalLink } from 'lucide-react'
import { mapToTradingView } from './TradingViewWidget'
import api from '@/services/api'

interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const INTERVALS: { label: string; code: string }[] = [
  { label: '5m',  code: '5' },
  { label: '15m', code: '15' },
  { label: '1h',  code: '60' },
  { label: '1D',  code: 'D' },
  { label: '1W',  code: 'W' },
  { label: '1M',  code: 'M' },
]

interface Props {
  symbol: string
  height?: number
  interval?: string
  compact?: boolean
}

export default function LightweightChart({ symbol, height = 680, interval = 'D', compact = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const [activeInterval, setActiveInterval] = useState(interval)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tvSymbol = mapToTradingView(symbol)
  const fallbackHref = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}&interval=${activeInterval}`

  useEffect(() => {
    if (!containerRef.current) return

    let chart: ReturnType<typeof createChart> | null = null
    try {
      chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth || 800,
        height,
        layout: {
          background: { type: ColorType.Solid, color: '#111827' },
          textColor: '#9ca3af',
          fontSize: 12,
        },
        grid: {
          vertLines: { color: '#1f2937' },
          horzLines: { color: '#1f2937' },
        },
        crosshair: {
          mode: 0,
          vertLine: { color: '#4b5563', width: 1, style: 2, labelBackgroundColor: '#374151' },
          horzLine: { color: '#4b5563', width: 1, style: 2, labelBackgroundColor: '#374151' },
        },
        timeScale: {
          timeVisible: activeInterval !== 'D' && activeInterval !== 'W' && activeInterval !== 'M',
          secondsVisible: false,
          borderColor: '#1f2937',
        },
        rightPriceScale: {
          borderColor: '#1f2937',
        },
      })
      chartRef.current = chart
    } catch (e) {
      console.error('Chart init failed:', e)
      setError('Chart failed to initialize')
      return
    }

    const handleResize = () => {
      if (containerRef.current) {
        chart!.applyOptions({ width: containerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (chart) chart.remove()
      chartRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, activeInterval, symbol])

  useEffect(() => {
    if (!chartRef.current) return

    let cancelled = false

    const loadData = async () => {
      setLoading(true)
      setError(null)

      try {
        const res = await api.get('/market/ohlcv', {
          params: { symbol, interval: activeInterval, limit: compact ? 200 : 500 },
        })
        const candles: Candle[] = res.data.candles
        if (cancelled || !chartRef.current) return

        if (!candles || candles.length === 0) {
          setError('No data available')
          setLoading(false)
          return
        }

        const candleSeries = chartRef.current.addSeries(CandlestickSeries, {
          upColor: '#22c55e',
          downColor: '#ef4444',
          borderVisible: false,
          wickUpColor: '#22c55e',
          wickDownColor: '#ef4444',
        })

        candleSeries.setData(candles.map((c) => ({
          time: c.time as any,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })))

        if (!compact) {
          const volumeSeries = chartRef.current.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' as const },
            priceScaleId: 'volume',
          })

          volumeSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
          })

          volumeSeries.setData(candles.map((c) => ({
            time: c.time as any,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)',
          })))
        }

        chartRef.current.timeScale().fitContent()
      } catch (e: any) {
        const msg = e?.response?.data?.detail || e?.message || 'Failed to load chart data'
        console.error('LightweightChart error:', e)
        if (!cancelled) setError(msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadData()
    return () => { cancelled = true }
  }, [symbol, activeInterval, compact])

  const selectInterval = (code: string) => {
    setActiveInterval(code)
  }

  return (
    <div className="w-full">
      <div
        className="w-full rounded-xl overflow-hidden border border-gray-700 bg-gray-900 relative"
        style={{ height }}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-20">
            <div className="text-gray-400 text-sm animate-pulse">Loading chart…</div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 z-20 gap-3">
            <p className="text-gray-400 text-sm">{error}</p>
            <a
              href={fallbackHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1"
            >
              <ExternalLink size={12} /> Open on TradingView
            </a>
          </div>
        )}

        <div ref={containerRef} className="w-full h-full" />

        {!compact && (
          <a
            href={fallbackHref}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-2 right-2 z-10 bg-gray-800/80 hover:bg-gray-700 backdrop-blur text-blue-300 hover:text-white text-xs px-2 py-1 rounded flex items-center gap-1 shadow"
          >
            <ExternalLink size={12} /> Open on TradingView
          </a>
        )}
      </div>

      {!compact && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="text-xs text-gray-500 mr-1">Timeframe:</span>
          {INTERVALS.map((tf) => (
            <button
              key={tf.code}
              onClick={() => selectInterval(tf.code)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                activeInterval === tf.code
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
