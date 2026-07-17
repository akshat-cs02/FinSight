/**
 * Visitor tracking service — used on app boot to register the anonymous
 * guest user with the backend so we know how many people are using the app.
 */
import axios from 'axios'

const STORAGE_KEY_TOKEN = 'fs_visitor_token'
const STORAGE_KEY_NAME = 'fs_guest_username'

let _cachedToken: string | null = null
let _cachedName: string | null = null

function getToken(): string | null {
  if (_cachedToken) return _cachedToken
  _cachedToken = localStorage.getItem(STORAGE_KEY_TOKEN)
  return _cachedToken
}

function setToken(t: string) {
  _cachedToken = t
  localStorage.setItem(STORAGE_KEY_TOKEN, t)
}

function getName(): string | null {
  if (_cachedName) return _cachedName
  _cachedName = localStorage.getItem(STORAGE_KEY_NAME)
  return _cachedName
}

function setName(n: string) {
  _cachedName = n
  localStorage.setItem(STORAGE_KEY_NAME, n)
}

export interface VisitorInfo {
  visitor_token: string
  guest_username: string
  ip_address: string
  first_seen: string | null
  last_seen?: string | null
  page_views?: number
}

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

/**
 * Ping the backend to register / update this visitor.
 * Called on every page navigation (App.tsx route change).
 */
export async function pingVisitor(path?: string): Promise<VisitorInfo | null> {
  try {
    const token = getToken()
    const name = getName()
    const params: Record<string, string> = {}
    if (token) params.token = token
    if (name) params.guest_username = name
    if (path) params.path = path

    const { data } = await axios.post<VisitorInfo>(`${BASE}/api/visitor/ping`, null, { params })
    setToken(data.visitor_token)
    setName(data.guest_username)
    return data
  } catch {
    return null
  }
}

/**
 * Fetch the current visitor details from the backend.
 */
export async function fetchVisitor(): Promise<VisitorInfo | null> {
  const token = getToken()
  if (!token) return null
  try {
    const { data } = await axios.get<VisitorInfo>(`${BASE}/api/visitor/me`, { params: { token } })
    return data
  } catch {
    return null
  }
}

export function getStoredGuestUsername(): string | null {
  return getName()
}
