import { useEffect, useRef, useState } from 'react'
import { WS_BASE } from '@/services/api'

export interface LiveQuote {
  symbol: string
  price: number
  change: number
  change_percent: number
  volume: number
}

export interface UseLiveQuotesOptions {
  symbols: string[]
  intervalSec?: number
  enabled?: boolean
}

export function useLiveQuotes({ symbols, intervalSec = 5, enabled = true }: UseLiveQuotesOptions) {
  const [quotes, setQuotes] = useState<LiveQuote[]>([])
  const [connected, setConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!enabled || symbols.length === 0) {
      return
    }
    const url = `${WS_BASE}/ws/market?symbols=${encodeURIComponent(symbols.join(','))}&interval=${intervalSec}`
    let cancelled = false
    let reconnectTimer: number | null = null

    const open = () => {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => { if (!cancelled) setConnected(true) }
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data)
          if (data.type === 'quote_update' && Array.isArray(data.quotes)) {
            setQuotes(data.quotes)
            setLastUpdate(data.timestamp)
          }
        } catch {}
      }
      ws.onclose = () => {
        if (!cancelled) {
          setConnected(false)
          // exponential-ish reconnect after 3s
          reconnectTimer = window.setTimeout(open, 3000)
        }
      }
      ws.onerror = () => { /* let onclose handle */ }
    }

    open()
    return () => {
      cancelled = true
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      try { wsRef.current?.close() } catch {}
    }
  }, [symbols.join(','), intervalSec, enabled])

  return { quotes, connected, lastUpdate }
}
