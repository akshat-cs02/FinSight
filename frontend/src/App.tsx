import { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Outlet, Link, useLocation, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import {
  LayoutDashboard, TrendingUp, Briefcase, Newspaper, Settings,
  Brain, Shield, BarChart2, Menu, Bell, Command, Search,
  ChevronDown, LogOut, Sparkles, PanelRightClose,
} from 'lucide-react'
import DashboardPage from '@/pages/Dashboard'
import StockDetailsPage from '@/pages/StockDetails'
import PortfolioPage from '@/pages/Portfolio'
import NewsPage from '@/pages/News'
import PredictionsPage from '@/pages/Predictions'
import AdminPage from '@/pages/Admin'
import BacktestingPage from '@/pages/Backtesting'
import SearchBar from '@/components/SearchBar'

type AccentName = 'indigo' | 'emerald' | 'purple' | 'blue' | 'amber' | 'rose' | 'teal' | 'orange' | 'cyan' | 'gray'

interface NavItem {
  icon: typeof LayoutDashboard
  label: string
  path: string
  accent: AccentName
}

const accentColors: Record<AccentName, { activeBg: string; activeDot: string; text: string }> = {
  indigo:  { activeBg: 'bg-indigo-500/10', activeDot: 'bg-indigo-400', text: 'text-indigo-400' },
  emerald: { activeBg: 'bg-emerald-500/10', activeDot: 'bg-emerald-400', text: 'text-emerald-400' },
  purple:  { activeBg: 'bg-purple-500/10', activeDot: 'bg-purple-400', text: 'text-purple-400' },
  blue:    { activeBg: 'bg-blue-500/10', activeDot: 'bg-blue-400', text: 'text-blue-400' },
  amber:   { activeBg: 'bg-amber-500/10', activeDot: 'bg-amber-400', text: 'text-amber-400' },
  rose:    { activeBg: 'bg-rose-500/10', activeDot: 'bg-rose-400', text: 'text-rose-400' },
  teal:    { activeBg: 'bg-teal-500/10', activeDot: 'bg-teal-400', text: 'text-teal-400' },
  orange:  { activeBg: 'bg-orange-500/10', activeDot: 'bg-orange-400', text: 'text-orange-400' },
  cyan:    { activeBg: 'bg-cyan-500/10', activeDot: 'bg-cyan-400', text: 'text-cyan-400' },
  gray:    { activeBg: 'bg-white/[0.06]', activeDot: 'bg-gray-400', text: 'text-gray-400' },
}

const sections: { label: string; items: NavItem[] }[] = [
  {
    label: 'Markets',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard',  path: '/dashboard',   accent: 'indigo' },
      { icon: TrendingUp,      label: 'Stocks',      path: '/stocks',      accent: 'blue' },
      { icon: Brain,           label: 'Predictions',  path: '/predictions', accent: 'purple' },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { icon: BarChart2, label: 'Backtesting', path: '/backtesting', accent: 'teal' },
      { icon: Briefcase, label: 'Portfolio',   path: '/portfolio',   accent: 'emerald' },
    ],
  },
  {
    label: 'General',
    items: [
      { icon: Newspaper, label: 'News',    path: '/news',    accent: 'amber' },
      { icon: Settings,  label: 'Settings', path: '/settings', accent: 'gray' },
      { icon: Shield,    label: 'Admin',    path: '/admin',   accent: 'rose' },
    ],
  },
]

/* ─── Sidebar (floating glass) ─── */
function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const location = useLocation()
  const isActive = (p: string) => location.pathname === p || location.pathname.startsWith(p + '/')

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={onClose} />}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 flex flex-col flex-shrink-0
        transition-all duration-300 ease-out
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        {/* Floating glass panel */}
        <div className="flex-1 flex flex-col m-3 rounded-2xl glass-panel overflow-hidden border border-white/[0.06] shadow-elev-3">
          {/* Logo */}
          <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-white/[0.04]">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-indigo-500/20">
              FS
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-white font-display tracking-tight">FinSight</div>
              <div className="text-[10px] text-ink-500 flex items-center gap-1">
                <span>Pro Workspace</span>
                <ChevronDown size={9} />
              </div>
            </div>
            <button className="w-7 h-7 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-center text-ink-500 hover:text-ink-300 transition-colors">
              <PanelRightClose size={13} />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
            {sections.map((section) => (
              <div key={section.label}>
                <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500/50">
                  {section.label}
                </div>
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon
                    const active = isActive(item.path)
                    const ac = accentColors[item.accent]
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={onClose}
                        className={`
                          group relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium
                          transition-all duration-200
                          ${active ? `${ac.activeBg} text-white` : 'text-ink-400 hover:text-ink-200 hover:bg-white/[0.02]'}
                        `}
                      >
                        {active && (
                          <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full ${ac.activeDot}`} />
                        )}
                        <Icon size={16} className={active ? ac.text : 'text-ink-500 group-hover:text-ink-300'} />
                        <span>{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Profile */}
          <div className="p-3 border-t border-white/[0.04]">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.02] transition cursor-pointer group">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                G
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-ink-300 truncate">Guest</div>
                <div className="text-[10px] text-ink-500">Free Plan</div>
              </div>
              <LogOut size={12} className="text-ink-500 opacity-0 group-hover:opacity-100 transition" />
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

/* ─── Navbar ─── */
function Navbar({ onMenuToggle }: { onMenuToggle: () => void }) {
  return (
    <header className="sticky top-0 z-30 px-3 pt-3 lg:px-4 lg:pt-4">
      <div className="glass-panel rounded-xl px-4 py-2.5 flex items-center justify-between gap-4 shadow-elev-2">
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuToggle}
            className="lg:hidden w-9 h-9 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-center text-ink-400 hover:text-ink-200 transition"
          >
            <Menu size={18} />
          </button>
          <SearchBar />
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-icon relative">
            <Sparkles size={15} />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          </button>
          <button className="btn-icon relative">
            <Bell size={15} />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-400" />
          </button>
        </div>
      </div>
    </header>
  )
}

/* ─── Settings ─── */
function SettingsPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="eyebrow">Settings</div>
      <h1 className="text-display-sm text-white font-display">Preferences</h1>
      <div className="card-surface2 p-5 rounded-xl space-y-3 text-sm">
        <p className="text-ink-400"><span className="text-ink-200 font-medium">Mode:</span> Testing (auth-free)</p>
        <p className="text-ink-400"><span className="text-ink-200 font-medium">API URL:</span> {import.meta.env.VITE_API_URL || 'http://localhost:8000'}</p>
        <p className="text-ink-400"><span className="text-ink-200 font-medium">Data:</span> Yahoo Finance (live)</p>
        <p className="text-ink-400"><span className="text-ink-200 font-medium">Sentiment:</span> VADER + Finance Lexicon</p>
        <p className="text-ink-400"><span className="text-ink-200 font-medium">ML:</span> LSTM + XGBoost + SHAP</p>
      </div>
    </div>
  )
}

/* ─── Bottom Nav (mobile) ─── */
const bottomItems = [
  { icon: LayoutDashboard, label: 'Dashboard',  path: '/dashboard' },
  { icon: TrendingUp,      label: 'Stocks',      path: '/stocks' },
  { icon: Brain,           label: 'Predictions', path: '/predictions' },
  { icon: Briefcase,       label: 'Portfolio',   path: '/portfolio' },
  { icon: Newspaper,       label: 'News',        path: '/news' },
]

function BottomNav() {
  const location = useLocation()
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 glass-panel border-t border-white/[0.04] lg:hidden pb-safe">
      <div className="flex justify-around items-center h-14 px-2">
        {bottomItems.map((item) => {
          const Icon = item.icon
          const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
          return (
            <Link key={item.path} to={item.path}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${
                active ? 'text-ink-100' : 'text-ink-500 hover:text-ink-300'
              }`}
            >
              <Icon size={18} />
              <span className="text-[9px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

/* ─── Layout ─── */
function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-dvh overflow-hidden aurora noise grid-bg">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        <Navbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-4">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}

const toastStyle = {
  style: {
    background: 'rgba(26,34,53,0.9)',
    backdropFilter: 'blur(20px)',
    color: '#E5E7EB',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '0.75rem',
    fontSize: '0.875rem',
  },
}

/* ─── App ─── */
export default function App() {
  return (
    <Router>
      <Toaster position="top-right" toastOptions={toastStyle} />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard"   element={<DashboardPage />} />
          <Route path="/stocks"      element={<StockDetailsPage />} />
          <Route path="/stocks/:symbol" element={<StockDetailsPage />} />
          <Route path="/predictions" element={<PredictionsPage />} />
          <Route path="/backtesting" element={<BacktestingPage />} />
          <Route path="/portfolio"   element={<PortfolioPage />} />
          <Route path="/news"        element={<NewsPage />} />
          <Route path="/admin"       element={<AdminPage />} />
          <Route path="/settings"    element={<SettingsPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  )
}
