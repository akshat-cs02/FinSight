import React, { useEffect, useRef, useState } from 'react'
import { Moon, Clock, PartyPopper } from 'lucide-react'

interface Props {
  marketName: string            // "US", "India", "Forex", …
  isOpen: boolean               // current open state of THIS market
  nextOpen?: string | null      // ISO timestamp of next open (when closed)
  nextOpenLocal?: string        // e.g. "Mon 09:15"
}

function useCountdown(target?: string | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  if (!target) return null
  const diff = Math.max(0, new Date(target).getTime() - now)
  const totalSec = Math.floor(diff / 1000)
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
    totalSec,
    done: diff === 0,
  }
}

function Unit({ value, label, red }: { value: number; label: string; red: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div className={`relative w-14 h-14 rounded-lg border flex items-center justify-center overflow-hidden transition-colors ${
        red ? 'bg-red-950/60 border-red-500/60' : 'bg-gray-900/70 border-indigo-500/30'
      }`}>
        <span className={`absolute inset-0 bg-gradient-to-b ${red ? 'from-red-500/20' : 'from-indigo-500/10'} to-transparent animate-pulse`} />
        <span
          key={value}
          className={`text-2xl font-bold tabular-nums animate-[flip_0.4s_ease] ${red ? 'text-red-400' : 'text-[var(--text)]'}`}
        >
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <span className={`mt-1 text-[10px] uppercase tracking-wider ${red ? 'text-red-400' : 'text-gray-500'}`}>{label}</span>
    </div>
  )
}

/** Confetti burst shown when a market opens. */
function Confetti() {
  const colors = ['#f43f5e', '#10b981', '#3b82f6', '#eab308', '#a855f7', '#f97316']
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {[...Array(40)].map((_, i) => (
        <span
          key={i}
          className="absolute top-0 animate-[confetti_1.4s_ease-in_forwards]"
          style={{
            left: `${(i * 2.5) % 100}%`,
            width: 7,
            height: 11,
            background: colors[i % colors.length],
            transform: `rotate(${i * 37}deg)`,
            animationDelay: `${(i % 8) * 0.06}s`,
          }}
        />
      ))}
    </div>
  )
}

/**
 * Per-market status banner:
 *  • CLOSED → animated day/hr/min/sec countdown to the next open (red under 10s)
 *  • Just opened → confetti celebration + "market is open now" for a few seconds
 */
export default function MarketClosedBanner({ marketName, isOpen, nextOpen, nextOpenLocal }: Props) {
  const cd = useCountdown(isOpen ? null : nextOpen)
  const [celebrate, setCelebrate] = useState(false)
  const prevOpen = useRef(isOpen)

  // Fire the celebration on a closed → open transition.
  useEffect(() => {
    const wasClosed = !prevOpen.current
    prevOpen.current = isOpen
    if (isOpen && wasClosed) {
      setCelebrate(true)
      const id = setTimeout(() => setCelebrate(false), 6000)
      return () => clearTimeout(id)
    }
    return undefined
  }, [isOpen])

  // ── Open celebration ──────────────────────────────────────────────────────
  if (isOpen && celebrate) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/50 via-gray-900 to-emerald-950/30 p-6">
        <Confetti />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
            <PartyPopper className="text-emerald-300 animate-bounce" size={26} />
          </div>
          <div>
            <h3 className="text-xl font-extrabold text-emerald-300">🎉 {marketName} market is open now!</h3>
            <p className="text-sm text-emerald-200/70">Live trading has resumed — signals are active.</p>
          </div>
        </div>
      </div>
    )
  }

  // If open (and not celebrating) show nothing.
  if (isOpen) return null

  // ── Closed countdown ──────────────────────────────────────────────────────
  const red = !!cd && cd.totalSec <= 10 && cd.totalSec > 0

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-6 transition-colors ${
      red ? 'border-red-500/50 bg-gradient-to-br from-gray-900 via-red-950/40 to-gray-900'
          : 'border-indigo-500/30 bg-gradient-to-br from-gray-900 via-indigo-950/40 to-gray-900'
    }`}>
      {/* drifting stars */}
      <div className="pointer-events-none absolute inset-0 opacity-40">
        {[...Array(18)].map((_, i) => (
          <span key={i} className="absolute rounded-full bg-white animate-pulse"
            style={{
              width: i % 3 === 0 ? 2 : 1, height: i % 3 === 0 ? 2 : 1,
              left: `${(i * 53) % 100}%`, top: `${(i * 37) % 100}%`,
              animationDelay: `${(i % 5) * 0.4}s`, animationDuration: `${2 + (i % 4)}s`,
            }} />
        ))}
      </div>

      <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center border ${
            red ? 'bg-red-500/15 border-red-400/30' : 'bg-indigo-500/15 border-indigo-400/30'
          }`}>
            <Moon className={`${red ? 'text-red-300' : 'text-indigo-300'} animate-[sway_3s_ease-in-out_infinite]`} size={26} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[var(--text)]">{marketName} market is closed</h3>
            <p className="text-sm text-gray-400 flex items-center gap-1.5">
              <Clock size={13} />
              {red ? <span className="text-red-400 font-semibold animate-pulse">Opening in seconds…</span>
                   : nextOpenLocal
                     ? <>Opens <span className="text-indigo-300 font-medium">{nextOpenLocal}</span></>
                     : 'Opening soon'}
            </p>
          </div>
        </div>

        {cd && (
          <div className="flex items-end gap-2">
            {cd.d > 0 && <Unit value={cd.d} label="days" red={red} />}
            <Unit value={cd.h} label="hrs" red={red} />
            <Unit value={cd.m} label="min" red={red} />
            <Unit value={cd.s} label="sec" red={red} />
          </div>
        )}
      </div>
    </div>
  )
}
