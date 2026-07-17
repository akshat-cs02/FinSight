/**
 * useScrollAnimation — GSAP ScrollTrigger hook for entrance animations.
 *
 * Usage:
 *   const ref = useScrollAnimation('fadeUp')
 *   <div ref={ref}>Animated on scroll</div>
 *
 * Variants:
 *   fadeUp    — opacity 0 → 1, y: 40 → 0
 *   fadeLeft  — opacity 0 → 1, x: -40 → 0
 *   fadeRight — opacity 0 → 1, x: 40 → 0
 *   scaleIn   — opacity 0 → 1, scale: 0.9 → 1
 *   slideUp   — y: 60 → 0 with spring-like power3
 *   flipIn    — rotateX: 15 → 0, opacity
 *   flipInY   — rotateY: 15 → 0, opacity
 *   none      — disabled (for prefers-reduced-motion)
 */

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

type AnimationVariant = 'fadeUp' | 'fadeLeft' | 'fadeRight' | 'scaleIn' | 'slideUp' | 'flipIn' | 'flipInY' | 'none'

const VARIANTS: Record<Exclude<AnimationVariant, 'none'>, gsap.TweenVars> = {
  fadeUp:    { opacity: 0, y: 40 },
  fadeLeft:  { opacity: 0, x: -40 },
  fadeRight: { opacity: 0, x: 40 },
  scaleIn:   { opacity: 0, scale: 0.9 },
  slideUp:   { opacity: 0, y: 60 },
  flipIn:    { opacity: 0, rotationX: 15, y: 20 },
  flipInY:   { opacity: 0, rotationY: 15, x: 20 },
}

export function useScrollAnimation(
  variant: AnimationVariant = 'fadeUp',
  options?: {
    delay?: number
    duration?: number
    stagger?: number
    start?: string
    toggleActions?: string
    markers?: boolean
  }
) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced || variant === 'none') {
      gsap.set(el, { opacity: 1, y: 0, x: 0, scale: 1, rotationX: 0, rotationY: 0 })
      return
    }

    const vars = VARIANTS[variant]
    if (!vars) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        vars,
        {
          opacity: 1,
          y: 0,
          x: 0,
          scale: 1,
          rotationX: 0,
          rotationY: 0,
          duration: options?.duration ?? 0.7,
          delay: options?.delay ?? 0,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el,
            start: options?.start ?? 'top 90%',
            toggleActions: options?.toggleActions ?? 'play none none none',
            markers: options?.markers ?? false,
          },
        }
      )
    })

    return () => ctx.revert()
  }, [variant, JSON.stringify(options)])

  return ref
}

/**
 * Stagger children within a container using GSAP ScrollTrigger.
 */
export function useStaggerAnimation(
  variant: AnimationVariant = 'fadeUp',
  options?: {
    stagger?: number
    duration?: number
    delay?: number
    start?: string
  }
) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced || variant === 'none') {
      gsap.set(el.children, { opacity: 1, y: 0, x: 0, scale: 1 })
      return
    }

    const vars = VARIANTS[variant]
    if (!vars) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el.children,
        vars,
        {
          opacity: 1,
          y: 0,
          x: 0,
          scale: 1,
          duration: options?.duration ?? 0.6,
          delay: options?.delay ?? 0,
          stagger: options?.stagger ?? 0.07,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: options?.start ?? 'top 90%',
            toggleActions: 'play none none none',
          },
        }
      )
    })

    return () => ctx.revert()
  }, [variant, JSON.stringify(options)])

  return ref
}

export default useScrollAnimation
