import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 180000,
  withCredentials: true, // send httpOnly cookies cross-origin
})

// Auto-redirect on 401 (token expired/missing)
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      const path = window.location.pathname
      if (!['/login', '/register'].includes(path)) {
        if (['/portfolio', '/predictions', '/admin'].some((p) => path.startsWith(p))) {
          // Prefer React Router SPA navigation; fallback to full reload if listener not mounted
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
)

export default api
export { API_URL }

const WS_BASE = API_URL.replace(/^http/, 'ws')
export { WS_BASE }
