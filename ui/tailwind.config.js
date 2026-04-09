/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Courier New', 'monospace'],
      },
      colors: {
        surface: {
          950: '#0a0e1a',
          900: '#0f1629',
          800: '#161d35',
          700: '#1e2847',
        },
        cloud2: {
          purple: {
            DEFAULT: '#A335FC',
            dark: '#8B2BD9',
            light: '#BB5DFF',
            soft: '#F5E6FF',
          },
        },
        accent: {
          purple: '#a855f7',
          cyan: '#06b6d4',
          green: '#10b981',
          red: '#ef4444',
        },
      },
      boxShadow: {
        'glow-purple': '0 0 20px rgba(163, 53, 252, 0.3)',
        'glow-cyan': '0 0 20px rgba(6, 182, 212, 0.3)',
        'glow-purple-lg': '0 0 40px rgba(163, 53, 252, 0.4)',
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 15px rgba(163, 53, 252, 0.3)' },
          '50%': { boxShadow: '0 0 30px rgba(6, 182, 212, 0.5)' },
        },
      },
    },
  },
  plugins: [],
}
