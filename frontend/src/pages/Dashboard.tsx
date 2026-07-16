import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Wallet, TrendingUp, AlertCircle, ArrowUp, ArrowDown, ExternalLink, Sparkles } from 'lucide-react'
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
import { formatPrice, guessCurrency } from '@/utils/currency'
import { MARKET_ORDER, MARKET_LABELS, tickerSymbolsForMarket } from '@/utils/markets'

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`glass-card p-6 ${className}`}>{children}</div>
}

function Loading({ label }: { label: string }) {
  return <div className="h-5 w-24 skeleton-glow" />
}

function ErrorMsg({ msg }: { msg: string }) {
  return <div className="text-red-400 text-sm">⚠ {msg}</div>
}

function StockCard({ s, onClick }: { s: StockQuote; onClick: () => void }) {
  const up = s.change_percent >= 0
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
      className="group relative glass-card p-4 pr-12 text-left w-full transition cursor-pointer card-border-gradient"
    >
      <a
        href={getTradingViewUrl(s.symbol)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title="Open in TradingView"
        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-black text-white/70 hover:text-white p-1.5 rounded-lg backdrop-blur-sm"
      >
        <ExternalLink size={13} />
      </a>

      <div className="flex justify-between items-start mb-2 gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-white text-lg font-display truncate">{s.symbol}</h3>
          <p className="text-xs text-gray-500 truncate">{s.name}</p>
        </div>
        <span className={`inline-flex items-center gap-1 text-sm font-semibold flex-shrink-0 ${up ? 'change-up' : 'change-down'}`}>
          {up ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
          {Math.abs(s.change_percent).toFixed(2)}%
        </span>
      </div>
      <p className="text-2xl font-bold gradient-text number-ticker font-mono">
        {formatPrice(s.price, s.currency || guessCurrency(s.symbol))}
      </p>
      <p className={`text-sm ${up ? 'change-up' : 'change-down'}`}>
        {up ? '+' : ''}{s.change.toFixed(2)}
      </p>
    </div>
  )
}

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
    const loadMovers = () => {
      dashboardService.getTrending(market).then(setTrending).catch((e) => setErrors((p) => ({ ...p, trending: e.message })))
      dashboardService.getGainers(5, market).then(setGainers).catch((e) => setErrors((p) => ({ ...p, gainers: e.message })))
      dashboardService.getLosers(5, market).then(setLosers).catch((e) => setErrors((p) => ({ ...p, losers: e.message })))
    }
    loadMovers()
    const id = setInterval(loadMovers, 30000)
    return () => clearInterval(id)
  }, [market])

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 animate-spring-in">
        <div>
          <h1 className="text-3xl font-bold text-white font-display">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Live market overview</p>
        </div>
        <div className="flex flex-nowrap sm:flex-wrap gap-1.5 glass-card p-1.5 overflow-x-auto rounded-xl">
          {MARKET_ORDER.map((k) => {
            const openMarket = status?.markets?.find((m) => m.key === k)
            const isOpen = k === 'ALL' ? status?.is_open : openMarket?.is_open
            return (
              <button
                key={k}
                onClick={() => setMarket(k)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                  market === k ? 'bg-gradient-to-r from-[#00F5A0]/20 to-[#00D4FF]/10 text-white border border-[#00F5A0]/20' : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {k !== 'ALL' && (
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-[#00F5A0] animate-pulse' : 'bg-gray-600'}`} />
                )}
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
        return (
          <div className="animate-spring-up stagger-1">
            <MarketClosedBanner
              marketName={sel.name}
              isOpen={sel.is_open}
              nextOpen={sel.next_open}
              nextOpenLocal={sel.next_open_local}
            />
          </div>
        )
      })()}

      {/* Metrics row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="animate-spring-up stagger-1">
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-[#00F5A0]/10 border border-[#00F5A0]/20"><Wallet className="text-[#00F5A0]" size={18} /></div>
            </div>
            <h3 className="text-gray-500 text-xs font-medium uppercase tracking-widest mb-1">Portfolio Value</h3>
            {portfolio === null ? <Loading label="portfolio" /> : <>
              <p className="text-2xl font-bold text-white font-mono">{formatPrice(portfolio.total_value, 'USD', 2)}</p>
              <p className={`text-sm mt-1 ${portfolio.total_gain_loss >= 0 ? 'change-up' : 'change-down'}`}>
                {portfolio.total_gain_loss >= 0 ? '+' : ''}{portfolio.total_gain_loss.toFixed(2)}% all-time
              </p>
            </>}
          </Card>
        </div>

        <div className="animate-spring-up stagger-2">
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-[#00D4FF]/10 border border-[#00D4FF]/20"><TrendingUp className="text-[#00D4FF]" size={18} /></div>
            </div>
            <h3 className="text-gray-500 text-xs font-medium uppercase tracking-widest mb-1">Today's P/L</h3>
            {portfolio === null ? <Loading label="P/L" /> :
              <p className={`text-2xl font-bold font-mono ${portfolio.today_profit_loss >= 0 ? 'change-up' : 'change-down'}`}>
                {portfolio.today_profit_loss >= 0 ? '+' : ''}{formatPrice(portfolio.today_profit_loss, 'USD', 2)}
              </p>
            }
          </Card>
        </div>

        <div className="animate-spring-up stagger-3">
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-[#7C3AED]/10 border border-[#7C3AED]/20"><Activity className="text-[#7C3AED]" size={18} /></div>
            </div>
            <h3 className="text-gray-500 text-xs font-medium uppercase tracking-widest mb-1">Market Status</h3>
            {status === null ? <Loading label="status" /> : (() => {
              const open = (status.markets || []).filter((m) => m.is_open)
              if (open.length === 0) return <p className="text-2xl font-bold text-gray-600 font-mono">CLOSED</p>
              return (
                <div className="space-y-1.5">
                  {open.map((m) => (
                    <div key={m.name} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm text-gray-300">
                        <span className="relative"><span className="inline-block w-2 h-2 rounded-full bg-[#00F5A0] pulse-dot active" /></span>
                        {m.name}
                      </span>
                      <span className="text-sm font-semibold text-[#00F5A0]">OPEN</span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </Card>
        </div>

        <div className="animate-spring-up stagger-4">
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20"><AlertCircle className="text-amber-500" size={18} /></div>
            </div>
            <h3 className="text-gray-500 text-xs font-medium uppercase tracking-widest mb-1">Holdings</h3>
            {portfolio === null ? <Loading label="holdings" /> :
              <p className="text-3xl font-bold gradient-text font-mono">{portfolio.holdings_count}</p>
            }
          </Card>
        </div>
      </div>

      {/* Live ticker */}
      <div className="animate-fade-slide-up stagger-5">
        <LiveTicker symbols={tickerSymbolsForMarket(market)} />
      </div>

      <div className="animate-fade-slide-up stagger-6">
        <IntradaySignals market={market} />
      </div>

      <div className="animate-spring-up stagger-7">
        <WatchlistPanel onSearch={(sym) => navigate(`/stocks/${sym}`)} />
      </div>

      <div className="animate-fade-slide-up stagger-8">
        <SignalPerformance />
      </div>

      <WatchThese />
      <AIOutlook />

      {/* Indices */}
      <Card>
        <h2 className="text-lg font-bold text-white font-display mb-4">Market Indices</h2>
        {errors.indices && <ErrorMsg msg={errors.indices} />}
        {indices === null && !errors.indices && <Loading label="indices" />}
        {indices && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {indices.map((i, idx) => (
              <div key={i.symbol} className={`glass-card p-3 card-border-gradient animate-spring-up stagger-${idx + 1}`}>
                <p className="text-xs text-gray-500 font-medium">{i.name}</p>
                <p className="text-lg font-bold text-white font-mono mt-1">{i.price.toFixed(2)}</p>
                <p className={`text-xs mt-0.5 ${i.change_percent >= 0 ? 'change-up' : 'change-down'}`}>
                  {i.change_percent >= 0 ? '+' : ''}{i.change_percent.toFixed(2)}%
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Trending */}
      <Card>
        <h2 className="text-lg font-bold text-white font-display mb-4">
          Trending {market === 'ALL' ? 'Markets' : MARKET_LABELS[market]}
        </h2>
        {errors.trending && <ErrorMsg msg={errors.trending} />}
        {trending === null && !errors.trending && <Loading label="trending" />}
        {trending && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {trending.map((s, idx) => (
              <div key={s.symbol} className={`animate-spring-up stagger-${idx + 1}`}>
                <StockCard s={s} onClick={() => navigate(`/stocks/${s.symbol}`)} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Gainers & Losers */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <h2 className="text-lg font-bold text-[#00F5A0] font-display mb-4">
            Top Gainers{gainers && gainers.length > 0 ? ` (${gainers.length})` : ''}
          </h2>
          {gainers === null && !errors.gainers && <Loading label="gainers" />}
          {gainers && gainers.length === 0 && <p className="text-sm text-gray-600 py-6 text-center">No active gainers right now</p>}
          {gainers && gainers.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {gainers.map((s) => <StockCard key={s.symbol} s={s} onClick={() => navigate(`/stocks/${s.symbol}`)} />)}
            </div>
          )}
        </Card>
        <Card>
          <h2 className="text-lg font-bold text-red-400 font-display mb-4">
            Top Losers{losers && losers.length > 0 ? ` (${losers.length})` : ''}
          </h2>
          {losers === null && !errors.losers && <Loading label="losers" />}
          {losers && losers.length === 0 && <p className="text-sm text-gray-600 py-6 text-center">No active losers right now</p>}
          {losers && losers.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {losers.map((s) => <StockCard key={s.symbol} s={s} onClick={() => navigate(`/stocks/${s.symbol}`)} />)}
            </div>
          )}
        </Card>
      </div>

      <ForexCalendar />

      {/* News */}
      <Card>
        <h2 className="text-lg font-bold text-white font-display mb-4">Latest Financial News</h2>
        {errors.news && <ErrorMsg msg={errors.news} />}
        {news === null && !errors.news && <Loading label="news" />}
        {news && (
          <div className="space-y-3">
            {news.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                 className="block pb-3 border-b border-white/5 last:border-b-0 glass-card p-3 -m-3 mb-2 transition">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-white font-medium flex-1 font-display">{a.title}</h3>
                  <span className={`ml-3 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    a.sentiment === 'POSITIVE' ? 'bg-[#00F5A0]/10 text-[#00F5A0] border border-[#00F5A0]/20' :
                    a.sentiment === 'NEGATIVE' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                    'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                  }`}>{a.sentiment}</span>
                </div>
                <p className="text-gray-500 text-sm">{a.source}</p>
              </a>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
