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
import PriceDisplay from '@/components/PriceDisplay'
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
  const [searchParams] = useSearchParams()
  const TV_SYMBOL = searchParams.get('tv') || undefined

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

  const currency = quote?.currency || guessCurrency(SYMBOL)
  const sym = getCurrencySymbol(currency)

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
    let cancelled = false
    let liveId: ReturnType<typeof setInterval> | null = null

    setErr(null)
    setInWatchlist(false)

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
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 animate-spring-up stagger-0">
        <div>
          <div className="section-eyebrow">Stock Details</div>
          <h1 className="text-3xl font-bold text-ink-900 font-display">{SYMBOL}</h1>
          {quote ? (
            <p className="text-ink-600">
              {quote.name} · {quote.exchange || ''} ·{' '}
              <span className="text-blue-400 font-semibold">{currency}</span>
            </p>
          ) : !err ? (
            <p className="text-ink-500 text-sm animate-pulse">Loading {SYMBOL}…</p>
          ) : (
            <p className="text-ink-500 text-sm">Symbol not found</p>
          )}
        </div>
        {quote ? (
          <div className="text-right">
            <PriceDisplay price={quote.price} currency={currency} size="hero" color="default" />
            <p className={`flex items-center gap-1 justify-end ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
              {up ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
              {sym}{Math.abs(quote.change).toFixed(2)} ({quote.change_percent.toFixed(2)}%)
            </p>
          </div>
        ) : !err ? (
          <div className="text-right">
            <div className="skeleton h-10 w-32 rounded mb-2" />
            <div className="skeleton h-4 w-24 rounded ml-auto" />
          </div>
        ) : null}
      </div>

      {/* Spot-adjusted note */}
      {spotAdjusted && (
        <div className="card-accent-top blue card-layer rounded-xl px-4 py-2.5 text-ink-600 text-sm flex items-start gap-2 animate-spring-up stagger-1">
          <span className="text-blue-400 mt-0.5 shrink-0">ⓘ</span>
          <span>
            Showing <strong className="text-ink-800 font-medium">spot {spotAdjusted}</strong> prices. Yahoo only carries
            {' '}{spotAdjusted} as a futures contract, so we convert it to the spot scale (anchored to the
            {' '}{spotAdjusted === 'gold' ? 'GLD' : 'SLV'} ETF). Signals, entries, SL/TP and targets are all on the spot scale.
          </span>
        </div>
      )}

      {/* Futures-only note */}
      {futuresNote && (
        <div className="card-accent-top amber card-layer rounded-xl px-4 py-2.5 text-ink-600 text-sm flex items-start gap-2 animate-spring-up stagger-1">
          <span className="text-amber-400 mt-0.5 shrink-0">ⓘ</span>
          <span>
            Spot {SYMBOL.replace('=X', '')} has no live data feed, so prices, chart, and signals here use{' '}
            <strong className="text-ink-800 font-medium">{futuresNote}</strong> — which trades slightly above/below spot.
            The direction and % moves track spot closely.
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 animate-spring-up stagger-1">
        <button onClick={() => setShowAdd(!showAdd)} className="btn btn-primary">
          <Plus size={16} /> Add to Portfolio
        </button>
        <button
          onClick={toggleWatchlist}
          className={`btn ${
            inWatchlist
              ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 hover:bg-yellow-500/30'
              : 'btn-ghost'
          }`}
        >
          <Star size={16} fill={inWatchlist ? 'currentColor' : 'none'} />
          {inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
        </button>
        <a href={`${API_URL}/api/reports/stock/${SYMBOL}/pdf`} target="_blank" rel="noopener"
           className="btn btn-ghost">
          <Download size={16} /> PDF Report
        </a>
        <a href={`${API_URL}/api/reports/stock/${SYMBOL}/csv?period=1y`} target="_blank" rel="noopener"
           className="btn btn-ghost">
          <Download size={16} /> CSV Data
        </a>
      </div>

      {showAdd && (
        <form onSubmit={addToPortfolio} className="card-layer rounded-xl p-4 animate-spring-up stagger-2">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block section-eyebrow mb-1">Quantity</label>
              <input type="number" step="any" required value={addForm.quantity}
                     onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
                     className="input-glow w-32" />
            </div>
            <div>
              <label className="block section-eyebrow mb-1">Buy Price ({sym})</label>
              <input type="number" step="any" required value={addForm.purchase_price}
                     onChange={(e) => setAddForm({ ...addForm, purchase_price: e.target.value })}
                     placeholder={quote?.price.toFixed(2) || '0.00'}
                     className="input-glow w-32" />
            </div>
            <button type="submit" className="btn btn-emerald">Save</button>
          </div>
        </form>
      )}

      {/* Quote details */}
      {quote && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-spring-up stagger-1">
          <div className="card-flat card-layer rounded-xl p-3">
            <p className="section-eyebrow">Open</p>
            <PriceDisplay price={quote.open} currency={currency} size="md" color="default" />
          </div>
          <div className="card-flat card-layer rounded-xl p-3">
            <p className="section-eyebrow">High</p>
            <PriceDisplay price={quote.high} currency={currency} size="md" color="default" />
          </div>
          <div className="card-flat card-layer rounded-xl p-3">
            <p className="section-eyebrow">Low</p>
            <PriceDisplay price={quote.low} currency={currency} size="md" color="default" />
          </div>
          <div className="card-flat card-layer rounded-xl p-3">
            <p className="section-eyebrow">Volume</p>
            <p className="text-ink-900 font-semibold font-mono tabular-nums">{quote.volume.toLocaleString()}</p>
          </div>
          {quote.fifty_two_week_high && (
            <div className="card-flat card-layer rounded-xl p-3">
              <p className="section-eyebrow">52w High</p>
              <PriceDisplay price={quote.fifty_two_week_high} currency={currency} size="md" color="default" />
            </div>
          )}
          {quote.fifty_two_week_low && (
            <div className="card-flat card-layer rounded-xl p-3">
              <p className="section-eyebrow">52w Low</p>
              <PriceDisplay price={quote.fifty_two_week_low} currency={currency} size="md" color="default" />
            </div>
          )}
          {quote.market_cap && (
            <div className="card-flat card-layer rounded-xl p-3">
              <p className="section-eyebrow">Market Cap</p>
              <p className="text-ink-900 font-semibold font-mono tabular-nums">{formatMarketCap(quote.market_cap, currency)}</p>
            </div>
          )}
          {quote.pe_ratio && (
            <div className="card-flat card-layer rounded-xl p-3">
              <p className="section-eyebrow">P/E</p>
              <p className="text-ink-900 font-semibold font-mono tabular-nums">{quote.pe_ratio.toFixed(2)}</p>
            </div>
          )}
        </div>
      )}

      {/* TradingView Chart */}
      <div className="card-layer rounded-xl p-3 animate-spring-up stagger-2">
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

      {/* AI Prediction · ICT Signals · Paper trading */}
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

      {/* Technical Indicators — purple accent */}
      {indicators && (
        <div className="card-accent-top purple card-layer rounded-xl p-5 animate-spring-up stagger-3">
          <div className="section-eyebrow">Analysis</div>
          <h2 className="accent-heading text-purple-400 text-lg mb-4">
            <span className="text-ink-900">Technical Indicators</span>
          </h2>
          <div className="flex justify-between items-center mb-4">
            <p className="text-xs text-ink-500">
              This bias comes from RSI / MACD / Bollinger only. The <strong className="text-blue-400">AI Prediction</strong> above
              is the authoritative recommendation — it combines these indicators with the LSTM+XGBoost forecast.
            </p>
            <div className="flex items-center gap-2 flex-shrink-0 ml-4">
              <span className="text-xs text-ink-500">Technical-only bias:</span>
              <span className={`tag ${
                indicators.signal === 'BUY' ? 'tag-emerald' :
                indicators.signal === 'SELL' ? 'tag-rose' :
                'tag-gray'
              }`}>{indicators.signal}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(indicators.latest).map(([k, v]) => (
              <div key={k} className="card-flat card-layer rounded-xl p-3">
                <p className="section-eyebrow">{k.replace(/_/g, ' ')}</p>
                <p className="text-ink-900 font-semibold font-mono tabular-nums">{v !== null && v !== undefined ? v.toFixed(2) : '-'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* News — cyan accent */}
      <div className="card-accent-top cyan card-layer rounded-xl p-5 animate-spring-up stagger-4">
        <div className="section-eyebrow">Latest</div>
        <h2 className="accent-heading text-cyan-400 text-lg mb-4">
          <span className="text-ink-900">Recent News</span>
        </h2>
        {news === null && <div className="text-ink-500 text-sm">Loading news…</div>}
        {news && news.length === 0 && <div className="text-ink-500 text-sm">No recent news</div>}
        {news && news.length > 0 && (
          <div className="space-y-3">
            {news.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                 className="block pb-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02] rounded p-2 -m-2 transition-colors">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-ink-900 font-medium flex-1">{a.title}</h3>
                  <span className={`ml-3 tag ${
                    a.sentiment === 'POSITIVE' ? 'tag-emerald' :
                    a.sentiment === 'NEGATIVE' ? 'tag-rose' :
                    'tag-gray'
                  }`}>{a.sentiment}</span>
                </div>
                {a.summary && <p className="text-ink-600 text-sm line-clamp-2">{a.summary}</p>}
                <p className="text-ink-500 text-xs mt-1">{a.source}</p>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
