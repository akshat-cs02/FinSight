import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import {
  LayoutDashboard, TrendingUp, Briefcase, Newspaper, Settings as SettingsIcon,
  ChevronRight, Brain, Shield, LogOut, BarChart2, Menu,
} from 'lucide-react'

import DashboardPage from '@/pages/Dashboard'
import StockDetailsPage from '@/pages/StockDetails'
import PortfolioPage from '@/pages/Portfolio'
import NewsPage from '@/pages/News'
import PredictionsPage from '@/pages/Predictions'
import AdminPage from '@/pages/Admin'
import BacktestingPage from '@/pages/Backtesting'
import LoginPage from '@/pages/auth/Login'
import RegisterPage from '@/pages/auth/Register'
import SearchBar from '@/components/SearchBar'
import { useAuthStore } from '@/store/authStore'

function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const baseItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: TrendingUp, label: 'Stocks', path: '/stocks' },
    { icon: Brain, label: 'AI Predictions', path: '/predictions' },
    { icon: BarChart2, label: 'Backtesting', path: '/backtesting' },
    { icon: Briefcase, label: 'Portfolio', path: '/portfolio' },
    { icon: Newspaper, label: 'News', path: '/news' },
    { icon: SettingsIcon, label: 'Settings', path: '/settings' },
  ]
  const items = user?.is_admin
    ? [...baseItems.slice(0, -1), { icon: Shield, label: 'Admin', path: '/admin' }, baseItems[baseItems.length - 1]]
    : baseItems

  const isActive = (p: string) => location.pathname === p || location.pathname.startsWith(p + '/')

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={onClose} />
      )}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        bg-gray-800 border-r border-gray-700
        w-64 flex flex-col flex-shrink-0
        transform transition-transform duration-300 ease-in-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static
      `}>
        <div className="p-5 border-b border-gray-700 flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center font-bold text-sm text-white">FS</div>
          <span className="font-bold text-lg text-white">FinSight</span>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {items.map((item) => {
            const Icon = item.icon
            const active = isActive(item.path)
            return (
              <Link key={item.path} to={item.path} onClick={onClose}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
                      active ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                    }`}>
                <Icon size={18} />
                <span className="text-sm font-medium">{item.label}</span>
                {active && <ChevronRight size={14} className="ml-auto" />}
              </Link>
            )
          })}
        </nav>
        <div className="p-4 border-t border-gray-700 text-xs text-gray-500">v1.0.0 · Live data</div>
      </aside>
    </>
  )
}

function Navbar({ onMenuToggle }: { onMenuToggle: () => void }) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  return (
    <nav className="bg-gray-800 border-b border-gray-700 px-3 sm:px-6 py-3 flex justify-between items-center gap-4 flex-shrink-0">
      <button onClick={onMenuToggle} className="lg:hidden text-gray-400 hover:text-white p-1">
        <Menu size={22} />
      </button>
      <SearchBar />
      <div className="flex items-center gap-3">
        {user && (
          <>
            <span className="text-sm text-gray-300 hidden md:inline">
              {user.username} {user.is_admin && <span className="text-yellow-400 text-xs ml-1">ADMIN</span>}
            </span>
            <button onClick={() => { logout(); navigate('/login') }}
                    className="flex items-center gap-1 text-sm text-gray-400 hover:text-red-300 px-2 py-1 rounded">
              <LogOut size={14} /> Logout
            </button>
          </>
        )}
      </div>
    </nav>
  )
}

function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-gray-900 min-h-[calc(100vh-4rem)] lg:min-h-screen">
      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4">Settings</h1>
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4 sm:p-6 text-gray-300 space-y-2">
        <p><b>Signed in as:</b> {user?.email}</p>
        <p><b>Username:</b> {user?.username}</p>
        <p><b>Role:</b> {user?.is_admin ? 'Admin' : 'User'}</p>
        <p><b>Subscription:</b> {user?.subscription_tier}</p>
        <hr className="border-gray-700 my-3" />
        <p><b>API URL:</b> {import.meta.env.VITE_API_URL || 'http://localhost:8000'}</p>
        <p><b>Data Source:</b> Yahoo Finance (live)</p>
        <p><b>Sentiment Engine:</b> VADER + Finance Keyword Lexicon</p>
        <p><b>ML:</b> LSTM + XGBoost ensemble + SHAP explainability</p>
      </div>
    </div>
  )
}

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
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-gray-900/95 backdrop-blur-lg border-t border-gray-700 lg:hidden pb-safe">
      <div className="flex justify-around items-center h-14">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
          return (
            <Link key={item.path} to={item.path}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition ${
                    active ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'
                  }`}>
              <Icon size={18} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function ProtectedLayout({ adminOnly = false }: { adminOnly?: boolean }) {
  const user = useAuthStore((s) => s.user)
  const initialized = useAuthStore((s) => s.initialized)
  const [mobileOpen, setMobileOpen] = useState(false)

  if (!initialized) {
    return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-400">Loading…</div>
  }
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && !user.is_admin) return <Navigate to="/dashboard" replace />

  return (
    <div className="flex h-dvh overflow-hidden bg-gray-900 text-white">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar onMenuToggle={() => setMobileOpen(!mobileOpen)} />
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}

export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap)
  useEffect(() => { bootstrap() }, [])

  return (
    <Router>
      <Toaster position="top-right" toastOptions={{ style: { background: '#1f2937', color: '#fff', border: '1px solid #374151' } }} />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/stocks" element={<StockDetailsPage />} />
          <Route path="/stocks/:symbol" element={<StockDetailsPage />} />
          <Route path="/predictions" element={<PredictionsPage />} />
          <Route path="/backtesting" element={<BacktestingPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route element={<ProtectedLayout adminOnly />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  )
}