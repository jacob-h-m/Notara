/**
 * src/main.tsx
 * React application entry point.
 * Mounts the root <App /> component into #root and imports global styles.
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
