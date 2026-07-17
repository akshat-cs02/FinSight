import { useCountUp } from '@/hooks/useCountUp'
import { useScrollAnimation } from '@/hooks/useScrollAnimation'
import { TrendingUp, Activity, BarChart3, Brain } from 'lucide-react'

interface StatItem {
  icon: typeof TrendingUp
  value: number
  prefix?: string
  suffix: string
  label: string
  color: string
}

const stats: StatItem[] = [
  { icon: TrendingUp, value: 15000, suffix: '+', label: 'Markets Covered', color: 'from-gold to-gold-2' },
  { icon: Activity, value: 99, suffix: '%', label: 'Signal Accuracy', color: 'from-gold to-gold-2' },
  { icon: BarChart3, value: 28, suffix: '', prefix: '1:', label: 'Risk-Reward Ratio', color: 'from-gold-2 to-gold-3' },
  { icon: Brain, value: 50, suffix: 'ms', label: 'Prediction Latency', color: 'from-gold to-gold-2' },
]

function StatCard({ item, index }: { item: StatItem; index: number }) {
  const ref = useScrollAnimation('fadeUp', { delay: index * 0.1, stagger: 0 })
  const countRef = useCountUp(item.value, {
    duration: 2.2,
    suffix: item.suffix,
    prefix: item.prefix || '',
    start: 'top 85%',
  })
  const Icon = item.icon

  return (
    <div
      ref={ref}
      className="group relative"
    >
      <div className="relative overflow-hidden rounded-2xl border border-gold/10 bg-gradient-to-br from-[#1a1a1a]/80 to-[#222222]/80 backdrop-blur-xl p-6 transition-all duration-500 hover:border-gold/20 hover:shadow-glow-gold">
        <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} mb-4 shadow-lg`}>
          <Icon size={20} className="text-black" />
        </div>

        <div className="text-3xl md:text-4xl font-bold font-display text-white tracking-tight mb-1">
          <span ref={countRef}>0</span>
        </div>

        <div className="text-sm text-ink-400 font-medium">{item.label}</div>

        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
      </div>
    </div>
  )
}

export default function StatsCounter() {
  return (
    <section className="relative py-20 px-4">
      <div className="text-center mb-12">
        <span className="inline-block text-xs font-semibold uppercase tracking-[0.15em] text-gold bg-gold/10 px-4 py-1.5 rounded-full mb-4">
          Platform Stats
        </span>
        <h2 className="text-3xl md:text-4xl font-bold font-display text-white tracking-tight">
          Built for <span className="text-gold">Performance</span>
        </h2>
        <p className="text-ink-400 mt-3 max-w-xl mx-auto text-sm">
          Real-time data processing with sub-50ms latency across global markets
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
        {stats.map((item, i) => (
          <StatCard key={item.label} item={item} index={i} />
        ))}
      </div>
    </section>
  )
}
