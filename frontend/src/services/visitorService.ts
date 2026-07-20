import { API_URL } from '@/services/api'
import axios from 'axios'

const TOKEN_KEY = 'fs_vt'
const NAME_KEY = 'fs_gn'

let _token: string | null = null
let _name: string | null = null

function getToken(): string | null {
  if (_token) return _token
  try { _token = sessionStorage.getItem(TOKEN_KEY) } catch {}
  return _token
}

function setToken(t: string) {
  _token = t
  try { sessionStorage.setItem(TOKEN_KEY, t) } catch {}
}

function getName(): string | null {
  if (_name) return _name
  try { _name = sessionStorage.getItem(NAME_KEY) } catch {}
  return _name
}

function setName(n: string) {
  _name = n
  try { sessionStorage.setItem(NAME_KEY, n) } catch {}
}

export interface VisitorInfo {
  visitor_token: string
  guest_username: string
  ip_address: string
  first_seen: string | null
  last_seen?: string | null
  page_views?: number
}

export async function pingVisitor(path?: string): Promise<VisitorInfo | null> {
  try {
    const params: Record<string, string> = {}
    const token = getToken()
    const name = getName()
    if (token) params.token = token
    if (name) params.guest_username = name
    if (path) params.path = path

    const { data } = await axios.post<VisitorInfo>(`${API_URL}/api/visitor/ping`, null, { params })
    setToken(data.visitor_token)
    setName(data.guest_username)
    return data
  } catch {
    return null
  }
}

export async function fetchVisitor(): Promise<VisitorInfo | null> {
  const token = getToken()
  if (!token) return null
  try {
    const { data } = await axios.get<VisitorInfo>(`${API_URL}/api/visitor/me`, { params: { token } })
    return data
  } catch {
    return null
  }
}

export function getStoredGuestUsername(): string | null {
  return getName()
}
