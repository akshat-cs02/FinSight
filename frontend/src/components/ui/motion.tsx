/**
 * Motion primitives — the app's animation vocabulary.
 * All primitives respect prefers-reduced-motion automatically.
 */
import React from 'react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'

/* Spring used everywhere — snappy but organic (Linear/Vercel feel). */
export const spring = { type: 'spring', stiffness: 380, damping: 30, mass: 0.7 } as const

/* ─── Page transition: fade + rise, exit fade ─── */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 12, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? undefined : { opacity: 0, y: -6, transition: { duration: 0.12 } }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

/* ─── Staggered entrance for grids/lists ─── */
const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.05 } },
}
const staggerChild: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
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

/* ─── Hover lift wrapper for cards ─── */
export function Lift({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      className={className}
      whileHover={reduced ? undefined : { y: -3, transition: spring }}
      whileTap={reduced ? undefined : { scale: 0.985 }}
    >
      {children}
    </motion.div>
  )
}
