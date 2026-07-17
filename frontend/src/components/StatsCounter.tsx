import { useEffect, useState, useCallback } from 'react'
import { TrendingUp, Activity, BarChart3, Brain, RefreshCw } from 'lucide-react'
import { platformService, type PlatformStats } from '@/services/platformService'
import { useCountUp } from '@/hooks/useCountUp'

interface StatItem {
  icon: typeof TrendingUp
  value: number
  prefix?: string
  suffix: string
  label: string
  color: string
  decimals?: number
}

function StatCard({ item, loading }: { item: StatItem; loading: boolean }) {
  const countRef = useCountUp(item.value, {
    duration: 2.2,
    suffix: item.suffix,
    prefix: item.prefix || '',
    decimals: item.decimals ?? 0,
    start: 'top 85%',
    enabled: !loading,
  })
  const Icon = item.icon

  return (
    <div className="group relative">
      <div className="relative overflow-hidden rounded-2xl border border-gold/10 bg-gradient-to-br from-[#1a1a1a]/80 to-[#222222]/80 backdrop-blur-xl p-6 transition-all duration-500 hover:border-gold/20 hover:shadow-glow-gold">
        <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} mb-4 shadow-lg`}>
          <Icon size={20} className="text-black" />
        </div>

        <div className="text-3xl md:text-4xl font-bold font-display text-white tracking-tight mb-1">
          {loading ? (
            <span className="inline-block w-20 h-8 rounded-md bg-white/5 animate-pulse" />
          ) : (
            <span ref={countRef}>0</span>
          )}
        </div>

        <div className="text-sm text-ink-400 font-medium">{item.label}</div>

        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
      </div>
    </div>
  )
}

export default function StatsCounter() {
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      setError(null)
      const data = await platformService.getStats()
      setStats(data)
    } catch (err: any) {
      setError('Could not load stats')
      console.error('Failed to fetch platform stats:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 60000) // refresh every 60s to reduce API load
    return () => clearInterval(interval)
  }, [fetchStats])

  const items: StatItem[] = stats
    ? [
        { icon: TrendingUp, value: stats.markets_covered, suffix: '', label: 'Markets Covered', color: 'from-gold to-gold-2' },
        { icon: Activity, value: stats.signal_accuracy, suffix: '%', label: 'Signal Accuracy', color: 'from-gold to-gold-2', decimals: 1 },
        { icon: BarChart3, value: stats.risk_reward_ratio, suffix: '', prefix: '1:', label: 'Risk-Reward Ratio', color: 'from-gold-2 to-gold-3', decimals: 2 },
        { icon: Brain, value: stats.prediction_latency, suffix: 'ms', label: 'Prediction Latency', color: 'from-gold to-gold-2' },
      ]
    : [
        { icon: TrendingUp, value: 0, suffix: '', label: 'Markets Covered', color: 'from-gold to-gold-2' },
        { icon: Activity, value: 0, suffix: '%', label: 'Signal Accuracy', color: 'from-gold to-gold-2', decimals: 1 },
        { icon: BarChart3, value: 0, suffix: '', prefix: '1:', label: 'Risk-Reward Ratio', color: 'from-gold-2 to-gold-3', decimals: 2 },
        { icon: Brain, value: 0, suffix: 'ms', label: 'Prediction Latency', color: 'from-gold to-gold-2' },
      ]

  return (
    <section className="relative py-20 px-4">
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <span className="inline-block text-xs font-semibold uppercase tracking-[0.15em] text-gold bg-gold/10 px-4 py-1.5 rounded-full">
            Platform Stats
          </span>
          {error && (
            <button
              onClick={fetchStats}
              className="inline-flex items-center gap-1.5 text-xs text-rose-400/60 hover:text-rose-400 transition-colors"
              title="Retry"
            >
              <RefreshCw size={12} />
              Retry
            </button>
          )}
        </div>
        <h2 className="text-3xl md:text-4xl font-bold font-display text-white tracking-tight">
          Built for <span className="text-gold">Performance</span>
        </h2>
        <p className="text-ink-400 mt-3 max-w-xl mx-auto text-sm">
          {stats
            ? `Real-time data processing with sub-${stats.prediction_latency}ms latency across ${stats.markets_covered}${stats.markets_covered > 100 ? '+' : ''} markets`
            : 'Real-time data processing with sub-50ms latency across global markets'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
        {items.map((item) => (
          <StatCard key={item.label} item={item} loading={loading} />
        ))}
      </div>
    </section>
  )
}
