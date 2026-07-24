import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

interface ProtectedRouteProps {
  children: React.ReactNode
  adminOnly?: boolean
}

/**
 * Protected route that checks authentication via httpOnly cookie.
 * On mount, it calls /auth/me to verify the session is still valid.
 * Shows a loading spinner while checking, redirects to /login if not authenticated.
 */
export default function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const { user, initialized, bootstrap } = useAuthStore()
  const [checking, setChecking] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    let cancelled = false
    let bootstrapped = false
    const checkAuth = async () => {
      try {
        // Fast path: if user is already a real logged-in user, skip everything.
        const currentUser = useAuthStore.getState().user
        const isReal = currentUser && currentUser.id !== '0' && currentUser.email !== 'guest@finsight.app'
        if (isReal) {
          if (!cancelled) { setAuthenticated(true); setChecking(false) }
          return
        }
        // Only call bootstrap once (prevents double-calls from App.tsx + ProtectedRoute)
        if (!bootstrapped) {
          bootstrapped = true
          await bootstrap()
        }
        if (!cancelled) {
          // After bootstrap, check again
          const finalUser = useAuthStore.getState().user
          const ok = finalUser && finalUser.id !== '0' && finalUser.email !== 'guest@finsight.app'
          setAuthenticated(!!ok)
          setChecking(false)
        }
      } catch {
        if (!cancelled) {
          setAuthenticated(false)
          setChecking(false)
        }
      }
    }
    checkAuth()
    return () => { cancelled = true }
  }, [])

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
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
