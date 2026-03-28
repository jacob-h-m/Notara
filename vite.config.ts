/**
 * vite.config.ts
 * Vite configuration for Notara.
 * - @vitejs/plugin-react handles React/JSX fast refresh in the renderer.
 * - Electron main/preload are compiled separately via `npm run build:electron`
 *   (esbuild, compatible with all Vite versions).
 * - Use `npm run electron:dev` (scripts/start-electron-dev.js) to run in dev
 *   mode. That script builds electron/, starts Vite, polls for readiness, then
 *   spawns Electron. vite-plugin-electron is NOT used — it would launch a second
 *   Electron process and conflict with the custom launcher.
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Add visualizer only when running analysis to avoid extra dev deps in CI
const shouldAnalyze = process.env.ANALYZE === 'true'

export default defineConfig(async () => {
  const plugins: any[] = [react()]

  return {
    base: './',
    plugins,
    build: {
      // Ensure assets imported in code are not renamed with hashes
      // so URLs remain consistent in Electron app
      assetsInlineLimit: 0,
      rollupOptions: {
        plugins: shouldAnalyze
          ? [
              // lazy import the visualizer to avoid hard dependency during dev
              (await import('rollup-plugin-visualizer')).visualizer({
                filename: 'dist/stats.html',
                open: false,
              }),
            ]
          : [],
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
  }
})
