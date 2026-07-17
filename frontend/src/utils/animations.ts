import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/** Stagger entrance for groups of elements */
export function staggerItems(
  elements: Element[] | NodeListOf<Element> | HTMLCollection | HTMLCollectionOf<Element>,
  options?: { delay?: number; stagger?: number; y?: number; duration?: number }
) {
  return gsap.fromTo(
    Array.from(elements),
    { y: options?.y ?? 20, opacity: 0 },
    {
      y: 0,
      opacity: 1,
      duration: options?.duration ?? 0.5,
      stagger: options?.stagger ?? 0.06,
      ease: 'power3.out',
      delay: options?.delay ?? 0,
    }
  )
}

/** Number count-up animation */
export function countUp(el: Element | null, target: number, duration = 1.5) {
  if (!el) return
  return gsap.to(el, {
    innerText: Math.round(target),
    duration,
    ease: 'power2.out',
    snap: { innerText: 1 },
  })
}

/** Page entrance — smooth fade + slide up with scale */
export function pageEnter(container: Element | null) {
  if (!container) return
  const tl = gsap.timeline()
  tl.fromTo(container, { y: 30, opacity: 0, scale: 0.995 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'power3.out' })
  return tl
}

/** Section stagger reveal on scroll */
export function sectionEnter(container: Element | null, options?: { delay?: number }) {
  if (!container) return
  const cards = container.querySelectorAll(':scope > .card, :scope > .card-layer, :scope > .card-surface2, :scope > .card-accent, :scope > [class*="anim-up"]')
  if (!cards.length) return
  return staggerItems(cards, { y: 24, stagger: 0.07, delay: options?.delay ?? 0.1, duration: 0.45 })
}

/** Slide down for navbar entrance */
export function slideDown(element: Element | null) {
  if (!element) return
  return gsap.fromTo(element, { y: -80, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out', delay: 0.1 })
}

/** Mouse glow effect for cards */
export function cardMouseGlow(card: Element) {
  const onMove = (e: Event) => {
    const me = e as MouseEvent
    const rect = card.getBoundingClientRect()
    card.setAttribute('style', `--glow-x: ${me.clientX - rect.left}px; --glow-y: ${me.clientY - rect.top}px; --glow-opacity: 1`)
  }
  const onLeave = () => {
    card.setAttribute('style', '--glow-opacity: 0')
  }
  card.addEventListener('mousemove', onMove)
  card.addEventListener('mouseleave', onLeave)
  return () => {
    card.removeEventListener('mousemove', onMove)
    card.removeEventListener('mouseleave', onLeave)
  }
}

/** Button hover scale animation */
export function buttonHoverScale(btn: Element) {
  btn.addEventListener('mouseenter', () => {
    gsap.to(btn, { scale: 1.02, duration: 0.2, ease: 'power2.out' })
  })
  btn.addEventListener('mouseleave', () => {
    gsap.to(btn, { scale: 1, duration: 0.2, ease: 'power2.out' })
  })
}

/** Marquee animation for ticker */
export function marqueeScroll(el: Element, speed = 1) {
  const itemWidth = el.scrollWidth / 2
  if (itemWidth === 0) return null
  const duration = itemWidth * 0.025 * speed
  gsap.set(el, { x: 0 })
  return gsap.to(el, {
    x: -itemWidth / 2,
    duration,
    ease: 'none',
    repeat: -1,
  })
}

/** Pulse animation for elements */
export function pulseAnim(el: Element) {
  return gsap.to(el, {
    scale: 1.05,
    duration: 1.5,
    ease: 'sine.inOut',
    yoyo: true,
    repeat: -1,
  })
}

/** GSAP-based stagger reveal for framer-motion-like staggered lists */
export function gsapStaggerList(container: Element | null, selector = ':scope > *', options?: { delay?: number; stagger?: number; y?: number }) {
  if (!container) return
  const items = container.querySelectorAll(selector)
  if (!items.length) return
  gsap.fromTo(
    items,
    { y: options?.y ?? 16, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.4, stagger: options?.stagger ?? 0.05, ease: 'power3.out', delay: options?.delay ?? 0.1 }
  )
}
