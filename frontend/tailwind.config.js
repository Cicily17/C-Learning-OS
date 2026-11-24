/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#050d0a',
          900: '#081611',
          850: '#0b1d16',
          800: '#0f261c',
          700: '#16352a',
          600: '#1d4738',
        },
        neon: {
          DEFAULT: '#8dff4a',
          dim: '#5fbd35',
          soft: '#c6ff94',
        },
        steel: {
          400: '#7d968c',
          500: '#5d756b',
          600: '#3f554c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'Microsoft YaHei', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 0 0 1px rgba(141,255,74,0.06), 0 18px 40px rgba(0,0,0,0.35)',
        glow: '0 0 18px rgba(141,255,74,0.18)',
      },
    },
  },
  plugins: [],
}
