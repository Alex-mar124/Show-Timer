/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        show: {
          base:          '#06070d',
          surface:       '#0a0d16',
          card:          '#101524',
          'card-alt':    '#141d2e',
          'panel-alt':   '#0e0a18',
          hover:         '#1a2540',
          border:        '#1c2b42',
          'border-light':'#243650',
        },
      },
      boxShadow: {
        'amber-glow':      '0 0 30px rgba(245,158,11,0.25), 0 0 60px rgba(245,158,11,0.08)',
        'amber-glow-sm':   '0 0 12px rgba(245,158,11,0.3)',
        'green-glow':      '0 0 20px rgba(34,197,94,0.2)',
        'purple-glow-sm':  '0 0 12px rgba(168,85,247,0.25)',
        'card':            '0 4px 24px rgba(0,0,0,0.4)',
      },
      animation: {
        'colon-pulse':  'colonPulse 1s ease-in-out infinite',
        'fade-in-up':   'fadeInUp 0.25s ease-out',
        'slide-in-right':'slideInRight 0.3s ease-out',
        'cue-pulse':    'cuePulse 1.5s ease-in-out infinite',
        'cue-hold':     'cueHold 3s ease-in-out infinite',
      },
      keyframes: {
        colonPulse: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.2' },
        },
        fadeInUp: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%':   { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        cuePulse: {
          '0%, 100%': { boxShadow: '0 0 6px 2px rgba(245,158,11,0.8)', opacity: '1' },
          '50%':      { boxShadow: '0 0 16px 5px rgba(245,158,11,0.2)', opacity: '0.85' },
        },
        cueHold: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.15' },
        },
      },
    },
  },
  plugins: [],
};
