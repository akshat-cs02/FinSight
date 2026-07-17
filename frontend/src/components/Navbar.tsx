import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, TrendingUp, Brain, BarChart2, Briefcase, Newspaper,
  Settings, Shield, Search, Bell, User, LogOut, Menu, X, Sparkles,
} from 'lucide-react'
import gsap from 'gsap'
import { useAuthStore } from '@/store/authStore'
import SearchBar from '@/components/SearchBar'
import { slideDown } from '@/utils/animations'
import watchlistService from '@/services/watchlistService'

/* ─── Nav items ─── */
const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard',  path: '/dashboard' },
  { icon: TrendingUp,      label: 'Stocks',      path: '/stocks' },
  { icon: Brain,           label: 'Predictions', path: '/predictions' },
  { icon: BarChart2,       label: 'Backtesting', path: '/backtesting' },
  { icon: Briefcase,       label: 'Portfolio',   path: '/portfolio' },
  { icon: Newspaper,       label: 'News',        path: '/news' },
  { icon: Settings,        label: 'Settings',    path: '/settings' },
]

export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)
  const [alertCount, setAlertCount] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  const navRef = useRef<HTMLElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const bellDotRef = useRef<HTMLSpanElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const linksRef = useRef<(HTMLAnchorElement | null)[]>([])

  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    user?.username || user?.email || 'Account'

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
  const [userMenuVisible, setUserMenuVisible] = useState(false)
  useEffect(() => {
    const menu = userMenuRef.current
    if (!menu) return
    if (showUserMenu) {
      setUserMenuVisible(true)
      gsap.fromTo(menu, { opacity: 0, scale: 0.95, y: -4 }, { opacity: 1, scale: 1, y: 0, duration: 0.2, ease: 'power2.out' })
    } else if (userMenuVisible) {
      gsap.to(menu, {
        opacity: 0, scale: 0.95, y: -4, duration: 0.15, ease: 'power2.in',
        onComplete: () => setUserMenuVisible(false),
      })
    }
  }, [showUserMenu])

  const handleLogout = () => { logout(); navigate('/login') }

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
          <div className="flex items-center gap-4 ml-auto">
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

          {/* User avatar */}
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] transition-all duration-300"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold to-gold-2 flex items-center justify-center">
              <User size={15} className="text-black" />
            </div>
            <span className="hidden md:block text-xs font-medium text-white/70">{displayName}</span>
          </button>
          </div>
        </div>

        {/* User dropdown menu */}
        {userMenuVisible && (
          <div className="relative">
            <div
              ref={userMenuRef}
              className="absolute right-4 top-1 mt-1 w-48 bg-[#141414]/95 backdrop-blur-xl rounded-lg shadow-xl border border-white/5 z-50 overflow-hidden"
            >
              <button
                onClick={() => { navigate('/settings'); setShowUserMenu(false) }}
                className="w-full text-left px-4 py-3 text-sm hover:bg-white/[0.04] transition-all duration-300 flex items-center gap-2 text-white/70"
              >
                <Settings size={14} /> Settings
              </button>
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-3 text-sm hover:bg-white/[0.04] transition-all duration-300 flex items-center gap-2 border-t border-white/5 text-rose-400"
              >
                <LogOut size={14} /> Logout
              </button>
            </div>
          </div>
        )}
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
        <div className="absolute bottom-0 inset-x-0 p-4 border-t border-white/5">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.02] cursor-pointer transition-all duration-300">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gold to-gold-2 flex items-center justify-center text-[9px] font-bold text-black flex-shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white/70 truncate">{displayName}</div>
              <div className="text-[10px] text-white/30">Free Plan</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
