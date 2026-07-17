export const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
  EUR: '€',
  AUD: 'A$',
  CAD: 'C$',
  HKD: 'HK$',
  CHF: 'Fr',
  BRL: 'R$',
  KRW: '₩',
  USD: '$',
}

const SUFFIX_MAP: Record<string, string> = {
  '.NS': 'INR', '.BO': 'INR',
  '.L': 'GBP',
  '.T': 'JPY',
  '.HK': 'HKD',
  '.SS': 'CNY', '.SZ': 'CNY',
  '.PA': 'EUR', '.DE': 'EUR', '.AS': 'EUR', '.MI': 'EUR', '.MC': 'EUR',
  '.TO': 'CAD', '.V': 'CAD',
  '.AX': 'AUD',
  '.SW': 'CHF',
  '.SA': 'BRL',
  '.KS': 'KRW', '.KQ': 'KRW',
}

export function guessCurrency(symbol: string): string {
  const s = symbol.toUpperCase()
  if (s.endsWith('-USD')) return 'USD'
  for (const [suffix, cur] of Object.entries(SUFFIX_MAP)) {
    if (s.endsWith(suffix)) return cur
  }
  return 'USD'
}

export function getCurrencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? '$'
}

function autoDecimals(price: number): number {
  const p = Math.abs(price)
  if (p === 0)     return 2
  if (p < 0.0001)  return 8
  if (p < 0.01)    return 6
  if (p < 1)       return 5
  if (p < 10)      return 4
  if (p < 100)     return 3
  return 2
}

export function formatPrice(price: number, currency = 'USD', decimals?: number): string {
  const sym = getCurrencySymbol(currency)
  const d   = decimals ?? autoDecimals(price)
  const formatted = Math.abs(price).toFixed(d)
  const parts = formatted.split('.')
  const intPart = parts[0]
  const decPart = parts.length > 1 ? parts[1] : ''
  const sign = price >= 0 ? '' : '-'
  return `${sign}${sym}${withCommas(intPart)}${decPart ? `.${decPart}` : ''}`
}

function withCommas(n: string): string {
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function formatCompact(price: number, currency = 'USD'): string {
  const sym = getCurrencySymbol(currency)
  const sign = price >= 0 ? '' : '-'
  const p = Math.abs(price)
  if (p >= 1e12) return `${sign}${sym}${(p / 1e12).toFixed(2)}T`
  if (p >= 1e9) return `${sign}${sym}${(p / 1e9).toFixed(2)}B`
  if (p >= 1e6) return `${sign}${sym}${(p / 1e6).toFixed(2)}M`
  if (p >= 1e3) return `${sign}${sym}${(p / 1e3).toFixed(1)}K`
  return formatPrice(price, currency)
}

export function formatMarketCap(cap: number, currency = 'USD'): string {
  const sym = getCurrencySymbol(currency)
  if (cap >= 1e12) return `${sym}${(cap / 1e12).toFixed(2)}T`
  if (cap >= 1e9) return `${sym}${(cap / 1e9).toFixed(2)}B`
  if (cap >= 1e6) return `${sym}${(cap / 1e6).toFixed(2)}M`
  return `${sym}${cap.toFixed(0)}`
}

export function splitPrice(price: number, decimals?: number): { int: string; dec: string; sign: string } {
  const d = decimals ?? autoDecimals(price)
  const formatted = Math.abs(price).toFixed(d)
  const dotIdx = formatted.indexOf('.')
  return {
    int: dotIdx >= 0 ? formatted.slice(0, dotIdx) : formatted,
    dec: dotIdx >= 0 ? formatted.slice(dotIdx + 1) : '',
    sign: price < 0 ? '-' : '',
  }
}
