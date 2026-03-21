/**
 * src/main.tsx
 * React application entry point.
 * Mounts the root <App /> component into #root and imports global styles.
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import './boot-splash'
// Initialize i18n before rendering so all components have translations available.
import './i18n'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Fallback: if the renderer for some reason doesn't emit readiness, ensure the
// in-page splash is removed and the main process is notified after a short
// delay so the app becomes visible during development.
setTimeout(() => {
  try {
    window.dispatchEvent(new Event('notara:app-ready'))
  } catch {}
  try {
    if (window.api?.notifyReady) window.api.notifyReady()
  } catch {}
  try {
    const s = document.getElementById('boot-splash')
    if (s && s.parentNode) s.parentNode.removeChild(s)
  } catch {}
  try {
    const root = document.getElementById('root')
    if (root) (root as HTMLElement).style.opacity = '1'
  } catch {}
}, 700)
