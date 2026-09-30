import React, { useEffect, useState } from 'react'
import { Moon, Clock } from 'lucide-react'

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
      <div className={`w-14 h-14 rounded-lg border flex items-center justify-center ${red ? 'bg-red-950/40 border-red-500/40' : 'bg-gray-900/70 border-indigo-500/30'}`}>
        <span className={`text-2xl font-bold tabular-nums ${red ? 'text-red-400' : 'text-[var(--text)]'}`}>
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <span className={`mt-1 text-[10px] uppercase tracking-wider ${red ? 'text-red-400' : 'text-gray-500'}`}>{label}</span>
    </div>
  )
}

/**
 * Per-market status banner (shown while a market is closed):
 *  • Closed → clean countdown to the next open, red accent when opening within 10s.
 *  • Open → renders nothing.
 */
export default function MarketClosedBanner({ marketName, isOpen, nextOpen, nextOpenLocal }: Props) {
  const cd = useCountdown(isOpen ? null : nextOpen)

  // If open show nothing.
  if (isOpen) return null

  const red = !!cd && cd.totalSec <= 10 && cd.totalSec > 0

  return (
    <div className={`rounded-2xl border p-4 sm:p-6 ${
      red ? 'border-red-500/50 bg-gradient-to-br from-gray-900 via-red-950/40 to-gray-900'
          : 'border-indigo-500/30 bg-gradient-to-br from-gray-900 via-indigo-950/40 to-gray-900'
    }`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-5">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center border ${
            red ? 'bg-red-500/15 border-red-400/30' : 'bg-indigo-500/15 border-indigo-400/30'
          }`}>
            <Moon className={red ? 'text-red-300' : 'text-indigo-300'} size={26} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[var(--text)]">{marketName} market is closed</h3>
            <p className="text-sm text-gray-400 flex items-center gap-1.5">
              <Clock size={13} />
              {red ? <span className="text-red-400 font-semibold">Opening in seconds…</span>
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