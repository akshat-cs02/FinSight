import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  TrendingUp,
  Briefcase,
  Newspaper,
  Settings,
  Shield,
  ChevronRight,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

export default function Sidebar() {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const user = useAuthStore((s) => s.user)

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: TrendingUp, label: 'Stocks', path: '/stocks' },
    { icon: Briefcase, label: 'Portfolio', path: '/portfolio' },
    { icon: Newspaper, label: 'News', path: '/news' },
    // Admin link is shown only to admins.
    ...(user?.is_admin ? [{ icon: Shield, label: 'Admin', path: '/admin' }] : []),
    { icon: Settings, label: 'Settings', path: '/settings' },
  ]

  const isActive = (path: string) => location.pathname.startsWith(path)

  return (
    <aside
      className={`bg-gray-800 border-r border-gray-700 transition-all duration-300 ${
        collapsed ? 'w-20' : 'w-64'
      } h-screen flex flex-col`}
    >
      <div className="p-6 border-b border-gray-700 flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="FinSight" className="w-9 h-9 rounded-lg shadow-md shadow-blue-500/20" />
            <div className="leading-tight">
              <div className="font-bold text-lg text-white tracking-tight">FinSight</div>
              <div className="text-[10px] uppercase tracking-widest text-blue-400 font-medium">AI-Powered</div>
            </div>
          </div>
        )}
        {collapsed && (
          <img src="/logo.svg" alt="FinSight" className="w-9 h-9 rounded-lg mx-auto" />
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-gray-400 hover:text-white transition p-1"
        >
          <ChevronRight size={20} className={`transition-transform ${collapsed ? '' : 'rotate-180'}`} />
        </button>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.path)

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                active
                  ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
              title={item.label}
            >
              <Icon size={20} />
              {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-gray-700">
        {!collapsed && (
          <div className="text-xs text-gray-400 space-y-2">
            <p>Version 1.0.0</p>
            <p>© 2026 FinSight</p>
          </div>
        )}
      </div>
    </aside>
  )
}
