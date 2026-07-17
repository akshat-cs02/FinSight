import { useEffect, useRef } from 'react'
import gsap from 'gsap'

export default function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const logoRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const subtitleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tl = gsap.timeline({
      onComplete: () => {
        gsap.to(containerRef.current, {
          opacity: 0,
          duration: 0.5,
          ease: 'power2.out',
          onComplete: onFinish,
        })
      },
    })

    // Logo entrance: scale up + rotate in
    tl.fromTo(
      logoRef.current,
      { scale: 0, opacity: 0, rotation: -20 },
      { scale: 1, opacity: 1, rotation: 0, duration: 0.6, ease: 'back.out(1.7)' }
    )
    // Brand text fade + slide up
    tl.fromTo(
      textRef.current,
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out' },
      '-=0.2'
    )
    // Subtitle fade in
    tl.fromTo(
      subtitleRef.current,
      { y: 10, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' },
      '-=0.15'
    )
    // Hold briefly so the user sees the full brand
    tl.to({}, { duration: 0.8 })
  }, [onFinish])

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0a0a0a]"
    >
      {/* Logo */}
      <div ref={logoRef} className="mb-6">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gold to-gold-2 flex items-center justify-center font-bold text-2xl text-black shadow-2xl shadow-gold/30">
          FS
        </div>
      </div>

      {/* Brand name */}
      <div ref={textRef} className="text-center">
        <h1 className="text-3xl font-bold font-display text-white tracking-tight">
          FinSight
        </h1>
      </div>

      {/* Subtitle */}
      <div ref={subtitleRef} className="mt-2">
        <p className="text-sm text-ink-400 font-medium tracking-wider uppercase text-[10px]">
          Market Intelligence
        </p>
      </div>

      {/* Loading dots */}
      <div className="absolute bottom-12 flex gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-gold/40"
            style={{
              animation: `splashPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes splashPulse {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  )
}
