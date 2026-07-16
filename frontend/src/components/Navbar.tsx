import React, { useEffect, useState } from 'react'
import { Bell, Settings, LogOut, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import watchlistService from '@/services/watchlistService'

export default function Navbar() {
  const navigate = useNavigate()
  const [showMenu, setShowMenu] = useState(false)
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)
  const [alertCount, setAlertCount] = useState(0)

  // Real notification count = live watchlist alerts (existing endpoint).
  useEffect(() => {
    if (!user) return
    let cancelled = false
    const load = () =>
      watchlistService.getAlerts()
        .then((a) => { if (!cancelled) setAlertCount(a.length) })
        .catch(() => {})
    load()
    const id = setInterval(load, 60000)
    return () => { cancelled = true; clearInterval(id) }
  }, [user])

  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    user?.username || user?.email || 'Account'

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center">
      <div className="flex-1">
        <h1 className="text-xl font-bold text-blue-500">FinSight Dashboard</h1>
      </div>

      <div className="flex items-center gap-6">
        <button className="relative text-gray-300 hover:text-white transition" title="Watchlist alerts">
          <Bell size={20} />
          {alertCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {alertCount > 9 ? '9+' : alertCount}
            </span>
          )}
        </button>

        <button
          onClick={() => navigate('/settings')}
          className="text-gray-300 hover:text-white transition"
        >
          <Settings size={20} />
        </button>

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-3 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition"
          >
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
              <User size={16} />
            </div>
            <span className="text-sm font-medium">{displayName}</span>
          </button>

          {showMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-gray-700 rounded-lg shadow-xl border border-gray-600 z-50">
              <button
                onClick={() => {
                  navigate('/settings')
                  setShowMenu(false)
                }}
                className="w-full text-left px-4 py-3 text-sm hover:bg-gray-600 transition flex items-center gap-2"
              >
                <Settings size={16} />
                Settings
              </button>
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-3 text-sm hover:bg-gray-600 transition flex items-center gap-2 border-t border-gray-600 text-red-400"
              >
                <LogOut size={16} />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
