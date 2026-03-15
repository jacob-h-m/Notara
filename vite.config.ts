/**
 * vite.config.ts
 * Vite configuration for Notara.
 * - @vitejs/plugin-react handles React/JSX fast refresh in the renderer.
 * - vite-plugin-electron compiles electron/main.ts and electron/preload.ts.
 * - vite-plugin-electron-renderer enables using Electron/Node APIs inside
 *   the renderer in development (optional, safe to remove if unused).
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Electron main process entry point
        entry: 'electron/main.ts',
      },
      {
        // Preload script — bundled separately, exposed via contextBridge
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
      },
    ]),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
