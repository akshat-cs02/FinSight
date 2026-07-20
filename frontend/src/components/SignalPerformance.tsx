import React, { useEffect, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import { BarChart2, TrendingUp } from 'lucide-react'
import signalService, { PerformanceStats } from '@/services/signalService'

type Days = 7 | 30 | 90
const TABS: { label: string; value: Days }[] = [
  { label: '7D', value: 7 },
  { label: '30D', value: 30 },
  { label: '3M', value: 90 },
]

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white/[0.03] rounded-xl p-3 text-center border border-white/5">
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-xs text-white/40 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-white/30 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function SignalPerformance() {
  const [days, setDays] = useState<Days>(7)
  const [stats, setStats] = useState<PerformanceStats | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async (d: Days) => {
    setLoading(true)
    try {
      const data = await signalService.getPerformance(d)
      setStats(data)
    } catch {
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(days) }, [days])

  return (
    <div className="bg-[#141414] rounded-xl border border-white/5 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart2 size={18} className="text-gold" />
          <h2 className="text-lg font-semibold text-white">My Signal Performance</h2>
        </div>
        <div className="flex gap-1 bg-white/[0.03] rounded-lg p-0.5">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setDays(t.value)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-300 ${
                days === t.value ? 'bg-gold text-black' : 'text-white/40 hover:text-white/70'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !stats && (
        <div className="h-40 flex items-center justify-center text-white/30 text-sm">Loading...</div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
            <StatCard
              label="Win Rate"
              value={`${stats.win_rate}%`}
              sub={`${stats.tp_hit} TP / ${stats.sl_hit} SL`}
            />
            <StatCard
              label="Total Signals"
              value={stats.total_signals}
              sub={`${stats.pending} pending`}
            />
            <StatCard
              label="TP Hit"
              value={`${stats.tp_hit}`}
              sub={stats.total_signals > 0 ? `${((stats.tp_hit / stats.total_signals) * 100).toFixed(0)}% of total` : '–'}
            />
            <StatCard
              label="Avg R Earned"
              value={stats.avg_pnl_r >= 0 ? `+${stats.avg_pnl_r}R` : `${stats.avg_pnl_r}R`}
              sub="per signal"
            />
            <StatCard
              label="Active Now"
              value={stats.pending}
              sub="in market"
            />
          </div>

          {stats.total_signals > 0 && stats.daily_pnl.length > 1 && (
            <div className="mb-4">
              <div className="text-xs text-white/40 mb-2 flex items-center gap-1">
                <TrendingUp size={11} /> Cumulative P&L (R-multiples)
              </div>
              <ResponsiveContainer width="100%" height={110}>
                <AreaChart data={stats.daily_pnl} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#D4AF37" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} />
                  <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} />
                  <Tooltip
                    contentStyle={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }}
                    formatter={(val: number) => [`${val >= 0 ? '+' : ''}${val}R`, 'Cumulative']}
                  />
                  <Area type="monotone" dataKey="cumulative" stroke="#D4AF37" fill="url(#pnlGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {stats.daily_pnl.length > 1 && (
            <div>
              <div className="text-xs text-white/40 mb-2">Daily Wins vs Losses</div>
              <ResponsiveContainer width="100%" height={80}>
                <BarChart data={stats.daily_pnl} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} />
                  <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} />
                  <Tooltip
                    contentStyle={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }}
                  />
                  <Bar dataKey="wins" fill="#10b981" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="losses" fill="#ef4444" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {stats.daily_pnl.length <= 1 && (
            <div className="text-center py-6 text-white/30 text-sm">
              Not enough data yet — signals will appear here as they generate and resolve.
            </div>
          )}
        </>
      )}
    </div>
  )
}
