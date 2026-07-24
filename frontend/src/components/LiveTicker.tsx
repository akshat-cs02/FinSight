import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, Wifi, WifiOff } from 'lucide-react'
import { useLiveQuotes } from '@/hooks/useLiveQuotes'
import { formatLocalTime, getUserTzAbbr } from '@/utils/timezone'
import { formatPrice, guessCurrency } from '@/utils/currency'
import gsap from 'gsap'

interface Props { symbols?: string[]; intervalSec?: number }

const DEFAULT = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'AMZN']

export default function LiveTicker({ symbols = DEFAULT, intervalSec = 5 }: Props) {
  const navigate = useNavigate()
  const { quotes, connected, lastUpdate } = useLiveQuotes({ symbols, intervalSec })
  const containerRef = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)

  // GSAP entrance animation (runs once)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    gsap.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', delay: 0.2 })
  }, [])

  return (
    <div ref={containerRef} className="card-layer rounded-xl overflow-hidden">
      <div className="flex justify-between items-center px-3 pt-3 pb-1.5">
        <div className="flex items-center gap-2 text-xs text-[var(--dim)]">
          {connected
            ? <span className="flex items-center gap-1 text-green-400"><Wifi size={12} /> Live</span>
            : <span className="flex items-center gap-1 text-amber-400"><WifiOff size={12} /> Reconnecting…</span>
          }
          {lastUpdate && <span>· {formatLocalTime(lastUpdate)} {getUserTzAbbr()}</span>}
        </div>
        <span
          className={`text-[10px] font-medium transition-all duration-300 ${paused ? 'text-green-400' : 'text-[var(--faint)]'}`}
        >
          {paused ? '● Paused' : '● Scrolling'}
        </span>
      </div>

      <div
        className="overflow-hidden px-3 pb-3"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {quotes.length === 0 && (
          <span className="text-[var(--faint)] text-sm">Waiting for data…</span>
        )}
        {quotes.length > 0 && (
          <div className="relative whitespace-nowrap">
            <div
              className="ticker-track"
              style={{ animationPlayState: paused ? 'paused' : 'running' }}
            >
              {/* First set */}
              {quotes.map((q, idx) => (
                <TickerItem key={`a-${q.symbol}-${idx}`} q={q} navigate={navigate} />
              ))}
              {/* Duplicate set for seamless loop */}
              {quotes.map((q, idx) => (
                <TickerItem key={`b-${q.symbol}-${idx}`} q={q} navigate={navigate} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TickerItem({ q, navigate }: { q: any; navigate: any }) {
  const up = q.change_percent >= 0
  const display = q.symbol.replace(/\.(NS|BO)$/, '').replace(/=X$/, '').replace(/-USD$/, '')
  return (
    <button
      onClick={() => {
        navigate(`/stocks/${q.symbol}`)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }}
      className="flex-shrink-0 flex items-center gap-2.5 bg-[var(--raised)] rounded-lg px-3 py-1.5 border border-[var(--border)] hover:border-green-500/20 hover:bg-[var(--surface-3)] transition-all duration-300 cursor-pointer"
    >
      <span className="font-bold text-[var(--text)] text-sm">{display}</span>
      <span className={`text-sm ${up ? 'text-green-400' : 'text-rose-400'}`}>
        {formatPrice(q.price, guessCurrency(q.symbol))}
      </span>
      <span className={`flex items-center text-xs font-medium ${up ? 'text-green-400' : 'text-rose-400'}`}>
        {up ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
        {Math.abs(q.change_percent).toFixed(2)}%
      </span>
    </button>
  )
}
