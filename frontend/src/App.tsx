import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { PageTransition, spring } from '@/components/ui/motion'
import { Toaster } from 'react-hot-toast'
import gsap from 'gsap'
import {
  LayoutDashboard, TrendingUp, Brain, Briefcase, Newspaper,
  ChevronDown, HelpCircle,
} from 'lucide-react'
import Navbar from '@/components/Navbar'
import CanvasParticles from '@/components/CanvasParticles'
import FloatingOrbs from '@/components/FloatingOrbs'
import CommandPalette from '@/components/CommandPalette'
import SplashScreen from '@/components/SplashScreen'
import ErrorBoundary from '@/components/ErrorBoundary'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'
import { pageEnter } from '@/utils/animations'
import { useAuthStore } from '@/store/authStore'
import ProtectedRoute from '@/components/ProtectedRoute'
import { warmUpBackend } from '@/services/api'

// ─── Lazy-loaded pages (code-split) ───
const DashboardPage = lazy(() => import('@/pages/Dashboard'))
const StockDetailsPage = lazy(() => import('@/pages/StockDetails'))
const PortfolioPage = lazy(() => import('@/pages/Portfolio'))
const NewsPage = lazy(() => import('@/pages/News'))
const PredictionsPage = lazy(() => import('@/pages/Predictions'))
const AdminPage = lazy(() => import('@/pages/Admin'))
const BacktestingPage = lazy(() => import('@/pages/Backtesting'))
const StatsCounter = lazy(() => import('@/components/StatsCounter'))
const CTASection = lazy(() => import('@/components/CTASection'))
const Footer = lazy(() => import('@/components/Footer'))
const LoginPage = lazy(() => import('@/pages/auth/Login'))
const RegisterPage = lazy(() => import('@/pages/auth/Register'))

/* ─── Mouse glow effect ─── */
function MouseGlow() {
  const glowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const glow = glowRef.current
    if (!glow) return
    const onMove = (e: MouseEvent) => {
      gsap.to(glow, {
        x: e.clientX - 150,
        y: e.clientY - 150,
        duration: 0.6,
        ease: 'power2.out',
      })
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <div
      ref={glowRef}
      className="fixed top-0 left-0 w-[300px] h-[300px] rounded-full pointer-events-none z-[9999]"
      style={{ background: 'radial-gradient(circle, rgba(212,168,83,0.06) 0%, transparent 60%)' }}
    />
  )
}

/* ─── Global SPA navigation listener (for api.ts 401 redirects) ─── */
function GlobalNavigateListener() {
  const navigate = useNavigate()
  useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent).detail
      if (typeof path === 'string') navigate(path)
    }
    window.addEventListener('finsight:navigate', handler)
    return () => window.removeEventListener('finsight:navigate', handler)
  }, [navigate])
  return null
}

/* ─── Page transition wrapper ─── */
function PageContent({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    pageEnter(containerRef.current)
  }, [location.pathname])

  return <div ref={containerRef}>{children}</div>
}

/* ─── Route prefetch map (shared with BottomNav) ─── */
const routeImportMap: Record<string, () => Promise<any>> = {
  '/dashboard': () => import('@/pages/Dashboard'),
  '/stocks': () => import('@/pages/StockDetails'),
  '/predictions': () => import('@/pages/Predictions'),
  '/backtesting': () => import('@/pages/Backtesting'),
  '/portfolio': () => import('@/pages/Portfolio'),
  '/news': () => import('@/pages/News'),
  '/admin': () => import('@/pages/Admin'),
}

function prefetchRoute(path: string) {
  routeImportMap[path]?.()
}

/* ─── Bottom Nav (mobile) ─── */
const bottomItems = [
  { icon: LayoutDashboard, label: 'Dashboard',  path: '/dashboard' },
  { icon: TrendingUp,      label: 'Stocks',      path: '/stocks' },
  { icon: Brain,           label: 'Predictions', path: '/predictions' },
  { icon: Briefcase,       label: 'Portfolio',   path: '/portfolio' },
  { icon: Newspaper,       label: 'News',        path: '/news' },
]

function BottomNav() {
  const location = useLocation()
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 glass-panel border-t border-white/5 lg:hidden pb-safe">
      <div className="flex justify-around items-center h-14 px-2">
        {bottomItems.map((item) => {
          const Icon = item.icon
          const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
          return (
            <Link key={item.path} to={item.path} onMouseEnter={() => prefetchRoute(item.path)}
              className={`relative flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all duration-300 ${
                active ? 'text-gold' : 'text-white/40 hover:text-white/60'
              }`}
            >
              {active && (
                <motion.span layoutId="bottomnav-active" transition={spring}
                  className="absolute inset-0 rounded-lg bg-white/[0.06]" />
              )}
              <Icon size={18} className="relative z-10" />
              <span className="relative z-10 text-[9px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

/* ─── Layout ─── */
function Layout() {
  const [showShortcuts, setShowShortcuts] = useState(false)
  const location = useLocation()
  const sectionKey = '/' + (location.pathname.split('/')[1] || '')
  const isDashboard = location.pathname === '/dashboard'

  const [showScrollTop, setShowScrollTop] = useState(false)
  const user = useAuthStore((s) => s.user)
  const pingVisitor = useAuthStore((s) => s.pingVisitor)

  // Ping visitor on route change
  useEffect(() => {
    pingVisitor(location.pathname)
  }, [location.pathname])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setShowShortcuts((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Hide shortcuts on click outside
  useEffect(() => {
    if (!showShortcuts) return
    const handler = () => setShowShortcuts(false)
    window.addEventListener('click', handler, { once: true })
    return () => window.removeEventListener('click', handler)
  }, [showShortcuts])

  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 400)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // GSAP scroll-to-top button entrance
  const scrollBtnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const btn = scrollBtnRef.current
    if (!btn) return
    if (showScrollTop) {
      gsap.to(btn, { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'power2.out', pointerEvents: 'auto' })
    } else {
      gsap.to(btn, { opacity: 0, y: 16, scale: 0.8, duration: 0.3, ease: 'power2.out', pointerEvents: 'none' })
    }
  }, [showScrollTop])

  return (
    <div className="min-h-screen bg-[var(--bg)] aurora noise grid-bg">
      <MouseGlow />
      {isDashboard && <CanvasParticles count={50} speed={0.2} connectDistance={100} />}
      <FloatingOrbs />
      <CommandPalette />

      {/* Navbar at top - fixed */}
      <Navbar />

      {/* Main content with pt-16 to offset fixed navbar */}
      <div className="relative z-10 pt-16">
        <main className="flex-1 min-h-screen pb-20 lg:pb-8">
          <AnimatePresence mode="wait">
            <PageTransition key={sectionKey}>
              <PageContent>
                <Suspense fallback={
                  <div className="flex items-center justify-center h-64">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 rounded-full border-2 border-gold/30 border-t-gold animate-spin" />
                      <span className="text-xs text-white/30">Loading…</span>
                    </div>
                  </div>
                }>
                  <Outlet />
                </Suspense>
              </PageContent>
            </PageTransition>
          </AnimatePresence>
        </main>

        {isDashboard && (
          <Suspense fallback={null}>
            <StatsCounter />
          </Suspense>
        )}
        {isDashboard && user?.email !== 'guest@finsight.app' && (
          <Suspense fallback={null}>
            <CTASection />
          </Suspense>
        )}
        <Suspense fallback={null}>
          <Footer />
        </Suspense>
      </div>

      <BottomNav />

      {/* Keyboard shortcuts hint */}
      <KeyboardShortcutsHint show={showShortcuts} />

      {/* Scroll-to-top button */}
      <button
        ref={scrollBtnRef}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-xl bg-gradient-to-br from-gold to-gold-2 text-black font-bold shadow-lg shadow-gold/20 flex items-center justify-center hover:shadow-gold/30 hover:-translate-y-0.5 transition-all duration-300"
        style={{ opacity: 0, y: 16, scale: 0.8, pointerEvents: 'none' }}
      >
        <ChevronDown size={18} className="rotate-180" />
      </button>

      {/* ? button for shortcuts */}
      <button
        onClick={() => setShowShortcuts((prev) => !prev)}
        className="fixed bottom-6 left-6 z-50 w-9 h-9 rounded-xl bg-[#141414]/80 backdrop-blur-md border border-white/5 text-white/40 hover:text-white/70 hover:border-white/10 flex items-center justify-center transition-all duration-300 shadow-lg"
      >
        <HelpCircle size={16} />
      </button>
    </div>
  )
}

/* ─── Keyboard shortcuts hint ─── */
function KeyboardShortcutsHint({ show }: { show: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    gsap.to(el, {
      opacity: show ? 1 : 0,
      y: show ? 0 : 8,
      duration: 0.3,
      ease: 'power2.out',
    })
  }, [show])

  if (!show) return null

  return (
    <div
      ref={ref}
      className="fixed bottom-20 right-6 z-50 card-surface3 rounded-xl border border-white/5 shadow-xl p-4 min-w-[180px]"
    >
      <div className="text-xs font-semibold text-white/70 mb-2">Keyboard Shortcuts</div>
      <div className="space-y-1.5 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-white/50">Search</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/[0.04] text-white/40">⌘K</kbd>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-white/50">Shortcuts</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/[0.04] text-white/40">?</kbd>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-white/50">Home</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/[0.04] text-white/40">⌘⇧H</kbd>
        </div>
      </div>
    </div>
  )
}

const toastStyle = {
  style: {
    background: 'rgba(20,20,20,0.9)',
    backdropFilter: 'blur(20px)',
    color: 'rgba(232,232,224,0.8)',
    border: '1px solid rgba(212,168,83,0.06)',
    borderRadius: '0.75rem',
    fontSize: '0.875rem',
  },
}

/* ─── Landing Redirect (full page reload to static landing.html) ─── */
function LandingRedirect() {
  useEffect(() => { window.location.href = '/' }, [])
  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-gold/30 border-t-gold animate-spin" />
    </div>
  )
}

/* ─── App ─── */
export default function App() {
  const [splashDone, setSplashDone] = useState(false)
  const firstVisit = useRef(sessionStorage.getItem('finsight_splash') !== 'true')

  const handleSplashFinish = () => {
    sessionStorage.setItem('finsight_splash', 'true')
    setSplashDone(true)
  }

  // Warm up backend on app mount (fire-and-forget)
  useEffect(() => { warmUpBackend() }, [])

  return (
    <Router>
      <GlobalNavigateListener />
      <Toaster position="top-right" toastOptions={toastStyle} />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard"   element={<ProtectedRoute><ErrorBoundary><DashboardPage /></ErrorBoundary></ProtectedRoute>} />
          <Route path="/stocks"      element={<ProtectedRoute><ErrorBoundary><StockDetailsPage /></ErrorBoundary></ProtectedRoute>} />
          <Route path="/stocks/:symbol" element={<ProtectedRoute><ErrorBoundary><StockDetailsPage /></ErrorBoundary></ProtectedRoute>} />
          <Route path="/predictions" element={<ProtectedRoute><ErrorBoundary><PredictionsPage /></ErrorBoundary></ProtectedRoute>} />
          <Route path="/backtesting" element={<ProtectedRoute><ErrorBoundary><BacktestingPage /></ErrorBoundary></ProtectedRoute>} />
          <Route path="/portfolio"   element={<ProtectedRoute><ErrorBoundary><PortfolioPage /></ErrorBoundary></ProtectedRoute>} />
          <Route path="/news"        element={<ProtectedRoute><ErrorBoundary><NewsPage /></ErrorBoundary></ProtectedRoute>} />
          <Route path="/admin"       element={<ProtectedRoute adminOnly><ErrorBoundary><AdminPage /></ErrorBoundary></ProtectedRoute>} />
        </Route>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<LandingRedirect />} />
      </Routes>

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />

      {/* Splash overlay fades out while content loads underneath */}
      {!splashDone && firstVisit.current && (
        <SplashScreen onFinish={handleSplashFinish} />
      )}
    </Router>
  )
}
