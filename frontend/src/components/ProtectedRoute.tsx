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
    const checkAuth = async () => {
      try {
        // bootstrap calls /auth/me which validates the httpOnly cookie
        if (!initialized || !user || user.id === '0') {
          await bootstrap()
        }
        if (!cancelled) {
          // After bootstrap, check if we have any user (including guest)
          const currentUser = useAuthStore.getState().user
          setAuthenticated(!!currentUser)
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
  }, [initialized, user, bootstrap])

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
    return <Navigate to="/login" replace />
  }

  if (adminOnly && !user?.is_admin) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
