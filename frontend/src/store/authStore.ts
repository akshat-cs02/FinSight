import { create } from 'zustand'
import { authService, User } from '@/services/authService'

interface AuthState {
  user: User | null
  token: string | null
  loading: boolean
  initialized: boolean
  login: (email: string, password: string) => Promise<User>
  register: (data: { username: string; email: string; password: string; admin_key?: string }) => Promise<void>
  logout: () => void
  bootstrap: () => Promise<void>  // restore session from localStorage
  refresh: () => Promise<boolean> // exchange refresh token for a new access token
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('finsight_token'),
  loading: false,
  initialized: false,

  bootstrap: async () => {
    const tok = localStorage.getItem('finsight_token')
    if (!tok) {
      set({ initialized: true })
      return
    }
    set({ token: tok })
    try {
      // Happy path: access token still valid
      const u = await authService.me()
      set({ user: u, initialized: true })
    } catch {
      // Access token expired — try refreshing before giving up
      const refreshTok = localStorage.getItem('finsight_refresh')
      if (refreshTok) {
        try {
          const t = await authService.refresh(refreshTok)
          localStorage.setItem('finsight_token', t.access_token)
          localStorage.setItem('finsight_refresh', t.refresh_token)
          set({ token: t.access_token })
          const u = await authService.me()
          set({ user: u, initialized: true })
          return
        } catch {
          // Refresh token also invalid — full logout
        }
      }
      localStorage.removeItem('finsight_token')
      localStorage.removeItem('finsight_refresh')
      set({ token: null, user: null, initialized: true })
    }
  },

  login: async (email, password) => {
    set({ loading: true })
    try {
      const t = await authService.login(email, password)
      localStorage.setItem('finsight_token', t.access_token)
      localStorage.setItem('finsight_refresh', t.refresh_token)
      set({ token: t.access_token })
      const u = await authService.me()
      set({ user: u })
      return u
    } finally {
      set({ loading: false })
    }
  },

  register: async (data) => {
    set({ loading: true })
    try {
      await authService.register(data)
    } finally {
      set({ loading: false })
    }
  },

  logout: () => {
    localStorage.removeItem('finsight_token')
    localStorage.removeItem('finsight_refresh')
    set({ user: null, token: null })
  },

  refresh: async () => {
    const refreshTok = localStorage.getItem('finsight_refresh')
    if (!refreshTok) return false
    try {
      const t = await authService.refresh(refreshTok)
      localStorage.setItem('finsight_token', t.access_token)
      localStorage.setItem('finsight_refresh', t.refresh_token)
      set({ token: t.access_token })
      return true
    } catch {
      return false
    }
  },
}))
