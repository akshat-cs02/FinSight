import { create } from 'zustand'
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
  token: string | null
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
    set({ user: GUEST_USER, initialized: true })
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

  login: async () => {
    return GUEST_USER
  },

  register: async () => {},

  logout: () => {
    set({ user: GUEST_USER, token: null })
  },

  refresh: async () => true,
}))
