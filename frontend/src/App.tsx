import { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Outlet, Link, useLocation, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import {
  LayoutDashboard, TrendingUp, Briefcase, Newspaper, Settings,
  ChevronRight, Brain, Shield, BarChart2, Menu, Search, Bell, Command,
  ChevronDown, LogOut, Sparkles,
} from 'lucide-react'

import DashboardPage from '@/pages/Dashboard'
import StockDetailsPage from '@/pages/StockDetails'
import PortfolioPage from '@/pages/Portfolio'
import NewsPage from '@/pages/News'
import PredictionsPage from '@/pages/Predictions'
import AdminPage from '@/pages/Admin'
import BacktestingPage from '@/pages/Backtesting'
import SearchBar from '@/components/SearchBar'

/* ─── Sidebar ─── */
function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const location = useLocation()

  const sections = [
    {
      label: 'Markets',
      items: [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', accent: 'cyan' },
        { icon: TrendingUp, label: 'Stocks', path: '/stocks', accent: 'blue' },
        { icon: Brain, label: 'AI Predictions', path: '/predictions', accent: 'purple' },
      ],
    },
    {
      label: 'Analysis',
      items: [
        { icon: BarChart2, label: 'Backtesting', path: '/backtesting', accent: 'amber' },
        { icon: Briefcase, label: 'Portfolio', path: '/portfolio', accent: 'emerald' },
      ],
    },
    {
      label: 'General',
      items: [
        { icon: Newspaper, label: 'News', path: '/news', accent: 'cyan' },
        { icon: Settings, label: 'Settings', path: '/settings', accent: 'gray' },
        { icon: Shield, label: 'Admin', path: '/admin', accent: 'rose' },
      ],
    },
  ]

  const isActive = (p: string) => location.pathname === p || location.pathname.startsWith(p + '/')

  const accentMap: Record<string, { active: string; dot: string }> = {
    cyan:    { active: 'bg-cyan-500/10 text-white',        dot: 'text-cyan-400' },
    blue:    { active: 'bg-blue-500/10 text-white',        dot: 'text-blue-400' },
    purple:  { active: 'bg-purple-500/10 text-white',      dot: 'text-purple-400' },
    amber:   { active: 'bg-amber-500/10 text-white',       dot: 'text-amber-400' },
    emerald: { active: 'bg-emerald-500/10 text-white',     dot: 'text-emerald-400' },
    rose:    { active: 'bg-rose-500/10 text-white',        dot: 'text-rose-400' },
    gray:    { active: 'bg-white/[0.06] text-white',       dot: 'text-ink-600' },
  }

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={onClose} />
      )}

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        glass-2 border-r border-white/[0.03]
        w-60 flex flex-col flex-shrink-0
        transform transition-all duration-400 ease-out-expo
        ${mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        {/* Logo + Workspace */}
        <div className="px-4 pt-5 pb-4 flex items-center gap-3 border-b border-white/[0.03]">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#3B82F6] to-[#7C3AED] flex items-center justify-center font-bold text-sm text-white shadow-lg shadow-blue-500/20 flex-shrink-0">
            FS
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[15px] text-white font-display tracking-tight">FinSight</div>
            <div className="text-[11px] text-ink-500 flex items-center gap-1">
              <span>Pro Workspace</span>
              <ChevronDown size={10} />
            </div>
          </div>
          <button className="w-7 h-7 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-center text-ink-500 hover:text-ink-700 transition-colors">
            <Command size={13} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
          {sections.map((section) => (
            <div key={section.label}>
              <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500/60">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.path)
                  const accent = accentMap[item.accent] || accentMap.cyan
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={onClose}
                      className={`
                        group relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium
                        transition-all duration-200 ease-out
                        ${active ? accent.active : 'text-ink-500 hover:text-ink-700 hover:bg-white/[0.03]'}
                      `}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-current opacity-60" />
                      )}
                      <Icon size={16} className={`transition-all duration-200 ${active ? accent.dot : 'text-ink-500 group-hover:text-ink-700'}`} />
                      <span>{item.label}</span>
                      {active && <ChevronRight size={12} className={`ml-auto opacity-40`} />}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Profile */}
        <div className="p-3 border-t border-white/[0.03]">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors cursor-pointer group">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
              U
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-ink-700 truncate">Guest User</div>
              <div className="text-[11px] text-ink-500">Free Plan</div>
            </div>
            <LogOut size={13} className="text-ink-500 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </aside>
    </>
  )
}

/* ─── Navbar ─── */
function Navbar({ onMenuToggle }: { onMenuToggle: () => void }) {
  return (
    <header className="sticky top-0 z-30">
      <div className="glass-3 mx-3 mt-2 mb-0 px-4 py-2.5 flex items-center justify-between gap-4 rounded-xl lg:mx-4 lg:mt-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuToggle}
            className="lg:hidden w-9 h-9 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-center text-ink-500 hover:text-ink-700 transition-colors"
          >
            <Menu size={18} />
          </button>
          <SearchBar />
        </div>

        <div className="flex items-center gap-2">
          {/* AI Assistant */}
          <button className="btn-icon relative group">
            <Sparkles size={16} />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          </button>

          {/* Notifications */}
          <button className="btn-icon relative group">
            <Bell size={16} />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-400" />
          </button>
        </div>
      </div>
    </header>
  )
}

/* ─── Settings Page (unchanged logic) ─── */
function SettingsPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-dvh">
      <h1 className="text-display-sm text-white font-display mb-6">Settings</h1>
      <div className="card-layer p-6 rounded-xl text-ink-600 space-y-3 text-sm">
        <p><b className="text-ink-800 font-medium">Mode:</b> Testing (auth-free)</p>
        <p><b className="text-ink-800 font-medium">API URL:</b> {import.meta.env.VITE_API_URL || 'http://localhost:8000'}</p>
        <p><b className="text-ink-800 font-medium">Data Source:</b> Yahoo Finance (live)</p>
        <p><b className="text-ink-800 font-medium">Sentiment Engine:</b> VADER + Finance Keyword Lexicon</p>
        <p><b className="text-ink-800 font-medium">ML:</b> LSTM + XGBoost ensemble + SHAP explainability</p>
      </div>
    </div>
  )
}

/* ─── Bottom Nav (mobile) ─── */
const BOTTOM_NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: TrendingUp, label: 'Stocks', path: '/stocks' },
  { icon: Brain, label: 'Predictions', path: '/predictions' },
  { icon: Briefcase, label: 'Portfolio', path: '/portfolio' },
  { icon: Newspaper, label: 'News', path: '/news' },
]

function BottomNav() {
  const location = useLocation()
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 glass-2 border-t border-white/[0.03] lg:hidden pb-safe">
      <div className="flex justify-around items-center h-14 px-2">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors ${
                active ? 'text-ink-800' : 'text-ink-500 hover:text-ink-600'
              }`}
            >
              <Icon size={18} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

/* ─── Toaster config ─── */
const toastOptions = {
  style: {
    background: 'rgba(19, 27, 46, 0.9)',
    backdropFilter: 'blur(20px)',
    color: '#F1F5F9',
    border: '1px solid rgba(255,255,255,0.04)',
    borderRadius: '0.75rem',
    fontSize: '0.875rem',
  },
}

/* ─── Layout ─── */
function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-dvh overflow-hidden canvas-bg aurora-bg noise-overlay">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        <Navbar onMenuToggle={() => setMobileOpen(!mobileOpen)} />
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}

/* ─── App ─── */
export default function App() {
  return (
    <Router>
      <Toaster position="top-right" toastOptions={toastOptions} />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/stocks" element={<StockDetailsPage />} />
          <Route path="/stocks/:symbol" element={<StockDetailsPage />} />
          <Route path="/predictions" element={<PredictionsPage />} />
          <Route path="/backtesting" element={<BacktestingPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  )
}
