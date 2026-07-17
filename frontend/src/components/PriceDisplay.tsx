import { useEffect, useRef, useState } from 'react'

const symSize = { sm: 'text-[9px]', md: 'text-[10px]', lg: 'text-[11px]', xl: 'text-[13px]', hero: 'text-[15px]' }
const intSize = { sm: 'font-medium text-sm', md: 'font-semibold text-base', lg: 'font-bold text-xl', xl: 'font-bold text-2xl', hero: 'font-extrabold text-[32px]' }
const decSize = { sm: 'text-[10px]', md: 'text-[11px]', lg: 'text-[12px]', xl: 'text-[14px]', hero: 'text-lg' }
const gapMap = { sm: 'gap-px', md: 'gap-px', lg: 'gap-0.5', xl: 'gap-0.5', hero: 'gap-0.5' }

const colorMap: Record<string, string> = {
  default: 'text-ink-800',
  gains: 'text-positive',
  losses: 'text-negative',
  brand: 'text-blue-400',
  emerald: 'text-emerald-400',
  purple: 'text-purple-400',
  cyan: 'text-cyan-400',
  rose: 'text-rose-400',
  amber: 'text-amber-400',
}

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

function splitParts(p: number, d?: number): { int: string; dec: string } {
  const dec = d ?? autoDecimals(p)
  const f = Math.abs(p).toFixed(dec)
  const dot = f.indexOf('.')
  return {
    int: dot >= 0 ? f.slice(0, dot) : f,
    dec: dot >= 0 ? f.slice(dot + 1) : '',
  }
}

function withCommas(n: string): string {
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹', GBP: '£', JPY: '¥', EUR: '€', AUD: 'A$', CAD: 'C$',
  HKD: 'HK$', CHF: 'Fr', BRL: 'R$', KRW: '₩', USD: '$', CNY: '¥',
}

function getSym(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? '$'
}

interface PriceDisplayProps {
  price: number
  currency?: string
  decimals?: number
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero'
  color?: 'default' | 'gains' | 'losses' | 'brand' | 'emerald' | 'purple' | 'cyan' | 'rose' | 'amber'
  showSign?: boolean
  compact?: boolean
  animate?: boolean
  className?: string
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
  const sym = getSym(currency)
  const { int, dec } = splitParts(price, decimals)
  const intComma = withCommas(int)
  const s = { sym: symSize[size], int: intSize[size], dec: decSize[size], gap: gapMap[size] }
  const c = colorMap[color] || colorMap.default

  const prev = useRef(price)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    if (!animate) { prev.current = price; return }
    if (prev.current === price) return
    setFlash(price > prev.current ? 'up' : 'down')
    const t = setTimeout(() => setFlash(null), 700)
    prev.current = price
    return () => clearTimeout(t)
  }, [price, animate])

  const flashClass = flash === 'up' ? 'flash-up' : flash === 'down' ? 'flash-down' : ''

  if (compact) {
    const prefix = showSign && price > 0 ? '+' : ''
    const neg = price < 0 ? '-' : ''
    return (
      <span className={`inline-flex items-baseline font-mono tabular-nums ${s.gap} ${c} ${flashClass} ${className}`}>
        {neg}{prefix}{sym}{intComma}{dec ? <span className="opacity-40">.{dec}</span> : ''}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-baseline font-mono tabular-nums ${s.gap} ${c} ${flashClass} ${className}`}>
      {showSign && price > 0 && <span className="opacity-50 text-[0.75em]">+</span>}
      {price < 0 && <span className="opacity-50 text-[0.75em]">−</span>}
      <span className={`opacity-35 font-medium ${s.sym}`}>{sym}</span>
      <span className={s.int}>{intComma}</span>
      {dec && <span className={`opacity-40 ${s.dec}`}>.{dec}</span>}
    </span>
  )
}
