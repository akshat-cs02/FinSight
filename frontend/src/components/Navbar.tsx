import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, TrendingUp, Brain, BarChart2, Briefcase, Newspaper,
  Shield, Search, Bell, User, LogOut, Menu, X, Sparkles, Globe, Mail, Eye, Clock, ChevronRight,
} from 'lucide-react'
import gsap from 'gsap'
import { useAuthStore } from '@/store/authStore'
import SearchBar from '@/components/SearchBar'
import { slideDown } from '@/utils/animations'
import watchlistService from '@/services/watchlistService'

/** Prefetch route chunks on hover */
function prefetchRoute(path: string) {
  const map: Record<string, () => Promise<any>> = {
    '/dashboard': () => import('@/pages/Dashboard'),
    '/stocks': () => import('@/pages/StockDetails'),
    '/predictions': () => import('@/pages/Predictions'),
    '/backtesting': () => import('@/pages/Backtesting'),
    '/portfolio': () => import('@/pages/Portfolio'),
    '/news': () => import('@/pages/News'),
    '/admin': () => import('@/pages/Admin'),
  }
  map[path]?.()
}

/* ─── Nav items ─── */
const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard',  path: '/dashboard' },
  { icon: TrendingUp,      label: 'Stocks',      path: '/stocks' },
  { icon: Brain,           label: 'Predictions', path: '/predictions' },
  { icon: BarChart2,       label: 'Backtesting', path: '/backtesting' },
  { icon: Briefcase,       label: 'Portfolio',   path: '/portfolio' },
  { icon: Newspaper,       label: 'News',        path: '/news' },
]

export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)
  const visitor = useAuthStore((s) => s.visitor)
  const [alertCount, setAlertCount] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  const navRef = useRef<HTMLElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const bellDotRef = useRef<HTMLSpanElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const linksRef = useRef<(HTMLAnchorElement | null)[]>([])

  const isGuest = user?.id === 0
  const isRealUser = !isGuest && user !== null && user.id > 0

  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    visitor?.guest_username ||
    user?.username ||
    user?.email ||
    'Guest'

  const displayEmail = isRealUser ? user?.email : (visitor?.ip_address ? `${visitor.ip_address} · Guest` : 'guest@finsight.app')

  const isActive = (p: string) => location.pathname === p || location.pathname.startsWith(p + '/')

  // Notification count
  useEffect(() => {
    if (!user) return
    let cancelled = false
    const load = () =>
      watchlistService.getAlerts()
        .then((a) => { if (!cancelled) setAlertCount(a.length) })
        .catch(() => {})
    load()
    const id = setInterval(load, 60000)
    return () => { cancelled = true; clearInterval(id) }
  }, [user])

  // GSAP: navbar slides down on mount
  useEffect(() => {
    slideDown(navRef.current)
  }, [])

  // GSAP: desktop nav links stagger entrance
  useEffect(() => {
    const navLinks = navRef.current?.querySelectorAll('.desktop-nav-link')
    if (!navLinks || navLinks.length === 0) return
    gsap.fromTo(
      navLinks,
      { y: -12, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.4, stagger: 0.05, ease: 'power3.out', delay: 0.25 }
    )
  }, [])

  // GSAP: mobile drawer open/close
  useEffect(() => {
    const drawer = drawerRef.current
    const overlay = overlayRef.current
    if (!drawer || !overlay) return

    if (drawerOpen) {
      gsap.to(overlay, { opacity: 1, duration: 0.25, ease: 'power2.out', display: 'block' })
      gsap.to(drawer, { x: 0, duration: 0.35, ease: 'power3.out' })
      const links = drawer.querySelectorAll('.drawer-link')
      gsap.fromTo(links, { x: 30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, stagger: 0.04, ease: 'power2.out', delay: 0.15 })
    } else {
      gsap.to(drawer, { x: '100%', duration: 0.25, ease: 'power3.in' })
      gsap.to(overlay, { opacity: 0, duration: 0.2, ease: 'power2.out', delay: 0.05, onComplete: () => { overlay.style.display = 'none' } })
    }
  }, [drawerOpen])

  // GSAP: notification bell pulse
  useEffect(() => {
    const dot = bellDotRef.current
    if (!dot) return
    gsap.to(dot, { scale: 1.3, duration: 1.2, ease: 'sine.inOut', yoyo: true, repeat: -1 })
  }, [])

  // GSAP: user menu open/close
  useEffect(() => {
    const menu = userMenuRef.current
    if (!menu) return
    if (showUserMenu) {
      gsap.set(menu, { display: 'block' })
      gsap.fromTo(menu, { opacity: 0, scale: 0.95, y: -4 }, { opacity: 1, scale: 1, y: 0, duration: 0.2, ease: 'power2.out' })
    } else {
      gsap.to(menu, {
        opacity: 0, scale: 0.95, y: -4, duration: 0.15, ease: 'power2.in',
        onComplete: () => { gsap.set(menu, { display: 'none' }) },
      })
    }
  }, [showUserMenu])

  const handleLogout = () => { logout(); navigate('/'); }

  // GSAP hover animations for logout button
  const logoutBtnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const btn = logoutBtnRef.current
    if (!btn) return
    const icon = btn.querySelector('svg')
    const onEnter = () => {
      gsap.to(btn, { scale: 1.08, duration: 0.25, ease: 'power2.out' })
      if (icon) gsap.to(icon, { rotation: -15, duration: 0.25, ease: 'power2.out' })
    }
    const onLeave = () => {
      gsap.to(btn, { scale: 1, duration: 0.2, ease: 'power2.inOut' })
      if (icon) gsap.to(icon, { rotation: 0, duration: 0.2, ease: 'power2.inOut' })
    }
    btn.addEventListener('mouseenter', onEnter)
    btn.addEventListener('mouseleave', onLeave)
    return () => { btn.removeEventListener('mouseenter', onEnter); btn.removeEventListener('mouseleave', onLeave) }
  }, [isRealUser])

  // GSAP hover animation for Sign In button
  const signInBtnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const btn = signInBtnRef.current
    if (!btn) return
    const icon = btn.querySelector('svg')
    const onEnter = () => {
      gsap.to(btn, { scale: 1.05, boxShadow: '0 8px 24px -6px rgba(212,168,83,0.35)', duration: 0.3, ease: 'power2.out' })
      if (icon) gsap.to(icon, { scale: 1.15, duration: 0.3, ease: 'power2.out' })
    }
    const onLeave = () => {
      gsap.to(btn, { scale: 1, boxShadow: 'none', duration: 0.25, ease: 'power2.inOut' })
      if (icon) gsap.to(icon, { scale: 1, duration: 0.25, ease: 'power2.inOut' })
    }
    btn.addEventListener('mouseenter', onEnter)
    btn.addEventListener('mouseleave', onLeave)
    return () => { btn.removeEventListener('mouseenter', onEnter); btn.removeEventListener('mouseleave', onLeave) }
  }, [])

  const closeDrawer = () => setDrawerOpen(false)

  const handleNavClick = () => {
    closeDrawer()
    setShowUserMenu(false)
  }

  // Admin link - show only for admins
  const allNavItems = [
    ...navItems,
    ...(user?.is_admin ? [{ icon: Shield, label: 'Admin', path: '/admin' }] : []),
  ]

  return (
    <>
      {/* ─── DESKTOP NAVBAR (lg+) ─── */}
      <header
        ref={navRef}
        className="fixed top-0 inset-x-0 z-50 bg-[#141414]/80 backdrop-blur-xl border-b border-white/5"
      >
        <div className="max-w-[1600px] mx-auto px-4 lg:px-6 h-16 flex items-center gap-4">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gold to-gold-2 flex items-center justify-center font-bold text-sm text-black shadow-lg shadow-gold/20">
              FS
            </div>
            <div className="hidden sm:block leading-tight">
              <div className="font-bold text-sm text-white font-display tracking-tight">FinSight</div>
              <div className="text-[9px] uppercase tracking-widest text-white/40 font-medium">Market Intelligence</div>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden lg:flex items-center gap-2">
            {allNavItems.map((item, idx) => {
              const Icon = item.icon
              const active = isActive(item.path)
              return (
                <Link
                  key={item.path}
                  ref={(el) => { linksRef.current[idx] = el }}
                  to={item.path}
                  onMouseEnter={() => prefetchRoute(item.path)}
                  className={`desktop-nav-link relative flex items-center gap-3 px-6 py-2.5 rounded-xl text-base font-display font-semibold transition-all duration-300 whitespace-nowrap ${
                    active
                      ? 'text-gold bg-gold/10 shadow-sm shadow-gold/5'
                      : 'text-white/60 hover:text-white/90 hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon size={20} className={`transition-all duration-300 ${active ? 'text-gold' : ''}`} />
                  <span className="transition-all duration-300 tracking-wider">{item.label}</span>
                  {active && <span className="absolute -bottom-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-gold animate-pulse shadow-sm shadow-gold/50" />}
                </Link>
              )
            })}
          </nav>

          {/* Search — icon by default, expands with GSAP on click */}
          <SearchBar />

          {/* Right section — pushed to far right edge */}
          <div className="flex items-center gap-3 ml-auto">
            {/* Mobile hamburger */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden w-9 h-9 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white/70 transition-all duration-300"
          >
            <Menu size={18} />
          </button>

          {/* Bell */}
          <button
            className="relative w-9 h-9 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white/70 transition-all duration-300 p-2.5"
            title="Notifications"
          >
            <Bell size={16} />
            <span ref={bellDotRef} className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-gold" />
          </button>

          {/* Logout / Sign In button */}
          {isRealUser ? (
            <button
              ref={logoutBtnRef}
              onClick={handleLogout}
              className="hidden lg:flex w-9 h-9 rounded-lg bg-white/[0.03] hover:bg-rose-500/10 items-center justify-center text-white/40 hover:text-rose-400 transition-colors duration-300"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          ) : (
            <button
              ref={signInBtnRef}
              onClick={() => navigate('/login')}
              className="hidden lg:flex items-center gap-2 px-4 py-2 rounded-lg bg-gold/10 text-gold text-sm font-medium transition-colors duration-300 border border-gold/20"
            >
              <Sparkles size={14} />
              Sign In
            </button>
          )}

          {/* User avatar */}
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 px-3 py-1.5 rounded-xl hover:bg-white/[0.04] transition-all duration-300 border border-transparent hover:border-white/5"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold to-gold-2 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-black">{displayName.charAt(0).toUpperCase()}</span>
            </div>
          </button>
          </div>
        </div>

        {/* User profile card popup */}
        <div className="relative">
          <div
            ref={userMenuRef}
            className="absolute right-4 top-1 mt-1 w-72 bg-[#141414]/95 backdrop-blur-xl rounded-xl shadow-2xl border border-white/5 z-50 overflow-hidden"
            style={{ display: 'none' }}
          >
              {/* Profile header */}
              <div className="px-5 pt-5 pb-4 bg-gradient-to-b from-gold/5 to-transparent border-b border-white/5">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gold to-gold-2 flex items-center justify-center flex-shrink-0 shadow-lg shadow-gold/20">
                    <span className="text-base font-bold text-black">{displayName.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white font-display truncate">{displayName}</div>
                    <div className="text-[11px] text-white/40 truncate mt-0.5">
                      {isRealUser ? user?.email : `${visitor?.ip_address || 'Unknown IP'} · Guest`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="px-5 py-3 space-y-2.5">
                {isRealUser ? (
                  <>
                    <div className="flex items-center gap-3 text-[12px]">
                      <Mail size={12} className="text-gold shrink-0" />
                      <span className="text-white/60 truncate">{user?.email}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[12px]">
                      <User size={12} className="text-gold shrink-0" />
                      <span className="text-white/60 truncate">{user?.username}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[12px]">
                      <Clock size={12} className="text-gold shrink-0" />
                      <span className="text-white/60 truncate">
                        Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3 text-[12px]">
                      <Globe size={12} className="text-gold shrink-0" />
                      <span className="text-white/60 truncate">IP: {visitor?.ip_address || 'Unknown'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[12px]">
                      <Eye size={12} className="text-gold shrink-0" />
                      <span className="text-white/60 truncate">{visitor?.page_views || 1} page views</span>
                    </div>
                    <div className="flex items-center gap-3 text-[12px]">
                      <Clock size={12} className="text-gold shrink-0" />
                      <span className="text-white/60 truncate">
                        First seen: {visitor?.first_seen ? new Date(visitor.first_seen).toLocaleDateString() : 'Today'}
                      </span>
                    </div>
                    <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-gold/5 border border-gold/10">
                      <p className="text-[10px] text-white/40 leading-relaxed">
                        You're browsing as a <span className="text-gold font-medium">guest</span>. Sign in to save your portfolio and access all features.
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="px-3 pb-3 pt-1 border-t border-white/5">
                {isGuest && (
                  <button
                    onClick={() => navigate('/login')}
                    className="group/signin w-full text-left px-3 py-2.5 text-sm rounded-lg hover:bg-gold/10 transition-all duration-300 flex items-center gap-2.5 text-gold font-medium"
                  >
                    <Sparkles size={14} className="transition-transform duration-300 group-hover/signin:scale-110" />
                    Sign In / Register
                    <ChevronRight size={14} className="ml-auto transition-transform duration-300 group-hover/signin:translate-x-1" />
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  className="group/logout w-full text-left px-3 py-2.5 text-sm rounded-lg hover:bg-rose-500/10 transition-all duration-300 flex items-center gap-2.5 text-rose-400 font-medium"
                >
                  <LogOut size={14} className="transition-transform duration-300 group-hover/logout:-translate-x-0.5 group-hover/logout:rotate-[-12deg]" />
                  {isGuest ? 'Reset Session' : 'Logout'}
                </button>
              </div>
            </div>
          </div>
      </header>

      {/* ─── MOBILE DRAWER (<lg) ─── */}
      {/* Overlay */}
      <div
        ref={overlayRef}
        onClick={closeDrawer}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        style={{ display: 'none', opacity: 0 }}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed top-0 right-0 bottom-0 z-50 w-72 bg-[#141414] border-l border-white/5 lg:hidden overflow-y-auto"
        style={{ transform: 'translateX(100%)' }}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <Link to="/dashboard" onClick={closeDrawer} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-gold to-gold-2 flex items-center justify-center font-bold text-xs text-black">
              FS
            </div>
            <div className="leading-tight">
              <div className="font-bold text-sm text-white font-display tracking-tight">FinSight</div>
              <div className="text-[8px] uppercase tracking-widest text-white/40 font-medium">Market Intelligence</div>
            </div>
          </Link>
          <button
            onClick={closeDrawer}
            className="w-8 h-8 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white/70 transition-all duration-300"
          >
            <X size={16} />
          </button>
        </div>

        {/* Drawer nav links */}
        <nav className="p-3 space-y-1">
          {allNavItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.path)
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={handleNavClick}
                className={`drawer-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                  active
                    ? 'bg-gold/10 text-gold border border-gold/20'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.03]'
                }`}
              >
                <Icon size={18} className={active ? 'text-gold' : ''} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Drawer footer */}
        <div className="absolute bottom-0 inset-x-0 p-4 border-t border-white/5 space-y-2">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.02] cursor-pointer transition-all duration-300">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gold to-gold-2 flex items-center justify-center text-[9px] font-bold text-black flex-shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white/70 truncate">{displayName}</div>
              <div className="text-[10px] text-white/30">{isGuest ? 'Guest' : (user?.subscription_tier || 'Free')}</div>
            </div>
          </div>
          {isGuest ? (
            <button
              onClick={() => { closeDrawer(); navigate('/login'); }}
              className="group/msignin w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-gold/10 hover:bg-gold/20 text-gold text-sm font-medium transition-all duration-300 border border-gold/20 hover:shadow-lg hover:shadow-gold/10"
            >
              <Sparkles size={14} className="transition-transform duration-300 group-hover/msignin:scale-110 group-hover/msignin:rotate-12" />
              Sign In
            </button>
          ) : (
            <button
              onClick={() => { closeDrawer(); handleLogout(); }}
              className="group/mlogout w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-sm font-medium transition-all duration-300 border border-rose-500/20 hover:shadow-lg hover:shadow-rose-500/10"
            >
              <LogOut size={14} className="transition-transform duration-300 group-hover/mlogout:-rotate-12 group-hover/mlogout:scale-110" />
              Logout
            </button>
          )}
        </div>
      </div>
    </>
  )
}
