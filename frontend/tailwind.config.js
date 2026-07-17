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
        // Surface palette (per brief)
        canvas: '#050816',
        surface: '#0D1323',
        card: '#131B2E',
        'card-2': '#18243A',

        // Semantic
        positive: '#22C55E',
        negative: '#EF4444',
        warn: '#F59E0B',
        info: '#3B82F6',

        // Accents
        electric: '#2563EB',
        royal: '#7C3AED',
        emerald: '#10B981',
        amber: '#F59E0B',
        rose: '#F43F5E',
        cyan: '#06B6D4',
        indigo: '#6366F1',
        orange: '#F97316',

        // Subtle text scale
        ink: {
          900: '#FFFFFF',
          800: '#F1F5F9',
          700: '#CBD5E1',
          600: '#94A3B8',
          500: '#64748B',
          400: '#475569',
          300: '#334155',
          200: '#1E293B',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'mesh-emerald': 'radial-gradient(at 30% 20%, rgba(16,185,129,0.15) 0px, transparent 50%), radial-gradient(at 70% 60%, rgba(59,130,246,0.10) 0px, transparent 50%)',
        'mesh-purple': 'radial-gradient(at 20% 30%, rgba(124,58,237,0.18) 0px, transparent 50%), radial-gradient(at 80% 70%, rgba(99,102,241,0.10) 0px, transparent 50%)',
        'mesh-blue':    'radial-gradient(at 25% 25%, rgba(59,130,246,0.18) 0px, transparent 50%), radial-gradient(at 75% 75%, rgba(6,182,212,0.10) 0px, transparent 50%)',
        'mesh-cyan':    'radial-gradient(at 30% 30%, rgba(6,182,212,0.20) 0px, transparent 50%), radial-gradient(at 70% 70%, rgba(99,102,241,0.10) 0px, transparent 50%)',
        'mesh-orange':  'radial-gradient(at 25% 25%, rgba(249,115,22,0.18) 0px, transparent 50%), radial-gradient(at 80% 80%, rgba(245,158,11,0.10) 0px, transparent 50%)',
        'mesh-rose':    'radial-gradient(at 30% 30%, rgba(244,63,94,0.18) 0px, transparent 50%), radial-gradient(at 70% 70%, rgba(217,70,239,0.10) 0px, transparent 50%)',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        'display-2xl': ['4.5rem', { lineHeight: '1.05', letterSpacing: '-0.04em', fontWeight: '700' }],
        'display-xl':  ['3.75rem', { lineHeight: '1.05', letterSpacing: '-0.035em', fontWeight: '700' }],
        'display-lg':  ['3rem',   { lineHeight: '1.1',  letterSpacing: '-0.03em',  fontWeight: '700' }],
        'display-md':  ['2.25rem',{ lineHeight: '1.15', letterSpacing: '-0.025em', fontWeight: '700' }],
        'display-sm':  ['1.75rem',{ lineHeight: '1.2',  letterSpacing: '-0.02em',  fontWeight: '600' }],
      },
      letterSpacing: {
        'tightest': '-0.04em',
        'tighter': '-0.025em',
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(2, 6, 23, 0.4)',
        'glass-lg': '0 24px 48px -12px rgba(2, 6, 23, 0.6)',
        'glow-emerald': '0 0 24px -4px rgba(16,185,129,0.45)',
        'glow-blue': '0 0 24px -4px rgba(59,130,246,0.45)',
        'glow-purple': '0 0 24px -4px rgba(124,58,237,0.45)',
        'glow-cyan': '0 0 24px -4px rgba(6,182,212,0.45)',
        'glow-orange': '0 0 24px -4px rgba(249,115,22,0.45)',
        'glow-rose': '0 0 24px -4px rgba(244,63,94,0.45)',
        'inner-glow': 'inset 0 0 0 1px rgba(255,255,255,0.06)',
        'elev-1': '0 1px 2px rgba(0,0,0,0.4), 0 1px 1px rgba(0,0,0,0.2)',
        'elev-2': '0 4px 12px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.3)',
        'elev-3': '0 16px 32px -8px rgba(0,0,0,0.5), 0 4px 8px rgba(0,0,0,0.3)',
        'elev-4': '0 24px 56px -16px rgba(0,0,0,0.6), 0 8px 16px rgba(0,0,0,0.4)',
      },
      backdropBlur: {
        '4xl': '72px',
      },
      animation: {
        'pulse-slow':  'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in':    'slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in':     'fadeIn 0.4s ease-out both',
        'bounce-slow': 'bounce 2s infinite',
        'shimmer':     'shimmer 2.5s linear infinite',
      },
      keyframes: {
        slideIn:  { '0%': { transform: 'translateX(-12px)', opacity: '0' }, '100%': { transform: 'translateX(0)', opacity: '1' } },
        fadeIn:   { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        shimmer:  { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        float:    { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        glowPulse: { '0%,100%': { opacity: '0.4' }, '50%': { opacity: '1' } },
      },
    },
  },
  plugins: [],
  darkMode: 'class',
  safelist: [
    'bg-blue-400/60', 'bg-purple-400/60', 'bg-emerald-400/60', 'bg-cyan-400/60', 'bg-rose-400/60', 'bg-amber-400/60',
    'bg-blue-500/10', 'bg-purple-500/10', 'bg-emerald-500/10', 'bg-cyan-500/10', 'bg-rose-500/10', 'bg-amber-500/10', 'bg-white/[0.06]',
    'text-blue-400', 'text-purple-400', 'text-emerald-400', 'text-cyan-400', 'text-rose-400', 'text-amber-400',
    'border-blue-400/20', 'border-purple-400/20', 'border-emerald-400/20', 'border-cyan-400/20', 'border-rose-400/20', 'border-amber-400/20',
    'border-blue-500/20', 'border-purple-500/20', 'border-emerald-500/20', 'border-cyan-500/20', 'border-rose-500/20', 'border-amber-500/20',
  ],
}
