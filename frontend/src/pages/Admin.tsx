import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Shield, Users, Cpu, BarChart3, RefreshCw, PlayCircle, CheckCircle2, Trash2, ToggleLeft, ToggleRight, Eye, EyeOff, Zap, Filter, Database, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Plus, Pencil, X, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { pageEnter, staggerItems } from '@/utils/animations'
import {
  adminService, AdminUser, ModelOverview, SystemStats, AdminSignal,
  DbTable, DbTablesResponse, DbTableRowsResponse,
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

/* ═══════════════════════════════════════════════════════════════════════
   Database Explorer — browse any table, search, sort, paginate
   ═══════════════════════════════════════════════════════════════════════ */
function DatabaseExplorer() {
  const [tables, setTables] = useState<DbTable[]>([])
  const [selected, setSelected] = useState<string>('users')
  const [rows, setRows] = useState<Record<string, any>[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [perPage] = useState(50)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<string>('id')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<{ total_tables: number; total_rows: number; activity_7d: { new_users: number; signals_generated: number; predictions_made: number } } | null>(null)
  // CRUD state
  const [showAddModal, setShowAddModal] = useState(false)
  const [newRow, setNewRow] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editRow, setEditRow] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)

  // Load table list + summary on mount
  useEffect(() => {
    adminService.dbTables().then((r) => setTables(r.tables)).catch(() => {})
    adminService.dbSummary().then(setSummary).catch(() => {})
  }, [])

  // Load table rows when selected table, page, search, or sort changes
  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const r = await adminService.dbTableRows(selected, {
        page, per_page: perPage, search: search || undefined,
        sort_by: sortBy || undefined, sort_dir: sortDir,
      })
      setRows(r.rows)
      setColumns(r.columns)
      setTotal(r.total)
      setTotalPages(r.total_pages)
    } catch {} finally {
      setLoading(false)
    }
  }, [selected, page, perPage, search, sortBy, sortDir])

  useEffect(() => { loadRows() }, [loadRows])

  // Reset to page 1 when table or search changes
  useEffect(() => { setPage(1) }, [selected, search])

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
  }

  const formatCell = (val: any): string => {
    if (val === null || val === undefined) return '—'
    if (typeof val === 'boolean') return val ? '✓' : '✗'
    if (typeof val === 'number') return val.toLocaleString()
    if (typeof val === 'string' && val.length > 120) return val.slice(0, 120) + '…'
    return String(val)
  }

  const activeTable = tables.find((t) => t.name === selected)

  // ── CRUD helpers ──
  const EDITABLE_COLS = useMemo(() => columns.filter((c) => c !== 'id' && c !== 'created_at' && c !== 'updated_at'), [columns])

  const openAddModal = () => {
    const blank: Record<string, string> = {}
    EDITABLE_COLS.forEach((c) => { blank[c] = '' })
    setNewRow(blank)
    setShowAddModal(true)
  }

  const handleCreate = async () => {
    setSaving(true)
    try {
      const payload: Record<string, any> = {}
      Object.entries(newRow).forEach(([k, v]) => { if (v !== '') payload[k] = v })
      await adminService.dbCreateRow(selected, payload)
      toast.success('Row created!')
      setShowAddModal(false)
      loadRows()
      adminService.dbTables().then((r) => setTables(r.tables)).catch(() => {})
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Create failed')
    } finally { setSaving(false) }
  }

  const startEdit = (row: Record<string, any>) => {
    setEditingId(row.id)
    const mapped: Record<string, string> = {}
    EDITABLE_COLS.forEach((c) => { mapped[c] = row[c] != null ? String(row[c]) : '' })
    setEditRow(mapped)
  }

  const handleUpdate = async () => {
    if (editingId == null) return
    setSaving(true)
    try {
      const payload: Record<string, any> = {}
      Object.entries(editRow).forEach(([k, v]) => { payload[k] = v === '' ? null : v })
      await adminService.dbUpdateRow(selected, editingId, payload)
      toast.success('Row updated!')
      setEditingId(null)
      loadRows()
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Update failed')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm(`Delete row #${id} from ${selected}?`)) return
    setDeleting(id)
    try {
      await adminService.dbDeleteRow(selected, id)
      toast.success('Row deleted!')
      loadRows()
      adminService.dbTables().then((r) => setTables(r.tables)).catch(() => {})
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Delete failed')
    } finally { setDeleting(null) }
  }

  return (
    <Section title="Database Explorer" icon={<Database size={18} className="text-gold" />} className="card-accent card p-5">
      {/* Summary row */}
      {summary && (
        <div className="flex flex-wrap gap-4 mb-4 pb-4 border-b border-ink-700">
          <div className="text-xs text-ink-400">
            <span className="text-ink-100 font-bold font-mono">{summary.total_tables}</span> tables
            <span className="mx-1.5 text-ink-600">·</span>
            <span className="text-ink-100 font-bold font-mono">{summary.total_rows.toLocaleString()}</span> total rows
          </div>
          <div className="flex gap-3 text-xs">
            <span className="text-green-400">+{summary.activity_7d.new_users} users (7d)</span>
            <span className="text-gold">+{summary.activity_7d.signals_generated} signals (7d)</span>
            <span className="text-blue-400">+{summary.activity_7d.predictions_made} predictions (7d)</span>
          </div>
        </div>
      )}

      {/* Table tabs + search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {tables.map((t) => (
            <button
              key={t.name}
              onClick={() => setSelected(t.name)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
                selected === t.name
                  ? 'bg-gold text-black shadow-sm'
                  : 'bg-[var(--raised)] text-[var(--dim)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]'
              }`}
            >
              {t.name.replace(/_/g, ' ')}
              <span className="opacity-60 text-[10px]">({t.rows})</span>
            </button>
          ))}
        </div>
        <div className="relative flex-shrink-0">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rows…"
            className="pl-8 pr-3 py-1.5 text-xs bg-[var(--raised)] border border-[var(--border)] rounded-lg text-[var(--text)] outline-none focus:border-gold/50 w-48"
          />
        </div>
      </div>

      {/* Table info */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-ink-400">
          {activeTable && (
            <>
              <span className="text-ink-100 font-medium">{selected}</span>
              {' '}&middot;{' '}{activeTable.columns.length} columns
              {' '}&middot;{' '}{total.toLocaleString()} rows
              {search && <span className="text-gold"> &middot; filtered</span>}
            </>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setPage((p) => Math.max(1, p - 1)) }}
            disabled={page <= 1}
            className="p-1 rounded bg-[var(--raised)] text-ink-400 hover:text-ink-100 disabled:opacity-30"
          ><ChevronLeft size={14} /></button>
          <span className="text-xs text-ink-400 font-mono">
            {page} / {totalPages || 1}
          </span>
          <button
            onClick={() => { setPage((p) => Math.min(totalPages, p + 1)) }}
            disabled={page >= totalPages}
            className="p-1 rounded bg-[var(--raised)] text-ink-400 hover:text-ink-100 disabled:opacity-30"
          ><ChevronRight size={14} /></button>
          <button
            onClick={openAddModal}
            className="ml-2 px-2.5 py-1 bg-gold hover:bg-gold-2 text-black text-xs font-medium rounded-lg inline-flex items-center gap-1 transition-colors"
          ><Plus size={12} /> Add Row</button>
        </div>
      </div>

      {/* Data table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 rounded-full border-2 border-gold/30 border-t-gold animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-ink-500 text-sm">
          {search ? 'No rows match your search' : 'No data in this table'}
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[var(--raised)]">
                {columns.map((col) => (
                  <th
                    key={col}
                    onClick={() => toggleSort(col)}
                    className="text-left py-2.5 px-3 text-ink-400 font-medium whitespace-nowrap cursor-pointer hover:text-ink-100 transition-colors border-b border-ink-700 select-none"
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.replace(/_/g, ' ')}
                      {sortBy === col ? (
                        sortDir === 'asc' ? <ArrowUp size={10} className="text-gold" /> : <ArrowDown size={10} className="text-gold" />
                      ) : (
                        <ArrowUpDown size={10} className="opacity-0 group-hover:opacity-100" />
                      )}
                    </span>
                  </th>
                ))}
                <th className="text-right py-2.5 px-3 text-ink-400 font-medium border-b border-ink-700 w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isEditing = editingId === row.id
                return (
                  <tr key={row.id ?? i} className={`border-b border-ink-700/50 transition-colors ${isEditing ? 'bg-gold/[0.04]' : 'hover:bg-white/[0.02]'}`}>
                    {columns.map((col) => (
                      <td key={col} className="py-2 px-3 text-ink-300 whitespace-nowrap max-w-[250px]">
                        {isEditing && EDITABLE_COLS.includes(col) ? (
                          <input
                            type="text"
                            value={editRow[col] ?? ''}
                            onChange={(e) => setEditRow({ ...editRow, [col]: e.target.value })}
                            className="w-full bg-[var(--raised)] border border-gold/30 rounded px-2 py-1 text-xs text-[var(--text)] outline-none focus:border-gold"
                          />
                        ) : (
                          <span className="truncate block" title={String(row[col] ?? '')}>
                            {formatCell(row[col])}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right">
                      {isEditing ? (
                        <span className="inline-flex gap-1">
                          <button onClick={handleUpdate} disabled={saving} className="text-green-400 hover:text-green-300" title="Save"><Save size={14} /></button>
                          <button onClick={() => setEditingId(null)} className="text-ink-400 hover:text-ink-100" title="Cancel"><X size={14} /></button>
                        </span>
                      ) : (
                        <span className="inline-flex gap-1">
                          <button onClick={() => startEdit(row)} className="text-ink-400 hover:text-gold transition-colors" title="Edit row"><Pencil size={13} /></button>
                          <button onClick={() => handleDelete(row.id)} disabled={deleting === row.id} className="text-ink-400 hover:text-red-400 transition-colors disabled:opacity-30" title="Delete row"><Trash2 size={13} /></button>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* Add Row Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[var(--text)] flex items-center gap-2"><Plus size={18} className="text-gold" /> Add Row to {selected}</h3>
              <button onClick={() => setShowAddModal(false)} className="text-ink-400 hover:text-ink-100"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {EDITABLE_COLS.map((col) => (
                <div key={col}>
                  <label className="block text-xs text-[var(--dim)] mb-1 capitalize">{col.replace(/_/g, ' ')}</label>
                  <input
                    type="text"
                    value={newRow[col] ?? ''}
                    onChange={(e) => setNewRow({ ...newRow, [col]: e.target.value })}
                    placeholder={`Enter ${col.replace(/_/g, ' ')}…`}
                    className="w-full bg-[var(--raised)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-gold/50"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-ink-400 hover:text-ink-100">Cancel</button>
              <button onClick={handleCreate} disabled={saving} className="px-4 py-2 bg-gold hover:bg-gold-2 text-black text-sm font-medium rounded-lg inline-flex items-center gap-1 disabled:opacity-50">
                {saving ? 'Saving…' : <><Save size={14} /> Create</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </Section>
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

      {/* Database Explorer */}
      <DatabaseExplorer />

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
