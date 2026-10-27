import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Bleu nuit profond, légèrement chaud (Afrique–Méditerranée)
        nuit: { 950: '#070B14', 900: '#0C1322', 850: '#101A2C', 800: '#152136', 700: '#1F2D47', 600: '#2F3F5E', 400: '#8592AB', 200: '#C9D1DE' },
        ocre: { 600: '#A9682A', 500: '#CF8F45', 400: '#E1AA67', 200: '#F2D9B5' },
        terre: { 600: '#93412A', 500: '#B9583A' },
        sable: '#F3ECDF',
        issa: '#E1AA67',
        moctar: '#4CB9A6',
      },
      fontFamily: {
        titre: ['Georgia', '"Times New Roman"', 'serif'],
        corps: ['var(--font-carlito)', 'Calibri', '"Segoe UI"', '"Helvetica Neue"', 'sans-serif'],
      },
      boxShadow: {
        carte: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 12px 32px -18px rgba(0,0,0,0.7)',
        flottant: '0 18px 40px -12px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.06) inset',
      },
      keyframes: {
        monte: { from: { transform: 'translateY(24px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        fondu: { from: { opacity: '0' }, to: { opacity: '1' } },
        apparait: { from: { transform: 'translateY(6px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
      },
      animation: {
        monte: 'monte .28s cubic-bezier(.2,.8,.2,1)',
        fondu: 'fondu .2s ease-out',
        apparait: 'apparait .32s cubic-bezier(.2,.8,.2,1) both',
      },
    },
  },
  plugins: [],
} satisfies Config;
