import { useRef, useEffect, useState } from 'react'
import { getCurrencySymbol } from '@/utils/currency'

function autoDecimals(p: number): number {
  const a = Math.abs(p)
  if (a === 0) return 2
  if (a < 0.0001) return 8
  if (a < 0.01) return 6
  if (a < 1) return 5
  if (a < 10) return 4
  if (a < 100) return 3
  return 2
}

function splitPrice(p: number, d?: number): { int: string; dec: string; sign: string } {
  const dec = d ?? autoDecimals(p)
  const formatted = Math.abs(p).toFixed(dec)
  const dotIdx = formatted.indexOf('.')
  return {
    int: dotIdx >= 0 ? formatted.slice(0, dotIdx) : formatted,
    dec: dotIdx >= 0 ? formatted.slice(dotIdx + 1) : '',
    sign: p < 0 ? '-' : '',
  }
}

interface PriceDisplayProps {
  price: number
  currency?: string
  decimals?: number
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero'
  color?: 'default' | 'gains' | 'losses' | 'brand'
  showSign?: boolean
  compact?: boolean
  animate?: boolean
  className?: string
}

const sizeMap = {
  sm: { sym: 'text-[9px]', int: 'font-medium text-sm', dec: 'text-[10px]', gap: 'gap-px' },
  md: { sym: 'text-[10px]', int: 'font-semibold text-base', dec: 'text-[11px]', gap: 'gap-px' },
  lg: { sym: 'text-[12px]', int: 'font-bold text-xl', dec: 'text-[13px]', gap: 'gap-0.5' },
  xl: { sym: 'text-[14px]', int: 'font-bold text-2xl', dec: 'text-[15px]', gap: 'gap-0.5' },
  hero: { sym: 'text-base', int: 'font-extrabold text-[32px]', dec: 'text-lg', gap: 'gap-0.5' },
}

const colorMap: Record<string, string> = {
  default: 'text-white',
  gains: 'text-emerald-400',
  losses: 'text-rose-400',
  brand: 'text-cyan-400',
}

function withCommas(n: string): string {
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export default function PriceDisplay({
  price,
  currency = 'USD',
  decimals,
  size = 'lg',
  color = 'default',
  showSign = false,
  compact = false,
  animate = false,
  className = '',
}: PriceDisplayProps) {
  const sym = getCurrencySymbol(currency)
  const { int, dec, sign } = splitPrice(price, decimals)
  const intComma = withCommas(int)
  const s = sizeMap[size]
  const c = colorMap[color]

  const prevPrice = useRef(price)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    if (!animate) { prevPrice.current = price; return }
    if (prevPrice.current === price) return
    const dir = price > prevPrice.current ? 'up' as const : 'down' as const
    setFlash(dir)
    const t = setTimeout(() => setFlash(null), 700)
    prevPrice.current = price
    return () => clearTimeout(t)
  }, [price, animate])

  const flashClass = flash === 'up' ? 'flash-up' : flash === 'down' ? 'flash-down' : ''

  if (compact) {
    const signStr = showSign && price > 0 ? '+' : ''
    const negStr = price < 0 ? '-' : ''
    return (
      <span className={`inline-flex items-baseline font-mono tabular-nums lining-nums ${s.gap} ${c} ${flashClass} ${className}`}>
        {negStr}{signStr}{sym}{intComma}{dec ? <span className="opacity-50">.{dec}</span> : ''}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-baseline font-mono tabular-nums lining-nums ${s.gap} ${c} ${flashClass} ${className}`}>
      {showSign && price > 0 && <span className="opacity-60 text-[0.75em]">+</span>}
      {sign && <span className="opacity-60 text-[0.75em]">−</span>}
      <span className={`opacity-40 font-medium ${s.sym}`}>{sym}</span>
      <span className={s.int}>{intComma}</span>
      {dec && <span className={`opacity-50 ${s.dec}`}>.{dec}</span>}
    </span>
  )
}
