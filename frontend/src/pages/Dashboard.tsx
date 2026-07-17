import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, Wallet, TrendingUp, AlertCircle, ArrowUp, ArrowDown, ExternalLink,
  BarChart3, Globe, Sparkles, LineChart, Database,
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

/* ─── Skeleton ─── */
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

/* ─── Stock Card ─── */
function StockCard({ s, onClick }: { s: StockQuote; onClick: () => void }) {
  const up = s.change_percent >= 0
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
      className="group relative card p-4 pr-12 text-left w-full transition-all duration-300 cursor-pointer card-glow indigo hover:-translate-y-0.5"
    >
      <a href={getTradingViewUrl(s.symbol)} target="_blank" rel="noopener noreferrer"
         onClick={(e) => e.stopPropagation()}
         className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition bg-black/40 hover:bg-black/60 p-1.5 rounded-lg">
        <ExternalLink size={12} className="text-ink-400" />
      </a>
      <div className="flex items-center justify-between mb-2.5 gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-ink-100 text-[15px] font-display truncate">{s.symbol}</h3>
          <p className="text-[11px] text-ink-500 truncate">{s.name}</p>
        </div>
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded ${
          up ? 'badge-gains' : 'badge-losses'
        }`}>
          {up ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
          {Math.abs(s.change_percent).toFixed(1)}%
        </span>
      </div>
      <PriceDisplay price={s.price} currency={s.currency || guessCurrency(s.symbol)} size="lg" />
      <p className={`text-[11px] mt-1 ${up ? 'text-emerald-400/60' : 'text-rose-400/60'}`}>
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

  useEffect(() => {
    dashboardService.getMarketStatus().then((s) => {
      setStatus(s)
      if (!autoPicked) {
        const o = s.markets?.find((m) => m.is_open && (m.key === 'INDIA' || m.key === 'US'))
        if (o?.key) setMarket(o.key)
        setAutoPicked(true)
      }
    }).catch((e) => setErrors((p) => ({ ...p, status: e.message })))
    dashboardService.getMarketSummary().then((d) => setIndices(d.indices)).catch((e) => setErrors((p) => ({ ...p, indices: e.message })))
    portfolioService.getSummary().then(setPortfolio).catch((e) => setErrors((p) => ({ ...p, portfolio: e.message })))
    newsService.getNews(6).then(setNews).catch((e) => setErrors((p) => ({ ...p, news: e.message })))
    const id = setInterval(() => {
      dashboardService.getMarketStatus().then(setStatus).catch(() => {})
      dashboardService.getMarketSummary().then((d) => setIndices(d.indices)).catch(() => {})
      portfolioService.getSummary().then(setPortfolio).catch(() => {})
    }, 30000)
    return () => clearInterval(id)
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
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 anim-up">
        <div>
          <div className="eyebrow">Overview</div>
          <h1 className="text-[28px] font-bold text-white font-display tracking-tight leading-tight">Dashboard</h1>
        </div>
        <div className="flex flex-nowrap gap-1 p-1 card rounded-xl overflow-x-auto">
          {MARKET_ORDER.map((k) => {
            const om = status?.markets?.find((m) => m.key === k)
            const isOpen = k === 'ALL' ? status?.is_open : om?.is_open
            return (
              <button key={k} onClick={() => setMarket(k)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition whitespace-nowrap flex items-center gap-1.5 ${
                  market === k
                    ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                    : 'text-ink-500 hover:text-ink-300 hover:bg-white/[0.03]'
                }`}>
                {k !== 'ALL' && <span className={`inline-block w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-ink-500'}`} />}
                {MARKET_LABELS[k]}
              </button>
            )
          })}
        </div>
      </div>

      {status && (() => {
        const sel = market === 'ALL'
          ? status.markets?.find((m) => !m.is_open && m.next_open === status.next_open)
          : status.markets?.find((m) => m.key === market)
        if (!sel) return null
        if (market === 'ALL' && status.is_open) return null
        if (sel.key === 'CRYPTO') return null
        return <div className="anim-up delay-1"><MarketClosedBanner marketName={sel.name} isOpen={sel.is_open} nextOpen={sel.next_open} nextOpenLocal={sel.next_open_local} /></div>
      })()}

      {/* ── Metrics — each card looks different ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Portfolio Value — boxed, elevated */}
        <div className="card-box p-5 anim-up delay-1">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="icon-wrap indigo"><Wallet size={16} className="text-indigo-400" /></div>
          </div>
          <div className="eyebrow">Portfolio Value</div>
          {portfolio === null ? (
            <div className="mt-2 space-y-2"><Skeleton className="h-8 w-36" /><Skeleton className="h-3 w-20" /></div>
          ) : (
            <>
              <PriceDisplay price={portfolio.total_value} size="xl" className="text-ink-100" animate />
              <p className={`text-xs mt-1.5 ${portfolio.total_gain_loss >= 0 ? 'text-emerald-400/60' : 'text-rose-400/60'}`}>
                {portfolio.total_gain_loss >= 0 ? '+' : ''}{portfolio.total_gain_loss.toFixed(2)}% all-time
              </p>
            </>
          )}
        </div>

        {/* Today's P/L — accent card with dynamic glow */}
        {portfolio != null ? (
          <div className={`card-accent p-5 anim-up delay-2 ${portfolio.today_profit_loss >= 0 ? 'emerald' : 'rose'}`}
               style={{ background: portfolio.today_profit_loss >= 0 ? 'rgba(16,185,129,0.03)' : 'rgba(244,63,94,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className={`icon-wrap ${portfolio.today_profit_loss >= 0 ? 'emerald' : 'rose'}`}>
                <TrendingUp size={16} className={portfolio.today_profit_loss >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
              </div>
            </div>
            <div className="eyebrow">Today's P/L</div>
            <PriceDisplay price={portfolio.today_profit_loss} size="xl" color={portfolio.today_profit_loss >= 0 ? 'gains' : 'losses'} showSign animate />
          </div>
        ) : (
          <div className="card p-5 anim-up delay-2">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="icon-wrap indigo"><TrendingUp size={16} className="text-indigo-400" /></div>
            </div>
            <div className="eyebrow">Today's P/L</div>
            <div className="mt-2"><Skeleton className="h-8 w-28" /></div>
          </div>
        )}

        {/* Market Status — surface-3 elevated */}
        <div className="card-surface3 p-5 anim-up delay-3">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="icon-wrap cyan"><Activity size={16} className="text-cyan-400" /></div>
          </div>
          <div className="eyebrow">Market Status</div>
          {status === null ? (
            <div className="mt-2"><Skeleton className="h-8 w-24" /></div>
          ) : (() => {
            const open = (status.markets || []).filter((m) => m.is_open)
            if (open.length === 0) return <div className="text-lg font-bold font-mono text-ink-500 mt-2">CLOSED</div>
            return (
              <div className="space-y-1.5 mt-1">
                {open.map((m) => (
                  <div key={m.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-ink-400">
                      <span className="pulse-dot live" />{m.name}
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-400">LIVE</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

        {/* Holdings — card-flat style */}
        <div className="card-flat p-5 anim-up delay-4">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="icon-wrap amber"><BarChart3 size={16} className="text-amber-400" /></div>
          </div>
          <div className="eyebrow">Holdings</div>
          {portfolio === null ? (
            <div className="mt-2"><Skeleton className="h-8 w-16" /></div>
          ) : (
            <div className="text-3xl font-extrabold font-mono grad-text-indigo mt-2">{portfolio.holdings_count}</div>
          )}
        </div>
      </div>

      {/* ── Ticker ── */}
      <div className="card p-4 anim-up delay-5">
        <LiveTicker symbols={tickerSymbolsForMarket(market)} />
      </div>

      {/* ── Signals + Watchlist ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-5 anim-up delay-6">
        <div className="card overflow-hidden"><IntradaySignals market={market} /></div>
        <div className="card overflow-hidden"><WatchlistPanel onSearch={(sym) => navigate(`/stocks/${sym}`)} /></div>
      </div>

      <div className="anim-up delay-7"><SignalPerformance /></div>

      <WatchThese />
      <AIOutlook />

      {/* ── Market Indices — teal accent ── */}
      <div className="card-accent teal card-surface2 p-5 anim-up delay-2">
        <div className="section-rule teal mb-5 text-white">Market Indices</div>
        {errors.indices && <div className="text-rose-400 text-sm">⚠ {errors.indices}</div>}
        {indices === null && !errors.indices && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1,2,3,4].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
          </div>
        )}
        {indices && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {indices.map((i, idx) => (
              <div key={i.symbol} className="card p-3 anim-up" style={{ animationDelay: `${idx * 0.05}s` }}>
                <div className="text-[11px] text-ink-500 font-medium truncate">{i.name}</div>
                <div className="text-lg font-bold text-ink-100 font-mono tabular-nums mt-0.5">{i.price.toFixed(2)}</div>
                <div className={`text-[11px] mt-0.5 font-medium ${i.change_percent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {i.change_percent >= 0 ? '+' : ''}{i.change_percent.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Trending ── */}
      <div className="card-accent indigo card p-5 anim-up delay-3">
        <div className="section-rule indigo mb-5 text-white">
          Trending {market === 'ALL' ? 'Markets' : MARKET_LABELS[market]}
        </div>
        {errors.trending && <div className="text-rose-400 text-sm">⚠ {errors.trending}</div>}
        {trending === null && !errors.trending && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {[1,2,3,4].map((i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
          </div>
        )}
        {trending && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {trending.map((s, idx) => (
              <div key={s.symbol} className="anim-up" style={{ animationDelay: `${idx * 0.04}s` }}>
                <StockCard s={s} onClick={() => navigate(`/stocks/${s.symbol}`)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Gainers & Losers ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 anim-up delay-4">
        <div className="card-accent emerald card-surface2 p-5">
          <div className="section-rule emerald mb-5 text-white">Top Gainers{gainers && gainers.length > 0 ? ` (${gainers.length})` : ''}</div>
          {errors.gainers && <div className="text-rose-400 text-sm">⚠ {errors.gainers}</div>}
          {gainers === null && !errors.gainers && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{[1,2].map((i) => <div key={i} className="skeleton h-28 rounded-xl" />)}</div>
          )}
          {gainers && gainers.length === 0 && <div className="text-sm text-ink-500 py-6 text-center">No active gainers</div>}
          {gainers && gainers.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {gainers.map((s) => <StockCard key={s.symbol} s={s} onClick={() => navigate(`/stocks/${s.symbol}`)} />)}
            </div>
          )}
        </div>
        <div className="card-accent rose card-surface2 p-5">
          <div className="section-rule rose mb-5 text-white">Top Losers{losers && losers.length > 0 ? ` (${losers.length})` : ''}</div>
          {errors.losers && <div className="text-rose-400 text-sm">⚠ {errors.losers}</div>}
          {losers === null && !errors.losers && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{[1,2].map((i) => <div key={i} className="skeleton h-28 rounded-xl" />)}</div>
          )}
          {losers && losers.length === 0 && <div className="text-sm text-ink-500 py-6 text-center">No active losers</div>}
          {losers && losers.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {losers.map((s) => <StockCard key={s.symbol} s={s} onClick={() => navigate(`/stocks/${s.symbol}`)} />)}
            </div>
          )}
        </div>
      </div>

      <ForexCalendar />

      {/* ── News — amber accent ── */}
      <div className="card-accent amber card-surface2 p-5 anim-up delay-5">
        <div className="section-rule amber mb-5 text-white">Latest Financial News</div>
        {errors.news && <div className="text-rose-400 text-sm">⚠ {errors.news}</div>}
        {news === null && !errors.news && (
          <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
        )}
        {news && (
          <div className="space-y-1">
            {news.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                 className="flex items-start justify-between gap-3 py-3 px-3 -mx-3 rounded-xl transition-colors hover:bg-white/[0.02]">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-ink-200 font-display leading-snug">{a.title}</h3>
                  <p className="text-[11px] text-ink-500 mt-1">{a.source}</p>
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
