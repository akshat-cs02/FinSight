import { create } from 'zustand'

type Theme = 'dark' | 'light'

interface ThemeStore {
  theme: Theme
  toggle: () => void
  set: (t: Theme) => void
}

function applyTheme(t: Theme) {
  const root = document.documentElement
  if (t === 'light') {
    root.setAttribute('data-theme', 'light')
  } else {
    root.removeAttribute('data-theme')
  }
  root.style.colorScheme = t
}

// Read initial theme from localStorage or system preference
function getInitialTheme(): Theme {
  const saved = localStorage.getItem('tickerscope-theme') as Theme | null
  if (saved === 'light' || saved === 'dark') return saved
  if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  return 'dark'
}

export const useThemeStore = create<ThemeStore>((set) => {
  const initial = getInitialTheme()
  // Apply on load
  if (typeof document !== 'undefined') {
    applyTheme(initial)
  }

  return {
    theme: initial,
    toggle: () => {
      set((s) => {
        const next = s.theme === 'dark' ? 'light' : 'dark'
        localStorage.setItem('tickerscope-theme', next)
        applyTheme(next)
        return { theme: next }
      })
    },
    set: (t: Theme) => {
      localStorage.setItem('tickerscope-theme', t)
      applyTheme(t)
      set({ theme: t })
    },
  }
})
