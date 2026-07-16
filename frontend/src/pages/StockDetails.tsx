import React, { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Download, ArrowUp, ArrowDown, Plus, Star } from 'lucide-react'
import type { StockQuote, IndicatorsResponse } from '@/services/stockService'
import type { NewsArticle } from '@/services/newsService'
import { portfolioService } from '@/services/portfolioService'
import TradingViewWidget from '@/components/charts/TradingViewWidget'
import PredictionCard from '@/components/Prediction/PredictionCard'
import ICTSignals from '@/components/ICTSignals'
import PaperTrading from '@/components/PaperTrading'
import StockTermSignals from '@/components/StockTermSignals'
import SignalConsensus from '@/components/SignalConsensus'
import ErrorBoundary from '@/components/ErrorBoundary'
import { API_URL } from '@/services/api'
import { formatPrice, formatMarketCap, guessCurrency, getCurrencySymbol } from '@/utils/currency'
import watchlistService from '@/services/watchlistService'
import type { ConsensusResult } from '@/services/signalService'
import { useStockCache, useQuote, useIndicators, useNews, useConsensus } from '@/store/stockCache'
import toast from 'react-hot-toast'

export default function StockDetailsPage() {
  return (
    <ErrorBoundary>
      <StockDetailsContent />
    </ErrorBoundary>
  )
}

function StockDetailsContent() {
  const { symbol = 'AAPL' } = useParams()
  const SYMBOL = symbol.toUpperCase()
  // Optional pre-resolved TV symbol from search (e.g. "NSE:RELIANCE"). When set,
  // passed directly to the chart so it works for symbols the yfinance→TV mapping
  // would fail for (NIFTY/SENSEX indices, some less common tickers).
  const [searchParams] = useSearchParams()
  const TV_SYMBOL = searchParams.get('tv') || undefined

  // Cache-backed data — shows instantly if cached, fetches in background if stale.
  const quoteEntry = useQuote(SYMBOL)
  const indicatorsEntry = useIndicators(SYMBOL)
  const newsEntry = useNews(SYMBOL)
  const consensusEntry = useConsensus(SYMBOL)

  const quote = quoteEntry.data?.symbol ? quoteEntry.data : null
  const indicators = indicatorsEntry.data?.symbol ? indicatorsEntry.data : null
  const news = newsEntry.data ?? null
  const consensus = consensusEntry.data?.symbol ? consensusEntry.data : null

  const [err, setErr] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ quantity: '', purchase_price: '' })
  const [paperTrade, setPaperTrade] = useState<{
    entry: number; sl: number; tp: number; strategy: string; side: 'BUY' | 'SELL'
  } | null>(null)
  const [inWatchlist, setInWatchlist] = useState(false)

  // Derive currency from quote (most accurate — from yfinance info) or guess from symbol suffix
  const currency = quote?.currency || guessCurrency(SYMBOL)
  const sym = getCurrencySymbol(currency)

  // Spot metals/energy have no Yahoo spot feed, so data comes from futures.
  // Gold & silver are spot-adjusted back onto the spot scale (label: "spot-adjusted");
  // the rest are shown as their futures contract (label: "futures").
  const SPOT_ADJUSTED: Record<string, string> = {
    'XAUUSD=X': 'gold', 'XAUUSD': 'gold',
    'XAGUSD=X': 'silver', 'XAGUSD': 'silver',
  }
  const FUTURES_ONLY: Record<string, string> = {
    'XPTUSD': 'Platinum futures (PL=F)', 'XPDUSD': 'Palladium futures (PA=F)',
    'XCUUSD': 'Copper futures (HG=F)',
    'USOIL': 'WTI crude futures (CL=F)', 'WTIUSD': 'WTI crude futures (CL=F)',
    'UKOIL': 'Brent crude futures (BZ=F)', 'BRENT': 'Brent crude futures (BZ=F)',
    'NATGAS': 'Natural gas futures (NG=F)',
  }
  const spotAdjusted = SPOT_ADJUSTED[SYMBOL]
  const futuresNote = FUTURES_ONLY[SYMBOL]

  const cache = useStockCache.getState
  useEffect(() => {
    // Cancellation guard — when SYMBOL changes mid-fetch, ignore results from
    // the old SYMBOL so stale data doesn't overwrite the new stock's data.
    let cancelled = false
    let liveId: ReturnType<typeof setInterval> | null = null

    setErr(null)
    setInWatchlist(false)

    // Kick off background fetches. Cache hooks already show cached data instantly.
    const fetchAll = () => {
      cache().getQuote(SYMBOL).catch((e) => { if (!cancelled) !quote && setErr(e.response?.data?.detail || e.message) })
      cache().getIndicators(SYMBOL, '6mo').catch(() => {})
      cache().getNews(SYMBOL, 6).catch(() => {})
      cache().getConsensus(SYMBOL).catch(() => {})
    }

    fetchAll()

    watchlistService.get()
      .then((items) => { if (!cancelled) setInWatchlist(items.some((i) => i.symbol === SYMBOL)) })
      .catch(() => {})

    // Live price refresh every 6 seconds (uses cache to dedupe)
    liveId = setInterval(() => {
      cache().prefetchQuote(SYMBOL).catch(() => {})
    }, 6000)

    return () => {
      cancelled = true
      if (liveId) clearInterval(liveId)
    }
  }, [SYMBOL])

  const toggleWatchlist = async () => {
    try {
      if (inWatchlist) {
        await watchlistService.remove(SYMBOL)
        setInWatchlist(false)
        toast.success(`${SYMBOL} removed from watchlist`)
      } else {
        await watchlistService.add(SYMBOL)
        setInWatchlist(true)
        toast.success(`${SYMBOL} added to watchlist`)
      }
    } catch {
      toast.error('Could not update watchlist — are you logged in?')
    }
  }

  const addToPortfolio = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addForm.quantity || !addForm.purchase_price) return
    try {
      await portfolioService.addHolding({
        symbol: SYMBOL,
        quantity: parseFloat(addForm.quantity),
        purchase_price: parseFloat(addForm.purchase_price),
      })
      toast.success(`Added ${SYMBOL} to portfolio`)
      setShowAdd(false)
      setAddForm({ quantity: '', purchase_price: '' })
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to add')
    }
  }

  const up = quote ? quote.change_percent >= 0 : false

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white font-display">{SYMBOL}</h1>
          {quote ? (
            <p className="text-gray-400">
              {quote.name} · {quote.exchange || ''} ·{' '}
              <span className="text-blue-400 font-semibold">{currency}</span>
            </p>
          ) : !err ? (
            <p className="text-gray-500 text-sm animate-pulse">Loading {SYMBOL}…</p>
          ) : (
            <p className="text-gray-500 text-sm">Symbol not found</p>
          )}
        </div>
        {quote ? (
          <div className="text-right">
            <p className="text-4xl font-bold text-white font-mono">{formatPrice(quote.price, currency)}</p>
            <p className={`flex items-center gap-1 justify-end ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
              {up ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
              {sym}{Math.abs(quote.change).toFixed(2)} ({quote.change_percent.toFixed(2)}%)
            </p>
          </div>
        ) : !err ? (
          <div className="text-right">
            <div className="h-10 w-32 bg-gray-700 rounded animate-pulse mb-2" />
            <div className="h-4 w-24 bg-gray-700 rounded animate-pulse ml-auto" />
          </div>
        ) : null}
      </div>

      {/* Spot-adjusted note: gold/silver futures data converted to spot scale */}
      {spotAdjusted && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-2.5 text-blue-200/90 text-sm flex items-start gap-2">
          <span className="text-blue-400 mt-0.5">ⓘ</span>
          <span>
            Showing <strong className="text-blue-100">spot {spotAdjusted}</strong> prices. Yahoo only carries
            {' '}{spotAdjusted} as a futures contract, so we convert it to the spot scale (anchored to the
            {' '}{spotAdjusted === 'gold' ? 'GLD' : 'SLV'} ETF). Signals, entries, SL/TP and targets are all on the spot scale.
          </span>
        </div>
      )}

      {/* Futures-only note: platinum/oil/gas shown as their futures contract */}
      {futuresNote && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5 text-amber-200/90 text-sm flex items-start gap-2">
          <span className="text-amber-400 mt-0.5">ⓘ</span>
          <span>
            Spot {SYMBOL.replace('=X', '')} has no live data feed, so prices, chart, and signals here use{' '}
            <strong className="text-amber-100">{futuresNote}</strong> — which trades slightly above/below spot.
            The direction and % moves track spot closely.
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 animate-spring-up stagger-1">
        <button onClick={() => setShowAdd(!showAdd)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm">
          <Plus size={16} /> Add to Portfolio
        </button>
        <button
          onClick={toggleWatchlist}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
            inWatchlist
              ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 hover:bg-yellow-500/30'
              : 'bg-gray-700 hover:bg-gray-600 text-white border border-gray-600'
          }`}
        >
          <Star size={16} fill={inWatchlist ? 'currentColor' : 'none'} />
          {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
        </button>
        <a href={`${API_URL}/api/reports/stock/${SYMBOL}/pdf`} target="_blank" rel="noopener"
           className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm">
          <Download size={16} /> PDF Report
        </a>
        <a href={`${API_URL}/api/reports/stock/${SYMBOL}/csv?period=1y`} target="_blank" rel="noopener"
           className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm">
          <Download size={16} /> CSV Data
        </a>
      </div>

      {showAdd && (
        <form onSubmit={addToPortfolio} className="glass-card p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Quantity</label>
            <input type="number" step="any" required value={addForm.quantity}
                   onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
                   className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white w-32" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Buy Price ({sym})</label>
            <input type="number" step="any" required value={addForm.purchase_price}
                   onChange={(e) => setAddForm({ ...addForm, purchase_price: e.target.value })}
                   placeholder={quote?.price.toFixed(2) || '0.00'}
                   className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white w-32" />
          </div>
          <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded text-white">Save</button>
        </form>
      )}

      {/* Quote details */}
      {quote && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="glass-card p-3">
            <p className="text-xs text-gray-400">Open</p>
            <p className="text-white font-semibold">{formatPrice(quote.open, currency)}</p>
          </div>
          <div className="glass-card p-3">
            <p className="text-xs text-gray-400">High</p>
            <p className="text-white font-semibold">{formatPrice(quote.high, currency)}</p>
          </div>
          <div className="glass-card p-3">
            <p className="text-xs text-gray-400">Low</p>
            <p className="text-white font-semibold">{formatPrice(quote.low, currency)}</p>
          </div>
          <div className="glass-card p-3">
            <p className="text-xs text-gray-400">Volume</p>
            <p className="text-white font-semibold">{quote.volume.toLocaleString()}</p>
          </div>
          {quote.fifty_two_week_high && (
            <div className="glass-card p-3">
              <p className="text-xs text-gray-400">52w High</p>
              <p className="text-white font-semibold">{formatPrice(quote.fifty_two_week_high, currency)}</p>
            </div>
          )}
          {quote.fifty_two_week_low && (
            <div className="glass-card p-3">
              <p className="text-xs text-gray-400">52w Low</p>
              <p className="text-white font-semibold">{formatPrice(quote.fifty_two_week_low, currency)}</p>
            </div>
          )}
          {quote.market_cap && (
            <div className="glass-card p-3">
              <p className="text-xs text-gray-400">Market Cap</p>
              <p className="text-white font-semibold">{formatMarketCap(quote.market_cap, currency)}</p>
            </div>
          )}
          {quote.pe_ratio && (
            <div className="glass-card p-3">
              <p className="text-xs text-gray-400">P/E</p>
              <p className="text-white font-semibold">{quote.pe_ratio.toFixed(2)}</p>
            </div>
          )}
        </div>
      )}

      {/* TradingView Chart — full feature set with all drawing tools + indicators */}
      <div className="glass-card p-3">
        <TradingViewWidget symbol={SYMBOL} tvSymbol={TV_SYMBOL} height={680} />
      </div>

      {/* Signal Consensus + Term Signals */}
      <SignalConsensus
        result={consensus}
        loading={consensusEntry.loading}
        onRefresh={() => {
          useStockCache.getState().refreshConsensus(SYMBOL).catch(() => {})
        }}
      />
      <StockTermSignals symbol={SYMBOL} masterSignal={consensus?.master_signal} />

      {/* AI Prediction · ICT signals · Paper trading */}
      <PredictionCard symbol={SYMBOL} currency={currency} />

      <ICTSignals symbol={SYMBOL} currency={currency} onTrade={(t) => {
        setPaperTrade(t)
        document.getElementById('paper-trading')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }} />

      <div id="paper-trading">
        <PaperTrading
          symbol={SYMBOL}
          currency={currency}
          suggestedEntry={paperTrade?.entry}
          suggestedSl={paperTrade?.sl}
          suggestedTp={paperTrade?.tp}
          suggestedStrategy={paperTrade?.strategy}
        />
      </div>

      {/* Technical Indicators */}
      {indicators && (
        <div className="glass-card p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-white">Technical Indicators</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Technical-only bias:</span>
              <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                indicators.signal === 'BUY' ? 'bg-emerald-500/20 text-emerald-300' :
                indicators.signal === 'SELL' ? 'bg-rose-500/20 text-rose-300' :
                'bg-gray-500/20 text-gray-300'
              }`}>{indicators.signal}</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            This bias comes from RSI / MACD / Bollinger only. The <strong className="text-blue-400">AI Prediction</strong> above
            is the authoritative recommendation — it combines these indicators with the LSTM+XGBoost forecast.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(indicators.latest).map(([k, v]) => (
              <div key={k} className="bg-gray-700 rounded-lg p-3 border border-gray-600">
                <p className="text-xs text-gray-400 uppercase">{k.replace(/_/g, ' ')}</p>
                <p className="text-white font-semibold">{v !== null && v !== undefined ? v.toFixed(2) : '-'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* News */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-bold text-white mb-4">Recent News</h2>
        {news === null && <div className="text-gray-500 text-sm">Loading news…</div>}
        {news && news.length === 0 && <div className="text-gray-500 text-sm">No recent news</div>}
        {news && news.length > 0 && (
          <div className="space-y-3">
            {news.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                 className="block pb-3 border-b border-gray-700 last:border-b-0 hover:bg-gray-700/30 rounded p-2 -m-2">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-white font-medium flex-1">{a.title}</h3>
                  <span className={`ml-3 px-2 py-1 rounded text-xs font-semibold ${
                    a.sentiment === 'POSITIVE' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' :
                    a.sentiment === 'NEGATIVE' ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20' :
                    'bg-gray-500/20 text-gray-300'
                  }`}>{a.sentiment}</span>
                </div>
                {a.summary && <p className="text-gray-400 text-sm line-clamp-2">{a.summary}</p>}
                <p className="text-gray-500 text-xs mt-1">{a.source}</p>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
