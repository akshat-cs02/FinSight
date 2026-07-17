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
  const marqueeRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<gsap.core.Tween | null>(null)
  const [paused, setPaused] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // GSAP-powered smooth marquee
  useEffect(() => {
    const el = marqueeRef.current
    if (!el || quotes.length === 0) return

    const itemWidth = el.scrollWidth / 2 // because we duplicate for seamless loop
    if (itemWidth === 0) return

    const duration = itemWidth * 0.025 // speed factor — pixels per second

    if (animRef.current) animRef.current.kill()

    // Set initial position
    gsap.set(el, { x: 0 })

    animRef.current = gsap.to(el, {
      x: -itemWidth / 2,
      duration,
      ease: 'none',
      repeat: -1,
      paused,
    })

    return () => {
      if (animRef.current) animRef.current.kill()
    }
  }, [quotes, paused])

  // Pause/resume on hover with GSAP smoothness
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onEnter = () => {
      setPaused(true)
      if (animRef.current) {
        gsap.to(animRef.current, { timeScale: 0, duration: 0.3, ease: 'power2.out' })
        animRef.current.pause()
      }
    }
    const onLeave = () => {
      setPaused(false)
      if (animRef.current) {
        animRef.current.resume()
        gsap.to(animRef.current, { timeScale: 1, duration: 0.3, ease: 'power2.out' })
      }
    }

    el.addEventListener('mouseenter', onEnter)
    el.addEventListener('mouseleave', onLeave)

    return () => {
      el.removeEventListener('mouseenter', onEnter)
      el.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  // GSAP entrance animation
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    gsap.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', delay: 0.2 })
  }, [])

  return (
    <div ref={containerRef} className="card-layer rounded-xl overflow-hidden">
      <div className="flex justify-between items-center px-3 pt-3 pb-1.5">
        <div className="flex items-center gap-2 text-xs text-white/40">
          {connected
            ? <span className="flex items-center gap-1 text-green-400"><Wifi size={12} /> Live</span>
            : <span className="flex items-center gap-1 text-amber-400"><WifiOff size={12} /> Reconnecting…</span>
          }
          {lastUpdate && <span>· {formatLocalTime(lastUpdate)} {getUserTzAbbr()}</span>}
        </div>
        <span className={`text-[10px] font-medium transition-all duration-300 ${paused ? 'text-green-400' : 'text-white/30'}`}>
          {paused ? '● Paused' : '● Scrolling'}
        </span>
      </div>

      <div className="overflow-hidden px-3 pb-3">
        {quotes.length === 0 && (
          <span className="text-white/30 text-sm">Waiting for data…</span>
        )}
        {quotes.length > 0 && (
          <div className="relative whitespace-nowrap">
            <div ref={marqueeRef} className="inline-flex gap-3 will-change-transform">
              {/* Duplicate for seamless loop */}
              {[...quotes, ...quotes].map((q, idx) => {
                const up = q.change_percent >= 0
                const display = q.symbol.replace(/\.(NS|BO)$/, '').replace(/=X$/, '').replace(/-USD$/, '')
                return (
                  <button
                    key={`${q.symbol}-${idx}`}
                    onClick={() => {
                      // Smooth scroll to stock view
                      navigate(`/stocks/${q.symbol}`)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    className="flex-shrink-0 flex items-center gap-2.5 bg-[#0f1a0f]/50 rounded-lg px-3 py-1.5 border border-white/5 hover:border-green-500/20 hover:bg-[#0f1a0f]/80 transition-all duration-300 cursor-pointer"
                  >
                    <span className="font-bold text-white/80 text-sm">{display}</span>
                    <span className={`text-sm ${up ? 'text-green-400' : 'text-rose-400'}`}>
                      {formatPrice(q.price, guessCurrency(q.symbol))}
                    </span>
                    <span className={`flex items-center text-xs font-medium ${up ? 'text-green-400' : 'text-rose-400'}`}>
                      {up ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                      {Math.abs(q.change_percent).toFixed(2)}%
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
