import { create } from 'zustand'

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

interface AuthState {
  user: User | null
  token: string | null
  loading: boolean
  initialized: boolean
  login: (email: string, password: string) => Promise<User>
  register: (data: { username: string; email: string; password: string; admin_key?: string }) => Promise<void>
  logout: () => void
  bootstrap: () => Promise<void>
  refresh: () => Promise<boolean>
}

const GUEST_USER: User = {
  id: 0,
  username: 'Guest',
  email: 'guest@finsight.app',
  first_name: 'Demo',
  last_name: null,
  is_admin: true,
  subscription_tier: 'free',
  created_at: new Date().toISOString(),
}

export const useAuthStore = create<AuthState>((set) => ({
  user: GUEST_USER,
  token: null,
  loading: false,
  initialized: true,

  bootstrap: async () => {
    set({ user: GUEST_USER, initialized: true })
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
