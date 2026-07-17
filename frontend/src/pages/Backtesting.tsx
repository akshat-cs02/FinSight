import React, { useState } from 'react'
import {
  BarChart2, TrendingUp, TrendingDown, RefreshCw, Trophy, Shield, Zap,
  ChevronDown, ChevronUp, Info
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import api from '@/services/api'
import { formatTradeDate } from '@/utils/timezone'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BacktestMetrics {
  total_return_pct: number
  sharpe_ratio: number
  max_drawdown_pct: number
  win_rate_pct: number
  profit_factor: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  avg_trade_pct?: number
  calmar_ratio?: number
  error?: string
}

interface EquityPoint { date: string; equity: number }

interface Trade {
  entry_date: string
  exit_date: string
  side: string
  entry: number
  exit: number
  pnl: number
  pnl_pct: number
  exit_reason: string
  strategy?: string
}

interface BacktestResult {
  symbol: string
  strategy: string
  period: string
  initial_capital: number
  final_capital: number
  metrics: BacktestMetrics
  equity_curve: EquityPoint[]
  trades: Trade[]
  news_filter: boolean
  blackout_days: number
  data_bars: number
}

interface LeaderboardEntry {
  rank: number
  strategy: string
  metrics: BacktestMetrics
  equity_curve: EquityPoint[]
  trade_count: number
}

interface LeaderboardResult {
  symbol: string
  period: string
  initial_capital: number
  data_bars: number
  news_filter: boolean
  blackout_days: number
  leaderboard: LeaderboardEntry[]
  best_strategy: string
  equity_curve: EquityPoint[]
  trades: Trade[]
}

interface UniverseStrategyRank {
  rank: number
  strategy: string
  symbols_tested: number
  avg_sharpe: number
  median_sharpe: number
  avg_return_pct: number
  avg_win_rate: number
  avg_max_drawdown: number
  per_symbol: { symbol: string; asset_class: string; sharpe: number; return_pct: number }[]
}

interface UniverseResult {
  status?: string
  message?: string
  period: string
  symbols_tested: number
  universe: Record<string, string[]>
  global_rankings: UniverseStrategyRank[]
  top_strategies: string[]
  per_symbol_best: { symbol: string; asset_class: string; best_strategy: string; sharpe: number; return_pct: number }[]
  computed_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

// ICT/SMC is INTRADAY ONLY — same-day open & close.
// Daily TF (1d) intentionally removed: holding for weeks contradicts ICT core.
const INTERVAL_PERIODS: Record<string, string[]> = {
  '15m': ['1mo', '2mo'],
  '30m': ['1mo', '2mo'],
  '1h':  ['1y', '2y'],
}
const QUICK_SYMBOLS: { sym: string; label?: string; group: string }[] = [
  // US
  { sym: 'AAPL',        group: 'US' },
  { sym: 'MSFT',        group: 'US' },
  { sym: 'GOOGL',       group: 'US' },
  { sym: 'NVDA',        group: 'US' },
  { sym: 'TSLA',        group: 'US' },
  { sym: 'META',        group: 'US' },
  { sym: 'AMZN',        group: 'US' },
  // India
  { sym: 'RELIANCE.NS', label: 'RELIANCE', group: 'IN' },
  { sym: 'TCS.NS',      label: 'TCS',      group: 'IN' },
  { sym: 'INFY.NS',     label: 'INFY',     group: 'IN' },
  { sym: 'HDFCBANK.NS', label: 'HDFC',     group: 'IN' },
  // Forex
  { sym: 'EURUSD=X',    label: 'EUR/USD',  group: 'FX' },
  { sym: 'GBPUSD=X',    label: 'GBP/USD',  group: 'FX' },
  // Crypto
  { sym: 'BTC-USD',     label: 'BTC',      group: 'Crypto' },
  { sym: 'ETH-USD',     label: 'ETH',      group: 'Crypto' },
  // Commodities
  { sym: 'GC=F',        label: 'Gold',     group: 'Commod' },
  { sym: 'CL=F',        label: 'Oil',      group: 'Commod' },
]

const STRATEGIES: { key: string; label: string; desc: string; icon: string }[] = [
  { key: 'BOS_FVG',        label: 'BOS + FVG',          icon: '📐', desc: 'Break of Structure + Fair Value Gap. Enters on trend continuation after structure break with imbalance confirmation.' },
  { key: 'CHOCH_FVG',      label: 'CHoCH + FVG',        icon: '🔄', desc: 'Change of Character + FVG. Reversal entry when market structure shifts direction with an imbalance present.' },
  { key: 'MSS_OrderBlock', label: 'MSS + Order Block',  icon: '🏛️', desc: 'Market Structure Shift + Order Block. Highest-confidence setup: EMA-200 trend + last institutional candle before move.' },
  { key: 'LiqSweep_FVG',  label: 'Liq. Sweep + FVG',   icon: '🌊', desc: 'Liquidity Sweep + FVG. Classic ICT stop-hunt: price wicks beyond recent high/low then reverses with FVG confirmation.' },
  { key: 'SR_Bounce',      label: 'S/R Bounce',         icon: '📊', desc: 'Support & Resistance levels from swing highs/lows. Enters on price touch+rejection of key structural levels.' },
  { key: 'RSI_OTE',        label: 'RSI + OTE',          icon: '🎯', desc: 'RSI in Optimal Trade Entry zone (62-79% Fibonacci retracement). Institutional retracement entry model.' },
  { key: 'PriceAction',    label: 'Price Action',       icon: '🕯️', desc: 'Candlestick patterns: Bullish/Bearish Engulfing, Hammer, Shooting Star. Confirmed by EMA-50 trend bias.' },
  { key: 'MA_FVG',         label: 'MA Cross + FVG',     icon: '📈', desc: 'EMA 21/55 crossover with Fair Value Gap confirmation. Trend-following with institutional momentum filter.' },
]

// ─── Small Components ─────────────────────────────────────────────────────────

function MetricCard({ label, value, good, suffix = '', small = false }: {
  label: string; value: string | number; good: boolean; suffix?: string; small?: boolean
}) {
  return (
    <div className="card p-4">
      <p className="text-xs text-ink-400 mb-1">{label}</p>
      <p className={`font-bold tabular-nums ${small ? 'text-lg' : 'text-2xl'} ${good ? 'text-emerald-400' : 'text-rose-400'}`}>
        {value}{suffix}
      </p>
    </div>
  )
}

function StrategyTooltip({ desc }: { desc: string }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-block">
      <Info size={13} className="text-ink-500 cursor-pointer hover:text-ink-300 ml-1 inline"
            onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} />
      {show && (
        <div className="absolute z-50 left-0 top-5 w-64 p-3 bg-gray-900 border border-gray-600 rounded-lg text-xs text-ink-300 shadow-xl">
          {desc}
        </div>
      )}
    </span>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BacktestingPage() {
  const [symbol, setSymbol] = useState('AAPL')
  const [interval, setIntervalVal] = useState<'15m' | '30m' | '1h'>('15m')
  const [period, setPeriod] = useState('2y')
  const [capital, setCapital] = useState('10000')
  const [allowShort, setAllowShort] = useState(false)
  const [filterNews, setFilterNews] = useState(true)
  const [mode, setMode] = useState<'single' | 'leaderboard' | 'universe'>('leaderboard')
  const [selectedStrategy, setSelectedStrategy] = useState('BOS_FVG')

  const [singleResult, setSingleResult] = useState<BacktestResult | null>(null)
  const [leaderResult, setLeaderResult] = useState<LeaderboardResult | null>(null)
  const [universeResult, setUniverseResult] = useState<UniverseResult | null>(null)
  const [universePolling, setUniversePolling] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null)
  const [expandedUniverseStrategy, setExpandedUniverseStrategy] = useState<string | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    setSingleResult(null)
    setLeaderResult(null)

    try {
      const params = {
        period,
        interval,
        initial_capital: parseFloat(capital) || 10000,
        allow_short: allowShort,
        filter_news: filterNews,
      }

      if (mode === 'leaderboard') {
        const res = await api.get<LeaderboardResult>(
          `/backtest/${symbol.toUpperCase()}/leaderboard`, { params, timeout: 120_000 }
        )
        setLeaderResult(res.data)
      } else {
        const res = await api.get<BacktestResult>(
          `/backtest/${symbol.toUpperCase()}`,
          { params: { ...params, strategy: selectedStrategy }, timeout: 60_000 }
        )
        setSingleResult(res.data)
      }
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchUniverse = async (force = false) => {
    setUniversePolling(true)
    setError(null)
    try {
      const res = await api.get<UniverseResult>('/backtest/universe/leaderboard', {
        params: { period, filter_news: filterNews, force },
        timeout: 0,  // no timeout — can take several minutes first run
      })
      if (res.data.status === 'computing') {
        // Backend started background computation — poll every 30s
        setUniverseResult(res.data)
        setTimeout(() => fetchUniverse(false), 30_000)
      } else {
        setUniverseResult(res.data)
        setUniversePolling(false)
      }
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message)
      setUniversePolling(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">

      {/* Header */}
      <div className="anim-up delay-0">
        <h1 className="text-3xl font-bold text-ink-50 flex items-center gap-3 font-display">
          <BarChart2 size={28} className="text-gold" /> ICT/SMC Backtesting Engine
        </h1>
        <p className="text-ink-500 mt-1 text-sm">
          Professional-grade backtesting with ICT & Smart Money Concepts — 8 strategies, news filter, 5-year data
        </p>
      </div>

      {/* Controls */}
      <div className="card-accent card p-5 anim-up delay-1">
        <div className="section-rule">
          <h2 className="font-display text-ink-50">Configure Backtest</h2>
        </div>

        <div className="flex flex-wrap gap-4 items-start">
          {/* Symbol */}
          <div>
            <label className="block text-xs text-ink-400 mb-1">Symbol</label>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="AAPL"
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-ink-50 w-32 uppercase"
            />
          </div>

          {/* Quick picks */}
          <div>
            <label className="block text-xs text-ink-400 mb-1">Quick pick</label>
            <div className="flex flex-wrap gap-1">
              {QUICK_SYMBOLS.map(({ sym, label, group }) => (
                <button key={sym} onClick={() => setSymbol(sym)}
                        title={`${sym} · ${group}`}
                        className={`px-2 py-1 text-xs rounded transition ${symbol === sym
                          ? 'bg-gold text-black'
                          : group === 'IN'     ? 'bg-orange-900/50 text-orange-300 hover:bg-orange-800/60'
                          : group === 'FX'     ? 'bg-purple-900/50 text-purple-300 hover:bg-purple-800/60'
                          : group === 'Crypto' ? 'bg-yellow-900/50 text-yellow-300 hover:bg-yellow-800/60'
                          : group === 'Commod' ? 'bg-green-900/50 text-green-300 hover:bg-green-800/60'
                          : 'bg-gray-700 text-ink-300 hover:bg-gray-600'}`}>
                  {label ?? sym}
                </button>
              ))}
            </div>
            <div className="flex gap-3 mt-1 text-xs text-ink-600">
              <span className="text-ink-400">US</span>
              <span className="text-orange-500">IN</span>
              <span className="text-purple-500">FX</span>
              <span className="text-yellow-500">Crypto</span>
              <span className="text-green-500">Commod</span>
            </div>
          </div>

          {/* Interval */}
          <div>
            <label className="block text-xs text-ink-400 mb-1">
              Interval <span className="text-ink-600 font-normal">(ICT/SMC = intraday)</span>
            </label>
            <div className="flex gap-1">
              {(['15m', '30m', '1h'] as const).map((iv) => (
                <button key={iv} onClick={() => {
                  setIntervalVal(iv)
                  const validPeriods = INTERVAL_PERIODS[iv]
                  if (!validPeriods.includes(period)) setPeriod(validPeriods[validPeriods.length - 1])
                }}
                        className={`px-3 py-2 text-xs rounded transition ${interval === iv
                          ? 'bg-gold text-black'
                          : 'bg-gray-700 text-ink-300 hover:bg-gray-600'}`}>
                  {iv.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Period */}
          <div>
            <label className="block text-xs text-ink-400 mb-1">Period</label>
            <div className="flex gap-1">
              {INTERVAL_PERIODS[interval].map((p) => (
                <button key={p} onClick={() => setPeriod(p)}
                        className={`px-3 py-2 text-xs rounded transition ${period === p
                          ? 'bg-gold text-black'
                          : 'bg-gray-700 text-ink-300 hover:bg-gray-600'}`}>
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Capital */}
          <div>
            <label className="block text-xs text-ink-400 mb-1">Capital ($)</label>
            <input type="number" value={capital}
                   onChange={(e) => setCapital(e.target.value)}
                   className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-ink-50 w-28" />
          </div>

          {/* Toggles */}
          <div className="flex flex-col gap-2 pt-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={allowShort} onChange={(e) => setAllowShort(e.target.checked)}
                     className="accent-gold" />
              <span className="text-xs text-ink-300">Allow Short</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={filterNews} onChange={(e) => setFilterNews(e.target.checked)}
                     className="accent-gold" />
              <span className="text-xs text-gold flex items-center gap-1">
                <Shield size={10} /> News Filter
              </span>
            </label>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="border-t border-gray-700 pt-4">
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setMode('leaderboard')}
              className={`px-4 py-2 text-sm rounded-lg font-medium transition flex items-center gap-2 ${
                mode === 'leaderboard' ? 'bg-gold text-black' : 'bg-gray-700 text-ink-300 hover:bg-gray-600'
              }`}
            >
              <Trophy size={14} /> Leaderboard (All 8 Strategies)
            </button>
            <button
              onClick={() => setMode('single')}
              className={`px-4 py-2 text-sm rounded-lg font-medium transition flex items-center gap-2 ${
                mode === 'single' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-ink-300 hover:bg-gray-600'
              }`}
            >
              <Zap size={14} /> Single Strategy
            </button>
            <button
              onClick={() => setMode('universe')}
              className={`px-4 py-2 text-sm rounded-lg font-medium transition flex items-center gap-2 ${
                mode === 'universe' ? 'bg-gold text-black' : 'bg-gray-700 text-ink-300 hover:bg-gray-600'
              }`}
            >
              <Shield size={14} /> Universe Rankings
            </button>
          </div>

          {mode === 'leaderboard' && (
            <p className="text-xs text-gold flex items-center gap-1">
              <Trophy size={11} /> Runs all 8 ICT/SMC strategies and ranks by Sharpe ratio. May take 20-40s.
            </p>
          )}

          {mode === 'single' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {STRATEGIES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSelectedStrategy(s.key)}
                  className={`p-3 rounded-lg text-left border transition ${
                    selectedStrategy === s.key
                      ? 'bg-gold/20 border-gold text-gold'
                      : 'bg-gray-700 border-gray-600 text-ink-300 hover:bg-gray-600'
                  }`}
                >
                  <div className="text-base mb-1">{s.icon}</div>
                  <div className="text-xs font-semibold">{s.label}
                    <StrategyTooltip desc={s.desc} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {mode === 'universe' ? (
          <button onClick={() => fetchUniverse(false)} disabled={universePolling}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gold hover:bg-gold-2 disabled:opacity-50 rounded-lg text-black font-medium transition">
            {universePolling ? <RefreshCw size={16} className="animate-spin" /> : <Shield size={16} />}
            {universePolling ? 'Computing (~2-5 min first run)…' : universeResult ? 'Refresh Universe' : 'Run Universe Analysis'}
          </button>
        ) : (
          <button onClick={run} disabled={loading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gold hover:bg-gold-2 disabled:opacity-50 rounded-lg text-black font-medium transition">
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <BarChart2 size={16} />}
            {loading ? (mode === 'leaderboard' ? 'Running 8 strategies…' : 'Running backtest…') : 'Run Backtest'}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm anim-up delay-2">{error}</div>
      )}

      {/* ── Leaderboard Results ────────────────────────────────────────────────── */}
      {leaderResult && mode === 'leaderboard' && (
        <>
          <div className="card-box p-6 anim-up delay-2">
            <div className="section-rule">
              <h2 className="font-display text-ink-50 flex items-center gap-2">
                <Trophy size={18} className="text-gold" />
                Strategy Leaderboard — {leaderResult.symbol} ({leaderResult.period})
              </h2>
            </div>

            <div className="space-y-2">
              {leaderResult.leaderboard.map((item) => {
                const isExpanded = expandedStrategy === item.strategy
                const hasError = !!item.metrics.error
                const isWinner = item.rank === 1 && !hasError

                return (
                  <div key={item.strategy}
                       className={`rounded-xl border transition overflow-hidden ${
                         isWinner
                           ? 'border-gold/40 bg-gold/[0.03]'
                           : hasError
                             ? 'border-gray-700 bg-gray-800/50 opacity-60'
                             : 'border-gray-700 bg-gray-800/80'
                       }`}>
                    {/* Row header */}
                    <button
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-700/30 transition"
                      onClick={() => setExpandedStrategy(isExpanded ? null : item.strategy)}
                    >
                      {/* Rank */}
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        isWinner ? 'bg-gold text-black'
                          : item.rank === 2 ? 'bg-gray-400 text-black'
                          : item.rank === 3 ? 'bg-orange-600 text-white'
                          : 'bg-gray-700 text-ink-300'
                      }`}>
                        {item.rank}
                      </div>

                      {/* Strategy name + icon */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">
                            {STRATEGIES.find(s => s.key === item.strategy)?.icon || '📊'}
                          </span>
                          <span className="font-semibold text-ink-50 text-sm">
                            {STRATEGIES.find(s => s.key === item.strategy)?.label || item.strategy}
                          </span>
                          {isWinner && <span className="text-gold text-xs">👑 Best</span>}
                        </div>
                      </div>

                      {/* Key metrics inline */}
                      {!hasError && (
                        <div className="hidden md:flex items-center gap-6 text-xs">
                          <div className="text-center">
                            <div className="text-ink-500">Return</div>
                            <div className={`font-bold ${(item.metrics.total_return_pct || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {(item.metrics.total_return_pct || 0) >= 0 ? '+' : ''}{(item.metrics.total_return_pct || 0).toFixed(1)}%
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-ink-500">Sharpe</div>
                            <div className={`font-bold ${(item.metrics.sharpe_ratio || 0) >= 1 ? 'text-emerald-400' : (item.metrics.sharpe_ratio || 0) >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                              {(item.metrics.sharpe_ratio || 0).toFixed(2)}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-ink-500">Win%</div>
                            <div className={`font-bold ${(item.metrics.win_rate_pct || 0) >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {(item.metrics.win_rate_pct || 0).toFixed(1)}%
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-ink-500">Drawdown</div>
                            <div className={`font-bold ${(item.metrics.max_drawdown_pct || 0) > -20 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {(item.metrics.max_drawdown_pct || 0).toFixed(1)}%
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-ink-500">Trades</div>
                            <div className="font-bold text-ink-50">{item.trade_count}</div>
                          </div>
                        </div>
                      )}
                      {hasError && (
                        <span className="text-red-400 text-xs">Error: {item.metrics.error}</span>
                      )}

                      {!hasError && (
                        isExpanded
                          ? <ChevronUp size={14} className="text-ink-400 flex-shrink-0" />
                          : <ChevronDown size={14} className="text-ink-400 flex-shrink-0" />
                      )}
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && !hasError && (
                      <div className="px-4 pb-4 border-t border-gray-700/50 space-y-3">
                        <p className="text-xs text-ink-400 pt-3">
                          {STRATEGIES.find(s => s.key === item.strategy)?.desc}
                        </p>

                        {/* Mini metrics grid */}
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                          {[
                            { l: 'Total Return', v: `${(item.metrics.total_return_pct || 0) >= 0 ? '+' : ''}${(item.metrics.total_return_pct || 0).toFixed(2)}%`, g: (item.metrics.total_return_pct || 0) >= 0 },
                            { l: 'Sharpe', v: (item.metrics.sharpe_ratio || 0).toFixed(3), g: (item.metrics.sharpe_ratio || 0) >= 1 },
                            { l: 'Max Drawdown', v: `${(item.metrics.max_drawdown_pct || 0).toFixed(2)}%`, g: (item.metrics.max_drawdown_pct || 0) > -20 },
                            { l: 'Win Rate', v: `${(item.metrics.win_rate_pct || 0).toFixed(1)}%`, g: (item.metrics.win_rate_pct || 0) >= 50 },
                            { l: 'Profit Factor', v: (item.metrics.profit_factor || 0).toFixed(2), g: (item.metrics.profit_factor || 0) >= 1 },
                            { l: 'Calmar', v: (item.metrics.calmar_ratio || 0).toFixed(2), g: (item.metrics.calmar_ratio || 0) >= 0.5 },
                          ].map((x, i) => (
                            <MetricCard key={i} label={x.l} value={x.v} good={x.g} small />
                          ))}
                        </div>

                        {/* Mini equity chart */}
                        {item.equity_curve.length > 0 && (
                          <ResponsiveContainer width="100%" height={120}>
                            <LineChart data={item.equity_curve}>
                              <XAxis dataKey="date" hide />
                              <YAxis hide domain={['auto', 'auto']} />
                              <Tooltip
                                contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: 11 }}
                                formatter={(v: number) => [`$${v.toLocaleString()}`, 'Equity']}
                              />
                              <ReferenceLine y={leaderResult.initial_capital} stroke="#374151" strokeDasharray="3 3" />
                              <Line type="monotone" dataKey="equity"
                                    stroke={isWinner ? '#f59e0b' : '#3b82f6'} dot={false} strokeWidth={1.5} />
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Best strategy equity curve full + trade log */}
          {leaderResult.equity_curve.length > 0 && (
            <EquityAndTrades
              symbol={leaderResult.symbol}
              strategyLabel={`Best: ${STRATEGIES.find(s => s.key === leaderResult.best_strategy)?.label || leaderResult.best_strategy}`}
              initialCapital={leaderResult.initial_capital}
              equityCurve={leaderResult.equity_curve}
              trades={leaderResult.trades}
            />
          )}
        </>
      )}

      {/* ── Single Strategy Results ────────────────────────────────────────────── */}
      {singleResult && mode === 'single' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 anim-up delay-3">
            <MetricCard label="Total Return"
              value={`${(singleResult.metrics.total_return_pct || 0) >= 0 ? '+' : ''}${(singleResult.metrics.total_return_pct || 0).toFixed(2)}`}
              good={(singleResult.metrics.total_return_pct || 0) >= 0} suffix="%" />
            <MetricCard label="Sharpe Ratio"
              value={(singleResult.metrics.sharpe_ratio || 0).toFixed(3)}
              good={(singleResult.metrics.sharpe_ratio || 0) >= 1} />
            <MetricCard label="Max Drawdown"
              value={(singleResult.metrics.max_drawdown_pct || 0).toFixed(2)}
              good={(singleResult.metrics.max_drawdown_pct || 0) > -20} suffix="%" />
            <MetricCard label="Win Rate"
              value={(singleResult.metrics.win_rate_pct || 0).toFixed(1)}
              good={(singleResult.metrics.win_rate_pct || 0) >= 50} suffix="%" />
            <MetricCard label="Profit Factor"
              value={(singleResult.metrics.profit_factor || 0).toFixed(2)}
              good={(singleResult.metrics.profit_factor || 0) >= 1} />
            <MetricCard label="Total Trades"
              value={singleResult.metrics.total_trades}
              good={singleResult.metrics.total_trades > 0} />
          </div>

          <div className="card p-4 text-sm text-ink-400 flex flex-wrap gap-4 anim-up delay-4">
            <span>{singleResult.symbol} · {singleResult.strategy} · {singleResult.period}</span>
            <span>{singleResult.data_bars} bars</span>
            <span>Initial: ${singleResult.initial_capital.toLocaleString()} →
              <span className={singleResult.final_capital >= singleResult.initial_capital ? 'text-emerald-400' : 'text-rose-400'}>
                {' '}${singleResult.final_capital.toLocaleString()}
              </span>
            </span>
            {singleResult.news_filter && (
              <span className="text-gold">
                <Shield size={12} className="inline mr-1" />{singleResult.blackout_days} news days excluded
              </span>
            )}
          </div>

          <EquityAndTrades
            symbol={singleResult.symbol}
            strategyLabel={STRATEGIES.find(s => s.key === singleResult.strategy)?.label || singleResult.strategy}
            initialCapital={singleResult.initial_capital}
            equityCurve={singleResult.equity_curve}
            trades={singleResult.trades}
          />
        </>
      )}

      {/* ── Universe Rankings ──────────────────────────────────────────────────── */}
      {mode === 'universe' && universeResult && (
        <>
          {universeResult.status === 'computing' ? (
            <div className="card p-6 text-center anim-up delay-2">
              <RefreshCw size={32} className="animate-spin text-gold mx-auto mb-3" />
              <p className="font-semibold text-ink-50">Universe analysis computing in background…</p>
              <p className="text-ink-400 text-sm mt-1">{universeResult.message}</p>
              <p className="text-ink-500 text-xs mt-2">Auto-refreshing every 30s</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header */}
              <div className="card-surface2 p-6 anim-up delay-2">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-bold text-ink-50 flex items-center gap-2">
                    <Shield size={18} className="text-gold" /> Global Strategy Rankings
                  </h2>
                  <span className="text-xs text-ink-500">
                    {universeResult.symbols_tested} symbols · {universeResult.period} · computed {formatTradeDate(universeResult.computed_at?.slice(0,10))}
                  </span>
                </div>
                <p className="text-sm text-ink-400 mb-4">
                  All 8 ICT/SMC strategies tested across US stocks, Indian blue chips, Forex, Crypto, and Commodities.
                  Ranked by average Sharpe ratio across all {universeResult.symbols_tested} symbols.
                </p>

                {/* Top 3 banner */}
                {universeResult.top_strategies?.length > 0 && (
                  <div className="flex flex-wrap gap-3 mb-5">
                    {universeResult.top_strategies.map((s, i) => (
                      <div key={s} className={`px-4 py-2 rounded-xl border flex items-center gap-2 ${
                        i === 0 ? 'bg-gold/10 border-gold/50 text-gold'
                        : i === 1 ? 'bg-gray-400/10 border-gray-400/50 text-ink-300'
                        : 'bg-orange-600/10 border-orange-600/50 text-orange-300'
                      }`}>
                        <span className="font-bold">{['🥇','🥈','🥉'][i]}</span>
                        <span className="text-sm font-semibold">
                          {STRATEGIES.find(x => x.key === s)?.label || s}
                        </span>
                      </div>
                    ))}
                    <div className="text-xs text-ink-500 flex items-center">← Live signals use these strategies</div>
                  </div>
                )}

                {/* Strategy rankings table */}
                <div className="space-y-2">
                  {universeResult.global_rankings.map((r) => {
                    const isExpanded = expandedUniverseStrategy === r.strategy
                    const strat = STRATEGIES.find(s => s.key === r.strategy)
                    const isTop = universeResult.top_strategies?.includes(r.strategy)
                    return (
                      <div key={r.strategy}
                           className={`rounded-xl border overflow-hidden ${
                             isTop ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-gray-700 bg-gray-800/60'
                           }`}>
                        <button
                          onClick={() => setExpandedUniverseStrategy(isExpanded ? null : r.strategy)}
                          className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-700/30 transition"
                        >
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            r.rank === 1 ? 'bg-gold text-black'
                            : r.rank === 2 ? 'bg-gray-400 text-black'
                            : r.rank === 3 ? 'bg-orange-600 text-white'
                            : 'bg-gray-700 text-ink-300'
                          }`}>{r.rank}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span>{strat?.icon || '📊'}</span>
                              <span className="font-semibold text-ink-50 text-sm">{strat?.label || r.strategy}</span>
                              {isTop && <span className="text-emerald-400 text-xs px-1.5 py-0.5 bg-emerald-400/10 rounded">Top Strategy</span>}
                            </div>
                          </div>
                          <div className="hidden md:flex items-center gap-6 text-xs">
                            <div className="text-center">
                              <div className="text-ink-500">Avg Sharpe</div>
                              <div className={`font-bold ${r.avg_sharpe >= 1 ? 'text-emerald-400' : r.avg_sharpe >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                                {r.avg_sharpe.toFixed(3)}
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-ink-500">Avg Return</div>
                              <div className={`font-bold ${r.avg_return_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {r.avg_return_pct >= 0 ? '+' : ''}{r.avg_return_pct.toFixed(1)}%
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-ink-500">Avg Win%</div>
                              <div className={`font-bold ${r.avg_win_rate >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {r.avg_win_rate.toFixed(1)}%
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-ink-500">Symbols</div>
                              <div className="font-bold text-ink-50">{r.symbols_tested}</div>
                            </div>
                          </div>
                          {isExpanded ? <ChevronUp size={14} className="text-ink-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-ink-400 flex-shrink-0" />}
                        </button>

                        {/* Expanded: per-symbol breakdown */}
                        {isExpanded && r.per_symbol && (
                          <div className="px-4 pb-4 border-t border-gray-700/50">
                            <div className="overflow-x-auto mt-3">
                              <table className="tbl w-full text-xs text-ink-300">
                                <thead>
                                  <tr className="text-ink-500 border-b border-gray-700">
                                    <th className="text-left py-1 px-1">Symbol</th>
                                    <th className="text-left py-1 px-1">Class</th>
                                    <th className="text-right py-1 px-1">Sharpe</th>
                                    <th className="text-right py-1 px-1">Return</th>
                                    <th className="text-right py-1 px-1">Win%</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {[...r.per_symbol].sort((a, b) => b.sharpe - a.sharpe).map((ps) => (
                                    <tr key={ps.symbol} className="border-b border-gray-700/40 hover:bg-gray-700/20">
                                      <td className="py-1 px-1 font-medium text-ink-50">{ps.symbol}</td>
                                      <td className="py-1 px-1 text-ink-500">{ps.asset_class}</td>
                                      <td className={`py-1 px-1 text-right ${ps.sharpe >= 1 ? 'text-emerald-400' : ps.sharpe >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                                        {ps.sharpe.toFixed(3)}
                                      </td>
                                      <td className={`py-1 px-1 text-right ${ps.return_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {ps.return_pct >= 0 ? '+' : ''}{ps.return_pct.toFixed(1)}%
                                      </td>
                                      <td className="py-1 px-1 text-right text-ink-400">
                                        {(ps as any).win_rate?.toFixed(1) ?? '—'}%
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Per-symbol best strategy table */}
              {universeResult.per_symbol_best?.length > 0 && (
                <div className="card-box p-6 anim-up delay-3">
                  <h3 className="text-base font-bold text-ink-50 mb-4">Best Strategy Per Symbol</h3>
                  <div className="overflow-x-auto">
                    <table className="tbl w-full text-xs text-ink-300">
                      <thead>
                        <tr className="text-ink-500 border-b border-gray-700">
                          <th className="text-left py-2 px-2">Symbol</th>
                          <th className="text-left py-2 px-2">Class</th>
                          <th className="text-left py-2 px-2">Best Strategy</th>
                          <th className="text-right py-2 px-2">Sharpe</th>
                          <th className="text-right py-2 px-2">Return (5Y)</th>
                          <th className="text-right py-2 px-2">Live Signal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {universeResult.per_symbol_best.map((pb) => (
                          <tr key={pb.symbol} className="border-b border-gray-700/40 hover:bg-gray-700/20">
                            <td className="py-2 px-2 font-bold text-ink-50">{pb.symbol}</td>
                            <td className="py-2 px-2 text-ink-500">{pb.asset_class}</td>
                            <td className="py-2 px-2 text-gold">
                              {STRATEGIES.find(s => s.key === pb.best_strategy)?.icon || '📊'}{' '}
                              {STRATEGIES.find(s => s.key === pb.best_strategy)?.label || pb.best_strategy}
                            </td>
                            <td className={`py-2 px-2 text-right ${pb.sharpe >= 1 ? 'text-emerald-400' : pb.sharpe >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                              {pb.sharpe.toFixed(3)}
                            </td>
                            <td className={`py-2 px-2 text-right ${pb.return_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {pb.return_pct >= 0 ? '+' : ''}{pb.return_pct.toFixed(1)}%
                            </td>
                            <td className="py-2 px-2 text-right">
                              <button
                                onClick={() => { setSymbol(pb.symbol); setMode('leaderboard'); }}
                                className="text-xs text-gold hover:text-gold underline"
                              >
                                Backtest →
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Shared Equity Curve + Trade Log Component ────────────────────────────────

function EquityAndTrades({ symbol, strategyLabel, initialCapital, equityCurve, trades }: {
  symbol: string
  strategyLabel: string
  initialCapital: number
  equityCurve: EquityPoint[]
  trades: Trade[]
}) {
  return (
    <>
      {equityCurve.length > 0 && (
        <div className="card-accent card p-5 anim-up delay-4">
          <div className="section-rule">
            <h2 className="font-display text-ink-50 flex items-center gap-2">
              <TrendingUp size={16} className="text-gold" />
              Equity Curve — {symbol} · {strategyLabel}
            </h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={equityCurve}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(55,65,81,0.4)" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={(v) => formatTradeDate(v)} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
              <Tooltip
                contentStyle={{ background: '#1f2937', border: '1px solid #374151', color: '#f3f4f6' }}
                formatter={(v: number) => [`$${v.toLocaleString()}`, 'Equity']}
              />
              <ReferenceLine y={initialCapital} stroke="#6b7280" strokeDasharray="4 4" label={{ value: 'Start', fill: '#9ca3af', fontSize: 10 }} />
              <Line type="monotone" dataKey="equity" stroke="#3b82f6" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {trades.length > 0 && (
        <div className="card-accent card p-5 anim-up delay-5">
          <div className="section-rule">
            <h2 className="font-display text-ink-50 flex items-center gap-2">
              <TrendingDown size={16} className="text-gold" />
              Trade Log ({trades.length} trades shown)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="tbl w-full text-xs text-ink-300">
              <thead>
                <tr className="border-b border-gray-700 text-ink-500 text-left">
                  <th className="pb-2">Entry</th>
                  <th className="pb-2">Exit</th>
                  <th className="pb-2">Side</th>
                  <th className="pb-2 text-right">Entry $</th>
                  <th className="pb-2 text-right">Exit $</th>
                  <th className="pb-2 text-right">P&L $</th>
                  <th className="pb-2 text-right">P&L %</th>
                  <th className="pb-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {[...trades].reverse().slice(0, 50).map((t, i) => (
                  <tr key={i} className="border-b border-gray-700/40 hover:bg-gray-700/20">
                    <td className="py-1.5">{formatTradeDate(t.entry_date)}</td>
                    <td className="py-1.5">{formatTradeDate(t.exit_date)}</td>
                    <td className="py-1.5">
                      <span className={`px-1.5 py-0.5 rounded font-bold ${
                        t.side === 'LONG' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                      }`}>{t.side}</span>
                    </td>
                    <td className="py-1.5 text-right">{t.entry.toFixed(2)}</td>
                    <td className="py-1.5 text-right">{t.exit.toFixed(2)}</td>
                    <td className={`py-1.5 text-right font-medium ${t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                    </td>
                    <td className={`py-1.5 text-right ${t.pnl_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {t.pnl_pct >= 0 ? '+' : ''}{t.pnl_pct.toFixed(2)}%
                    </td>
                    <td className="py-1.5 text-ink-500">
                      <span className={`px-1 rounded text-xs ${
                        t.exit_reason === 'TP' ? 'text-emerald-500' :
                        t.exit_reason === 'SL' ? 'text-rose-500' :
                        'text-ink-500'
                      }`}>{t.exit_reason}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
