/**
 * tailwind.config.js
 * Tailwind CSS configuration for Notara.
 * Custom surface palette matched to the dark editor aesthetic.
 * darkMode: 'class' lets us toggle via <html class="dark">.
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'monospace'],
      },
      colors: {
        // Neutral dark surfaces used throughout the app
        surface: {
          50:  '#f8f8f8',
          100: '#f0f0f0',
          200: '#e4e4e4',
          600: '#3a3a3a',
          700: '#2a2a2a',
          800: '#1e1e1e',
          900: '#141414',
          950: '#0d0d0d',
        },
      },
    },
  },
  plugins: [],
}
