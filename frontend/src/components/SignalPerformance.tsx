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
    <div className="bg-gray-800/60 rounded-lg p-3 text-center">
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
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
      // keep stale
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(days) }, [days])

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart2 size={18} className="text-indigo-400" />
          <h2 className="text-lg font-semibold text-white">My Signal Performance</h2>
        </div>
        <div className="flex gap-1 bg-gray-800 rounded-lg p-0.5">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setDays(t.value)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                days === t.value ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !stats && (
        <div className="h-40 flex items-center justify-center text-gray-500 text-sm">Loading...</div>
      )}

      {stats && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
            <StatCard
              label="Win Rate"
              value={`${stats.win_rate}%`}
              sub={`${stats.tp_hit} TP / ${stats.sl_hit} SL`}
            />
            <StatCard
              label="Total Signals"
              value={stats.total_signals}
              sub={`${stats.expired} expired`}
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
          </div>

          {/* Cumulative P&L chart */}
          {stats.daily_pnl.length > 1 && (
            <div className="mb-4">
              <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                <TrendingUp size={11} /> Cumulative P&L (R-multiples)
              </div>
              <ResponsiveContainer width="100%" height={110}>
                <AreaChart data={stats.daily_pnl} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6b7280' }} />
                  <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} />
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 6, fontSize: 11 }}
                    formatter={(val: number) => [`${val >= 0 ? '+' : ''}${val}R`, 'Cumulative']}
                  />
                  <Area type="monotone" dataKey="cumulative" stroke="#6366f1" fill="url(#pnlGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Daily wins/losses bar chart */}
          {stats.daily_pnl.length > 1 && (
            <div>
              <div className="text-xs text-gray-500 mb-2">Daily Wins vs Losses</div>
              <ResponsiveContainer width="100%" height={80}>
                <BarChart data={stats.daily_pnl} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6b7280' }} />
                  <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} />
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 6, fontSize: 11 }}
                  />
                  <Bar dataKey="wins" fill="#10b981" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="losses" fill="#ef4444" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {stats.daily_pnl.length <= 1 && (
            <div className="text-center py-6 text-gray-500 text-sm">
              Not enough data yet — signals will appear here as they generate and resolve.
            </div>
          )}
        </>
      )}
    </div>
  )
}
