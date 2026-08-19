import React, { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, RotateCcw, Briefcase } from 'lucide-react'
import signalService, { PaperAccount, PaperPosition } from '@/services/signalService'

function Stat({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-[var(--raised)] rounded-xl p-3 text-center border border-[var(--border)]">
      <div className={`text-xl font-bold ${color || 'text-[var(--text)]'}`}>{value}</div>
      <div className="text-xs text-[var(--dim)] mt-0.5">{label}</div>
      {sub && <div className="text-xs text-[var(--faint)] mt-0.5">{sub}</div>}
    </div>
  )
}

function PositionRow({ pos }: { pos: PaperPosition }) {
  const isBuy = pos.direction === 'BUY'
  const isWin = pos.status === 'CLOSED_TP'
  const isOpen = pos.status === 'OPEN'

  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0 text-sm">
      <div className="flex items-center gap-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isBuy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
          {pos.direction}
        </span>
        <span className="font-medium text-[var(--text)]">{pos.symbol}</span>
      </div>
      <div className="text-right">
        <div className="text-[var(--dim)] text-xs">
          {pos.entry_price.toFixed(2)} → {pos.exit_price?.toFixed(2) || '...'}
        </div>
        <div className={`font-mono text-xs ${isOpen ? 'text-[var(--dim)]' : isWin ? 'text-emerald-400' : 'text-red-400'}`}>
          {isOpen ? 'Open' : `${pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)} (${pos.pnl_percent >= 0 ? '+' : ''}${pos.pnl_percent}%)`}
        </div>
      </div>
    </div>
  )
}

export default function PaperTradingDashboard() {
  const [account, setAccount] = useState<PaperAccount | null>(null)
  const [positions, setPositions] = useState<PaperPosition[]>([])
  const [tab, setTab] = useState<'open' | 'history'>('open')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const [acct, pos] = await Promise.all([
        signalService.getPaperAccount(),
        signalService.getPaperPositions(tab === 'open' ? 'OPEN' : undefined),
      ])
      setAccount(acct)
      setPositions(pos)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [tab])

  const handleReset = async () => {
    if (!confirm('Reset paper account to $10,000? All positions will be closed.')) return
    await signalService.resetPaperAccount()
    load()
  }

  if (loading && !account) {
    return (
      <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-5">
        <div className="h-20 flex items-center justify-center text-[var(--faint)] text-sm">Loading paper trading...</div>
      </div>
    )
  }

  return (
    <div className="bg-[var(--panel)] rounded-xl border border-[var(--border)] p-3 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Briefcase size={18} className="text-gold" />
          <h2 className="text-lg font-semibold text-[var(--text)]">Paper Trading</h2>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-[var(--dim)] hover:text-[var(--text)] hover:bg-[var(--raised)] transition-all"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      {account && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2 mb-4">
          <Stat
            label="Balance"
            value={`$${account.balance.toLocaleString()}`}
            sub={`from $${account.initial_balance.toLocaleString()}`}
          />
          <Stat
            label="Total P&L"
            value={`${account.total_pnl >= 0 ? '+' : ''}$${account.total_pnl.toFixed(2)}`}
            sub={`${account.total_pnl_pct >= 0 ? '+' : ''}${account.total_pnl_pct}%`}
            color={account.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}
          />
          <Stat
            label="Win Rate"
            value={`${account.win_rate}%`}
            sub={`${account.wins}W / ${account.losses}L`}
          />
          <Stat
            label="Total Trades"
            value={account.total_trades}
            sub={`${account.open_positions} open`}
          />
          <Stat
            label="Open Positions"
            value={account.open_positions}
            sub="active"
          />
        </div>
      )}

      <div className="flex gap-1 bg-[var(--raised)] rounded-lg p-0.5 mb-3">
        <button
          onClick={() => setTab('open')}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${tab === 'open' ? 'bg-gold text-black' : 'text-[var(--dim)] hover:text-[var(--text)]'}`}
        >
          Open ({positions.filter(p => p.status === 'OPEN').length})
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${tab === 'history' ? 'bg-gold text-black' : 'text-[var(--dim)] hover:text-[var(--text)]'}`}
        >
          History
        </button>
      </div>

      {positions.length === 0 ? (
        <div className="text-center py-6 text-[var(--faint)] text-sm">
          {tab === 'open' ? 'No open positions — trades auto-place when signals generate.' : 'No trade history yet.'}
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          {positions.map(pos => <PositionRow key={pos.id} pos={pos} />)}
        </div>
      )}
    </div>
  )
}
