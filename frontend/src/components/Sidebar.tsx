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
      className={`glass-v2 border-r border-gray-700/30 transition-all duration-300 ${
        collapsed ? 'w-20' : 'w-64'
      } h-screen flex flex-col`}
    >
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00F5A0] to-[#00D4FF] flex items-center justify-center font-bold text-sm text-[#060b18] font-display shadow-lg shadow-[#00F5A0]/20">FS</div>
            <div className="leading-tight">
              <div className="font-bold text-lg text-white tracking-tight font-display">FinSight</div>
              <div className="text-[10px] uppercase tracking-widest text-[#00F5A0] font-medium">AI-Powered</div>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00F5A0] to-[#00D4FF] flex items-center justify-center font-bold text-sm text-[#060b18] font-display mx-auto">FS</div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-gray-500 hover:text-white transition p-1"
        >
          <ChevronRight size={20} className={`transition-transform ${collapsed ? '' : 'rotate-180'}`} />
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.path)

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 ${
                active
                  ? 'bg-gradient-to-r from-[#00F5A0]/15 to-[#00D4FF]/10 text-white border border-[#00F5A0]/20 shadow-sm shadow-[#00F5A0]/5'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
              title={item.label}
            >
              <Icon size={18} className={active ? 'text-[#00F5A0]' : ''} />
              {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-white/5">
        {!collapsed && (
          <div className="text-xs text-gray-600 space-y-1">
            <p className="font-mono">v1.0.0</p>
            <p>© 2026 FinSight</p>
          </div>
        )}
      </div>
    </aside>
  )
}
