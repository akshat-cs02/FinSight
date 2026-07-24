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
    <div className="bg-[var(--raised)] rounded-xl p-3 text-center border border-[var(--border)]">
      <div className="text-xl font-bold text-[var(--text)]">{value}</div>
      <div className="text-xs text-[var(--dim)] mt-0.5">{label}</div>
      {sub && <div className="text-xs text-[var(--faint)] mt-0.5">{sub}</div>}
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
    <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart2 size={18} className="text-gold" />
          <h2 className="text-lg font-semibold text-[var(--text)]">My Signal Performance</h2>
        </div>
        <div className="flex gap-1 bg-[var(--raised)] rounded-lg p-0.5">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setDays(t.value)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-300 ${
                days === t.value ? 'bg-gold text-black' : 'text-[var(--dim)] hover:text-[var(--text)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !stats && (
        <div className="h-40 flex items-center justify-center text-[var(--faint)] text-sm">Loading...</div>
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
              <div className="text-xs text-[var(--dim)] mb-2 flex items-center gap-1">
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
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'rgba(128,128,128,0.4)' }} />
                  <YAxis tick={{ fontSize: 9, fill: 'rgba(128,128,128,0.4)' }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text)' }}
                    formatter={(val: number) => [`${val >= 0 ? '+' : ''}${val}R`, 'Cumulative']}
                  />
                  <Area type="monotone" dataKey="cumulative" stroke="#D4AF37" fill="url(#pnlGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {stats.daily_pnl.length > 1 && (
            <div>
              <div className="text-xs text-[var(--dim)] mb-2">Daily Wins vs Losses</div>
              <ResponsiveContainer width="100%" height={80}>
                <BarChart data={stats.daily_pnl} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'rgba(128,128,128,0.4)' }} />
                  <YAxis tick={{ fontSize: 9, fill: 'rgba(128,128,128,0.4)' }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text)' }}
                  />
                  <Bar dataKey="wins" fill="#10b981" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="losses" fill="#ef4444" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {stats.daily_pnl.length <= 1 && (
            <div className="text-center py-6 text-[var(--faint)] text-sm">
              Not enough data yet — signals will appear here as they generate and resolve.
            </div>
          )}
        </>
      )}
    </div>
  )
}
