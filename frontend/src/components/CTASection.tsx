import { useScrollAnimation } from '@/hooks/useScrollAnimation'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'

export default function CTASection() {
  const navigate = useNavigate()
  const ref = useScrollAnimation('fadeUp')

  return (
    <section ref={ref} className="relative px-4 py-16">
      <div className="relative max-w-4xl mx-auto overflow-hidden rounded-3xl border border-gold/15 bg-gradient-to-br from-[#1a1a1a]/90 via-[#222222]/80 to-[#141414]/40 p-8 md:p-12">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-gold/10 blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-gold/10 blur-[100px] pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex-1 text-center md:text-left">
            <div className="flex items-center gap-2 text-gold text-sm font-semibold mb-3 justify-center md:justify-start">
              <Sparkles size={16} />
              <span>Predictive Intelligence</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold font-display text-white tracking-tight">
              Ready to elevate your{' '}
              <span className="text-gold">trading strategy</span>?
            </h2>
            <p className="text-ink-400 mt-3 text-sm max-w-lg">
              Get real-time ICT signals, multi-model AI predictions, and institutional-grade
              backtesting — all in one platform.
            </p>
          </div>

          <div className="flex gap-3 flex-shrink-0">
            <button
              onClick={() => navigate('/dashboard')}
              className="group relative inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-gold to-gold-2 text-black text-sm font-semibold hover:from-gold hover:to-gold-2 transition-all duration-300 shadow-lg shadow-gold/20 hover:shadow-gold/30"
            >
              <span>Get Started</span>
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </button>
            <button
              onClick={() => navigate('/backtesting')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-gold/20 text-ink-300 text-sm font-semibold hover:bg-white/[0.03] hover:border-gold/30 transition-all duration-300"
            >
              Explore Backtesting
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
