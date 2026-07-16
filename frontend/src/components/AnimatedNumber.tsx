import { useEffect, useRef, useState } from 'react'

interface Props {
  value: number
  duration?: number
  decimals?: number
  prefix?: string
  suffix?: string
  className?: string
  formatFn?: (v: number) => string
}

export default function AnimatedNumber({
  value, duration = 600, decimals, prefix = '', suffix = '',
  className = '', formatFn,
}: Props) {
  const [display, setDisplay] = useState(value)
  const raf = useRef<number>(0)
  const startTime = useRef<number>(0)
  const from = useRef(value)

  useEffect(() => {
    from.current = display
    startTime.current = 0
    cancelAnimationFrame(raf.current)

    const step = (ts: number) => {
      if (!startTime.current) startTime.current = ts
      const t = Math.min((ts - startTime.current) / duration, 1)
      const ease = 1 - Math.pow(1 - t, 3)
      setDisplay(from.current + (value - from.current) * ease)
      if (t < 1) raf.current = requestAnimationFrame(step)
    }

    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [value, duration])

  const formatted = formatFn ? formatFn(display) : display.toFixed(decimals ?? 2)
  return <span className={className}>{prefix}{formatted}{suffix}</span>
}
