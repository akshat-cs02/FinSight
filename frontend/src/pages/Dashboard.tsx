import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, Wallet, TrendingUp, AlertCircle, ArrowUp, ArrowDown, ExternalLink,
  BarChart3, LineChart, Globe, Zap,
} from 'lucide-react'
import { dashboardService, MarketIndex, MarketStatus, MarketKey } from '@/services/dashboardService'
import { portfolioService, PortfolioSummary } from '@/services/portfolioService'
import { newsService, NewsArticle } from '@/services/newsService'
import type { StockQuote } from '@/services/stockService'
import { getTradingViewUrl } from '@/services/stockService'
import AIOutlook from '@/components/Prediction/AIOutlook'
import LiveTicker from '@/components/LiveTicker'
import MarketClosedBanner from '@/components/MarketClosedBanner'
import ForexCalendar from '@/components/ForexCalendar'
import IntradaySignals from '@/components/IntradaySignals'
import SignalPerformance from '@/components/SignalPerformance'
import WatchlistPanel from '@/components/WatchlistPanel'
import WatchThese from '@/components/WatchThese'
import PriceDisplay from '@/components/PriceDisplay'
import { formatPrice, guessCurrency } from '@/utils/currency'
import { MARKET_ORDER, MARKET_LABELS, tickerSymbolsForMarket } from '@/utils/markets'

/* ─── Loading Skeleton ─── */
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

/* ─── Section Heading ─── */
const headingAccents: Record<string, string> = {
  blue:    'bg-blue-400/60',
  purple:  'bg-purple-400/60',
  emerald: 'bg-emerald-400/60',
  cyan:    'bg-cyan-400/60',
  rose:    'bg-rose-400/60',
  amber:   'bg-amber-400/60',
}

function SectionHeading({ accent = 'blue', children }: { accent?: string; children: React.ReactNode }) {
  const bar = headingAccents[accent] || headingAccents.blue
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className={`w-[3px] h-5 rounded-full ${bar}`} />
      <h2 className="text-base font-bold text-ink-800 font-display tracking-tight">{children}</h2>
    </div>
  )
}

/* ─── StockCard (reusable) ─── */
function StockCard({ s, onClick }: { s: StockQuote; onClick: () => void }) {
  const up = s.change_percent >= 0
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
      className="group relative card-layer rounded-xl p-4 pr-12 text-left w-full transition-all duration-300 cursor-pointer card-gradient-border hover:border-blue-400/20 hover:shadow-lg hover:-translate-y-0.5"
    >
      <a
        href={getTradingViewUrl(s.symbol)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title="Open in TradingView"
        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-all bg-black/40 hover:bg-black/60 text-ink-600 hover:text-ink-700 p-1.5 rounded-lg backdrop-blur-sm"
      >
        <ExternalLink size={12} />
      </a>

      <div className="flex items-center justify-between mb-2.5 gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-ink-800 text-base font-display truncate">{s.symbol}</h3>
          <p className="text-[11px] text-ink-500 truncate leading-tight mt-0.5">{s.name}</p>
        </div>
        <span className={`inline-flex items-center gap-1 text-xs font-semibold flex-shrink-0 px-1.5 py-0.5 rounded-md ${
          up ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
        }`}>
          {up ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
          {Math.abs(s.change_percent).toFixed(1)}%
        </span>
      </div>
      <PriceDisplay price={s.price} currency={s.currency || guessCurrency(s.symbol)} size="lg" />
      <p className={`text-xs mt-1 ${up ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
        {up ? '+' : ''}{s.change.toFixed(2)} ({Math.abs(s.change_percent).toFixed(2)}%)
      </p>
    </div>
  )
}

/* ─── Main Dashboard Page ─── */
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

  useEffect(() => {
    dashboardService.getMarketStatus().then((s) => {
      setStatus(s)
      if (!autoPicked) {
        const openEquity = s.markets?.find((m) => m.is_open && (m.key === 'INDIA' || m.key === 'US'))
        if (openEquity?.key) setMarket(openEquity.key)
        setAutoPicked(true)
      }
    }).catch((e) => setErrors((p) => ({ ...p, status: e.message })))
    dashboardService.getMarketSummary().then((d) => setIndices(d.indices)).catch((e) => setErrors((p) => ({ ...p, indices: e.message })))
    portfolioService.getSummary().then(setPortfolio).catch((e) => setErrors((p) => ({ ...p, portfolio: e.message })))
    newsService.getNews(6).then(setNews).catch((e) => setErrors((p) => ({ ...p, news: e.message })))
    const liveId = setInterval(() => {
      dashboardService.getMarketStatus().then(setStatus).catch(() => {})
      dashboardService.getMarketSummary().then((d) => setIndices(d.indices)).catch(() => {})
      portfolioService.getSummary().then(setPortfolio).catch(() => {})
    }, 30000)
    return () => clearInterval(liveId)
  }, [])

  useEffect(() => {
    setTrending(null); setGainers(null); setLosers(null)
    const load = () => {
      dashboardService.getTrending(market).then(setTrending).catch((e) => setErrors((p) => ({ ...p, trending: e.message })))
      dashboardService.getGainers(5, market).then(setGainers).catch((e) => setErrors((p) => ({ ...p, gainers: e.message })))
      dashboardService.getLosers(5, market).then(setLosers).catch((e) => setErrors((p) => ({ ...p, losers: e.message })))
    }
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [market])

  return (
    <div className="p-4 sm:p-5 lg:p-6 space-y-5 lg:space-y-6 max-w-[1600px] mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 animate-spring-up">
        <div>
          <div className="section-eyebrow">Overview</div>
          <h1 className="text-display-sm text-white font-display">Dashboard</h1>
        </div>
        <div className="flex flex-nowrap gap-1 p-1 card-layer rounded-xl overflow-x-auto">
          {MARKET_ORDER.map((k) => {
            const openMarket = status?.markets?.find((m) => m.key === k)
            const isOpen = k === 'ALL' ? status?.is_open : openMarket?.is_open
            return (
              <button
                key={k}
                onClick={() => setMarket(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
                  market === k
                    ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20 shadow-sm'
                    : 'text-ink-500 hover:text-ink-700 hover:bg-white/[0.03]'
                }`}
              >
                {k !== 'ALL' && (
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-ink-400'}`} />
                )}
                {MARKET_LABELS[k]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Market closed banner */}
      {status && (() => {
        const sel = market === 'ALL'
          ? status.markets?.find((m) => !m.is_open && m.next_open === status.next_open)
          : status.markets?.find((m) => m.key === market)
        if (!sel) return null
        if (market === 'ALL' && status.is_open) return null
        if (sel.key === 'CRYPTO') return null
        return (
          <div className="animate-spring-up stagger-1">
            <MarketClosedBanner marketName={sel.name} isOpen={sel.is_open} nextOpen={sel.next_open} nextOpenLocal={sel.next_open_local} />
          </div>
        )
      })()}

      {/* ── Metrics Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Portfolio Value — emerald accent */}
        <div className="card-accent-top emerald card-layer rounded-xl p-5 animate-spring-up stagger-1">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="p-2 rounded-lg bg-emerald-500/10"><Wallet size={16} className="text-emerald-400" /></div>
          </div>
          <div className="section-eyebrow">Portfolio Value</div>
          {portfolio === null ? (
            <div className="mt-2 space-y-2"><Skeleton className="h-8 w-36" /><Skeleton className="h-3 w-20" /></div>
          ) : (
            <>
              <PriceDisplay price={portfolio.total_value} size="xl" color="default" animate />
              <p className={`text-xs mt-1.5 ${portfolio.total_gain_loss >= 0 ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
                {portfolio.total_gain_loss >= 0 ? '+' : ''}{portfolio.total_gain_loss.toFixed(2)}% all-time
              </p>
            </>
          )}
        </div>

        {/* Today's P/L — dynamic accent based on value */}
        <div className={`bg-card border border-white/[0.04] rounded-xl p-5 animate-spring-up stagger-2 ${
          portfolio?.today_profit_loss != null ? (portfolio.today_profit_loss >= 0 ? 'card-accent-left emerald' : 'card-accent-left rose') : ''
        }`}>
          <div className="flex items-center gap-2.5 mb-3">
            <div className={`p-2 rounded-lg ${
              portfolio?.today_profit_loss != null
                ? portfolio.today_profit_loss >= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10'
                : 'bg-ink-300/10'
            }`}>
              <TrendingUp size={16} className={
                portfolio?.today_profit_loss != null
                  ? portfolio.today_profit_loss >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  : 'text-ink-500'
              } />
            </div>
          </div>
          <div className="section-eyebrow">Today's P/L</div>
          {portfolio === null ? (
            <div className="mt-2 space-y-2"><Skeleton className="h-8 w-28" /></div>
          ) : (
            <PriceDisplay
              price={portfolio.today_profit_loss}
              size="xl"
              color={portfolio.today_profit_loss >= 0 ? 'gains' : 'losses'}
              showSign
              animate
            />
          )}
        </div>

        {/* Market Status — cyan accent */}
        <div className="card-accent-top cyan card-layer rounded-xl p-5 animate-spring-up stagger-3">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="p-2 rounded-lg bg-cyan-500/10"><Activity size={16} className="text-cyan-400" /></div>
          </div>
          <div className="section-eyebrow">Market Status</div>
          {status === null ? (
            <div className="mt-2 space-y-2"><Skeleton className="h-8 w-24" /></div>
          ) : (() => {
            const open = (status.markets || []).filter((m) => m.is_open)
            if (open.length === 0) return <div className="text-xl font-bold font-mono text-ink-400 mt-2">CLOSED</div>
            return (
              <div className="space-y-1.5 mt-1">
                {open.map((m) => (
                  <div key={m.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-ink-600">
                      <span className="pulse-dot cyan" />{m.name}
                    </span>
                    <span className="text-[11px] font-semibold text-cyan-400">OPEN</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

        {/* Holdings — amber accent */}
        <div className="card-accent-top amber card-layer rounded-xl p-5 animate-spring-up stagger-4">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="p-2 rounded-lg bg-amber-500/10"><BarChart3 size={16} className="text-amber-400" /></div>
          </div>
          <div className="section-eyebrow">Holdings</div>
          {portfolio === null ? (
            <div className="mt-2"><Skeleton className="h-8 w-16" /></div>
          ) : (
            <div className="text-3xl font-extrabold font-mono gradient-text-emerald mt-2">{portfolio.holdings_count}</div>
          )}
        </div>
      </div>

      {/* ── Live Ticker ── */}
      <div className="card-layer rounded-xl p-4 animate-fade-slide stagger-5">
        <LiveTicker symbols={tickerSymbolsForMarket(market)} />
      </div>

      {/* ── Signals row ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-5 animate-fade-slide stagger-6">
        <div className="card-layer rounded-xl overflow-hidden"><IntradaySignals market={market} /></div>
        <div className="card-layer rounded-xl overflow-hidden"><WatchlistPanel onSearch={(sym) => navigate(`/stocks/${sym}`)} /></div>
      </div>

      {/* ── Signal Performance ── */}
      <div className="animate-fade-slide stagger-7">
        <SignalPerformance />
      </div>

      {/* ── Components ── */}
      <WatchThese />
      <AIOutlook />

      {/* ── Market Indices — purple accent ── */}
      <div className="card-accent-top purple card-layer rounded-xl p-5 animate-spring-up stagger-2">
        <SectionHeading accent="purple">Market Indices</SectionHeading>
        {errors.indices && <div className="text-rose-400 text-sm">⚠ {errors.indices}</div>}
        {indices === null && !errors.indices && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1,2,3,4].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
          </div>
        )}
        {indices && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {indices.map((i, idx) => (
              <div key={i.symbol} className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 animate-spring-up" style={{ animationDelay: `${idx * 0.04}s` }}>
                <div className="text-[11px] text-ink-500 font-medium truncate">{i.name}</div>
                <div className="text-lg font-bold text-ink-800 font-mono tabular-nums mt-0.5">{i.price.toFixed(2)}</div>
                <div className={`text-[11px] mt-0.5 font-medium ${i.change_percent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {i.change_percent >= 0 ? '+' : ''}{i.change_percent.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Trending ── */}
      <div className="card-layer rounded-xl p-5 animate-spring-up stagger-3">
        <SectionHeading accent="blue">
          Trending {market === 'ALL' ? 'Markets' : MARKET_LABELS[market]}
        </SectionHeading>
        {errors.trending && <div className="text-rose-400 text-sm">⚠ {errors.trending}</div>}
        {trending === null && !errors.trending && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {[1,2,3,4].map((i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
          </div>
        )}
        {trending && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {trending.map((s, idx) => (
              <div key={s.symbol} className="animate-spring-up" style={{ animationDelay: `${idx * 0.04}s` }}>
                <StockCard s={s} onClick={() => navigate(`/stocks/${s.symbol}`)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Gainers & Losers ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-5 animate-spring-up stagger-4">
        {/* Gainers — emerald */}
        <div className="card-accent-top emerald card-layer rounded-xl p-5">
          <SectionHeading accent="emerald">
            Top Gainers{gainers && gainers.length > 0 ? ` (${gainers.length})` : ''}
          </SectionHeading>
          {errors.gainers && <div className="text-rose-400 text-sm">⚠ {errors.gainers}</div>}
          {gainers === null && !errors.gainers && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[1,2].map((i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
            </div>
          )}
          {gainers && gainers.length === 0 && <div className="text-sm text-ink-500 py-6 text-center">No active gainers right now</div>}
          {gainers && gainers.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {gainers.map((s) => <StockCard key={s.symbol} s={s} onClick={() => navigate(`/stocks/${s.symbol}`)} />)}
            </div>
          )}
        </div>

        {/* Losers — rose */}
        <div className="card-accent-top rose card-layer rounded-xl p-5">
          <SectionHeading accent="rose">
            Top Losers{losers && losers.length > 0 ? ` (${losers.length})` : ''}
          </SectionHeading>
          {errors.losers && <div className="text-rose-400 text-sm">⚠ {errors.losers}</div>}
          {losers === null && !errors.losers && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[1,2].map((i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
            </div>
          )}
          {losers && losers.length === 0 && <div className="text-sm text-ink-500 py-6 text-center">No active losers right now</div>}
          {losers && losers.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {losers.map((s) => <StockCard key={s.symbol} s={s} onClick={() => navigate(`/stocks/${s.symbol}`)} />)}
            </div>
          )}
        </div>
      </div>

      {/* ── Forex Calendar ── */}
      <ForexCalendar />

      {/* ── News — cyan accent ── */}
      <div className="card-accent-top cyan card-layer rounded-xl p-5 animate-spring-up stagger-5">
        <SectionHeading accent="cyan">Latest Financial News</SectionHeading>
        {errors.news && <div className="text-rose-400 text-sm">⚠ {errors.news}</div>}
        {news === null && !errors.news && (
          <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
        )}
        {news && (
          <div className="space-y-2">
            {news.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                 className="flex items-start justify-between gap-3 py-3 px-3 -mx-3 rounded-xl transition-colors hover:bg-white/[0.02]">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-ink-800 font-display leading-snug">{a.title}</h3>
                  <p className="text-[11px] text-ink-500 mt-1">{a.source}</p>
                </div>
                <span className={`flex-shrink-0 px-2 py-0.5 rounded text-[11px] font-semibold ${
                  a.sentiment === 'POSITIVE' ? 'bg-emerald-500/10 text-emerald-400' :
                  a.sentiment === 'NEGATIVE' ? 'bg-rose-500/10 text-rose-400' :
                  'bg-white/[0.04] text-ink-500'
                }`}>{a.sentiment}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
