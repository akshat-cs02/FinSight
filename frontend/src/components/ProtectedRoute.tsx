import React, { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

interface ProtectedRouteProps {
  children: React.ReactNode
  adminOnly?: boolean
}

/** Decode a JWT payload without a library. Returns null if malformed. */
function decodeJwt(token: string): { exp?: number; sub?: string } | null {
  try {
    const payload = token.split('.')[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json)
  } catch {
    return null
  }
}

/** Seconds until the token expires (negative if already expired). */
function secondsToExpiry(token: string | null): number {
  if (!token) return -1
  const claims = decodeJwt(token)
  if (!claims?.exp) return -1
  return claims.exp - Math.floor(Date.now() / 1000)
}

export default function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const { token, user, refresh, logout } = useAuthStore()
  const ttl = secondsToExpiry(token)
  const expired = !!token && ttl <= 0

  // Refresh the access token shortly before it expires (and immediately if
  // it's already expired) so the session doesn't drop mid-use.
  useEffect(() => {
    if (!token) return
    if (expired) {
      // Try one refresh; if it fails the store clears the token → redirect.
      refresh().then((ok) => { if (!ok) logout() })
      return
    }
    // Schedule a refresh ~60s before expiry (min 5s from now).
    const delayMs = Math.max((ttl - 60) * 1000, 5000)
    const id = setTimeout(() => { refresh() }, delayMs)
    return () => clearTimeout(id)
  }, [token, ttl, expired, refresh, logout])

  if (!token || expired) {
    return <Navigate to="/login" replace />
  }

  if (adminOnly && !user?.is_admin) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
