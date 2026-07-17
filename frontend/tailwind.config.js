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
        base:    '#09090B',
        surface: '#111827',
        'surface-2': '#1A2235',
        'surface-3': '#20293F',

        // Page accents
        indigo:  '#6366F1',
        emerald:'#10B981',
        purple:  '#8B5CF6',
        blue:    '#3B82F6',
        amber:   '#F59E0B',
        rose:    '#F43F5E',
        teal:    '#14B8A6',
        orange:  '#F97316',
        cyan:    '#06B6D4',

        // Semantic
        green:   '#22C55E',
        red:     '#EF4444',
        warn:    '#F59E0B',
        info:    '#3B82F6',

        // Text
        ink: {
          50:  '#FAFAFA',
          100: '#F5F5F5',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      boxShadow: {
        'elev-1': '0 1px 2px rgba(0,0,0,0.5)',
        'elev-2': '0 4px 12px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        'elev-3': '0 12px 32px -8px rgba(0,0,0,0.5), 0 4px 8px rgba(0,0,0,0.3)',
        'elev-4': '0 24px 48px -16px rgba(0,0,0,0.6)',
        'glow-indigo':  '0 0 24px -4px rgba(99,102,241,0.35)',
        'glow-emerald': '0 0 24px -4px rgba(16,185,129,0.35)',
        'glow-purple':  '0 0 24px -4px rgba(139,92,246,0.35)',
        'glow-blue':    '0 0 24px -4px rgba(59,130,246,0.35)',
        'glow-amber':   '0 0 24px -4px rgba(245,158,11,0.35)',
        'glow-rose':    '0 0 24px -4px rgba(244,63,94,0.35)',
        'glow-teal':    '0 0 24px -4px rgba(20,184,166,0.35)',
      },
      animation: {
        'float':     'float 6s ease-in-out infinite',
        'float-slow':'float 10s ease-in-out infinite',
        'pulse-subtle': 'pulse-subtle 3s ease-in-out infinite',
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
      },
    },
  },
  plugins: [],
  darkMode: 'class',
}
