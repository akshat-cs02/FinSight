import React from 'react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'

/* Spring used everywhere — snappy but organic (Linear/Vercel feel). */
export const spring = { type: 'spring', stiffness: 380, damping: 30, mass: 0.7 } as const
export const springLoose = { type: 'spring', stiffness: 300, damping: 25, mass: 0.8 } as const
export const springStiff = { type: 'spring', stiffness: 500, damping: 35, mass: 0.5 } as const

/* Easing curve matching Apple/Linear premium feel */
const easePremium = [0.22, 1, 0.36, 1] as const
const easeSnap = [0.34, 1.56, 0.64, 1] as const

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

/* ─── Hover lift wrapper for cards ─── */
export function Lift({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      className={className}
      whileHover={reduced ? undefined : { y: -4, scale: 1.005, transition: springLoose }}
      whileTap={reduced ? undefined : { scale: 0.985, transition: { duration: 0.1 } }}
    >
      {children}
    </motion.div>
  )
}

/* ─── Scale-in entrance for modals/popups ─── */
export const scaleInVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: -8, transformOrigin: 'top right' },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.2, ease: easeSnap } },
  exit: { opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.12, ease: 'easeIn' } },
}
