import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'

const symSize = { sm: 'text-[9px]', md: 'text-[10px]', lg: 'text-[11px]', xl: 'text-[13px]', hero: 'text-[15px]' }
const intSize = { sm: 'font-medium text-sm', md: 'font-semibold text-base', lg: 'font-bold text-xl', xl: 'font-bold text-2xl', hero: 'font-extrabold text-[32px]' }
const decSize = { sm: 'text-[10px]', md: 'text-[11px]', lg: 'text-[12px]', xl: 'text-[14px]', hero: 'text-lg' }
const gapMap = { sm: 'gap-px', md: 'gap-px', lg: 'gap-0.5', xl: 'gap-0.5', hero: 'gap-0.5' }

const colorMap: Record<string, { color: string } | undefined> = {
  default: undefined, // Use CSS variable for light/dark theme support
  gains: { color: '#22C55E' },
  losses: { color: '#EF4444' },
  brand: { color: '#D4A853' },
  emerald: { color: '#10B981' },
  purple: { color: '#8B5CF6' },
  cyan: { color: '#22D3EE' },
  rose: { color: '#F43F5E' },
  amber: { color: '#F59E0B' },
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
  const colorStyle = colorMap[color] ?? colorMap.default

  const prev = useRef(price)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const containerRef = useRef<HTMLSpanElement>(null)

  // GSAP number animation
  useEffect(() => {
    if (!animate || !containerRef.current) { prev.current = price; return }
    if (prev.current === price) return

    const el = containerRef.current
    const fromVal = prev.current
    const toVal = price

    // Flash animation
    setFlash(price > fromVal ? 'up' : 'down')
    const flashTimer = setTimeout(() => setFlash(null), 700)

    // GSAP count-up for the integer part
    const intEl = el.querySelector('.pd-int')
    if (intEl) {
      const obj = { val: fromVal }
      gsap.to(obj, {
        val: toVal,
        duration: 0.8,
        ease: 'power3.out',
        onUpdate: () => {
          const parts = splitParts(obj.val, decimals)
          intEl.textContent = withCommas(parts.int)
          const decEl = el.querySelector('.pd-dec')
          if (decEl) decEl.textContent = parts.dec
        },
      })
    }

    prev.current = price
    return () => clearTimeout(flashTimer)
  }, [price, animate, decimals])

  const flashClass = flash === 'up' ? 'flash-up' : flash === 'down' ? 'flash-down' : ''

  if (compact) {
    const prefix = showSign && price > 0 ? '+' : ''
    const neg = price < 0 ? '-' : ''
    return (
      <span className={`inline-flex items-baseline font-mono tabular-nums ${s.gap} ${flashClass} ${className}`} style={colorStyle}>
        {neg}{prefix}{sym}{intComma}{dec ? <span className="opacity-40">.{dec}</span> : ''}
      </span>
    )
  }

  return (
    <span
      ref={containerRef}
      className={`inline-flex items-baseline font-mono tabular-nums ${s.gap} ${flashClass} ${className}`}
      style={colorStyle ? colorStyle : undefined}
    >
      {showSign && price > 0 && <span className="opacity-50 text-[0.75em]">+</span>}
      {price < 0 && <span className="opacity-50 text-[0.75em]">−</span>}
      <span className={`opacity-35 font-medium ${s.sym} ${!color || color === 'default' ? 'text-[var(--text)]' : ''}`}>{sym}</span>
      <span className={`pd-int ${s.int} ${!color || color === 'default' ? 'text-[var(--text)]' : ''}`}>{intComma}</span>
      {dec && <span className={`pd-dec opacity-40 ${s.dec} ${!color || color === 'default' ? 'text-[var(--text)]' : ''}`}>.{dec}</span>}
    </span>
  )
}
