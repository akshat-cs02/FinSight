import React, { useEffect, useState } from 'react'
import { Shield, Users, Cpu, BarChart3, RefreshCw, PlayCircle, CheckCircle2, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  adminService, AdminUser, ModelOverview, SystemStats,
} from '@/services/adminService'
import { formatTradeDate, formatLocalDate } from '@/utils/timezone'

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass-card p-5">
      <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">{icon}{title}</h2>
      {children}
    </div>
  )
}

export default function AdminPage() {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [models, setModels] = useState<ModelOverview[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = async () => {
    setErr(null)
    try {
      const [s, u, m] = await Promise.all([
        adminService.stats(),
        adminService.listUsers(),
        adminService.modelsOverview(),
      ])
      setStats(s); setUsers(u.users); setModels(m.models)
    } catch (e: any) {
      setErr(e.response?.data?.detail || e.message)
    }
  }

  useEffect(() => { refresh() }, [])

  const toggleUser = async (id: number) => {
    try {
      await adminService.toggleActive(id)
      toast.success('User updated')
      refresh()
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed')
    }
  }

  const deleteUser = async (id: number, email: string) => {
    if (!confirm(`Delete user ${email}? This also deletes their portfolios.`)) return
    try {
      await adminService.deleteUser(id)
      toast.success('Deleted')
      refresh()
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed')
    }
  }

  const retrain = async (symbol: string, kind: 'both' | 'lstm' | 'xgb') => {
    setBusy(`${symbol}:${kind}`)
    try {
      await adminService.retrain(symbol, 6, kind === 'xgb', kind === 'lstm')
      toast.success(`Training started for ${symbol}`)
      // Poll status every 8s × 12
      let tries = 0
      const id = setInterval(async () => {
        tries++
        try {
          const m = await adminService.modelsOverview()
          setModels(m.models)
        } catch {}
        if (tries >= 12) { clearInterval(id); setBusy(null) }
      }, 8000)
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed')
      setBusy(null)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-900 min-h-screen">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white flex items-center gap-2 font-display">
          <Shield size={28} className="text-blue-400" /> Admin ML Dashboard
        </h1>
        <button onClick={refresh} className="flex items-center gap-2 text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg text-white">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {err && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300">{err}</div>}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-spring-up">
        <Section title="Users" icon={<Users size={18} className="text-blue-400" />}>
          {stats === null ? <span className="text-gray-500 text-sm">Loading…</span> : (
            <>
              <p className="text-3xl font-bold text-white font-mono">{stats.users.total}</p>
              <p className="text-xs text-emerald-400">{stats.users.active} active</p>
            </>
          )}
        </Section>
        <Section title="Portfolios" icon={<BarChart3 size={18} className="text-emerald-400" />}>
          {stats === null ? <span className="text-gray-500 text-sm">Loading…</span> : (
            <p className="text-3xl font-bold text-white font-mono">{stats.portfolios}</p>
          )}
        </Section>
        <Section title="Predictions Logged" icon={<Cpu size={18} className="text-purple-400" />}>
          {stats === null ? <span className="text-gray-500 text-sm">Loading…</span> : (
              <p className="text-3xl font-bold text-white font-mono">{stats.predictions_logged}</p>
          )}
        </Section>
        <Section title="Models Trained" icon={<CheckCircle2 size={18} className="text-yellow-400" />}>
          {stats === null ? <span className="text-gray-500 text-sm">Loading…</span> : (
            <>
              <p className="text-3xl font-bold text-white font-mono">{stats.ml_models.symbols_trained}/{stats.ml_models.symbols_supported}</p>
              <p className="text-xs text-gray-400">symbols</p>
            </>
          )}
        </Section>
      </div>

      {/* Models */}
      <div className="animate-spring-up stagger-2">
      <Section title="Model Performance" icon={<Cpu size={18} className="text-blue-400" />}>
        {models === null ? <div className="text-gray-500 text-sm">Loading…</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-2 px-2">Symbol</th>
                  <th className="text-center py-2 px-2">LSTM</th>
                  <th className="text-right py-2 px-2">LSTM RMSE</th>
                  <th className="text-right py-2 px-2">LSTM R²</th>
                  <th className="text-right py-2 px-2">LSTM MAPE</th>
                  <th className="text-center py-2 px-2">XGB</th>
                  <th className="text-right py-2 px-2">XGB RMSE</th>
                  <th className="text-right py-2 px-2">XGB R²</th>
                  <th className="text-right py-2 px-2">Trained</th>
                  <th className="text-right py-2 px-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => {
                  const lm = m.lstm.meta?.metrics
                  const xm = m.xgb.meta?.metrics
                  const trainedAt = m.lstm.meta?.trained_at || m.xgb.meta?.trained_at
                  return (
                    <tr key={m.symbol} className="border-b border-gray-700">
                      <td className="py-2 px-2 text-white font-medium">{m.symbol}</td>
                      <td className="py-2 px-2 text-center">{m.lstm.trained ? '✅' : '—'}</td>
                      <td className="py-2 px-2 text-right text-gray-300">{lm?.rmse?.toFixed(2) ?? '-'}</td>
                      <td className="py-2 px-2 text-right text-gray-300">{lm?.r2_score?.toFixed(3) ?? '-'}</td>
                      <td className="py-2 px-2 text-right text-gray-300">{lm?.mape?.toFixed(2) ?? '-'}%</td>
                      <td className="py-2 px-2 text-center">{m.xgb.trained ? '✅' : '—'}</td>
                      <td className="py-2 px-2 text-right text-gray-300">{xm?.rmse?.toFixed(2) ?? '-'}</td>
                      <td className="py-2 px-2 text-right text-gray-300">{xm?.r2_score?.toFixed(3) ?? '-'}</td>
                      <td className="py-2 px-2 text-right text-xs text-gray-500">
                        {trainedAt ? formatTradeDate(trainedAt) : '-'}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <button
                          onClick={() => retrain(m.symbol, 'both')}
                          disabled={busy === `${m.symbol}:both`}
                          className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-white inline-flex items-center gap-1"
                        >
                          <PlayCircle size={11} /> {busy === `${m.symbol}:both` ? 'Training…' : 'Retrain'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      </div>

      {/* Users */}
      <div className="animate-spring-up stagger-3">
      <Section title="User Management" icon={<Users size={18} className="text-emerald-400" />}>
        {users === null ? <div className="text-gray-500 text-sm">Loading…</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-2 px-2">ID</th>
                  <th className="text-left py-2 px-2">Username</th>
                  <th className="text-left py-2 px-2">Email</th>
                  <th className="text-center py-2 px-2">Admin</th>
                  <th className="text-center py-2 px-2">Active</th>
                  <th className="text-left py-2 px-2">Joined</th>
                  <th className="text-right py-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-700">
                    <td className="py-2 px-2 text-gray-400">{u.id}</td>
                    <td className="py-2 px-2 text-white">{u.username}</td>
                    <td className="py-2 px-2 text-gray-300">{u.email}</td>
                    <td className="py-2 px-2 text-center">{u.is_admin ? '👑' : '—'}</td>
                    <td className="py-2 px-2 text-center">{u.is_active ? '✓' : '✗'}</td>
                    <td className="py-2 px-2 text-xs text-gray-500">{u.created_at ? formatLocalDate(u.created_at) : '-'}</td>
                    <td className="py-2 px-2 text-right space-x-2">
                      <button onClick={() => toggleUser(u.id)} className="text-gray-400 hover:text-white">
                        {u.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      </button>
                      <button onClick={() => deleteUser(u.id, u.email)} className="text-red-400 hover:text-red-300">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      </div>
    </div>
  )
}
