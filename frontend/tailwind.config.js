/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        serif: ['"Instrument Serif"', 'serif'],
      },
      colors: {
        // ─── Warm Monochrome surfaces ───
        base:    '#0a0a0a',
        surface: '#141414',
        'surface-2': '#1a1a1a',
        'surface-3': '#222222',

        // ─── Brand accent — Gold ───
        gold:    '#D4A853',
        'gold-2':'#C9952E',
        'gold-3':'#A67B2B',
        'gold-4':'#8B6914',
        'gold-5':'#B8860B',

        // ─── Semantic — keep for financial data ───
        green:   '#22C55E',
        emerald:'#10B981',
        purple:  '#8B5CF6',
        blue:    '#3B82F6',
        amber:   '#F59E0B',
        rose:    '#F43F5E',

        gain:    '#22C55E',
        loss:    '#EF4444',
        neutral: '#9CA3AF',
        warn:    '#F59E0B',
        info:    '#3B82F6',

        // ─── Ink — warm gray text ───
        ink: {
          50:  '#f5f5f0',
          100: '#e5e5e0',
          200: '#d0d0c8',
          300: '#b0b0a8',
          400: '#8a8a8a',
          500: '#707070',
          600: '#585858',
        },
      },
      boxShadow: {
        'elev-1': '0 1px 2px rgba(0,0,0,0.5)',
        'elev-2': '0 4px 12px rgba(0,0,0,0.4)',
        'elev-3': '0 12px 32px -8px rgba(0,0,0,0.5)',
        'elev-card': '0 2px 8px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
        'elev-card-hover': '0 8px 24px -8px rgba(0,0,0,0.5)',
        'glow-gold':   '0 0 24px -4px rgba(212,168,83,0.35)',
        'glow-purple': '0 0 24px -4px rgba(139,92,246,0.35)',
      },
      animation: {
        'float':       'float 6s ease-in-out infinite',
        'float-slow':  'float 10s ease-in-out infinite',
        'float-slower':'float 14s ease-in-out infinite',
        'pulse-subtle': 'pulse-subtle 3s ease-in-out infinite',
        'drift':        'drift 20s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%':     { transform: 'translateY(-8px)' },
        },
        'pulse-subtle': {
          '0%,100%': { opacity: '0.4' },
          '50%':     { opacity: '0.8' },
        },
        drift: {
          '0%,100%': { transform: 'translate(0, 0)' },
          '25%':     { transform: 'translate(10px, -10px)' },
          '50%':     { transform: 'translate(-5px, 5px)' },
          '75%':     { transform: 'translate(8px, -5px)' },
        },
      },
    },
  },
  plugins: [],
  darkMode: 'class',
}
