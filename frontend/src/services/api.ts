import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 180000,
})

// Attach JWT token if present
api.interceptors.request.use((config) => {
  const tok = localStorage.getItem('finsight_token')
  if (tok) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${tok}`
  }
  return config
})

// Auto-redirect on 401 (token expired/missing)
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      const path = window.location.pathname
      if (!['/login', '/register'].includes(path)) {
        // Soft-fail — let component handle the message; only auto-redirect for protected pages
        if (['/portfolio', '/predictions', '/admin'].some((p) => path.startsWith(p))) {
          localStorage.removeItem('finsight_token')
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(err)
  }
)

export default api
export { API_URL }

const WS_BASE = API_URL.replace(/^http/, 'ws')
export { WS_BASE }
