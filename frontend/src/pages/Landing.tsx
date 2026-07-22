import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, Brain, BarChart2, Briefcase, ArrowRight, Sparkles } from 'lucide-react'
import gsap from 'gsap'
import CanvasParticles from '@/components/CanvasParticles'
import FloatingOrbs from '@/components/FloatingOrbs'

const features = [
  { icon: TrendingUp, title: 'Real-time Market Data', desc: 'Live stock prices, forex rates, and market indicators updated in real-time.' },
  { icon: Brain, title: 'AI Predictions', desc: 'LSTM + XGBoost ensemble models for accurate price predictions.' },
  { icon: BarChart2, title: 'Backtesting', desc: 'Test your trading strategies against historical data.' },
  { icon: Briefcase, title: 'Portfolio Tracking', desc: 'Track your investments and monitor performance.' },
]

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null)
  const featuresRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.hero-title', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out', delay: 0.2 })
      gsap.fromTo('.hero-sub', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', delay: 0.4 })
      gsap.fromTo('.hero-cta', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out', delay: 0.6 })
      gsap.fromTo('.feature-card', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.12, ease: 'power2.out', delay: 0.8 })
    }, heroRef)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={heroRef} className="min-h-screen bg-[#0a0a0a] relative overflow-hidden">
      <CanvasParticles count={12} speed={0.15} connectDistance={120} />
      <FloatingOrbs />

      {/* Nav */}
      <nav className="relative z-20 flex items-center justify-between px-6 lg:px-12 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gold to-gold-2 flex items-center justify-center font-bold text-sm text-black shadow-lg shadow-gold/20">FS</div>
          <div>
            <div className="font-bold text-sm text-white font-display tracking-tight">FinSight</div>
            <div className="text-[9px] uppercase tracking-widest text-white/40 font-medium">Market Intelligence</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm text-white/60 hover:text-white transition-colors duration-300">Sign In</Link>
          <Link to="/register" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold hover:bg-gold/90 text-black text-sm font-semibold transition-all duration-300 shadow-lg shadow-gold/20">
            Get Started <ArrowRight size={14} />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pt-24 pb-32 text-center">
        <div className="hero-title">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold/10 border border-gold/20 text-gold text-xs font-medium mb-8">
            <Sparkles size={12} /> AI-Powered Market Intelligence
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-display font-bold text-white leading-tight mb-6">
            Trade Smarter with<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold to-gold-2">AI-Driven Insights</span>
          </h1>
        </div>
        <p className="hero-sub text-lg text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
          ICT/SMC structure fused with LSTM + XGBoost ensemble. Entries, targets, and confidence in plain numbers.
        </p>
        <div className="hero-cta flex items-center justify-center gap-4">
          <Link to="/register" className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-gold to-gold-2 text-black font-semibold text-base shadow-xl shadow-gold/25 hover:shadow-gold/40 hover:scale-105 transition-all duration-300">
            Start Free <ArrowRight size={18} />
          </Link>
          <Link to="/login" className="flex items-center gap-2 px-8 py-3.5 rounded-xl border border-white/10 text-white/70 hover:text-white hover:border-white/20 hover:bg-white/[0.03] font-medium text-base transition-all duration-300">
            Sign In
          </Link>
        </div>
      </section>

      {/* Features */}
      <section ref={featuresRef} className="relative z-10 max-w-6xl mx-auto px-6 pb-32">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f) => {
            const Icon = f.icon
            return (
              <div key={f.title} className="feature-card group p-6 rounded-2xl bg-[#141414]/80 backdrop-blur-sm border border-white/5 hover:border-gold/20 hover:bg-[#1a1a1a] transition-all duration-500 hover:shadow-lg hover:shadow-gold/5">
                <div className="w-11 h-11 rounded-xl bg-gold/10 flex items-center justify-center mb-4 group-hover:bg-gold/15 transition-colors duration-300">
                  <Icon size={20} className="text-gold" />
                </div>
                <h3 className="text-sm font-semibold text-white mb-2 font-display">{f.title}</h3>
                <p className="text-xs text-white/40 leading-relaxed">{f.desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-8 text-center">
        <p className="text-xs text-white/30">&copy; {new Date().getFullYear()} FinSight. All rights reserved.</p>
      </footer>
    </div>
  )
}
