import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

function getCsrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/)
  return match ? match[1] : ''
}

function getStoredToken(): string | null {
  try {
    return localStorage.getItem('tickerscope_token')
  } catch {
    return null
  }
}

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 15000, // 15s timeout
  withCredentials: true,
})

// Attach CSRF token + auth token on requests
api.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase()
  if (!['get', 'head', 'options'].includes(method)) {
    config.headers['X-CSRF-Token'] = getCsrfToken()
  }
  // Send JWT in Authorization header as fallback for cross-origin cookie issues
  const token = getStoredToken()
  if (token && token !== 'cookie' && !config.headers['Authorization']) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

// ─── Retry with exponential backoff ───
const MAX_RETRIES = 2
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const c = err.config as any

    // Don't retry on 401 or if already retried
    if (err.response?.status === 401 || c?._retryCount >= MAX_RETRIES) {
      // Auto-redirect on 401
      if (err.response?.status === 401) {
        const path = window.location.pathname
        if (!['/login', '/register'].includes(path)) {
          if (['/portfolio', '/predictions', '/admin'].some((p) => path.startsWith(p))) {
            let handled = false
            const onHandled = () => { handled = true }
            window.addEventListener('tickerscope:navigate', onHandled, { once: true })
            window.dispatchEvent(new CustomEvent('tickerscope:navigate', { detail: '/' }))
            setTimeout(() => {
              window.removeEventListener('tickerscope:navigate', onHandled)
              if (!handled && window.location.pathname !== '/') {
                window.location.href = '/'
              }
            }, 100)
          }
        }
      }
      return Promise.reject(err)
    }

    // Retry with exponential backoff: 1s, 2s
    c._retryCount = (c._retryCount || 0) + 1
    const delay = 1000 * Math.pow(2, c._retryCount - 1)
    await new Promise((r) => setTimeout(r, delay))
    return api(c)
  }
)

export default api
export { API_URL }

// ─── Backend warm-up ping (fire-and-forget, once per session) ───
export function warmUpBackend() {
  if (typeof window !== 'undefined' && sessionStorage.getItem('tickerscope_warmed')) return
  if (typeof window !== 'undefined') sessionStorage.setItem('tickerscope_warmed', '1')
  api.get('/market/status').catch(() => {})
}

const WS_BASE = API_URL.replace(/^http/, 'ws')
export { WS_BASE }
