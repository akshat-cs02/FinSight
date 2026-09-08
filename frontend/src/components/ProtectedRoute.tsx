import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

interface ProtectedRouteProps {
  children: React.ReactNode
  adminOnly?: boolean
}

export default function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const { user, bootstrap } = useAuthStore()
  const [checking, setChecking] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    let cancelled = false
    const checkAuth = async () => {
      // Always bootstrap to recover session from httpOnly cookie
      try { await bootstrap() } catch { /* ignore */ }
      if (cancelled) return

      const u = useAuthStore.getState().user
      const isReal = u && u.id !== '0' && u.email !== 'guest@tickerscope.xyz'
      if (isReal) {
        setAuthenticated(true)
      } else {
        // Guest — only allowed if they came through the landing page
        setAuthenticated(!!sessionStorage.getItem('tickerscope_from_landing'))
      }
      setChecking(false)
    }
    checkAuth()
    return () => { cancelled = true }
  }, [])

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Verifying session…</p>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return <Navigate to="/" replace />
  }

  if (adminOnly && !user?.is_admin) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
