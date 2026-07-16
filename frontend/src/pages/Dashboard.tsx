import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Wallet, TrendingUp, AlertCircle, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react'
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

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6">{children}</div>
}

function Loading({ label }: { label: string }) {
  return <div className="text-gray-500 text-sm animate-pulse">Loading {label}…</div>
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
      className="group relative bg-gray-700 hover:bg-gray-600 rounded-lg p-4 pr-12 border border-gray-600 text-left w-full transition cursor-pointer"
    >
      {/* Open in TradingView — stops propagation so it doesn't trigger navigation */}
      <a
        href={getTradingViewUrl(s.symbol)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title="Open in TradingView"
        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900/70 hover:bg-gray-900 text-blue-300 hover:text-white p-1 rounded"
      >
        <ExternalLink size={13} />
      </a>

      <div className="flex justify-between items-start mb-2 gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-white text-lg truncate">{s.symbol}</h3>
          <p className="text-xs text-gray-400 truncate">{s.name}</p>
        </div>
        <span className={`inline-flex items-center gap-1 text-sm font-semibold flex-shrink-0 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
          {up ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
          {Math.abs(s.change_percent).toFixed(2)}%
        </span>
      </div>
      <p className="text-2xl font-bold text-white">
        {formatPrice(s.price, s.currency || guessCurrency(s.symbol))}
      </p>
      <p className={`text-sm ${up ? 'text-emerald-400' : 'text-red-400'}`}>
        {up ? '+' : ''}{s.change.toFixed(2)}
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<MarketStatus | null>(null)
  const [market, setMarket] = useState<MarketKey>('ALL')
  const [autoPicked, setAutoPicked] = useState(false)  // only auto-select market once
  const [indices, setIndices] = useState<MarketIndex[] | null>(null)
  const [trending, setTrending] = useState<StockQuote[] | null>(null)
  const [gainers, setGainers] = useState<StockQuote[] | null>(null)
  const [losers, setLosers] = useState<StockQuote[] | null>(null)
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null)
  const [news, setNews] = useState<NewsArticle[] | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Market status, indices, portfolio, news — independent of selected market
  useEffect(() => {
    dashboardService.getMarketStatus().then((s) => {
      setStatus(s)
      // First load: auto-select the open equity market (India/US) so a user
      // in an open session sees that market instead of a stale default.
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

  // Trending / gainers / losers — refetch whenever the selected market changes
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
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-900 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Dashboard</h1>
          <p className="text-gray-400">Live market data</p>
        </div>
        {/* Market / asset-class selector */}
        <div className="flex flex-nowrap sm:flex-wrap gap-1.5 bg-gray-800 border border-gray-700 rounded-xl p-1.5 overflow-x-auto">
          {MARKET_ORDER.map((k) => {
            const openMarket = status?.markets?.find((m) => m.key === k)
            const isOpen = k === 'ALL' ? status?.is_open : openMarket?.is_open
            return (
              <button
                key={k}
                onClick={() => setMarket(k)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                  market === k ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                {k !== 'ALL' && (
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                )}
                {MARKET_LABELS[k]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Per-market countdown / open-celebration for the SELECTED market.
          (Crypto is 24/7 so it never shows a countdown.) */}
      {status && (() => {
        const sel = market === 'ALL'
          ? status.markets?.find((m) => !m.is_open && m.next_open === status.next_open)
          : status.markets?.find((m) => m.key === market)
        if (!sel) return null
        if (market === 'ALL' && status.is_open) return null   // something's open → no banner
        if (sel.key === 'CRYPTO') return null                 // always open
        return (
          <MarketClosedBanner
            marketName={sel.name}
            isOpen={sel.is_open}
            nextOpen={sel.next_open}
            nextOpenLocal={sel.next_open_local}
          />
        )
      })()}

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="flex justify-between mb-3">
            <div className="p-3 rounded-lg bg-emerald-500/10"><Wallet className="text-emerald-500" size={22} /></div>
          </div>
          <h3 className="text-gray-400 text-sm mb-1">Portfolio Value</h3>
          {portfolio === null ? <Loading label="portfolio" /> :
            <>
              <p className="text-2xl font-bold text-white">{formatPrice(portfolio.total_value, 'USD', 2)}</p>
              <p className={`text-sm ${portfolio.total_gain_loss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {portfolio.total_gain_loss >= 0 ? '+' : ''}{portfolio.total_gain_loss.toFixed(2)}% all-time
              </p>
            </>
          }
        </Card>

        <Card>
          <div className="flex justify-between mb-3">
            <div className="p-3 rounded-lg bg-blue-500/10"><TrendingUp className="text-blue-500" size={22} /></div>
          </div>
          <h3 className="text-gray-400 text-sm mb-1">Today's P/L</h3>
          {portfolio === null ? <Loading label="P/L" /> :
            <p className={`text-2xl font-bold ${portfolio.today_profit_loss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {portfolio.today_profit_loss >= 0 ? '+' : ''}{formatPrice(portfolio.today_profit_loss, 'USD', 2)}
            </p>
          }
        </Card>

        <Card>
          <div className="flex justify-between mb-3">
            <div className="p-3 rounded-lg bg-purple-500/10"><Activity className="text-purple-500" size={22} /></div>
          </div>
          <h3 className="text-gray-400 text-sm mb-1">Market Status</h3>
          {status === null ? <Loading label="status" /> : (() => {
            // Show only the markets that are currently OPEN.
            const open = (status.markets || []).filter((m) => m.is_open)
            if (open.length === 0) {
              return <p className="text-2xl font-bold text-gray-400">CLOSED</p>
            }
            return (
              <div className="space-y-1">
                {open.map((m) => (
                  <div key={m.name} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm text-gray-200">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      {m.name}
                    </span>
                    <span className="text-sm font-semibold text-emerald-400">OPEN</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </Card>

        <Card>
          <div className="flex justify-between mb-3">
            <div className="p-3 rounded-lg bg-yellow-500/10"><AlertCircle className="text-yellow-500" size={22} /></div>
          </div>
          <h3 className="text-gray-400 text-sm mb-1">Holdings</h3>
          {portfolio === null ? <Loading label="holdings" /> :
            <p className="text-2xl font-bold text-white">{portfolio.holdings_count}</p>
          }
        </Card>
      </div>

      {/* Live ticker — symbols follow the selected market */}
      <LiveTicker symbols={tickerSymbolsForMarket(market)} />

      {/* Intraday Signals — scoped to the selected market */}
      <IntradaySignals market={market} />

      {/* Watchlist */}
      <WatchlistPanel onSearch={(sym) => navigate(`/stocks/${sym}`)} />

      {/* Signal Performance */}
      <SignalPerformance />

      {/* Watch These Stocks */}
      <WatchThese />

      {/* AI Outlook */}
      <AIOutlook />

      {/* Indices */}
      <Card>
        <h2 className="text-lg font-bold text-white mb-4">Market Indices</h2>
        {errors.indices && <ErrorMsg msg={errors.indices} />}
        {indices === null && !errors.indices && <Loading label="indices" />}
        {indices && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {indices.map((i) => (
              <div key={i.symbol} className="bg-gray-700 rounded-lg p-3 border border-gray-600">
                <p className="text-xs text-gray-400">{i.name}</p>
                <p className="text-lg font-bold text-white">{i.price.toFixed(2)}</p>
                <p className={`text-xs ${i.change_percent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {i.change_percent >= 0 ? '+' : ''}{i.change_percent.toFixed(2)}%
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Trending */}
      <Card>
        <h2 className="text-lg font-bold text-white mb-4">
          Trending {market === 'ALL' ? 'Markets' : MARKET_LABELS[market]}
        </h2>
        {errors.trending && <ErrorMsg msg={errors.trending} />}
        {trending === null && !errors.trending && <Loading label="trending" />}
        {trending && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {trending.map((s) => <StockCard key={s.symbol} s={s} onClick={() => navigate(`/stocks/${s.symbol}`)} />)}
          </div>
        )}
      </Card>

      {/* Gainers & Losers */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <h2 className="text-lg font-bold text-emerald-400 mb-4">
            Top Gainers{gainers && gainers.length > 0 ? ` (${gainers.length})` : ''}
          </h2>
          {gainers === null && !errors.gainers && <Loading label="gainers" />}
          {gainers && gainers.length === 0 && (
            <p className="text-sm text-gray-500 py-6">No active gainers right now — market is flat or closed.</p>
          )}
          {gainers && gainers.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {gainers.map((s) => <StockCard key={s.symbol} s={s} onClick={() => navigate(`/stocks/${s.symbol}`)} />)}
            </div>
          )}
        </Card>
        <Card>
          <h2 className="text-lg font-bold text-red-400 mb-4">
            Top Losers{losers && losers.length > 0 ? ` (${losers.length})` : ''}
          </h2>
          {losers === null && !errors.losers && <Loading label="losers" />}
          {losers && losers.length === 0 && (
            <p className="text-sm text-gray-500 py-6">No active losers right now — market is flat or closed.</p>
          )}
          {losers && losers.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {losers.map((s) => <StockCard key={s.symbol} s={s} onClick={() => navigate(`/stocks/${s.symbol}`)} />)}
            </div>
          )}
        </Card>
      </div>

      {/* Forex & Economic Calendar */}
      <ForexCalendar />

      {/* News */}
      <Card>
        <h2 className="text-lg font-bold text-white mb-4">Latest Financial News</h2>
        {errors.news && <ErrorMsg msg={errors.news} />}
        {news === null && !errors.news && <Loading label="news" />}
        {news && (
          <div className="space-y-3">
            {news.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                 className="block pb-3 border-b border-gray-700 last:border-b-0 hover:bg-gray-700/30 rounded p-2 -m-2 transition">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-white font-medium flex-1">{a.title}</h3>
                  <span className={`ml-3 px-2 py-1 rounded text-xs font-semibold ${
                    a.sentiment === 'POSITIVE' ? 'bg-emerald-500/20 text-emerald-300' :
                    a.sentiment === 'NEGATIVE' ? 'bg-red-500/20 text-red-300' :
                    'bg-gray-500/20 text-gray-300'
                  }`}>{a.sentiment}</span>
                </div>
                <p className="text-gray-400 text-sm">{a.source}</p>
              </a>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
