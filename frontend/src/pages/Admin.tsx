import React, { useEffect, useRef, useState } from 'react'
import { Shield, Users, Cpu, BarChart3, RefreshCw, PlayCircle, CheckCircle2, Trash2, ToggleLeft, ToggleRight, Eye, EyeOff, Zap, Filter } from 'lucide-react'
import toast from 'react-hot-toast'
import { pageEnter, staggerItems } from '@/utils/animations'
import {
  adminService, AdminUser, ModelOverview, SystemStats, AdminSignal,
} from '@/services/adminService'
import SEO from '@/components/SEO'
import { formatTradeDate, formatLocalDate } from '@/utils/timezone'

function Section({ title, icon, className, children }: { title: string; icon?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className={`card ${className ?? ''}`}>
      <h2 className="section-eyebrow font-display text-ink-100 mb-4 flex items-center gap-2">{icon}{title}</h2>
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
  const [signals, setSignals] = useState<AdminSignal[] | null>(null)
  const [signalsTotal, setSignalsTotal] = useState(0)
  const [signalFilter, setSignalFilter] = useState<string>('')
  const mainRef = useRef<HTMLDivElement>(null)
  const statsRef = useRef<HTMLDivElement>(null)
  const modelsRef = useRef<HTMLDivElement>(null)
  const usersRef = useRef<HTMLDivElement>(null)

  // GSAP: page entrance
  useEffect(() => { pageEnter(mainRef.current) }, [])

  // GSAP: stagger stats cards
  useEffect(() => {
    if (!statsRef.current) return
    const cards = statsRef.current.children
    staggerItems(cards, { stagger: 0.06, y: 15 })
  }, [stats])

  const refresh = async () => {
    setErr(null)
    try {
      const [s, u, m, sig] = await Promise.all([
        adminService.stats(),
        adminService.listUsers(),
        adminService.modelsOverview(),
        adminService.listSignals({ limit: 100, ...(signalFilter ? { outcome: signalFilter } : {}) }),
      ])
      setStats(s); setUsers(u.users); setModels(m.models)
      setSignals(sig.signals); setSignalsTotal(sig.total)
    } catch (e: any) {
      setErr(e.response?.data?.detail || e.message)
    }
  }

  const refreshSignals = async () => {
    try {
      const sig = await adminService.listSignals({ limit: 100, ...(signalFilter ? { outcome: signalFilter } : {}) })
      setSignals(sig.signals); setSignalsTotal(sig.total)
    } catch {}
  }

  useEffect(() => { refresh() }, [])
  useEffect(() => { refreshSignals() }, [signalFilter])

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

  const toggleHideSignal = async (id: number) => {
    try {
      await adminService.toggleHideSignal(id)
      toast.success('Signal visibility updated')
      refreshSignals()
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed')
    }
  }

  const deleteSignal = async (id: number, symbol: string) => {
    if (!confirm(`Permanently delete ${symbol} signal #${id}?`)) return
    try {
      await adminService.deleteSignal(id)
      toast.success('Signal deleted')
      refreshSignals()
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed')
    }
  }

  return (
    <div ref={mainRef} className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <SEO
        title="Admin Dashboard"
        description="FinSight admin panel for managing users, ML models, and system performance."
        noindex
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'FinSight Admin Dashboard',
        }}
      />
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-ink-100 flex items-center gap-2 font-display">
          <Shield size={28} className="text-gold" /> Admin Dashboard
        </h1>
        <button onClick={refresh} className="btn-accent">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {err && <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-300">{err}</div>}

      {/* Stats */}
      <div ref={statsRef} className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Section title="Users" icon={<Users size={18} className="text-gold" />} className="card-accent card-surface2 p-5">
          {stats === null ? <span className="text-ink-500 text-sm">Loading…</span> : (
            <>
              <p className="text-3xl font-bold text-ink-100 font-mono">{stats.users.total}</p>
              <p className="text-xs text-gold">{stats.users.active} active</p>
            </>
          )}
        </Section>
        <Section title="Portfolios" icon={<BarChart3 size={18} className="text-gold" />}>
          {stats === null ? <span className="text-ink-500 text-sm">Loading…</span> : (
            <p className="text-3xl font-bold text-ink-100 font-mono">{stats.portfolios}</p>
          )}
        </Section>
        <Section title="Predictions Logged" icon={<Cpu size={18} className="text-gold" />}>
          {stats === null ? <span className="text-ink-500 text-sm">Loading…</span> : (
              <p className="text-3xl font-bold text-ink-100 font-mono">{stats.predictions_logged}</p>
          )}
        </Section>
        <Section title="Models Trained" icon={<CheckCircle2 size={18} className="text-gold" />}>
          {stats === null ? <span className="text-ink-500 text-sm">Loading…</span> : (
            <>
              <p className="text-3xl font-bold text-ink-100 font-mono">{stats.ml_models.symbols_trained}/{stats.ml_models.symbols_supported}</p>
              <p className="text-xs text-ink-400">symbols</p>
            </>
          )}
        </Section>
      </div>

      {/* Models */}
      <div ref={modelsRef}>
      <Section title="Model Performance" icon={<Cpu size={18} className="text-gold" />} className="card-accent card p-5">
        {models === null ? <div className="text-ink-500 text-sm">Loading…</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink-400 border-b border-ink-700">
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
                    <tr key={m.symbol} className="border-b border-ink-700">
                      <td className="py-2 px-2 text-ink-100 font-medium">{m.symbol}</td>
                      <td className="py-2 px-2 text-center">{m.lstm.trained ? '✅' : '—'}</td>
                      <td className="py-2 px-2 text-right text-ink-300">{lm?.rmse?.toFixed(2) ?? '-'}</td>
                      <td className="py-2 px-2 text-right text-ink-300">{lm?.r2_score?.toFixed(3) ?? '-'}</td>
                      <td className="py-2 px-2 text-right text-ink-300">{lm?.mape?.toFixed(2) ?? '-'}%</td>
                      <td className="py-2 px-2 text-center">{m.xgb.trained ? '✅' : '—'}</td>
                      <td className="py-2 px-2 text-right text-ink-300">{xm?.rmse?.toFixed(2) ?? '-'}</td>
                      <td className="py-2 px-2 text-right text-ink-300">{xm?.r2_score?.toFixed(3) ?? '-'}</td>
                      <td className="py-2 px-2 text-right text-xs text-ink-500">
                        {trainedAt ? formatTradeDate(trainedAt) : '-'}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <button
                          onClick={() => retrain(m.symbol, 'both')}
                          disabled={busy === `${m.symbol}:both`}
                          className="text-xs px-2 py-1 bg-gold hover:bg-gold-2 disabled:opacity-50 rounded text-black inline-flex items-center gap-1"
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
      <div ref={usersRef}>
      <Section title="User Management" icon={<Users size={18} className="text-gold" />} className="card p-5">
        {users === null ? <div className="text-ink-500 text-sm">Loading…</div> : (
          <div className="overflow-x-auto">
            <table className="tbl w-full text-sm">
              <thead>
                <tr className="text-ink-400 border-b border-ink-700">
                  <th className="text-left py-2 px-2">ID</th>
                  <th className="text-left py-2 px-2">Username</th>
                  <th className="text-left py-2 px-2">Email</th>
                  <th className="text-center py-2 px-2">Role</th>
                  <th className="text-center py-2 px-2">Active</th>
                  <th className="text-left py-2 px-2">Joined</th>
                  <th className="text-right py-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-ink-700">
                    <td className="py-2 px-2 text-ink-400">{u.id}</td>
                    <td className="py-2 px-2 text-ink-100">{u.username}</td>
                    <td className="py-2 px-2 text-ink-300">{u.email}</td>
                    <td className="py-2 px-2 text-center">
                      {u.is_admin ? (
                        <span className="badge-neutral">Admin</span>
                      ) : (
                        <span className="badge-info">User</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-center">{u.is_active ? '✓' : '✗'}</td>
                    <td className="py-2 px-2 text-xs text-ink-500">{u.created_at ? formatLocalDate(u.created_at) : '-'}</td>
                    <td className="py-2 px-2 text-right space-x-2">
                      <button onClick={() => toggleUser(u.id)} className="text-ink-400 hover:text-ink-100">
                        {u.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      </button>
                      <button onClick={() => deleteUser(u.id, u.email)} className="text-gold hover:text-gold-2">
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

      {/* Signal Management */}
      <div>
      <Section title="Signal Management" icon={<Zap size={18} className="text-gold" />} className="card-accent card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-400">{signalsTotal} total signals</span>
            <div className="flex items-center gap-1">
              <Filter size={12} className="text-ink-400" />
              <select
                value={signalFilter}
                onChange={(e) => setSignalFilter(e.target.value)}
                className="text-xs bg-[var(--raised)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text)] outline-none"
              >
                <option value="">All</option>
                <option value="PENDING">Pending</option>
                <option value="TP_HIT">TP Hit</option>
                <option value="SL_HIT">SL Hit</option>
                <option value="EXPIRED">Expired</option>
              </select>
            </div>
          </div>
          <button onClick={refreshSignals} className="text-xs text-ink-400 hover:text-ink-100 flex items-center gap-1">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
        {signals === null ? <div className="text-ink-500 text-sm">Loading…</div> : (
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="tbl w-full text-sm">
              <thead>
                <tr className="text-ink-400 border-b border-ink-700">
                  <th className="text-left py-2 px-2">ID</th>
                  <th className="text-left py-2 px-2">Symbol</th>
                  <th className="text-center py-2 px-2">Signal</th>
                  <th className="text-right py-2 px-2">Entry</th>
                  <th className="text-right py-2 px-2">SL</th>
                  <th className="text-right py-2 px-2">TP</th>
                  <th className="text-right py-2 px-2">Confidence</th>
                  <th className="text-center py-2 px-2">Outcome</th>
                  <th className="text-center py-2 px-2">Hidden</th>
                  <th className="text-right py-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((s) => (
                  <tr key={s.id} className={`border-b border-ink-700 ${s.is_hidden ? 'opacity-50' : ''}`}>
                    <td className="py-2 px-2 text-ink-400 text-xs">{s.id}</td>
                    <td className="py-2 px-2 text-ink-100 font-medium">{s.symbol}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        s.signal === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>{s.signal}</span>
                    </td>
                    <td className="py-2 px-2 text-right text-ink-300 font-mono text-xs">{s.entry?.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right text-red-400 font-mono text-xs">{s.sl?.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right text-emerald-400 font-mono text-xs">{s.tp?.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right text-ink-300 text-xs">{s.confidence?.toFixed(0)}%</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        s.outcome === 'PENDING' ? 'bg-yellow-500/20 text-yellow-400' :
                        s.outcome === 'TP_HIT' ? 'bg-emerald-500/20 text-emerald-400' :
                        s.outcome === 'SL_HIT' ? 'bg-red-500/20 text-red-400' :
                        'bg-white/10 text-white/50'
                      }`}>{s.outcome}</span>
                    </td>
                    <td className="py-2 px-2 text-center">
                      {s.is_hidden ? <EyeOff size={14} className="text-red-400 mx-auto" /> : <Eye size={14} className="text-ink-400 mx-auto" />}
                    </td>
                    <td className="py-2 px-2 text-right space-x-2">
                      <button
                        onClick={() => toggleHideSignal(s.id)}
                        className="text-ink-400 hover:text-gold transition-colors"
                        title={s.is_hidden ? 'Unhide from main site' : 'Hide from main site'}
                      >
                        {s.is_hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <button
                        onClick={() => deleteSignal(s.id, s.symbol)}
                        className="text-ink-400 hover:text-red-400 transition-colors"
                        title="Delete signal"
                      >
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
