/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          950: '#0a0a0c',
          900: '#0f0f12',
          850: '#141418',
          800: '#1a1a20',
          700: '#22222b',
        },
        accent: {
          // 与仪表盘折线/强调一致的紫罗兰（≈ violet-500）
          DEFAULT: '#8b5cf6',
          dim: '#7c3aed',
          glow: '#a78bfa',
        },
      },
      boxShadow: {
        panel: '0 0 0 1px rgba(255,255,255,0.06), 0 24px 48px -12px rgba(0,0,0,0.65)',
        glow: '0 0 40px -10px rgba(139,92,246,0.45)',
      },
      keyframes: {
        /** 购买套餐 Ultra 卡：外扩光弱；靠明暗 + 略缩放突出呼吸 */
        'ultra-card-edge': {
          '0%, 100%': {
            opacity: '0.32',
            transform: 'scale(1)',
            boxShadow:
              '0 0 0 1px rgba(167,139,250,0.22), 0 0 28px -14px rgba(139,92,246,0.28)',
          },
          '50%': {
            opacity: '1',
            transform: 'scale(1.024)',
            boxShadow:
              '0 0 0 1px rgba(221,214,254,0.75), 0 0 44px -10px rgba(139,92,246,0.72), 0 0 64px -14px rgba(167,139,250,0.32)',
          },
        },
      },
      animation: {
        'ultra-card-edge': 'ultra-card-edge 2.2s cubic-bezier(0.42, 0, 0.58, 1) infinite',
      },
    },
  },
  plugins: [],
}
