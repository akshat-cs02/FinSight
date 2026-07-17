/**
 * @deprecated Sidebar is no longer used in the app.
 * Navigation is now handled by the Navbar component (desktop top bar + mobile drawer).
 * See src/components/Navbar.tsx for the current navigation system.
 *
 * This file is kept as a reference only.
 */

import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import gsap from 'gsap'
import {
  LayoutDashboard,
  TrendingUp,
  Briefcase,
  Newspaper,
  Settings,
  Shield,
  ChevronRight,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const navItemsRef = useRef<(HTMLAnchorElement | null)[]>([])
  const logoRef = useRef<HTMLDivElement>(null)
  const versionRef = useRef<HTMLDivElement>(null)
  const collapseBtnRef = useRef<HTMLButtonElement>(null)
  const activeDotRef = useRef<HTMLSpanElement>(null)

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: TrendingUp, label: 'Stocks', path: '/stocks' },
    { icon: Briefcase, label: 'Portfolio', path: '/portfolio' },
    { icon: Newspaper, label: 'News', path: '/news' },
    ...(user?.is_admin ? [{ icon: Shield, label: 'Admin', path: '/admin' }] : []),
    { icon: Settings, label: 'Settings', path: '/settings' },
  ]

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/')

  // Logo float animation
  useEffect(() => {
    const logo = logoRef.current
    if (!logo) return
    gsap.to(logo, {
      y: -3,
      duration: 3,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    })
  }, [])

  // Nav items stagger entrance on mount
  useEffect(() => {
    const items = navItemsRef.current.filter(Boolean) as HTMLAnchorElement[]
    if (items.length === 0) return
    gsap.fromTo(
      items,
      { x: -20, opacity: 0 },
      {
        x: 0,
        opacity: 1,
        duration: 0.4,
        stagger: 0.05,
        ease: 'power2.out',
        delay: 0.15,
      }
    )
  }, [])

  // GSAP collapse width animation
  useEffect(() => {
    const sidebar = sidebarRef.current
    if (!sidebar) return
    gsap.to(sidebar, {
      width: collapsed ? 64 : 256,
      duration: 0.4,
      ease: 'power3.out',
    })
  }, [collapsed])

  // Version text fade out/in on collapse
  useEffect(() => {
    const ver = versionRef.current
    if (!ver) return
    gsap.to(ver, {
      opacity: collapsed ? 0 : 1,
      duration: 0.3,
      ease: 'power2.out',
    })
  }, [collapsed])

  // Collapse button rotation
  useEffect(() => {
    const btn = collapseBtnRef.current
    if (!btn) return
    gsap.to(btn, {
      rotation: collapsed ? 0 : 180,
      duration: 0.35,
      ease: 'power3.out',
    })
  }, [collapsed])

  // Active dot animation — slide to active item
  useEffect(() => {
    const dot = activeDotRef.current
    if (!dot) return
    const activeIdx = menuItems.findIndex((item) => isActive(item.path))
    if (activeIdx < 0) return
    const activeEl = navItemsRef.current[activeIdx]
    if (!activeEl) return

    const parent = sidebarRef.current?.querySelector('nav')
    if (!parent) return

    const activeRect = activeEl.getBoundingClientRect()
    const parentRect = parent.getBoundingClientRect()
    const top = activeRect.top - parentRect.top + activeRect.height / 2 - 8

    gsap.to(dot, {
      top,
      duration: 0.4,
      ease: 'power3.out',
    })
  }, [location.pathname])

  return (
    <aside
      ref={sidebarRef}
      className="h-screen flex flex-col overflow-hidden border-r border-white/5 bg-[#0a120a]/80 backdrop-blur-xl"
    >
      {/* Logo */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
        <div ref={logoRef} className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center font-bold text-sm text-white font-display shadow-lg shadow-green-500/20 flex-shrink-0">
            FS
          </div>
          {!collapsed && (
            <div className="leading-tight overflow-hidden">
              <div className="font-bold text-lg text-white tracking-tight font-display whitespace-nowrap">
                FinSight
              </div>
              <div className="text-[10px] uppercase tracking-widest bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent font-medium">
                AI-Powered
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto relative">
        {/* Animated active dot indicator */}
        <span
          ref={activeDotRef}
          className="absolute left-1 w-[3px] h-4 rounded-full bg-gradient-to-b from-green-400 to-emerald-400"
        />

        {menuItems.map((item, idx) => {
          const Icon = item.icon
          const active = isActive(item.path)
          return (
            <Link
              key={item.path}
              to={item.path}
              ref={(el) => { navItemsRef.current[idx] = el }}
              className={`group flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 relative ${
                active
                  ? 'bg-green-500/10 text-white border border-green-500/20 shadow-sm shadow-green-500/5'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/[0.03]'
              }`}
              title={item.label}
            >
              <Icon
                size={18}
                className={`transition-all duration-300 group-hover:translate-x-1 ${
                  active ? 'text-green-400' : ''
                }`}
              />
              {!collapsed && (
                <span className="text-sm font-medium transition-all duration-300 group-hover:translate-x-1">
                  {item.label}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Version + Collapse */}
      <div className="p-4 border-t border-white/5 flex items-center justify-between flex-shrink-0">
        <div ref={versionRef} className="text-xs text-white/30 space-y-1">
          <p className="font-mono">v1.0.0</p>
          <p>© 2026 FinSight</p>
        </div>
        <button
          ref={collapseBtnRef}
          onClick={onToggle}
          className="text-white/40 hover:text-white/80 transition-all duration-300 p-1 flex-shrink-0"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </aside>
  )
}
