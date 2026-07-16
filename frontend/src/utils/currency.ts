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

/**
 * Pick a sensible number of decimals based on price magnitude.
 * Critical for forex (EUR/USD must show 1.1304, not 1.13) and small-cap crypto.
 */
function autoDecimals(price: number): number {
  const p = Math.abs(price)
  if (p === 0)     return 2
  if (p < 0.0001)  return 8     // sub-penny crypto (SHIB-style)
  if (p < 0.01)    return 6
  if (p < 1)       return 5     // small forex / penny stocks
  if (p < 10)      return 4     // most forex majors (EURUSD, GBPUSD)
  if (p < 100)     return 3     // JPY pairs, some indices
  return 2
}

export function formatPrice(price: number, currency = 'USD', decimals?: number): string {
  const sym = getCurrencySymbol(currency)
  const d   = decimals ?? autoDecimals(price)
  return `${sym}${price.toFixed(d)}`
}

export function formatMarketCap(cap: number, currency = 'USD'): string {
  const sym = getCurrencySymbol(currency)
  if (cap >= 1e12) return `${sym}${(cap / 1e12).toFixed(2)}T`
  if (cap >= 1e9) return `${sym}${(cap / 1e9).toFixed(2)}B`
  if (cap >= 1e6) return `${sym}${(cap / 1e6).toFixed(2)}M`
  return `${sym}${cap.toFixed(0)}`
}
