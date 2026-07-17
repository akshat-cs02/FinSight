import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, Wallet, TrendingUp, ArrowUp, ArrowDown, ExternalLink,
  BarChart3, Sparkles,
} from 'lucide-react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { pageEnter, staggerItems } from '@/utils/animations'
import { dashboardService, MarketIndex, MarketStatus, MarketKey } from '@/services/dashboardService'
import { portfolioService, PortfolioSummary } from '@/services/portfolioService'
import { newsService, NewsArticle } from '@/services/newsService'
import type { StockQuote } from '@/services/stockService'
import { getTradingViewUrl } from '@/services/stockService'
import LiveTicker from '@/components/LiveTicker'
import MarketClosedBanner from '@/components/MarketClosedBanner'
import IntradaySignals from '@/components/IntradaySignals'
import WatchlistPanel from '@/components/WatchlistPanel'
import PriceDisplay from '@/components/PriceDisplay'
import { formatPrice, guessCurrency } from '@/utils/currency'
import { requestCache } from '@/utils/requestCache'
import { MARKET_ORDER, MARKET_LABELS, tickerSymbolsForMarket } from '@/utils/markets'

// ─── Lazy-load below-the-fold components ───
const AIOutlook = lazy(() => import('@/components/Prediction/AIOutlook'))
const ForexCalendar = lazy(() => import('@/components/ForexCalendar'))
const SignalPerformance = lazy(() => import('@/components/SignalPerformance'))
const WatchThese = lazy(() => import('@/components/WatchThese'))

gsap.registerPlugin(ScrollTrigger)

/* ─── Skeleton ─── */
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

/* ─── Stock Card with mouse glow ─── */
function StockCard({ s, onClick }: { s: StockQuote; onClick: () => void }) {
  const up = s.change_percent >= 0
  const cardRef = useRef<HTMLDivElement>(null)

  // Mouse glow on hover
  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    const onMove = (e: MouseEvent) => {
      const rect = card.getBoundingClientRect()
      card.style.setProperty('--glow-x', `${e.clientX - rect.left}px`)
      card.style.setProperty('--glow-y', `${e.clientY - rect.top}px`)
      card.style.setProperty('--glow-opacity', '1')
    }
    const onLeave = () => {
      card.style.setProperty('--glow-opacity', '0')
    }
    card.addEventListener('mousemove', onMove)
    card.addEventListener('mouseleave', onLeave)
    return () => {
      card.removeEventListener('mousemove', onMove)
      card.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
      className="group relative card p-4 pr-12 text-left w-full transition-all duration-300 cursor-pointer hover:scale-[1.02] card-glow"
    >
      <a href={getTradingViewUrl(s.symbol)} target="_blank" rel="noopener noreferrer"
         onClick={(e) => e.stopPropagation()}
         className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-all duration-300 bg-black/40 hover:bg-black/60 p-1.5 rounded-lg">
        <ExternalLink size={12} className="text-white/40" />
      </a>
      <div className="flex items-center justify-between mb-2.5 gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-white/80 text-[15px] font-display truncate">{s.symbol}</h3>
          <p className="text-[11px] text-white/40 truncate">{s.name}</p>
        </div>
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded ${
          up ? 'badge-gains' : 'badge-losses'
        }`}>
          {up ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
          {Math.abs(s.change_percent).toFixed(1)}%
        </span>
      </div>
      <PriceDisplay price={s.price} currency={s.currency || guessCurrency(s.symbol)} size="lg" />
      <p className={`text-[11px] mt-1 ${up ? 'text-green-400/60' : 'text-rose-400/60'}`}>
        {up ? '+' : ''}{s.change.toFixed(2)}
      </p>
    </div>
  )
}

/* ─── Main ─── */
export default function DashboardPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<MarketStatus | null>(null)
  const [market, setMarket] = useState<MarketKey>('ALL')
  const [autoPicked, setAutoPicked] = useState(false)
  const [indices, setIndices] = useState<MarketIndex[] | null>(null)
  const [trending, setTrending] = useState<StockQuote[] | null>(null)
  const [gainers, setGainers] = useState<StockQuote[] | null>(null)
  const [losers, setLosers] = useState<StockQuote[] | null>(null)
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null)
  const [news, setNews] = useState<NewsArticle[] | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Refs for GSAP animations
  const mainRef = useRef<HTMLDivElement>(null)
  const metricsRef = useRef<HTMLDivElement>(null)
  const trendingCardsRef = useRef<HTMLDivElement>(null)
  const gainersCardsRef = useRef<HTMLDivElement>(null)
  const losersCardsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    requestCache('dashboard.status', () => dashboardService.getMarketStatus(), 60_000).then((s) => {
      setStatus(s)
      if (!autoPicked) {
        const o = s.markets?.find((m) => m.is_open && (m.key === 'INDIA' || m.key === 'US'))
        if (o?.key) setMarket(o.key)
        setAutoPicked(true)
      }
    }).catch((e) => setErrors((p) => ({ ...p, status: e.message })))
    requestCache('dashboard.indices', () => dashboardService.getMarketSummary().then((d) => d.indices), 60_000).then(setIndices).catch((e) => setErrors((p) => ({ ...p, indices: e.message })))
    portfolioService.getSummary().then(setPortfolio).catch((e) => setErrors((p) => ({ ...p, portfolio: e.message })))
    newsService.getNews(6).then(setNews).catch((e) => setErrors((p) => ({ ...p, news: e.message })))
    const id = setInterval(() => {
      requestCache('dashboard.status', () => dashboardService.getMarketStatus(), 60_000).then(setStatus).catch(() => {})
      requestCache('dashboard.indices', () => dashboardService.getMarketSummary().then((d) => d.indices), 60_000).then(setIndices).catch(() => {})
      portfolioService.getSummary().then(setPortfolio).catch(() => {})
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    setTrending(null); setGainers(null); setLosers(null)
    const load = () => {
      requestCache(`dashboard.trending.${market}`, () => dashboardService.getTrending(market), 60_000).then(setTrending).catch((e) => setErrors((p) => ({ ...p, trending: e.message })))
      requestCache(`dashboard.gainers.${market}`, () => dashboardService.getGainers(5, market), 60_000).then(setGainers).catch((e) => setErrors((p) => ({ ...p, gainers: e.message })))
      requestCache(`dashboard.losers.${market}`, () => dashboardService.getLosers(5, market), 60_000).then(setLosers).catch((e) => setErrors((p) => ({ ...p, losers: e.message })))
    }
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [market])

  // GSAP: page entrance on mount
  useEffect(() => { pageEnter(mainRef.current) }, [])

  // GSAP: stagger metrics cards
  useEffect(() => {
    if (!metricsRef.current) return
    const cards = metricsRef.current.querySelectorAll(':scope > div')
    staggerItems(cards, { stagger: 0.08, y: 30, delay: 0.2 })
  }, [])

  // GSAP: trending cards stagger
  useEffect(() => {
    if (!trendingCardsRef.current || !trending) return
    const cards = trendingCardsRef.current.querySelectorAll(':scope > div')
    if (cards.length === 0) return
    gsap.fromTo(
      cards,
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.4, stagger: 0.05, ease: 'power2.out', delay: 0.1 }
    )
  }, [trending])

  // GSAP: gainers stagger
  useEffect(() => {
    if (!gainersCardsRef.current || !gainers) return
    const cards = gainersCardsRef.current.children
    if (cards.length === 0) return
    gsap.fromTo(
      cards,
      { y: 15, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.3, stagger: 0.04, ease: 'power2.out' }
    )
  }, [gainers])

  // GSAP: losers stagger
  useEffect(() => {
    if (!losersCardsRef.current || !losers) return
    const cards = losersCardsRef.current.children
    if (cards.length === 0) return
    gsap.fromTo(
      cards,
      { y: 15, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.3, stagger: 0.04, ease: 'power2.out' }
    )
  }, [losers])

  // GSAP: ScrollTrigger for sections below the fold
  useEffect(() => {
    const sections = mainRef.current?.querySelectorAll('.scroll-reveal')
    if (!sections || sections.length === 0) return
    sections.forEach((section) => {
      gsap.fromTo(
        section,
        { y: 30, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.5, ease: 'power2.out',
          scrollTrigger: { trigger: section, start: 'top 85%', toggleActions: 'play none none none' },
        }
      )
    })
  }, [])

  // GSAP: market buttons animated underline — tracks active button
  const activeBtnRef = useRef<HTMLButtonElement>(null)
  const underlineRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const underline = underlineRef.current
    const btn = activeBtnRef.current
    if (!underline || !btn) return
    gsap.to(underline, {
      left: btn.offsetLeft,
      width: btn.offsetWidth,
      duration: 0.3,
      ease: 'power3.out',
    })
  }, [market])

  const scrollAnimRefs = {
    ticker: useRef<HTMLDivElement>(null),
    signals: useRef<HTMLDivElement>(null),
    performance: useRef<HTMLDivElement>(null),
    indices: useRef<HTMLDivElement>(null),
    gainersLosers: useRef<HTMLDivElement>(null),
    news: useRef<HTMLDivElement>(null),
  }

  return (
    <div ref={mainRef} className="px-4 sm:px-6 lg:px-8 py-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <div className="eyebrow">OVERVIEW</div>
        <h1 className="text-3xl font-bold text-white font-display tracking-tight leading-tight">Dashboard</h1>
      </div>

      {/* Market Tabs — below heading, left-aligned */}
      <div className="relative flex flex-wrap gap-1.5 p-1 bg-white/[0.02] rounded-xl border border-white/[0.04]">
        {MARKET_ORDER.map((k) => {
          const om = status?.markets?.find((m) => m.key === k)
          const isOpen = k === 'ALL' ? status?.is_open : om?.is_open
          return (
            <button key={k} ref={k === market ? activeBtnRef : undefined} onClick={() => setMarket(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 whitespace-nowrap flex items-center gap-1.5 ${
                market === k
                  ? 'bg-white/[0.08] text-white shadow-sm'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
              }`}>
              {k !== 'ALL' && <span className={`inline-block w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-green-400 animate-pulse' : 'bg-white/20'}`} />}
              {MARKET_LABELS[k]}
            </button>
          )
        })}
        <div ref={underlineRef} className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-gold to-gold-2 rounded-full" />
      </div>

      {status && (() => {
        const sel = market === 'ALL'
          ? status.markets?.find((m) => !m.is_open && m.next_open === status.next_open)
          : status.markets?.find((m) => m.key === market)
        if (!sel) return null
        if (market === 'ALL' && status.is_open) return null
        if (sel.key === 'CRYPTO') return null
        return <MarketClosedBanner marketName={sel.name} isOpen={sel.is_open} nextOpen={sel.next_open} nextOpenLocal={sel.next_open_local} />
      })()}

      {/* ── Metrics */}
      <div ref={metricsRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Portfolio Value */}
        <div className="card-box p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="icon-wrap gold"><Wallet size={16} className="text-gold" /></div>
          </div>
          <div className="eyebrow">Portfolio Value</div>
          {portfolio === null ? (
            <div className="mt-2 space-y-2"><Skeleton className="h-8 w-36" /><Skeleton className="h-3 w-20" /></div>
          ) : (
            <>
              <PriceDisplay price={portfolio.total_value} size="xl" className="text-white/80" animate />
              <p className={`text-xs mt-1.5 ${portfolio.total_gain_loss >= 0 ? 'text-green-400/60' : 'text-rose-400/60'}`}>
                {portfolio.total_gain_loss >= 0 ? '+' : ''}{portfolio.total_gain_loss.toFixed(2)}% all-time
              </p>
            </>
          )}
        </div>

        {/* Today's P/L */}
        {portfolio != null ? (
          <div className="card p-5"
               style={{ border: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="icon-wrap gold">
                <TrendingUp size={16} className="text-gold" />
              </div>
            </div>
            <div className="eyebrow">Today's P/L</div>
            <PriceDisplay price={portfolio.today_profit_loss} size="xl" color={portfolio.today_profit_loss >= 0 ? 'gains' : 'losses'} showSign animate />
          </div>
        ) : (
          <div className="card p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="icon-wrap gold"><TrendingUp size={16} className="text-gold" /></div>
            </div>
            <div className="eyebrow">Today's P/L</div>
            <div className="mt-2"><Skeleton className="h-8 w-28" /></div>
          </div>
        )}

        {/* Market Status */}
        <div className="card-surface3 p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="icon-wrap gold"><Activity size={16} className="text-gold" /></div>
          </div>
          <div className="eyebrow">Market Status</div>
          {status === null ? (
            <div className="mt-2"><Skeleton className="h-8 w-24" /></div>
          ) : (() => {
            const open = (status.markets || []).filter((m) => m.is_open)
            if (open.length === 0) return <div className="text-lg font-bold font-mono text-white/30 mt-2">CLOSED</div>
            return (
              <div className="space-y-1.5 mt-1">
                {open.map((m) => (
                  <div key={m.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-white/50">
                      <span className="pulse-dot live" />{m.name}
                    </span>
                    <span className="text-[10px] font-semibold text-green-400">LIVE</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

        {/* Holdings */}
        <div className="card-flat p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="icon-wrap gold"><BarChart3 size={16} className="text-gold" /></div>
          </div>
          <div className="eyebrow">Holdings</div>
          {portfolio === null ? (
            <div className="mt-2"><Skeleton className="h-8 w-16" /></div>
          ) : (
            <div className="text-3xl font-extrabold font-mono text-gold mt-2">{portfolio.holdings_count}</div>
          )}
        </div>
      </div>

      {/* ── Ticker ── */}
      <div ref={scrollAnimRefs.ticker as React.RefObject<HTMLDivElement>} className="scroll-reveal">
        <div className="card p-4">
          <LiveTicker symbols={tickerSymbolsForMarket(market)} />
        </div>
      </div>

      {/* ── Signals + Watchlist ── */}
      <div ref={scrollAnimRefs.signals as React.RefObject<HTMLDivElement>} className="scroll-reveal grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-5">
        <div className="card overflow-hidden"><IntradaySignals market={market} /></div>
        <div className="card overflow-hidden"><WatchlistPanel onSearch={(sym) => navigate(`/stocks/${sym}`)} /></div>
      </div>

      <div ref={scrollAnimRefs.performance as React.RefObject<HTMLDivElement>} className="scroll-reveal">
        <Suspense fallback={<div className="skeleton h-40 rounded-xl" />}>
          <SignalPerformance />
        </Suspense>
      </div>

      <Suspense fallback={<div className="skeleton h-48 rounded-xl" />}>
        <WatchThese />
      </Suspense>
      <Suspense fallback={<div className="skeleton h-80 rounded-xl" />}>
        <AIOutlook />
      </Suspense>

      {/* ── Market Indices ── */}
      <div ref={scrollAnimRefs.indices as React.RefObject<HTMLDivElement>} className="scroll-reveal card-accent card-surface2 p-5">
        <div className="section-rule mb-5 text-white">Market Indices</div>
        {errors.indices && <div className="text-rose-400 text-sm">⚠ {errors.indices}</div>}
        {indices === null && !errors.indices && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1,2,3,4].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
          </div>
        )}
        {indices && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {indices.map((i, idx) => (
              <div key={i.symbol} className="card p-3" style={{ animationDelay: `${idx * 0.05}s` }}>
                <div className="text-[11px] text-white/40 font-medium truncate">{i.name}</div>
                <div className="text-lg font-bold text-white/80 font-mono tabular-nums mt-0.5">{i.price.toFixed(2)}</div>
                <div className={`text-[11px] mt-0.5 font-medium ${i.change_percent >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
                  {i.change_percent >= 0 ? '+' : ''}{i.change_percent.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Trending ── */}
      <div ref={scrollAnimRefs.indices as React.RefObject<HTMLDivElement>} className="scroll-reveal card-accent card p-5">
        <div className="section-rule mb-5 text-white">
          Trending {market === 'ALL' ? 'Markets' : MARKET_LABELS[market]}
        </div>
        {errors.trending && <div className="text-rose-400 text-sm">⚠ {errors.trending}</div>}
        {trending === null && !errors.trending && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {[1,2,3,4].map((i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
          </div>
        )}
        {trending && (
          <div ref={trendingCardsRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {trending.map((s) => (
              <div key={s.symbol}>
                <StockCard s={s} onClick={() => navigate(`/stocks/${s.symbol}`)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Gainers & Losers ── */}
      <div ref={scrollAnimRefs.gainersLosers as React.RefObject<HTMLDivElement>} className="scroll-reveal grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="card-accent card-surface2 p-5">
          <div className="section-rule mb-5 text-white">Top Gainers{gainers && gainers.length > 0 ? ` (${gainers.length})` : ''}</div>
          {errors.gainers && <div className="text-rose-400 text-sm">⚠ {errors.gainers}</div>}
          {gainers === null && !errors.gainers && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{[1,2].map((i) => <div key={i} className="skeleton h-28 rounded-xl" />)}</div>
          )}
          {gainers && gainers.length === 0 && <div className="text-sm text-white/30 py-6 text-center">No active gainers</div>}
          {gainers && gainers.length > 0 && (
            <div ref={gainersCardsRef} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {gainers.map((s) => <StockCard key={s.symbol} s={s} onClick={() => navigate(`/stocks/${s.symbol}`)} />)}
            </div>
          )}
        </div>
        <div className="card-accent card-surface2 p-5">
          <div className="section-rule mb-5 text-white">Top Losers{losers && losers.length > 0 ? ` (${losers.length})` : ''}</div>
          {errors.losers && <div className="text-rose-400 text-sm">⚠ {errors.losers}</div>}
          {losers === null && !errors.losers && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{[1,2].map((i) => <div key={i} className="skeleton h-28 rounded-xl" />)}</div>
          )}
          {losers && losers.length === 0 && <div className="text-sm text-white/30 py-6 text-center">No active losers</div>}
          {losers && losers.length > 0 && (
            <div ref={losersCardsRef} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {losers.map((s) => <StockCard key={s.symbol} s={s} onClick={() => navigate(`/stocks/${s.symbol}`)} />)}
            </div>
          )}
        </div>
      </div>

      <Suspense fallback={<div className="skeleton h-64 rounded-xl" />}>
        <ForexCalendar />
      </Suspense>

      {/* ── News ── */}
      <div ref={scrollAnimRefs.news as React.RefObject<HTMLDivElement>} className="scroll-reveal card-accent card-surface2 p-5">
        <div className="section-rule mb-5 text-white">Latest Financial News</div>
        {errors.news && <div className="text-rose-400 text-sm">⚠ {errors.news}</div>}
        {news === null && !errors.news && (
          <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
        )}
        {news && (
          <div className="space-y-1">
            {news.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                 className="flex items-start justify-between gap-3 py-3 px-3 -mx-3 rounded-xl transition-all duration-300 hover:bg-white/[0.02]">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-white/70 font-display leading-snug">{a.title}</h3>
                  <p className="text-[11px] text-white/40 mt-1">{a.source}</p>
                </div>
                <span className={`flex-shrink-0 badge ${
                  a.sentiment === 'POSITIVE' ? 'badge-gains' :
                  a.sentiment === 'NEGATIVE' ? 'badge-losses' :
                  'badge-neutral'
                }`}>{a.sentiment}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
