/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Cyberpunk + Dark Tech 语义色板：每种颜色承担明确功能区分
      colors: {
        // 背景层级：深墨黑 → 深蓝灰面板
        void: '#0A0E14',        // 最底层背景
        ink: {
          950: '#10151C',       // 页面背景 #10151C
          900: '#151C26',       // 顶栏/次级
          850: '#19212B',       // 面板背景 #19212B
          800: '#1F2936',       // 输入/卡片
          700: '#2A3543',       // 边框
          600: '#3A4757',       // 边框强调
        },
        // 主强调色：荧光绿（主操作/成功/完成）
        neon: {
          DEFAULT: '#58EB04',
          dim: '#3FA803',
          soft: '#97F75E',
        },
        // 功能分区色
        learn: { DEFAULT: '#38BDF8', dim: '#1E93C9', soft: '#7DD3FC' }, // 学习模块：电光蓝
        ai: { DEFAULT: '#A78BFA', dim: '#7C5FE0', soft: '#C9B8FF' },    // AI 功能：科技紫
        challenge: { DEFAULT: '#FFAA36', dim: '#D6891B', soft: '#FFC978' }, // 挑战任务：活力橙
        danger: { DEFAULT: '#FF5B64', dim: '#D63E47', soft: '#FF9096' },    // 错误提示：警示红
        progress: { DEFAULT: '#2DD4BF', dim: '#159E8C', soft: '#6EE7D8' },  // 学习进度：科技青
        // 文字
        text: {
          primary: '#E8EDF4',
          secondary: '#94A3B8',
        },
        steel: {
          300: '#B6C2D2',
          400: '#94A3B8',       // 次要文字 #94A3B8
          500: '#64748B',
          600: '#475569',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'Microsoft YaHei', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      // 字号统一走 Astryx 主题的语义 token，避免页面里散落的硬编码小字号
      fontSize: {
        '2xs': ['var(--text-supporting-size)', { lineHeight: '1.5' }],
        xs: ['var(--text-supporting-size)', { lineHeight: '1.5' }],
        sm: ['var(--text-label-size)', { lineHeight: '1.45' }],
        base: ['var(--text-body-size)', { lineHeight: '1.5' }],
        lg: ['var(--text-large-size)', { lineHeight: '1.4' }],
        xl: ['var(--text-heading-2-size)', { lineHeight: '1.35' }],
        '2xl': ['var(--text-heading-1-size)', { lineHeight: '1.3' }],
        '3xl': ['var(--text-display-1-size)', { lineHeight: '1.25' }],
      },
      boxShadow: {
        panel: '0 0 0 1px rgba(88,235,4,0.05), 0 18px 44px rgba(0,0,0,0.45)',
        'glow-green': '0 0 16px rgba(88,235,4,0.28)',
        'glow-blue': '0 0 16px rgba(56,189,248,0.28)',
        'glow-purple': '0 0 16px rgba(167,139,250,0.30)',
        'glow-orange': '0 0 16px rgba(255,170,54,0.28)',
        glow: '0 0 18px rgba(88,235,4,0.22)',
      },
      backgroundImage: {
        'grid-cyber': 'linear-gradient(rgba(88,235,4,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(88,235,4,0.06) 1px, transparent 1px)',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        'scan': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
        'scan': 'scan 6s linear infinite',
        'fade-up': 'fade-up 0.4s ease-out both',
      },
    },
  },
  plugins: [],
}
