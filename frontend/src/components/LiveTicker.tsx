import React from 'react'
import { ArrowDown, ArrowUp, Wifi, WifiOff } from 'lucide-react'
import { useLiveQuotes } from '@/hooks/useLiveQuotes'
import { formatLocalTime, getUserTzAbbr } from '@/utils/timezone'
import { formatPrice, guessCurrency } from '@/utils/currency'

interface Props { symbols?: string[]; intervalSec?: number }

const DEFAULT = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'AMZN']

export default function LiveTicker({ symbols = DEFAULT, intervalSec = 5 }: Props) {
  const { quotes, connected, lastUpdate } = useLiveQuotes({ symbols, intervalSec })

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 overflow-hidden">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {connected
            ? <span className="flex items-center gap-1 text-emerald-400"><Wifi size={12} /> Live</span>
            : <span className="flex items-center gap-1 text-yellow-400"><WifiOff size={12} /> Reconnecting…</span>
          }
          {lastUpdate && <span>· {formatLocalTime(lastUpdate)} {getUserTzAbbr()}</span>}
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto">
        {quotes.length === 0 && <span className="text-gray-500 text-sm">Waiting for data…</span>}
        {quotes.map((q) => {
          const up = q.change_percent >= 0
          // Clean the display symbol: RELIANCE.NS → RELIANCE, EURUSD=X → EURUSD, BTC-USD → BTC
          const display = q.symbol.replace(/\.(NS|BO)$/, '').replace(/=X$/, '').replace(/-USD$/, '')
          return (
            <div key={q.symbol} className="flex-shrink-0 flex items-center gap-2 bg-gray-700/50 rounded px-3 py-1.5 border border-gray-600">
              <span className="font-bold text-white text-sm">{display}</span>
              <span className="text-gray-200 text-sm">{formatPrice(q.price, guessCurrency(q.symbol))}</span>
              <span className={`flex items-center text-xs ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                {up ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                {Math.abs(q.change_percent).toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
