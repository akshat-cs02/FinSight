import type { MarketKey } from '@/services/dashboardService'

/** Symbol lists per market — mirrors backend MARKET_GROUPS. */
export const MARKET_SYMBOLS: Record<Exclude<MarketKey, 'ALL'>, string[]> = {
  US:          ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX'],
  INDIA:       ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'ICICIBANK.NS', 'SBIN.NS', 'TATAMOTORS.NS', 'WIPRO.NS'],
  CRYPTO:      ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'XRP-USD', 'ADA-USD', 'DOGE-USD', 'AVAX-USD'],
  FOREX:       ['EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'AUDUSD=X', 'USDCAD=X', 'USDINR=X'],
  COMMODITIES: ['GC=F', 'SI=F', 'CL=F', 'BZ=F', 'NG=F', 'HG=F'],
}

export const MARKET_FLAGS: Record<MarketKey, string> = {
  ALL: '🌐', US: '🇺🇸', INDIA: '🇮🇳', CRYPTO: '₿', FOREX: '💱', COMMODITIES: '🏗️',
}

export const MARKET_LABELS: Record<MarketKey, string> = {
  ALL: '🌐 All', US: '🇺🇸 US', INDIA: '🇮🇳 India', CRYPTO: '₿ Crypto', FOREX: '💱 Forex', COMMODITIES: '🏗️ Commodities',
}

export const MARKET_ORDER: MarketKey[] = ['ALL', 'US', 'INDIA', 'CRYPTO', 'FOREX', 'COMMODITIES']

/** Classify a yfinance symbol into its asset class. */
export function classifySymbol(symbol: string): Exclude<MarketKey, 'ALL'> {
  const s = symbol.toUpperCase()
  if (s.endsWith('-USD')) return 'CRYPTO'
  if (s.endsWith('=X'))   return 'FOREX'
  if (s.endsWith('=F'))   return 'COMMODITIES'
  if (s.endsWith('.NS') || s.endsWith('.BO')) return 'INDIA'
  return 'US'
}

/** Does a symbol belong to the selected market? ('ALL' matches everything.) */
export function symbolInMarket(symbol: string, market: MarketKey): boolean {
  if (market === 'ALL') return true
  return classifySymbol(symbol) === market
}

/** Human-readable display names for signal universe tickers. */
export const SYMBOL_DISPLAY_NAMES: Record<string, string> = {
  // US
  'AAPL': 'Apple', 'MSFT': 'Microsoft', 'NVDA': 'NVIDIA', 'TSLA': 'Tesla',
  'GOOGL': 'Alphabet', 'AMZN': 'Amazon', 'META': 'Meta', 'NFLX': 'Netflix',
  // India
  'RELIANCE.NS': 'Reliance', 'TCS.NS': 'TCS', 'INFY.NS': 'Infosys',
  'HDFCBANK.NS': 'HDFC Bank', 'ICICIBANK.NS': 'ICICI Bank',
  'SBIN.NS': 'SBI', 'TATAMOTORS.NS': 'Tata Motors', 'WIPRO.NS': 'Wipro',
  // Crypto
  'BTC-USD': 'Bitcoin', 'ETH-USD': 'Ethereum', 'SOL-USD': 'Solana',
  'BNB-USD': 'BNB', 'XRP-USD': 'XRP', 'ADA-USD': 'Cardano',
  'DOGE-USD': 'Dogecoin', 'AVAX-USD': 'Avalanche',
  // Forex
  'EURUSD=X': 'EUR/USD', 'GBPUSD=X': 'GBP/USD', 'USDJPY=X': 'USD/JPY',
  'AUDUSD=X': 'AUD/USD', 'USDCAD=X': 'USD/CAD', 'USDINR=X': 'USD/INR',
  // Commodities
  'GC=F': 'Gold', 'SI=F': 'Silver', 'CL=F': 'WTI Crude Oil',
  'BZ=F': 'Brent Crude Oil', 'NG=F': 'Natural Gas', 'HG=F': 'Copper',
}

/** Return a user-friendly name for a ticker symbol. */
export function symbolDisplayName(symbol: string): string {
  return SYMBOL_DISPLAY_NAMES[symbol] ?? symbol
}

/** Ticker symbols to stream for a market (cross-asset sample for 'ALL'). */
export function tickerSymbolsForMarket(market: MarketKey): string[] {
  if (market === 'ALL') {
    return [
      ...MARKET_SYMBOLS.US.slice(0, 2),
      ...MARKET_SYMBOLS.INDIA.slice(0, 2),
      ...MARKET_SYMBOLS.CRYPTO.slice(0, 1),
      ...MARKET_SYMBOLS.FOREX.slice(0, 1),
    ]
  }
  return MARKET_SYMBOLS[market]
}
