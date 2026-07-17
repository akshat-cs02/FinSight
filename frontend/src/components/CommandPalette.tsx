import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Command, LayoutDashboard, TrendingUp, Briefcase, Newspaper, Brain, BarChart2, Shield, Settings, ArrowUpDown } from 'lucide-react'
import gsap from 'gsap'

interface PageItem {
  label: string
  path: string
  icon: typeof LayoutDashboard
  keywords: string[]
}

const PAGES: PageItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, keywords: ['home', 'main', 'overview'] },
  { label: 'Stocks', path: '/stocks', icon: TrendingUp, keywords: ['stock', 'market', 'equity'] },
  { label: 'Predictions', path: '/predictions', icon: Brain, keywords: ['ai', 'forecast', 'ml'] },
  { label: 'Portfolio', path: '/portfolio', icon: Briefcase, keywords: ['holdings', 'investments'] },
  { label: 'Backtesting', path: '/backtesting', icon: BarChart2, keywords: ['test', 'strategy', 'ict'] },
  { label: 'News', path: '/news', icon: Newspaper, keywords: ['articles', 'financial'] },
  { label: 'Admin', path: '/admin', icon: Shield, keywords: ['manage', 'users', 'system'] },
  { label: 'Settings', path: '/settings', icon: Settings, keywords: ['preferences', 'config'] },
]

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  let qi = 0
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++
  }
  return qi === q.length
}

export default function CommandPalette() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Filter results
  const results = query.trim()
    ? PAGES.filter((p) =>
        fuzzyMatch(p.label, query) ||
        fuzzyMatch(p.path, query) ||
        p.keywords.some((k) => fuzzyMatch(k, query))
      )
    : PAGES

  // Scroll selected item into view
  useEffect(() => {
    if (!open || !listRef.current || selectedIdx < 0) return
    const items = listRef.current.children
    if (items[selectedIdx]) {
      ;(items[selectedIdx] as HTMLElement).scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIdx, open])

  // Open/close with Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // GSAP entrance/exit animation
  useEffect(() => {
    const overlay = overlayRef.current
    const panel = panelRef.current
    if (!overlay || !panel) return

    if (open) {
      gsap.set([overlay, panel], { display: '' })
      gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.out' })
      gsap.fromTo(panel, { opacity: 0, y: -20, scale: 0.97 }, {
        opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'power3.out', delay: 0.05,
      })
      setTimeout(() => inputRef.current?.focus(), 100)
    } else {
      gsap.to(overlay, { opacity: 0, duration: 0.15 })
      gsap.to(panel, { opacity: 0, y: -10, scale: 0.97, duration: 0.15, ease: 'power2.in' })
      setTimeout(() => {
        gsap.set([overlay, panel], { display: 'none' })
      }, 150)
    }
  }, [open])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((prev) => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      e.preventDefault()
      navigate(results[selectedIdx].path)
      setOpen(false)
      setQuery('')
    }
  }, [results, selectedIdx, navigate])

  const handleSelect = (path: string) => {
    navigate(path)
    setOpen(false)
    setQuery('')
  }

  // Reset selection when results change
  useEffect(() => {
    setSelectedIdx(0)
  }, [query])

  if (!open) return null

  return (
    <>
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed top-[12%] left-1/2 -translate-x-1/2 z-[101] w-full max-w-lg"
      >
        <div className="card-surface3 rounded-2xl border border-[rgba(212,168,83,0.1)] shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(212,168,83,0.06)]">
            <Search size={18} className="text-[rgba(212,168,83,0.4)] shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search pages, stocks, commands..."
              className="flex-1 bg-transparent text-sm text-[rgba(232,232,224,0.8)] placeholder-[rgba(212,168,83,0.3)] outline-none"
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[rgba(255,255,255,0.04)] text-[rgba(212,168,83,0.4)]">
              <Command size={10} />K
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-72 overflow-y-auto p-2 space-y-0.5">
            {results.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-[rgba(212,168,83,0.3)]">
                No results for "{query}"
              </div>
            )}
            {results.map((page, idx) => {
              const Icon = page.icon
              const isSelected = idx === selectedIdx
              return (
                <button
                  key={page.path}
                  onClick={() => handleSelect(page.path)}
                  onMouseEnter={() => setSelectedIdx(idx)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                    isSelected
                      ? 'bg-[rgba(34,197,94,0.08)] text-[rgba(232,232,224,0.9)]'
                      : 'text-[rgba(212,168,83,0.5)] hover:bg-[rgba(255,255,255,0.03)] hover:text-[rgba(232,232,224,0.7)]'
                  }`}
                >
                  <Icon size={16} className={isSelected ? 'text-[#D4A853]' : ''} />
                  <span className="flex-1 text-left font-medium">{page.label}</span>
                  {isSelected && (
                    <span className="text-[10px] text-[rgba(212,168,83,0.4)] flex items-center gap-0.5">
                      <ArrowUpDown size={10} /> navigate
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 border-t border-[rgba(212,168,83,0.06)] flex items-center gap-3 text-[10px] text-[rgba(212,168,83,0.3)]">
            <span>↑↓ Navigate</span>
            <span>↵ Open</span>
            <span>Esc Close</span>
          </div>
        </div>
      </div>
    </>
  )
}
