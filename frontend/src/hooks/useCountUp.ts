/**
 * useCountUp — GSAP-powered number count-up on viewport enter.
 *
 * Usage:
 *   const countRef = useCountUp(12345, { suffix: '+', prefix: '$' })
 *   <span ref={countRef}>0</span>
 *
 * The element's textContent will be animated from 0 to the target value.
 */

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

interface CountUpOptions {
  duration?: number
  prefix?: string
  suffix?: string
  decimals?: number
  separator?: string
  start?: string
  enabled?: boolean
}

function formatNumber(value: number, decimals: number, separator: string): string {
  const parts = value.toFixed(decimals).split('.')
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separator)
  return decimals > 0 ? `${intPart}.${parts[1]}` : intPart
}

export function useCountUp(
  target: number,
  options: CountUpOptions = {}
) {
  const ref = useRef<HTMLSpanElement>(null)
  const {
    duration = 2,
    prefix = '',
    suffix = '',
    decimals = 0,
    separator = ',',
    start = 'top 90%',
    enabled = true,
  } = options

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      el.textContent = `${prefix}${formatNumber(target, decimals, separator)}${suffix}`
      return
    }

    const ctx = gsap.context(() => {
      const obj = { value: 0 }

      gsap.to(obj, {
        value: target,
        duration,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start,
          toggleActions: 'play none none none',
        },
        onUpdate: () => {
          el.textContent = `${prefix}${formatNumber(obj.value, decimals, separator)}${suffix}`
        },
      })
    })

    return () => ctx.revert()
  }, [target, duration, prefix, suffix, decimals, separator, start, enabled])

  return ref
}

export default useCountUp
