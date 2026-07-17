/**
 * GSAP Animation Hooks — Terminal Green Edition
 *
 * Provides:
 *  - useGsapCounter: Animate a number from 0 to target
 *  - useGsapMouseGlow: Mouse-following glow effect on cards
 *  - useGsapEntrance: Entrance animation with ScrollTrigger
 *  - useGsapStagger: Staggered entrance for children
 */

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/* ─── useGsapCounter ──────────────────────────────────────────────────── */
export function useGsapCounter(
  ref: React.RefObject<HTMLDivElement | null>,
  value: number,
  options?: { duration?: number; decimals?: number; prefix?: string; suffix?: string }
) {
  const animRef = useRef<gsap.core.Tween | null>(null)
  const { duration = 1.2, decimals = 0, prefix = '', suffix = '' } = options || {}

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const obj = { val: 0 }

    if (animRef.current) animRef.current.kill()

    animRef.current = gsap.to(obj, {
      val: value,
      duration,
      ease: 'power3.out',
      onUpdate: () => {
        el.textContent = `${prefix}${obj.val.toFixed(decimals)}${suffix}`
      },
    })

    return () => {
      if (animRef.current) animRef.current.kill()
    }
  }, [value, duration, decimals, prefix, suffix])

  return animRef
}

/* ─── useGsapCounterOnScroll ──────────────────────────────────────────── */
export function useGsapCounterOnScroll(
  ref: React.RefObject<HTMLDivElement | null>,
  value: number,
  options?: { duration?: number; decimals?: number; prefix?: string; suffix?: string; start?: string }
) {
  const hasAnimated = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el || hasAnimated.current) return

    const obj = { val: 0 }
    const { duration = 1.2, decimals = 0, prefix = '', suffix = '', start = 'top 85%' } = options || {}

    const anim = gsap.to(obj, {
      val: value,
      duration,
      ease: 'power3.out',
      paused: true,
      onUpdate: () => {
        el.textContent = `${prefix}${obj.val.toFixed(decimals)}${suffix}`
      },
    })

    ScrollTrigger.create({
      trigger: el,
      start,
      onEnter: () => {
        anim.play()
        hasAnimated.current = true
      },
    })

    return () => {
      anim.kill()
    }
  }, [value])

  return hasAnimated
}

/* ─── useGsapMouseGlow ───────────────────────────────────────────────── */
export function useGsapMouseGlow(
  ref: React.RefObject<HTMLDivElement | null>,
  options?: { color?: string; intensity?: number }
) {
  const color = options?.color || 'rgba(34, 197, 94, 0.08)'
  const intensity = options?.intensity || 30

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const handleMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      gsap.to(el, {
        '--glow-x': `${x}px`,
        '--glow-y': `${y}px`,
        '--glow-opacity': 1,
        duration: 0.3,
        ease: 'power2.out',
        overwrite: 'auto',
      })
    }

    const handleMouseLeave = () => {
      gsap.to(el, {
        '--glow-opacity': 0,
        duration: 0.5,
        ease: 'power2.out',
      })
    }

    el.style.setProperty('--glow-color', color)
    el.style.setProperty('--glow-intensity', `${intensity}px`)

    el.addEventListener('mousemove', handleMouseMove)
    el.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      el.removeEventListener('mousemove', handleMouseMove)
      el.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [color, intensity])

  return ref
}

/* ─── useGsapEntrance ─────────────────────────────────────────────────── */
export function useGsapEntrance(
  ref: React.RefObject<HTMLDivElement | null>,
  options?: {
    from?: gsap.TweenVars
    to?: gsap.TweenVars
    delay?: number
    duration?: number
    ease?: string
    triggerOnce?: boolean
    start?: string
  }
) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      gsap.set(el, { opacity: 1, y: 0 })
      return
    }

    const from = options?.from || { opacity: 0, y: 30 }
    const to = options?.to || {
      opacity: 1,
      y: 0,
      duration: options?.duration || 0.7,
      delay: options?.delay || 0,
      ease: options?.ease || 'power3.out',
    }

    gsap.fromTo(el, from, {
      ...to,
      scrollTrigger: {
        trigger: el,
        start: options?.start || 'top 88%',
        toggleActions: options?.triggerOnce !== false
          ? 'play none none none'
          : 'play none none reset',
      },
    })
  }, [])

  return ref
}

/* ─── useGsapStaggerChildren ──────────────────────────────────────────── */
export function useGsapStaggerChildren(
  ref: React.RefObject<HTMLDivElement | null>,
  options?: {
    stagger?: number
    delay?: number
    duration?: number
    from?: gsap.TweenVars
    start?: string
  }
) {
  useEffect(() => {
    const el = ref.current
    if (!el || !el.children) return

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      gsap.set(el.children, { opacity: 1, y: 0 })
      return
    }

    const from = options?.from || { opacity: 0, y: 30 }

    gsap.fromTo(el.children, from, {
      opacity: 1,
      y: 0,
      duration: options?.duration || 0.5,
      delay: options?.delay || 0,
      stagger: options?.stagger || 0.07,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: el,
        start: options?.start || 'top 88%',
        toggleActions: 'play none none none',
      },
    })
  }, [])

  return ref
}

/* ─── useGsapPageTransition ───────────────────────────────────────────── */
export function useGsapPageTransition(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      gsap.set(el, { opacity: 1, y: 0 })
      return
    }

    gsap.fromTo(el, { opacity: 0, y: 16 }, {
      opacity: 1,
      y: 0,
      duration: 0.4,
      ease: 'power2.out',
    })
  }, [])

  return ref
}

/* ─── useGsapPulse ────────────────────────────────────────────────────── */
export function useGsapPulse(
  ref: React.RefObject<HTMLDivElement | null>,
  enabled = true
) {
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return

    const tl = gsap.timeline({ repeat: -1, yoyo: true })
    tl.to(el, {
      opacity: 0.5,
      scale: 1.05,
      duration: 1.5,
      ease: 'sine.inOut',
    })

    return () => { tl.kill() }
  }, [enabled])

  return ref
}
