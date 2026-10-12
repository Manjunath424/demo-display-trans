/** @type {import('tailwindcss').Config} */
export default {
  // Only include classes that are actually used — drastically reduces bundle size
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],

  // Enable class-based dark mode
  darkMode: 'class',

  theme: {
    extend: {
      // ── Translator Brand Colours ──────────────────────────────────────────
      colors: {
        translator: {
          50:  '#eef6ff',
          100: '#d9eaff',
          200: '#bcd8ff',
          300: '#8ebdff',
          400: '#5996ff',
          500: '#3b72f6',   // primary brand blue
          600: '#2450eb',
          700: '#1c3dd8',
          800: '#1d34af',
          900: '#1e318a',
          950: '#161f54',
        },
        accent: {
          50:  '#fdf4ff',
          100: '#fae8ff',
          200: '#f5d0fe',
          300: '#f0abfc',
          400: '#e879f9',
          500: '#d946ef',   // secondary accent purple
          600: '#c026d3',
          700: '#a21caf',
          800: '#86198f',
          900: '#701a75',
          950: '#4a044e',
        },
        success: {
          50:  '#f0fdf4',
          500: '#22c55e',
          700: '#15803d',
        },
        warning: {
          50:  '#fffbeb',
          500: '#f59e0b',
          700: '#b45309',
        },
        danger: {
          50:  '#fef2f2',
          500: '#ef4444',
          700: '#b91c1c',
        },
        surface: {
          DEFAULT: '#ffffff',
          dark: '#0f172a',
          muted: '#f8fafc',
          'muted-dark': '#1e293b',
          border: '#e2e8f0',
          'border-dark': '#334155',
        },
      },

      // ── Typography ─────────────────────────────────────────────────────────
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          '"Fira Code"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },

      // ── Spacing extensions ─────────────────────────────────────────────────
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },

      // ── Box shadows ────────────────────────────────────────────────────────
      boxShadow: {
        'glass': '0 4px 30px rgba(0, 0, 0, 0.1)',
        'glow': '0 0 20px rgba(59, 114, 246, 0.35)',
        'glow-accent': '0 0 20px rgba(217, 70, 239, 0.35)',
        'card': '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06)',
      },

      // ── Animations ─────────────────────────────────────────────────────────
      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%':   { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.4' },
        },
        'strength-fill': {
          '0%':   { width: '0%' },
          '100%': { width: 'var(--tw-width)' },
        },
      },
      animation: {
        'fade-in':        'fade-in 0.25s ease-out',
        'slide-in-right': 'slide-in-right 0.2s ease-out',
        'pulse-dot':      'pulse-dot 1.5s ease-in-out infinite',
      },

      // ── Border radius ──────────────────────────────────────────────────────
      borderRadius: {
        'xl2': '1rem',
        'xl3': '1.25rem',
      },
    },
  },

  plugins: [],
};
