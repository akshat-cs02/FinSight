import React from 'react'
import ReactDOM from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

// Register the PWA service worker
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Auto-update — no user prompt needed
    updateSW()
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>,
)
