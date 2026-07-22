import axios from 'axios'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 60000, // 60s timeout (backends can cold-start)
  withCredentials: true,
})

// ─── Backend warming indicator ───
let warmingToastId: string | undefined
let pendingRequests = 0
const toastStyle = {
  background: 'rgba(20,20,20,0.95)',
  backdropFilter: 'blur(20px)',
  color: 'rgba(232,232,224,0.8)',
  borderRadius: '0.75rem',
  fontSize: '0.875rem',
}

api.interceptors.request.use((config) => {
  const c = config as any
  // Skip on landing/auth pages — they handle their own UI
  if (!window.location.pathname.match(/^\/$|^\/landing|^\/login|^\/register/)) {
    pendingRequests++
    c._warmTimer = setTimeout(() => {
      if (pendingRequests > 0 && !warmingToastId) {
        warmingToastId = toast.loading('⚡ Backend is waking up — first request may take ~20s', {
          duration: 60000,
          style: { ...toastStyle, border: '1px solid rgba(212,168,83,0.15)' },
        })
      }
    }, 5000) // show after 5s (not instantly)
  }
  return config
})

// ─── Retry with exponential backoff ───
const MAX_RETRIES = 2
api.interceptors.response.use(
  (r) => {
    const c = r.config as any
    if (c._warmTimer) clearTimeout(c._warmTimer)
    pendingRequests = Math.max(0, pendingRequests - 1)
    if (warmingToastId) {
      toast.dismiss(warmingToastId)
      warmingToastId = undefined
    }
    return r
  },
  async (err) => {
    const c = err.config as any

    // Dismiss warming toast on failure
    if (c._warmTimer) clearTimeout(c._warmTimer)
    pendingRequests = Math.max(0, pendingRequests - 1)
    if (warmingToastId) {
      toast.dismiss(warmingToastId)
      warmingToastId = undefined
    }

    // Don't retry on 401 or if already retried
    if (err.response?.status === 401 || c?._retryCount >= MAX_RETRIES) {
      // Auto-redirect on 401
      if (err.response?.status === 401) {
        const path = window.location.pathname
        if (!['/login', '/register'].includes(path)) {
          if (['/portfolio', '/predictions', '/admin'].some((p) => path.startsWith(p))) {
            let handled = false
            const onHandled = () => { handled = true }
            window.addEventListener('finsight:navigate', onHandled, { once: true })
            window.dispatchEvent(new CustomEvent('finsight:navigate', { detail: '/login' }))
            setTimeout(() => {
              window.removeEventListener('finsight:navigate', onHandled)
              if (!handled && window.location.pathname !== '/login') {
                window.location.href = '/login'
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
  if (typeof window !== 'undefined' && sessionStorage.getItem('finsight_warmed')) return
  if (typeof window !== 'undefined') sessionStorage.setItem('finsight_warmed', '1')
  api.get('/market/status').catch(() => {})
}

const WS_BASE = API_URL.replace(/^http/, 'ws')
export { WS_BASE }
