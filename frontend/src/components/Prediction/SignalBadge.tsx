import React from 'react'

interface Props { signal: 'BUY' | 'SELL' | 'HOLD' | string; size?: 'sm' | 'md' | 'lg' }

const STYLES: Record<string, string> = {
  BUY: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  SELL: 'bg-red-500/20 text-red-300 border-red-500/40',
  HOLD: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
}

export default function SignalBadge({ signal, size = 'md' }: Props) {
  const sizeCls = size === 'sm' ? 'text-xs px-2 py-1' : size === 'lg' ? 'text-base px-4 py-2' : 'text-sm px-3 py-1.5'
  return (
    <span className={`${STYLES[signal] || STYLES.HOLD} ${sizeCls} font-bold rounded-full border inline-block`}>
      {signal}
    </span>
  )
}
