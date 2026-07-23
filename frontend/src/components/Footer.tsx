import { useScrollAnimation } from '@/hooks/useScrollAnimation'
import { Brain, Twitter, Mail, ChevronUp, BookOpen } from 'lucide-react'

const footerLinks = [
  {
    label: 'Platform',
    links: [
      { text: 'Dashboard', href: '/dashboard' },
      { text: 'Predictions', href: '/predictions' },
      { text: 'Portfolio', href: '/portfolio' },
      { text: 'Backtesting', href: '/backtesting' },
    ],
  },
  {
    label: 'Markets',
    links: [
      { text: 'US Stocks', href: '/stocks/AAPL' },
      { text: 'India Markets', href: '/stocks/RELIANCE.NS' },
      { text: 'Forex', href: '/stocks/EURUSD=X' },
      { text: 'Crypto', href: '/stocks/BTC-USD' },
    ],
  },
  {
    label: 'Resources',
    links: [
      { text: 'News', href: '/news' },
      { text: 'API Docs', href: '/api/docs' },
      { text: 'Support', href: 'mailto:support@finsight.app' },
    ],
  },
]

export default function Footer() {
  const ref = useScrollAnimation('fadeUp')

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <footer ref={ref} className="relative border-t border-gold/10 bg-[var(--panel)]">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gold to-gold-2 flex items-center justify-center font-bold text-sm text-black shadow-lg shadow-gold/20">
                FS
              </div>
              <div>
                <div className="font-bold text-sm text-[var(--text)] font-display tracking-tight">FinSight</div>
                <div className="text-[10px] text-ink-400">Market Intelligence</div>
              </div>
            </div>
            <p className="text-xs text-[var(--dim)] leading-relaxed max-w-xs">
              Real-time market analysis with ICT/SMC signals, multi-model AI predictions,
              and institutional-grade backtesting tools.
            </p>
            <div className="flex gap-3 mt-4">
              <a href="/api/docs" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-lg bg-white/[0.03] hover:bg-gold/10 flex items-center justify-center text-ink-400 hover:text-gold transition-all" title="API Documentation">
                <BookOpen size={14} />
              </a>
              <a href="#" className="w-8 h-8 rounded-lg bg-white/[0.03] hover:bg-gold/10 flex items-center justify-center text-ink-400 hover:text-gold transition-all">
                <Twitter size={14} />
              </a>
              <a href="mailto:support@finsight.app" className="w-8 h-8 rounded-lg bg-white/[0.03] hover:bg-gold/10 flex items-center justify-center text-ink-400 hover:text-gold transition-all">
                <Mail size={14} />
              </a>
            </div>
          </div>

          {footerLinks.map((group) => (
            <div key={group.label}>
              <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--dim)] mb-3">
                {group.label}
              </h3>
              <ul className="space-y-2">
                {group.links.map((link) => (
                  <li key={link.text}>
                    <a
                      href={link.href}
                      className="text-sm text-ink-500 hover:text-ink-200 transition-colors"
                    >
                      {link.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-white/[0.03]">
          <p className="text-xs text-[var(--faint)]">
            © {new Date().getFullYear()} FinSight. All rights reserved.
            <span className="hidden sm:inline mx-2">·</span>
            <span className="block sm:inline text-ink-500">
              Data provided by Yahoo Finance. Not financial advice.
            </span>
          </p>

          <button
            onClick={scrollToTop}
            className="flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-200 transition-colors group"
          >
            <ChevronUp size={14} className="transition-transform group-hover:-translate-y-0.5" />
            Back to top
          </button>
        </div>
      </div>
    </footer>
  )
}
