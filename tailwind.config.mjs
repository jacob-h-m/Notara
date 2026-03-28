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
        // Neutral surfaces — use CSS variables so hover states update instantly on theme change
        surface: {
          50: '#f8f8f8',
          100: '#f0f0f0',
          200: '#e4e4e4',
          600: 'var(--surface-600)',
          700: 'var(--surface-700)',
          800: 'var(--surface-800)',
          900: 'var(--surface-900)',
          950: 'var(--surface-950)',
        },
        // Map semantic tokens so Tailwind utilities stay theme-aware
        destructive: 'var(--destructive)',
        'destructive-muted': 'var(--destructive-muted)',
        accent: 'var(--accent)',
      },
    },
  },
  plugins: [],
}
