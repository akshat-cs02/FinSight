import React, { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

/**
 * PWA Install Prompt — shows an "Add to Home Screen" banner when the browser
 * fires the `beforeinstallprompt` event. Dismissible; remembers dismissal
 * for 7 days via sessionStorage.
 */
export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Don't show if dismissed within the last 7 days
    const dismissedAt = localStorage.getItem('pwa_install_dismissed')
    if (dismissedAt && Date.now() - Number(dismissedAt) < 7 * 24 * 60 * 60 * 1000) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShow(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShow(false)
    }
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    localStorage.setItem('pwa_install_dismissed', String(Date.now()))
    setShow(false)
    setDeferredPrompt(null)
  }

  if (!show) return null

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)]">
      <div className="bg-[#141414]/95 backdrop-blur-xl border border-gold/20 rounded-xl p-4 shadow-2xl shadow-gold/10 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gold to-gold-2 flex items-center justify-center flex-shrink-0">
          <Download size={18} className="text-black" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Install FinSight</p>
          <p className="text-xs text-white/40">Add to your home screen for quick access</p>
        </div>
        <button
          onClick={handleInstall}
          className="px-3 py-1.5 bg-gold/10 text-gold hover:bg-gold/20 text-xs font-semibold rounded-lg transition-all duration-300 flex-shrink-0"
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          className="text-white/30 hover:text-white/60 transition-all duration-300 flex-shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
