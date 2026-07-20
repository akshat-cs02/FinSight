import React from 'react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'

/* Spring used everywhere — snappy but organic (Linear/Vercel feel). */
export const spring = { type: 'spring', stiffness: 380, damping: 30, mass: 0.7 } as const

/* Easing curve matching Apple/Linear premium feel */
const easePremium = [0.22, 1, 0.36, 1] as const

/* ─── Page transition: fade + subtle rise with scale ─── */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 16, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? undefined : { opacity: 0, y: -8, scale: 0.995, transition: { duration: 0.15, ease: easePremium } }}
      transition={{ duration: 0.35, ease: easePremium }}
    >
      {children}
    </motion.div>
  )
}

/* ─── Staggered entrance for grids/lists ─── */
const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.06 } },
}
const staggerChild: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: easePremium } },
}

export function Stagger({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <motion.div className={className} variants={staggerParent} initial="hidden" animate="show">
      {children}
    </motion.div>
  )
}

export function Item({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <motion.div className={className} variants={staggerChild}>
      {children}
    </motion.div>
  )
}

/* ─── Hover lift — CSS-only, no framer-motion needed ─── */
export function Lift({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`${className} transition-all duration-300 ease-out hover:-translate-y-[3px] hover:scale-[1.005] active:scale-[0.99]`}
    >
      {children}
    </div>
  )
}
