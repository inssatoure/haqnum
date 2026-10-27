import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nuit: { 950: '#070D18', 900: '#0B1526', 800: '#122038', 700: '#1B2D4A', 600: '#29405F', 400: '#6F85A6', 200: '#C6D1E1' },
        ocre: { 600: '#B06F26', 500: '#D08A3A', 400: '#E3A75E', 200: '#F3D5AE' },
        terre: { 600: '#9C3F24', 500: '#C0532F' },
        sable: '#F4ECDF',
        issa: '#E3A75E',
        moctar: '#3FB8A5',
      },
      fontFamily: {
        titre: ['Georgia', '"Times New Roman"', 'serif'],
        corps: ['var(--font-carlito)', 'Calibri', '"Segoe UI"', '"Helvetica Neue"', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
