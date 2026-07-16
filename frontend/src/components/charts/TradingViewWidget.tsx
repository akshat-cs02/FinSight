import React, { useEffect, useMemo, useState } from 'react'
import { ExternalLink, BarChart3 } from 'lucide-react'
import LightweightChart from './LightweightChart'

const SYMBOL_MAP: Record<string, string> = {
  // US large cap
  'AAPL':  'NASDAQ:AAPL', 'MSFT':  'NASDAQ:MSFT', 'GOOGL': 'NASDAQ:GOOGL',
  'AMZN':  'NASDAQ:AMZN', 'NVDA':  'NASDAQ:NVDA', 'META':  'NASDAQ:META',
  'TSLA':  'NASDAQ:TSLA', 'NFLX':  'NASDAQ:NFLX', 'ORCL':  'NYSE:ORCL',
  'JPM':   'NYSE:JPM',    'GS':    'NYSE:GS',     'BAC':   'NYSE:BAC',
  'WMT':   'NYSE:WMT',    'V':     'NYSE:V',      'MA':    'NYSE:MA',
  'UNH':   'NYSE:UNH',    'HD':    'NYSE:HD',     'AMD':   'NASDAQ:AMD',
  'INTC':  'NASDAQ:INTC', 'QCOM':  'NASDAQ:QCOM', 'ADBE':  'NASDAQ:ADBE',
  'CRM':   'NYSE:CRM',    'PYPL':  'NASDAQ:PYPL', 'DIS':   'NYSE:DIS',
  'SBUX':  'NASDAQ:SBUX', 'BA':    'NYSE:BA',     'CAT':   'NYSE:CAT',

  // Global indices — yfinance ^ prefix
  '^GSPC':  'SP:SPX',     '^IXIC':  'NASDAQ:COMP', '^DJI':   'TVC:DJI',
  '^VIX':   'TVC:VIX',    '^RUT':   'TVC:RUT',     '^FTSE':  'TVC:UKX',
  '^GDAXI': 'TVC:DEU40',  '^FCHI':  'EURONEXT:CAC40',
  '^N225':  'TVC:NI225',  '^HSI':   'TVC:HSI',
  '^NSEI':  'NSE:NIFTY',  '^BSESN': 'BSE:SENSEX',  '^NSEBANK': 'NSE:BANKNIFTY',

  // Crypto
  'BTC-USD':  'BINANCE:BTCUSDT', 'ETH-USD':  'BINANCE:ETHUSDT',
  'SOL-USD':  'BINANCE:SOLUSDT', 'BNB-USD':  'BINANCE:BNBUSDT',
  'XRP-USD':  'BINANCE:XRPUSDT', 'ADA-USD':  'BINANCE:ADAUSDT',
  'DOGE-USD': 'BINANCE:DOGEUSDT','AVAX-USD': 'BINANCE:AVAXUSDT',
  'LINK-USD': 'BINANCE:LINKUSDT','DOT-USD':  'BINANCE:DOTUSDT',
  'MATIC-USD':'BINANCE:MATICUSDT','LTC-USD':  'BINANCE:LTCUSDT',

  // Forex — yfinance =X suffix variants AND bare
  'EURUSD=X': 'FX:EURUSD', 'GBPUSD=X': 'FX:GBPUSD',
  'USDJPY=X': 'FX:USDJPY', 'AUDUSD=X': 'FX:AUDUSD',
  'USDCAD=X': 'FX:USDCAD', 'USDCHF=X': 'FX:USDCHF',
  'NZDUSD=X': 'FX:NZDUSD', 'USDINR=X': 'FX:USDINR',
  'EURJPY=X': 'FX:EURJPY', 'EURGBP=X': 'FX:EURGBP',
  'GBPJPY=X': 'FX:GBPJPY', 'USDSGD=X': 'FX:USDSGD',
  'USDHKD=X': 'FX:USDHKD', 'USDMXN=X': 'FX:USDMXN',
  'EURUSD':   'FX:EURUSD', 'GBPUSD':   'FX:GBPUSD',
  'USDJPY':   'FX:USDJPY', 'AUDUSD':   'FX:AUDUSD',
  'USDCAD':   'FX:USDCAD', 'USDCHF':   'FX:USDCHF',
  'NZDUSD':   'FX:NZDUSD', 'USDINR':   'FX:USDINR',
  'EURJPY':   'FX:EURJPY', 'EURGBP':   'FX:EURGBP', 'GBPJPY': 'FX:GBPJPY',

  // Gold & silver
  'XAUUSD=X': 'TVC:GOLD',   'XAGUSD=X': 'TVC:SILVER',
  'XAUUSD':   'TVC:GOLD',   'XAGUSD':   'TVC:SILVER',
  'XPTUSD=X': 'NYMEX:PL1!', 'XPDUSD=X': 'NYMEX:PA1!',
  'XPTUSD':   'NYMEX:PL1!', 'XPDUSD':   'NYMEX:PA1!',
  'XCUUSD':   'COMEX:HG1!',
  'USOIL':    'NYMEX:CL1!', 'WTIUSD':   'NYMEX:CL1!',
  'UKOIL':    'NYMEX:BZ1!', 'BRENT':    'NYMEX:BZ1!',
  'NATGAS':   'NYMEX:NG1!',

  // Explicit futures tickers
  'GC=F': 'COMEX:GC1!',  'SI=F': 'COMEX:SI1!',
  'CL=F': 'NYMEX:CL1!',  'BZ=F': 'NYMEX:BZ1!',
  'NG=F': 'NYMEX:NG1!',
  'ZW=F': 'CBOT:ZW1!',   'ZC=F': 'CBOT:ZC1!',
  'HG=F': 'COMEX:HG1!',  'PL=F': 'NYMEX:PL1!',
  'ES=F': 'CME:ES1!',    'NQ=F': 'CME:NQ1!',
  'YM=F': 'CBOT:YM1!',   'RTY=F':'CME:RTY1!',

  // Commodity ETFs
  'GLD':  'AMEX:GLD',  'SLV':  'AMEX:SLV',
  'USO':  'AMEX:USO',  'UNG':  'AMEX:UNG',
  'CPER': 'AMEX:CPER', 'PPLT': 'AMEX:PPLT',
  'WEAT': 'AMEX:WEAT', 'CORN': 'AMEX:CORN',
}

export function mapToTradingView(symbol: string, market?: string): string {
  const s = (symbol || '').toUpperCase().trim()
  if (s.includes(':')) return s

  if (SYMBOL_MAP[s]) return SYMBOL_MAP[s]

  if (s.endsWith('=X')) {
    const base = s.slice(0, -2)
    if (SYMBOL_MAP[base]) return SYMBOL_MAP[base]
    return `FX:${base}`
  }

  if (s.endsWith('=F')) {
    const base = s.slice(0, -2)
    if (SYMBOL_MAP[base + '=F']) return SYMBOL_MAP[base + '=F']
    if (SYMBOL_MAP[base]) return SYMBOL_MAP[base]
    return base
  }

  if (s.startsWith('^')) {
    if (SYMBOL_MAP[s]) return SYMBOL_MAP[s]
    return s.slice(1)
  }

  const suffixMap: [string, string, number][] = [
    ['.NS', 'NSE', 3], ['.BO', 'BSE', 3], ['.L', 'LSE', 2], ['.DE', 'XETR', 3],
    ['.PA', 'EURONEXT', 3], ['.AS', 'EURONEXT', 3], ['.MI', 'MIL', 3], ['.MC', 'BME', 3],
    ['.HK', 'HKEX', 3], ['.T', 'TSE', 2], ['.AX', 'ASX', 3], ['.SS', 'SSE', 3],
    ['.SZ', 'SZSE', 3], ['.SW', 'SWX', 3], ['.SA', 'BMFBOVESPA', 3], ['.KS', 'KRX', 3],
    ['.KQ', 'KRX', 3], ['.TO', 'TSX', 3], ['.V', 'TSXV', 2],
  ]
  for (const [suf, exch, cut] of suffixMap) {
    if (s.endsWith(suf)) return `${exch}:${s.slice(0, -cut)}`
  }

  if (market === 'INDIA') return `NSE:${s}`
  if (market === 'CRYPTO') return `BINANCE:${s.replace(/-?USD.?$/, '')}USDT`

  return s
}

const toTVSymbol = (symbol: string) => mapToTradingView(symbol)

const TIMEFRAMES: { label: string; code: string; group: 'intraday' | 'daily' }[] = [
  { label: '1m',  code: '1',   group: 'intraday' },
  { label: '5m',  code: '5',   group: 'intraday' },
  { label: '15m', code: '15',  group: 'intraday' },
  { label: '30m', code: '30',  group: 'intraday' },
  { label: '1h',  code: '60',  group: 'intraday' },
  { label: '1D',  code: 'D',   group: 'daily' },
  { label: '1W',  code: 'W',   group: 'daily' },
  { label: '1M',  code: 'M',   group: 'daily' },
]

interface Props {
  symbol: string
  /** Pre-resolved TradingView symbol (e.g. "NSE:RELIANCE"). If provided, used directly
   *  as the chart symbol — skips yfinance → TV format mapping (which fails for some
   *  symbols like NIFTY, SENSEX indices). */
  tvSymbol?: string
  height?: number
  interval?: string
  compact?: boolean
}

export default function TradingViewWidget({ symbol, tvSymbol: tvSymbolProp, height = 680, interval, compact = false }: Props) {
  const tvSymbol = tvSymbolProp || useMemo(() => toTVSymbol(symbol), [symbol])

  const tfKey = `finsight_tf_${symbol.toUpperCase()}`
  const [activeInterval, setActiveInterval] = useState<string>(interval || 'D')
  const [iframeLoaded, setIframeLoaded] = useState(false)

  // Symbols where TradingView's free embed is unreliable:
  //   - NSE/BSE Indian equities (NSE not in free embed at all; BSE EOD-only)
  //   - Continuous futures (CL1!, GC1!, BZ1!) — "only available on tradingview"
  // For these, default to native chart (lightweight-charts + backend OHLCV).
  const upperSym = symbol.toUpperCase()
  const isIndianEquity   = upperSym.endsWith('.NS') || upperSym.endsWith('.BO')
  const isContinuousFwd  = upperSym.endsWith('=F') || ['USOIL','UKOIL','WTIUSD','BRENT','NATGAS','XAUUSD','XAGUSD','XPTUSD','XPDUSD','XCUUSD'].includes(upperSym)
  const forceNative = isIndianEquity || isContinuousFwd
  const [useNative, setUseNative] = useState(forceNative)

  // Auto-fallback: if the TradingView iframe hasn't loaded within 12s (blocked by
  // an ad-blocker, network, or unsupported symbol), switch to the native chart
  // automatically so the user is never left staring at a blank/broken frame.
  useEffect(() => {
    if (useNative) return
    setIframeLoaded(false)
    const id = setTimeout(() => {
      setIframeLoaded((loaded) => {
        if (!loaded) setUseNative(true)
        return loaded
      })
    }, 12000)
    return () => clearTimeout(id)
  }, [tvSymbol, activeInterval, useNative])

  useEffect(() => {
    if (interval) { setActiveInterval(interval); return }
    try {
      const saved = localStorage.getItem(tfKey)
      setActiveInterval(saved || 'D')
    } catch {
      setActiveInterval('D')
    }
  }, [symbol, interval, tfKey])

  const selectTimeframe = (code: string) => {
    setActiveInterval(code)
    try { localStorage.setItem(tfKey, code) } catch { /* ignore */ }
  }

  const params = new URLSearchParams({
    symbol: tvSymbol,
    interval: activeInterval,
    theme: 'dark',
    style: '1',
    timezone: 'Asia/Kolkata',
    locale: 'in',
    toolbarbg: '1a1a2e',
    hidesidetoolbar: compact ? '1' : '0',
    hidetoptoolbar: compact ? '1' : '0',
    withdateranges: compact ? '0' : '1',
    details: compact ? '0' : '1',
    hideideas: '1',
    allow_symbol_change: compact ? '0' : '1',
    studies: compact ? '' : 'RSI@tv-basicstudies,MACD@tv-basicstudies',
    save_image: '0',
  })
  const src = `https://s.tradingview.com/widgetembed/?${params.toString()}`
  const fallbackHref = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}&interval=${activeInterval}`

  if (useNative) {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500">Native chart (self-hosted data)</span>
          <button
            onClick={() => setUseNative(false)}
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            Switch to TradingView
          </button>
        </div>
        <LightweightChart symbol={symbol} height={height} interval={activeInterval} compact={compact} />
      </div>
    )
  }

  return (
    <div className="w-full">
      <div
        className="w-full rounded-xl overflow-hidden border border-gray-700 bg-gray-900 relative"
        style={{ height }}
      >
        <iframe
          key={`${tvSymbol}-${activeInterval}-${compact}`}
          src={src}
          title={`TradingView chart — ${tvSymbol}`}
          style={{ width: '100%', height: '100%', border: 0 }}
          allow="fullscreen"
          loading="lazy"
          onLoad={() => setIframeLoaded(true)}
        />

        {/* Loading overlay until the iframe renders (or auto-falls-back). */}
        {!iframeLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-900/60 pointer-events-none">
            <div className="w-6 h-6 border-2 border-blue-500/40 border-t-blue-400 rounded-full animate-spin" />
            <span className="text-xs text-gray-400">Loading chart…</span>
          </div>
        )}

        {!compact && (
          <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5">
            <button
              onClick={() => setUseNative(true)}
              title="If chart shows 'only available on tradingview', try native chart"
              className="bg-gray-800/80 hover:bg-gray-700 backdrop-blur text-blue-300 hover:text-white text-xs px-2 py-1 rounded flex items-center gap-1 shadow"
            >
              <BarChart3 size={12} /> Native chart
            </button>
            <a
              href={fallbackHref}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gray-800/80 hover:bg-gray-700 backdrop-blur text-blue-300 hover:text-white text-xs px-2 py-1 rounded flex items-center gap-1 shadow"
            >
              <ExternalLink size={12} /> Open on TradingView
            </a>
          </div>
        )}
      </div>

      {!compact && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="text-xs text-gray-500 mr-1">Timeframe:</span>
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.code}
              onClick={() => selectTimeframe(tf.code)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                activeInterval === tf.code
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
              } ${tf.group === 'daily' && tf.label === '1D' ? 'ml-2' : ''}`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
