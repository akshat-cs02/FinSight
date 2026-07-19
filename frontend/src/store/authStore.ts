import { create } from 'zustand'
import api from '@/services/api'
import { pingVisitor, fetchVisitor, getStoredGuestUsername } from '@/services/visitorService'

export interface User {
  id: number
  username: string
  email: string
  first_name: string | null
  last_name: string | null
  is_admin: boolean
  subscription_tier: string
  created_at: string
}

export interface VisitorInfo {
  guest_username: string
  ip_address: string
  page_views: number
  first_seen: string | null
}

interface AuthState {
  user: User | null
  token: string | null  // kept for backward compat but no longer the primary auth mechanism
  loading: boolean
  initialized: boolean
  visitor: VisitorInfo | null
  login: (email: string, password: string) => Promise<User>
  register: (data: { username: string; email: string; password: string; admin_key?: string }) => Promise<void>
  logout: () => void
  bootstrap: () => Promise<void>
  refresh: () => Promise<boolean>
  pingVisitor: (path?: string) => Promise<void>
}

const GUEST_USER: User = {
  id: 0,
  username: 'Guest',
  email: 'guest@finsight.app',
  first_name: 'Demo',
  last_name: null,
  is_admin: false,
  subscription_tier: 'free',
  created_at: new Date().toISOString(),
}

export const useAuthStore = create<AuthState>((set) => ({
  user: GUEST_USER,
  token: null,
  loading: false,
  initialized: true,
  visitor: null,

  bootstrap: async () => {
    // Try to recover session from httpOnly cookie via /me endpoint
    try {
      const { data } = await api.get('/auth/me')
      if (data && data.id) {
        set({ user: data as User, token: 'cookie', initialized: true })
      } else {
        set({ user: GUEST_USER, initialized: true })
      }
    } catch {
      set({ user: GUEST_USER, initialized: true })
    }
    // Try fetching visitor info from backend
    const visitor = await fetchVisitor()
    if (visitor) {
      set({
        visitor: {
          guest_username: visitor.guest_username,
          ip_address: visitor.ip_address,
          page_views: visitor.page_views ?? 1,
          first_seen: visitor.first_seen ?? null,
        },
      })
    }
  },

  pingVisitor: async (path?: string) => {
    const data = await pingVisitor(path)
    if (data) {
      set({
        visitor: {
          guest_username: data.guest_username,
          ip_address: data.ip_address,
          page_views: data.page_views ?? 1,
          first_seen: data.first_seen ?? null,
        },
      })
    }
  },

  login: async (email: string, password: string) => {
    set({ loading: true })
    try {
      // Backend sets httpOnly cookies on success; we still get tokens + user in body
      // for backward compat, but the cookie is the authoritative auth mechanism.
      const { data } = await api.post('/auth/login', { email, password })
      const user = (data.user || GUEST_USER) as User
      set({ user, token: 'cookie', loading: false })
      return user
    } catch (err) {
      set({ loading: false })
      throw err
    }
  },

  register: async (formData) => {
    set({ loading: true })
    try {
      const { data } = await api.post('/auth/register', formData)
      const user = (data.user || GUEST_USER) as User
      set({ user, token: 'cookie', loading: false })
    } catch (err) {
      set({ loading: false })
      throw err
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // Even if server call fails, clear local state
    }
    set({ user: GUEST_USER, token: null })
  },

  refresh: async () => {
    try {
      const { data } = await api.post('/auth/refresh')
      if (data && data.access_token) {
        // Cookie was updated server-side; re-fetch user
        const meRes = await api.get('/auth/me')
        if (meRes.data && meRes.data.id) {
          set({ user: meRes.data as User, token: 'cookie' })
        }
        return true
      }
      return false
    } catch {
      set({ user: GUEST_USER, token: null })
      return false
    }
  },
}))
