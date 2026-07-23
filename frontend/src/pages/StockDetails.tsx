import React, { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Download, ArrowUp, ArrowDown, Plus, Star } from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { portfolioService } from '@/services/portfolioService'
import TradingViewWidget from '@/components/charts/TradingViewWidget'
import PredictionCard from '@/components/Prediction/PredictionCard'
import BacktestPanel from '@/components/BacktestPanel'
import ICTSignals from '@/components/ICTSignals'
import PaperTrading from '@/components/PaperTrading'
import StockTermSignals from '@/components/StockTermSignals'
import SignalConsensus from '@/components/SignalConsensus'
import ErrorBoundary from '@/components/ErrorBoundary'
import { API_URL } from '@/services/api'
import { formatMarketCap, guessCurrency, getCurrencySymbol } from '@/utils/currency'
import PriceDisplay from '@/components/PriceDisplay'
import watchlistService from '@/services/watchlistService'
import type { ConsensusResult } from '@/services/signalService'
import { useStockCache, useQuote, useIndicators, useNews, useConsensus } from '@/store/stockCache'
import toast from 'react-hot-toast'
import SEO from '@/components/SEO'
import { Lift } from '@/components/ui/motion'

gsap.registerPlugin(ScrollTrigger)

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
    }, 15000)

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

  // Refs for GSAP animations
  const headerRef = useRef<HTMLDivElement>(null)
  const priceRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const metricsCardsRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const predictionRef = useRef<HTMLDivElement>(null)
  const technicalRef = useRef<HTMLDivElement>(null)
  const newsRef = useRef<HTMLDivElement>(null)

  // GSAP: price count-up on symbol change
  useEffect(() => {
    if (!priceRef.current || !quote) return
    const el = priceRef.current.querySelector('.price-value')
    if (!el) return
    gsap.fromTo(el, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' })
  }, [quote?.price])

  // GSAP: chart draw-in animation
  useEffect(() => {
    if (!chartRef.current) return
    gsap.fromTo(chartRef.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', delay: 0.15 })
  }, [])

  // GSAP: metric cards stagger
  useEffect(() => {
    if (!metricsCardsRef.current || !quote) return
    const cards = metricsCardsRef.current.querySelectorAll(':scope > div')
    gsap.fromTo(cards, { y: 15, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, stagger: 0.04, ease: 'power2.out', delay: 0.2 })
  }, [quote])

  // GSAP: action buttons stagger
  useEffect(() => {
    if (!actionsRef.current) return
    const btns = actionsRef.current.querySelectorAll('button, a')
    gsap.fromTo(btns, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, stagger: 0.04, ease: 'power2.out', delay: 0.1 })
  }, [])

  // GSAP: prediction data staggered reveal
  useEffect(() => {
    if (!predictionRef.current) return
    const sections = predictionRef.current.children
    gsap.fromTo(sections, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, stagger: 0.06, ease: 'power2.out' })
  }, [])

  // GSAP: ScrollTrigger for sections
  const initScrollTriggers = useRef(false)
  useEffect(() => {
    if (initScrollTriggers.current) return
    initScrollTriggers.current = true

    const sections = [
      technicalRef.current,
      newsRef.current,
      document.querySelector('.signal-consensus-section'),
    ].filter(Boolean)

    sections.forEach((section) => {
      if (!section) return
      gsap.fromTo(
        section,
        { y: 25, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.5, ease: 'power2.out',
          scrollTrigger: { trigger: section, start: 'top 85%', toggleActions: 'play none none none' },
        }
      )
    })
  }, [])

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <SEO
        title={`${SYMBOL} — Stock Details & Analysis`}
        description={`${quote?.name || SYMBOL} stock analysis with live price, AI predictions, ICT/SMC signals, technical indicators, and recent news.`}
        url={`https://fin-sight-blush.vercel.app/stocks/${SYMBOL}`}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: `${SYMBOL} Stock Analysis`,
          description: `Detailed analysis for ${quote?.name || SYMBOL} stock with AI predictions and technical indicators.`,
        }}
      />
      {/* Header */}
      <div ref={headerRef} className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="eyebrow">Stock Details</div>
          <h1 className="text-3xl font-bold text-[var(--text)] font-display">{SYMBOL}</h1>
          {quote ? (
            <p className="text-[var(--dim)]">
              {quote.name} · {quote.exchange || ''} ·{' '}
              <span className="text-green font-semibold">{currency}</span>
            </p>
          ) : !err ? (
            <p className="text-[var(--dim)] text-sm animate-pulse">Loading {SYMBOL}…</p>
          ) : (
            <p className="text-[var(--dim)] text-sm">Symbol not found</p>
          )}
        </div>
        {quote ? (
          <div ref={priceRef} className="text-right">
            <div className="price-value">
              <PriceDisplay price={quote.price} currency={currency} size="hero" color="default" />
            </div>
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
        <Lift className="card-layer rounded-xl px-4 py-2.5 text-[var(--dim)] text-sm flex items-start gap-2">
          <span className="text-blue-400 mt-0.5 shrink-0">ⓘ</span>
          <span>
            Showing <strong className="text-[var(--text)] font-medium">spot {spotAdjusted}</strong> prices. Yahoo only carries
            {' '}{spotAdjusted} as a futures contract, so we convert it to the spot scale (anchored to the
            {' '}{spotAdjusted === 'gold' ? 'GLD' : 'SLV'} ETF). Signals, entries, SL/TP and targets are all on the spot scale.
          </span>
        </Lift>
      )}

      {/* Futures-only note */}
      {futuresNote && (
        <Lift className="card-layer rounded-xl px-4 py-2.5 text-[var(--dim)] text-sm flex items-start gap-2">
          <span className="text-amber mt-0.5 shrink-0">ⓘ</span>
          <span>
            Spot {SYMBOL.replace('=X', '')} has no live data feed, so prices, chart, and signals here use{' '}
            <strong className="text-[var(--text)] font-medium">{futuresNote}</strong> — which trades slightly above/below spot.
            The direction and % moves track spot closely.
          </span>
        </Lift>
      )}

      {/* Action buttons */}
      <div ref={actionsRef} className="flex flex-wrap gap-3">
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
        <Lift className="card-layer rounded-xl p-4"><form onSubmit={addToPortfolio}>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-[var(--dim)] mb-1">Quantity</label>
              <input type="number" step="any" required value={addForm.quantity}
                     onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
                     className="inp w-32" />
            </div>
            <div>
              <label className="block text-xs text-[var(--dim)] mb-1">Buy Price ({sym})</label>
              <input type="number" step="any" required value={addForm.purchase_price}
                     onChange={(e) => setAddForm({ ...addForm, purchase_price: e.target.value })}
                     placeholder={quote?.price.toFixed(2) || '0.00'}
                     className="inp w-32" />
            </div>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form></Lift>
      )}

      {/* Quote details */}
      {quote && (
        <div ref={metricsCardsRef} className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Lift className="card-flat card-layer rounded-xl p-3">
            <p className="eyebrow">Open</p>
            <PriceDisplay price={quote.open} currency={currency} size="md" color="default" />
          </Lift>
          <Lift className="card-flat card-layer rounded-xl p-3">
            <p className="eyebrow">High</p>
            <PriceDisplay price={quote.high} currency={currency} size="md" color="default" />
          </Lift>
          <Lift className="card-flat card-layer rounded-xl p-3">
            <p className="eyebrow">Low</p>
            <PriceDisplay price={quote.low} currency={currency} size="md" color="default" />
          </Lift>
          <Lift className="card-flat card-layer rounded-xl p-3">
            <p className="eyebrow">Volume</p>
            <p className="text-[var(--text)] font-semibold font-mono tabular-nums">{quote.volume.toLocaleString()}</p>
          </Lift>
          {quote.fifty_two_week_high && (
            <Lift className="card-flat card-layer rounded-xl p-3">
              <p className="eyebrow">52w High</p>
              <PriceDisplay price={quote.fifty_two_week_high} currency={currency} size="md" color="default" />
            </Lift>
          )}
          {quote.fifty_two_week_low && (
            <Lift className="card-flat card-layer rounded-xl p-3">
              <p className="eyebrow">52w Low</p>
              <PriceDisplay price={quote.fifty_two_week_low} currency={currency} size="md" color="default" />
            </Lift>
          )}
          {quote.market_cap && (
            <Lift className="card-flat card-layer rounded-xl p-3">
              <p className="eyebrow">Market Cap</p>
              <p className="text-[var(--text)] font-semibold font-mono tabular-nums">{formatMarketCap(quote.market_cap, currency)}</p>
            </Lift>
          )}
          {quote.pe_ratio && (
            <Lift className="card-flat card-layer rounded-xl p-3">
              <p className="eyebrow">P/E</p>
              <p className="text-[var(--text)] font-semibold font-mono tabular-nums">{quote.pe_ratio.toFixed(2)}</p>
            </Lift>
          )}
        </div>
      )}

      {/* TradingView Chart */}
      <Lift className="card-layer rounded-xl p-3"><div ref={chartRef}>
        <TradingViewWidget symbol={SYMBOL} tvSymbol={TV_SYMBOL} height={680} />
      </div></Lift>

      {/* Signal Consensus + Term Signals */}
      <div className="signal-consensus-section">
        <SignalConsensus
          result={consensus}
          loading={consensusEntry.loading}
          onRefresh={() => {
            useStockCache.getState().refreshConsensus(SYMBOL).catch(() => {})
          }}
        />
      </div>
      <StockTermSignals symbol={SYMBOL} masterSignal={consensus?.master_signal} />

      {/* AI Prediction · ICT Signals · Paper trading */}
      <div ref={predictionRef}>
        <PredictionCard symbol={SYMBOL} currency={currency} />
        <BacktestPanel symbol={SYMBOL} />
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
      </div>

      {/* Technical Indicators */}
      {indicators && (
        <Lift className="card-accent card-surface2 p-5"><div ref={technicalRef}>
          <div className="eyebrow">Analysis</div>
          <h2 className="section-rule mb-4 text-[var(--text)]">Technical Indicators</h2>
          <div className="flex justify-between items-center mb-4">
            <p className="text-xs text-white/50">
              This bias comes from RSI / MACD / Bollinger only. The <strong className="text-green-400">AI Prediction</strong> above
              is the authoritative recommendation — it combines these indicators with the LSTM+XGBoost forecast.
            </p>
            <div className="flex items-center gap-2 flex-shrink-0 ml-4">
              <span className="text-xs text-[var(--dim)]">Technical-only bias:</span>
              <span className={`badge ${
                indicators.signal === 'BUY' ? 'badge-gains' :
                indicators.signal === 'SELL' ? 'badge-losses' :
                'badge-neutral'
              }`}>{indicators.signal}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(indicators.latest).map(([k, v]) => (
              <Lift key={k} className="card-flat card-layer rounded-xl p-3">
                <p className="text-xs text-[var(--dim)] uppercase tracking-wider">{k.replace(/_/g, ' ')}</p>
                <p className="text-[var(--text)] font-semibold font-mono tabular-nums">{v !== null && v !== undefined ? v.toFixed(2) : '-'}</p>
              </Lift>
            ))}
          </div>
        </div></Lift>
      )}

      {/* News */}
      <Lift className="card-surface2 p-5 rounded-xl"><div ref={newsRef}>
        <div className="eyebrow">Latest</div>
        <h2 className="text-lg mb-4 text-[var(--text)] font-display font-bold">Recent News</h2>
        {news === null && <div className="text-[var(--dim)] text-sm">Loading news…</div>}
        {news && news.length === 0 && <div className="text-[var(--dim)] text-sm">No recent news</div>}
        {news && news.length > 0 && (
          <div className="space-y-3">
            {news.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                 className="block pb-3 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--raised)] rounded p-2 -m-2 transition-all duration-300">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-[var(--text)] font-medium flex-1">{a.title}</h3>
                  <span className={`ml-3 badge ${
                    a.sentiment === 'POSITIVE' ? 'badge-gains' :
                    a.sentiment === 'NEGATIVE' ? 'badge-losses' :
                    'badge-neutral'
                  }`}>{a.sentiment}</span>
                </div>
                {a.summary && <p className="text-[var(--dim)] text-sm line-clamp-2">{a.summary}</p>}
                <p className="text-[var(--dim)] text-xs mt-1">{a.source}</p>
              </a>
            ))}
          </div>
        )}
      </div></Lift>
    </div>
  )
}
