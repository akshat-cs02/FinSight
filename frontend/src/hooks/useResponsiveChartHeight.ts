import { useEffect, useState } from 'react'

/**
 * Returns a responsive chart height based on current viewport width.
 * Mobile-first: scales from 320px (tiny phones) up to the provided `desktopHeight`.
 * Updates on window resize (debounced).
 */
export function useResponsiveChartHeight(desktopHeight = 680): number {
  const getHeight = () => {
    if (typeof window === 'undefined') return desktopHeight
    const w = window.innerWidth
    if (w < 380)  return 280   // very small phones
    if (w < 480)  return 320   // small phones
    if (w < 640)  return 400   // phones
    if (w < 768)  return 480   // large phones / small tablets
    if (w < 1024) return 560   // tablets
    return desktopHeight        // desktop
  }

  const [height, setHeight] = useState(getHeight)

  useEffect(() => {
    let raf: number
    const onResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setHeight(getHeight()))
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(raf)
    }
  }, [desktopHeight])

  return height
}
