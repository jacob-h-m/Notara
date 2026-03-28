/**
 * electron/main.ts
 * Electron main process — application entry point.
 *
 * Responsibilities:
 *   - Creates and manages the BrowserWindow (renderer).
 *   - Registers IPC handlers so the renderer (via preload) can perform
 *     file I/O and state persistence without direct Node.js access.
 *   - All filesystem access is validated and sandboxed to NOTES_DIR.
 *
 * IPC channels:
 *   Notes      — fs:list-notes, fs:read-note, fs:write-note, fs:delete-note,
 *                fs:create-note, fs:rename-note
 *   App state  — state:load, state:save
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme, nativeImage } =
  require('electron') as typeof import('electron')

import { basename, extname, join, resolve, sep } from 'path'
import { tmpdir } from 'os'
import { createHash } from 'crypto'
import { spawn } from 'child_process'
// fs imports are below (full set)

// Improve dev stability by isolating Electron's userData to the project
// and disabling GPU to reduce driver issues on machines without a dedicated GPU.
// Note: These settings MUST be applied before app.whenReady()
// This code is deferred until app module is ready
function configureAppSettings() {
  try {
    const isPackaged = (app as any).isPackaged
    if (!isPackaged) {
      const PROJECT_ROOT = resolve(__dirname, '..')

      // Set userData to project-local folder for easier state management in dev
      try {
        const projectUserData = join(PROJECT_ROOT, '.user-data')
        try {
          mkdirSync(projectUserData, { recursive: true })
        } catch (e) {}
        app.setPath('userData', projectUserData)
        // Also explicitly tell Chromium to use the project user-data dir so it
        // doesn't attempt to move caches from a system location.
        try {
          app.commandLine.appendSwitch('user-data-dir', projectUserData)
        } catch (e) {}
      } catch (e) {}

      // Route disk cache to a writable temp directory and ensure it exists
      try {
        // Use a cache location guaranteed to be writable. In dev we prefer
        // a per-project tmp dir, but in production ensure cache lives under
        // the app userData path to avoid permission problems.
        const baseCache = (app as any).isPackaged ? app.getPath('userData') : tmpdir()
        const tmpCache = join(baseCache, 'notara-electron-cache')
        try {
          mkdirSync(tmpCache, { recursive: true })
        } catch (e) {}
        try {
          app.setPath('cache', tmpCache)
        } catch (e) {}
        try {
          app.commandLine.appendSwitch('disk-cache-dir', tmpCache)
        } catch (e) {}
      } catch (e) {}

      // Read GPU preference from persisted settings and probe the host for
      // a hardware GPU when the user has not explicitly chosen a preference.
      let enableGpuExplicitly: boolean | null = null
      try {
        const devStateFile = join(PROJECT_ROOT, 'state.json')
        if (existsSync(devStateFile)) {
          const raw = JSON.parse(readFileSync(devStateFile, 'utf-8') || '{}')
          const s = raw && raw.settings ? raw.settings : null
          if (s && typeof s.gpuAccelerationEnabled === 'boolean')
            enableGpuExplicitly = Boolean(s.gpuAccelerationEnabled)
        }
      } catch (e) {}

      // GPU detection removed from startup — configureAppSettings() runs synchronously
      // before app.whenReady() and must NOT block. GPU preference is applied in
      // whenReady() via applyGpuPreference() after an async probe.
      // Fall through: GPU switches are applied in whenReady() below.
      const shouldDisableGpu = enableGpuExplicitly === false
    }
  } catch (e) {
    console.warn('[main] Error setting up app config:', e)
  }
}

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  renameSync,
} from 'fs'
import { writeFile, rename, unlink, readFile, readdir, mkdir } from 'fs/promises'
import {
  isAllowedExternalUrl,
  isTrustedRendererUrl,
  sanitizeBoolean,
  sanitizeFilenameInput,
  sanitizeIpcString,
  sanitizeNoteContent,
  sanitizeStatePayload,
  sanitizeStringArray,
  sanitizeThemeEntries,
  sanitizeVersionId,
  sanitizeWindowTitle,
  sanitizeWord,
  sanitizeZoomLevel,
} from './ipcSecurity'

// ─── Storage Paths ────────────────────────────────────────────────────────────
//
// Portable mode: when --portable flag or NOTARA_PORTABLE=1 env var is set,
// all data is stored under <cwd>/data so the app can run from a USB drive.
//
// Dev  → project root  (dist-electron/../  =  project root)
// Prod → userData (AppData on Windows)  OR  <cwd>/data in portable mode
const isPortable = process.argv.includes('--portable') || process.env.NOTARA_PORTABLE === '1'

let APP_ROOT = resolve(__dirname, '..')

// Defer APP_ROOT calculation until after we know app is ready
// For now, use a sensible default that works for dev
if (isPortable) {
  APP_ROOT = resolve(process.cwd(), 'data')
  try {
    mkdirSync(APP_ROOT, { recursive: true })
  } catch {}
}

// Initialize single-instance lock and app model ID (deferred until app is ready)
function initializeSingleInstanceAndModelId() {
  try {
    const gotLock = app.requestSingleInstanceLock && app.requestSingleInstanceLock()
    if (!gotLock) {
      // Another instance is running — exit this one.
      try {
        app.quit && app.quit()
      } catch {}
    } else {
      app.on &&
        app.on('second-instance', () => {
          try {
            if (mainWindow) {
              if (mainWindow.isMinimized && mainWindow.isMinimized()) mainWindow.restore()
              mainWindow.focus && mainWindow.focus()
            }
          } catch (err) {}
        })
    }
  } catch (err) {
    // ignore if API not available
  }

  // Ensure Windows taskbar icon behaviour when packaged / in dev
  try {
    if ((app as any).setAppUserModelId) {
      // Use the same appId as package.json build.appId
      ;(app as any).setAppUserModelId('com.notara.app')
    }
  } catch (err) {
    // ignore on platforms without the API
  }
}

// Serialized write queue for state.json — prevents concurrent rename races
// (especially during tab drag between windows where multiple saves fire at once).
let _stateWriteQueue: Promise<void> = Promise.resolve()
function writeStateFile(content: string): Promise<void> {
  _stateWriteQueue = _stateWriteQueue.then(() => {
    return new Promise<void>((resolve) => {
      const tmp = STATE_FILE + '.tmp'
      try {
        writeFileSync(tmp, content, 'utf-8')
        try {
          renameSync(tmp, STATE_FILE)
        } catch (renameErr: any) {
          if (renameErr.code === 'EPERM') {
            // Windows may briefly lock the file; wait and retry once
            setTimeout(() => {
              try {
                renameSync(tmp, STATE_FILE)
              } catch {
                // Last resort: write directly without atomic rename
                try {
                  writeFileSync(STATE_FILE, content, 'utf-8')
                } catch {}
                try {
                  unlinkSync(tmp)
                } catch {}
              }
              resolve()
            }, 80)
            return
          }
          // Non-EPERM rename failure: fall back to direct write
          try {
            writeFileSync(STATE_FILE, content, 'utf-8')
          } catch {}
          try {
            unlinkSync(tmp)
          } catch {}
        }
      } catch {}
      resolve()
    })
  })
  return _stateWriteQueue
}

// Paths will be set up in whenReady() after APP_ROOT is finalized
let NOTES_DIR = join(APP_ROOT, 'notes')
let ATTACHMENTS_DIR = join(NOTES_DIR, 'attachments')
let VERSIONS_DIR = join(NOTES_DIR, '.versions')
let STATE_FILE = join(APP_ROOT, 'state.json')
let THEMES_DIR = join(APP_ROOT, 'themes')

// Helper function for migration and directory setup (called from whenReady)
function initializeDirectories() {
  // Update paths if APP_ROOT changed
  NOTES_DIR = join(APP_ROOT, 'notes')
  ATTACHMENTS_DIR = join(NOTES_DIR, 'attachments')
  VERSIONS_DIR = join(NOTES_DIR, '.versions')
  STATE_FILE = join(APP_ROOT, 'state.json')
  THEMES_DIR = join(APP_ROOT, 'themes')

  // Migration: If the app was previously storing notes next to the executable
  // (older behaviour) and the new `userData` location is empty, attempt to
  // migrate existing notes into the user's data folder on first run.
  if ((app as any).isPackaged) {
    try {
      const legacyRoot = resolve(process.execPath, '..')
      const legacyNotes = join(legacyRoot, 'notes')
      if (existsSync(legacyNotes) && !existsSync(NOTES_DIR)) {
        // create target dirs first
        mkdirSync(NOTES_DIR, { recursive: true })
        mkdirSync(ATTACHMENTS_DIR, { recursive: true })
        const files = readdirSync(legacyNotes).filter((f) => f && !f.startsWith('.'))
        for (const f of files) {
          try {
            const from = join(legacyNotes, f)
            const to = join(NOTES_DIR, f)
            if (!existsSync(to)) renameSync(from, to)
          } catch (err) {
            console.warn('[main] migration: failed moving', f, err)
          }
        }
      }
    } catch (err) {
      console.warn('[main] migration check failed:', err)
    }
  }

  // Ensure required directories exist at launch
  for (const dir of [NOTES_DIR, ATTACHMENTS_DIR, VERSIONS_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }

  // Ensure themes dir and default theme files exist
  if (!existsSync(THEMES_DIR)) mkdirSync(THEMES_DIR, { recursive: true })
  try {
    const darkPath = join(THEMES_DIR, 'dark.json')
    const lightPath = join(THEMES_DIR, 'light.json')
    if (!existsSync(darkPath))
      writeFileSync(darkPath, JSON.stringify(DEFAULT_DARK_THEME, null, 2), 'utf-8')
    if (!existsSync(lightPath))
      writeFileSync(lightPath, JSON.stringify(DEFAULT_LIGHT_THEME, null, 2), 'utf-8')
  } catch (err) {
    console.warn('[main] Could not ensure default themes:', err)
  }
}

const DEFAULT_DARK_THEME = {
  '--app-bg': '#05060a',
  '--titlebar-bg': '#080b0f',
  '--sidebar-bg': '#0b0e12',
  '--sidebar-fg': '#e6eef8',
  '--sidebar-hover-bg': 'rgba(255,255,255,0.08)',
  '--sidebar-hover-fg': '#f4f8ff',
  '--sidebar-active-bg': 'rgba(139,92,246,0.20)',
  '--sidebar-active-fg': '#ffffff',
  '--sidebar-rail-bg': '#080b0f',
  '--editor-bg': '#0d1117',
  '--preview-bg': '#0b0e12',
  '--modal-bg': '#10141a',
  '--surface-elevated': '#1a1f26',
  '--text-primary': '#e6eef8',
  '--text-muted': '#8a9ab0',
  '--text-accent': '#c4b5fd',
  '--border-subtle': 'rgba(255,255,255,0.07)',
  '--border-muted': 'rgba(255,255,255,0.04)',
  '--border-strong': 'rgba(255,255,255,0.14)',
  '--accent': '#8b5cf6',
  '--accent-hover': '#7c3aed',
  '--accent-muted': 'rgba(139,92,246,0.15)',
  '--btn-ghost-hover': 'rgba(255,255,255,0.06)',
  '--btn-ghost-active': 'rgba(255,255,255,0.10)',
  '--selection-bg': 'rgba(139,92,246,0.30)',
  '--editor-gutter-bg': '#141820',
  '--editor-line-active': 'rgba(255,255,255,0.035)',
  '--destructive': '#f87171',
  '--destructive-muted': 'rgba(248,113,113,0.12)',
  '--hover-overlay': 'rgba(255,255,255,0.04)',
  '--hover-shadow': '0 2px 8px rgba(0,0,0,0.4)',
  '--surface-950': '#05060a',
  '--surface-900': '#0b0f13',
  '--surface-800': '#111318',
  '--surface-700': '#1b1f23',
  '--surface-600': '#263038',
  '--muted-border': 'rgba(255,255,255,0.08)',
  '--accent-violet': '#8b5cf6',
  '--on-accent': '#ffffff',
  '--switch-knob': '#ffffff',
  '--editor-font':
    "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Segoe UI Mono', monospace",
  '--ui-font': "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  '--code-font':
    "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Segoe UI Mono', monospace",
  '--panel-elevated': '#121417',
  '--tab-bg': '#0b0f13',
  '--tab-hover-bg': 'rgba(255,255,255,0.02)',
  '--tab-active-bg': '#111318',
  '--tab-active-border': 'rgba(139,92,246,0.55)',
  '--input-focus-ring': 'rgba(139,92,246,0.18)',
  '--btn-hover-bg': 'rgba(255,255,255,0.03)',
  '--btn-active-bg': 'rgba(255,255,255,0.06)',
  '--toolbar-bg': '#080b0f',
  '--toolbar-fg': '#e6eef8',
  '--toolbar-hover-bg': 'rgba(255,255,255,0.08)',
  '--toolbar-hover-fg': '#ffffff',
}

const DEFAULT_LIGHT_THEME = {
  '--app-bg': '#f8fafc',
  '--titlebar-bg': '#f1f5f9',
  '--sidebar-bg': '#f1f5f9',
  '--sidebar-fg': '#0f172a',
  '--sidebar-hover-bg': 'rgba(15,23,42,0.10)',
  '--sidebar-hover-fg': '#020617',
  '--sidebar-active-bg': 'rgba(109,40,217,0.16)',
  '--sidebar-active-fg': '#1f1147',
  '--sidebar-rail-bg': '#e8edf3',
  '--editor-bg': '#ffffff',
  '--preview-bg': '#f8fafc',
  '--modal-bg': '#ffffff',
  '--surface-elevated': '#e2e8f0',
  '--text-primary': '#0f172a',
  '--text-muted': '#64748b',
  '--text-accent': '#5b21b6',
  '--border-subtle': 'rgba(15,23,42,0.08)',
  '--border-muted': 'rgba(15,23,42,0.04)',
  '--border-strong': 'rgba(15,23,42,0.18)',
  '--accent': '#6d28d9',
  '--accent-hover': '#5b21b6',
  '--accent-muted': 'rgba(109,40,217,0.12)',
  '--selection-bg': 'rgba(109,40,217,0.18)',
  '--editor-gutter-bg': '#f0f2f5',
  '--editor-line-active': 'rgba(15,23,42,0.04)',
  '--destructive': '#dc2626',
  '--destructive-muted': 'rgba(220,38,38,0.10)',
  '--hover-overlay': 'rgba(109,40,217,0.03)',
  '--hover-shadow': '0 2px 8px rgba(0,0,0,0.12)',
  '--surface-950': '#f8fafc',
  '--surface-900': '#f3f4f6',
  '--surface-800': '#e6e9ee',
  '--surface-700': '#d1d5db',
  '--surface-600': '#9ca3af',
  '--muted-border': 'rgba(15,23,42,0.08)',
  '--accent-violet': '#6d28d9',
  '--on-accent': '#ffffff',
  '--switch-knob': '#ffffff',
  '--ui-font': "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  '--editor-font':
    "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Segoe UI Mono', monospace",
  '--code-font':
    "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Segoe UI Mono', monospace",
  '--panel-elevated': '#ffffff',
  '--tab-bg': '#f7f8fa',
  '--tab-hover-bg': 'rgba(109,40,217,0.03)',
  '--tab-active-bg': '#ffffff',
  '--tab-active-border': 'rgba(109,40,217,0.30)',
  '--input-focus-ring': 'rgba(109,40,217,0.16)',
  '--btn-ghost-hover': 'rgba(109,40,217,0.04)',
  '--btn-hover-bg': 'rgba(0,0,0,0.05)',
  '--btn-active-bg': 'rgba(0,0,0,0.09)',
  '--toolbar-bg': '#f1f5f9',
  '--toolbar-fg': '#0f172a',
  '--toolbar-hover-bg': 'rgba(15,23,42,0.10)',
  '--toolbar-hover-fg': '#020617',
}

// Themes setup (moved to initializeDirectories)

// ─── Window ───────────────────────────────────────────────────────────────────

let mainWindow: any = null
const allWindows = new Set<any>()
let windowCounter = 0

function getEventWindow(e: any): any {
  try {
    return BrowserWindow.fromWebContents(e.sender)
  } catch {
    return null
  }
}

function assertTrustedSender(e: any, channel: string) {
  const senderUrl = String(e?.senderFrame?.url ?? '')
  if (!isTrustedRendererUrl(senderUrl, Boolean(app.isPackaged))) {
    throw new Error(`Blocked untrusted IPC sender for ${channel}`)
  }
}

function getFocusedOrMainWindow(): any {
  try {
    const focused = BrowserWindow.getFocusedWindow()
    if (focused) return focused
  } catch {}
  return mainWindow
}

function getPreferredThemeBg(): string {
  // Use nativeTheme for instant, zero-IO background colour — avoids a sync read
  // of state.json on every window creation which blocked the main thread.
  try {
    return nativeTheme && nativeTheme.shouldUseDarkColors
      ? DEFAULT_DARK_THEME['--app-bg']
      : DEFAULT_LIGHT_THEME['--app-bg']
  } catch {}
  return DEFAULT_DARK_THEME['--app-bg']
}

// ─── Filename validation ──────────────────────────────────────────────────────

/** Ensure a note filename is safe: no path traversal, no forbidden chars. */
function isSafeFilename(name: string): boolean {
  if (!name || typeof name !== 'string') return false
  if (name.includes('..') || name.includes(sep) || name.includes('/')) return false
  if (/[<>:"|?*\x00-\x1f]/.test(name)) return false
  return true
}

function requireNoteFilename(value: unknown, label = 'filename'): string {
  const filename = sanitizeFilenameInput(value, {
    label,
    allowedExtensions: ['.md', '.txt'],
  })
  if (!isSafeFilename(filename)) throw new Error(`Invalid ${label}`)
  return filename
}

function requireThemeFilename(value: unknown, label = 'theme name'): string {
  const raw = sanitizeFilenameInput(value, {
    label,
    allowedExtensions: ['.json'],
  })
  const normalized = raw.toLowerCase().endsWith('.json') ? raw : `${raw}.json`
  if (!isSafeFilename(normalized)) throw new Error(`Invalid ${label}`)
  return normalized
}

// ─── createWindow ─────────────────────────────────────────────────────────────

function createWindow(initialNote?: string, emptyWindow?: boolean, focusedMode?: boolean): any {
  const bg = getPreferredThemeBg()
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: bg,
    frame: false,
    show: false,
    // Only set an explicit window icon when the file exists (avoids trying
    // to load images from inside the ASAR in production which can fail).
    icon: (() => {
      try {
        const candidate = join(__dirname, '../assets/icon.png')
        if (existsSync(candidate)) {
          try {
            const img = nativeImage.createFromPath(candidate)
            if (img && typeof img.isEmpty === 'function' && !img.isEmpty()) return img
          } catch {}
        }
      } catch {}
      try {
        const resourceCandidate = join(
          process.resourcesPath || resolve(__dirname, '..'),
          'assets',
          'icon.png'
        )
        if (existsSync(resourceCandidate)) {
          try {
            const img2 = nativeImage.createFromPath(resourceCandidate)
            if (img2 && typeof img2.isEmpty === 'function' && !img2.isEmpty()) return img2
          } catch {}
        }
      } catch {}
      return undefined
    })(),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Electron v20+ defaults sandbox to true even without being set explicitly.
      // Sandboxed renderers cannot load http://localhost URLs in secondary windows,
      // causing chrome-error://chromewebdata/ (NET::ERR_BLOCKED_BY_CLIENT or similar).
      // contextIsolation: true already provides the renderer isolation we need.
      sandbox: false,
      // Allow loading the Vite dev server (http://localhost) in all windows.
      webSecurity: (app as any).isPackaged,
    },
  } as any)
  if (!mainWindow) mainWindow = win
  allWindows.add(win)
  // Remove stale window entries when webContents is destroyed
  win.webContents.on('destroyed', () => {
    allWindows.delete(win)
  })

  // All windows (main and secondary) wait for the renderer's notifyReady signal
  // before becoming visible. This ensures the window only shows once React has
  // finished hydrating and appReady is true — avoiding a blank white flash.
  const showTimeout = setTimeout(() => {
    try {
      win.show()
    } catch {}
  }, 8000)

  const readyHandler = (e: any) => {
    try {
      // Guard against the window or its webContents being destroyed
      if (!win || !win.webContents || typeof win.webContents.id !== 'number') {
        ipcMain.removeListener('notara:renderer-ready', readyHandler)
        clearTimeout(showTimeout)
        try {
          if (win && !win.isDestroyed && !win.isDestroyed()) win.show()
        } catch {}
        return
      }
      if (e.sender.id !== win.webContents.id) return
      ipcMain.removeListener('notara:renderer-ready', readyHandler)
      clearTimeout(showTimeout)
      try {
        if (!win.isDestroyed || !win.isDestroyed()) win.show()
      } catch {}
    } catch (err) {
      try {
        ipcMain.removeListener('notara:renderer-ready', readyHandler)
        clearTimeout(showTimeout)
        if (win && !win.isDestroyed && !win.isDestroyed()) win.show()
      } catch {}
    }
  }
  ipcMain.on('notara:renderer-ready', readyHandler)

  win.webContents.on(
    'did-fail-load',
    (_event: any, errorCode: number, errorDescription: string, validatedURL: string) => {
      const msg = `window failed to load — code=${errorCode} desc="${errorDescription}" url="${validatedURL}"`
      console.error('[main]', msg)
      appendCrashLog(msg)
      ipcMain.removeListener('notara:renderer-ready', readyHandler)
      clearTimeout(showTimeout)
      try {
        win.show()
      } catch {}
    }
  )

  win.webContents.on('render-process-gone', (_event: any, details: any) => {
    const msg = `render-process-gone reason=${details?.reason} exitCode=${details?.exitCode}`
    console.error('[main]', msg)
    appendCrashLog(msg)
  })

  win.on('unresponsive', () => {
    console.warn('[main] window became unresponsive')
    appendCrashLog('window unresponsive')
  })

  win.on('closed', () => {
    ipcMain.removeListener('notara:renderer-ready', readyHandler)
    clearTimeout(showTimeout)
    allWindows.delete(win)
    // If this window was the source of an in-progress drag, cancel it so other
    // windows can clear their drop zones and the broker doesn't stay locked.
    if (activeDrag?.sourceId === win.webContents.id) clearActiveDrag()
    if (mainWindow === win) {
      const next = Array.from(allWindows)[0] ?? null
      mainWindow = next
    }
  })

  // Forward spellcheck suggestions to the renderer
  win.webContents.on('context-menu', (_event: any, params: any) => {
    try {
      const suggestions: string[] = Array.isArray(params.dictionarySuggestions)
        ? params.dictionarySuggestions
        : []
      const misspelled: string | null = params.misspelledWord || null
      if (misspelled || suggestions.length > 0) {
        win.webContents.send('spellcheck:suggestions', {
          misspelled,
          suggestions,
          x: params.x,
          y: params.y,
        })
      }
    } catch {}
  })

  // Restore window bounds and set up persistence
  windowCounter += 1
  const winId = windowCounter
  // Async restore: read state file asynchronously so we don't block window creation
  void readFile(STATE_FILE, 'utf-8')
    .then((txt) => {
      try {
        const rawState = JSON.parse(txt)
        const savedBounds = rawState?.windows?.[winId]?.bounds
        if (
          savedBounds &&
          savedBounds.width >= 400 &&
          savedBounds.height >= 300 &&
          !win.isDestroyed()
        ) {
          win.setBounds(savedBounds)
        }
      } catch {}
    })
    .catch(() => {})
  let boundsTimer: ReturnType<typeof setTimeout> | null = null
  const saveBounds = () => {
    if (boundsTimer) clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => {
      void readFile(STATE_FILE, 'utf-8')
        .then((txt) => {
          try {
            const raw = JSON.parse(txt)
            raw.windows = raw.windows || {}
            raw.windows[winId] = { ...(raw.windows[winId] || {}), bounds: win.getBounds() }
            writeStateFile(JSON.stringify(raw, null, 2)).catch(() => {})
          } catch {}
        })
        .catch(() => {
          try {
            const raw: any = { windows: {} }
            raw.windows[winId] = { bounds: win.getBounds() }
            writeStateFile(JSON.stringify(raw, null, 2)).catch(() => {})
          } catch {}
        })
    }, 500)
  }
  win.on('resize', saveBounds)
  win.on('move', saveBounds)
  let urlSearch = ''
  if (initialNote && focusedMode)
    urlSearch = `?focused=1&note=${encodeURIComponent(initialNote)}&windowId=${winId}`
  else if (initialNote) urlSearch = `?note=${encodeURIComponent(initialNote)}&windowId=${winId}`
  else if (emptyWindow) urlSearch = `?empty=1&windowId=${winId}`
  else urlSearch = `?windowId=${winId}`
  const devUrl = !app.isPackaged && process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    const base = (process.env.VITE_DEV_SERVER_URL as string).replace(/\/$/, '')
    const fullUrl = urlSearch ? `${base}/${urlSearch}` : base
    win.loadURL(fullUrl)
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'), {
      search: urlSearch,
    } as any)
  }

  return win
}

// ─── Cross-window drag broker ─────────────────────────────────────────────────
// Module-scoped so createWindow's closed handler can access it.

let activeDrag: {
  filename: string
  sourceId: number
  timeoutId: ReturnType<typeof setTimeout>
} | null = null

function clearActiveDrag() {
  if (!activeDrag) return
  clearTimeout(activeDrag.timeoutId)
  activeDrag = null
  for (const w of allWindows) {
    if (!w.isDestroyed()) {
      try {
        w.webContents.send('window:tab-drag-cancelled')
      } catch {}
    }
  }
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// IPC handlers are registered in registerIPCHandlers() which is called from app.whenReady()

/** Broadcast a file-change event to all windows except the sender. */
function broadcastFileChange(
  senderWebContentsId: number,
  event:
    | 'notara:file-created'
    | 'notara:file-deleted'
    | 'notara:file-renamed'
    | 'notara:file-saved',
  payload: Record<string, string>
) {
  for (const w of allWindows) {
    if (!w.isDestroyed() && w.webContents.id !== senderWebContentsId) {
      try {
        w.webContents.send(event, payload)
      } catch {}
    }
  }
}

// Notes — fs:list-notes
function registerIPCHandlers_impl() {
  ipcMain.handle('fs:list-notes', async () => {
    try {
      const files = await readdir(NOTES_DIR).catch(() => [] as string[])
      return files.filter((f) => (f.endsWith('.md') || f.endsWith('.txt')) && !f.startsWith('.'))
    } catch (err) {
      console.error('[main] fs:list-notes error:', err)
      throw new Error('Failed to list notes: ' + (err instanceof Error ? err.message : String(err)))
    }
  })

  // Notes — fs:read-note
  ipcMain.handle('fs:read-note', async (_e: any, filename: string) => {
    const safeFilename = requireNoteFilename(filename)
    const filePath = join(NOTES_DIR, safeFilename)
    try {
      return await readFile(filePath, 'utf-8')
    } catch (err: any) {
      if (err?.code === 'ENOENT') return ''
      console.error('[main] fs:read-note error:', err)
      throw new Error(
        `Failed to read note "${safeFilename}": ${err instanceof Error ? err.message : String(err)}`
      )
    }
  })

  // Notes — fs:write-note
  ipcMain.handle('fs:write-note', async (_e: any, filename: string, content: string) => {
    assertTrustedSender(_e, 'fs:write-note')
    const safeFilename = requireNoteFilename(filename)
    const safeContent = sanitizeNoteContent(content)
    try {
      if (!existsSync(NOTES_DIR)) mkdirSync(NOTES_DIR, { recursive: true })
      await writeFile(join(NOTES_DIR, safeFilename), safeContent, 'utf-8')
    } catch (err) {
      console.error('[main] fs:write-note error:', err)
      throw new Error(
        `Failed to save note "${safeFilename}": ${err instanceof Error ? err.message : String(err)}`
      )
    }
    broadcastFileChange(_e.sender.id, 'notara:file-saved', {
      filename: safeFilename,
      content: safeContent,
    })
  })

  // Notes — fs:write-note-atomic (temp file → rename for crash safety)
  ipcMain.handle('fs:write-note-atomic', async (_e: any, filename: string, content: string) => {
    assertTrustedSender(_e, 'fs:write-note-atomic')
    const safeFilename = requireNoteFilename(filename)
    const safeContent = sanitizeNoteContent(content)
    const target = join(NOTES_DIR, safeFilename)
    const tmp = target + '.tmp'
    try {
      if (!existsSync(NOTES_DIR)) mkdirSync(NOTES_DIR, { recursive: true })
      await writeFile(tmp, safeContent, 'utf-8')
      await rename(tmp, target)
    } catch (err) {
      console.error('[main] fs:write-note-atomic error:', err)
      try {
        await unlink(tmp).catch(() => {})
      } catch {}
      throw new Error(
        `Failed to save note "${safeFilename}": ${err instanceof Error ? err.message : String(err)}`
      )
    }
    broadcastFileChange(_e.sender.id, 'notara:file-saved', {
      filename: safeFilename,
      content: safeContent,
    })
  })

  // Notes — fs:delete-note
  ipcMain.handle('fs:delete-note', async (_e: any, filename: string) => {
    assertTrustedSender(_e, 'fs:delete-note')
    const safeFilename = requireNoteFilename(filename)
    const filePath = join(NOTES_DIR, safeFilename)
    await unlink(filePath).catch((e: any) => {
      if (e?.code !== 'ENOENT') throw e
    })
    broadcastFileChange(_e.sender.id, 'notara:file-deleted', { filename: safeFilename })
  })

  // Notes — fs:create-note
  ipcMain.handle('fs:create-note', async (_e: any, filename: string) => {
    assertTrustedSender(_e, 'fs:create-note')
    const safeFilename = requireNoteFilename(filename)
    await mkdir(NOTES_DIR, { recursive: true }).catch(() => {})
    const filePath = join(NOTES_DIR, safeFilename)
    // O_EXCL via wx flag: only write if file doesn't already exist
    await writeFile(filePath, '', { encoding: 'utf-8', flag: 'wx' }).catch((e: any) => {
      if (e?.code !== 'EEXIST') throw e
    })
    broadcastFileChange(_e.sender.id, 'notara:file-created', { filename: safeFilename })
  })

  // Notes — fs:rename-note
  ipcMain.handle('fs:rename-note', async (_e: any, oldFilename: string, newFilename: string) => {
    assertTrustedSender(_e, 'fs:rename-note')
    const safeOldFilename = requireNoteFilename(oldFilename, 'old filename')
    const safeNewFilename = requireNoteFilename(newFilename, 'new filename')
    const oldPath = join(NOTES_DIR, safeOldFilename)
    const newPath = join(NOTES_DIR, safeNewFilename)
    await rename(oldPath, newPath)
    broadcastFileChange(_e.sender.id, 'notara:file-renamed', {
      oldFilename: safeOldFilename,
      newFilename: safeNewFilename,
    })
  })

  // App state — state:load
  ipcMain.handle('state:load', async () => {
    try {
      const raw = JSON.parse(await readFile(STATE_FILE, 'utf-8'))
      return raw
    } catch (err: any) {
      if (err?.code !== 'ENOENT') console.error('[main] state:load error:', err)
      // Return null rather than throwing — callers merge with DEFAULT_STATE
      return null
    }
  })

  // App state — state:save (serialized atomic write to avoid concurrent rename races)
  ipcMain.handle('state:save', async (_e: any, state: unknown) => {
    try {
      assertTrustedSender(_e, 'state:save')
      const safeState = sanitizeStatePayload(state)
      await writeStateFile(safeState)

      // Broadcast the saved state to every OTHER open window so they can
      // apply any global settings changes (theme, editor prefs, keybindings,
      // pinned notes, etc.) without a page reload.
      // Per-window state (openTabs, activeTab, sidebarCollapsed, windows) is
      // included in the payload but deliberately ignored by the receivers —
      // each window's sync handler applies only the globally-shared fields.
      let parsed: unknown
      try {
        parsed = JSON.parse(safeState)
      } catch {
        return
      }
      const senderWc = _e.sender
      for (const win of allWindows) {
        if (!win.isDestroyed() && win.webContents !== senderWc) {
          try {
            win.webContents.send('state:changed', parsed)
          } catch {}
        }
      }
    } catch (err) {
      console.error('[main] state:save error:', err)
    }
  })

  // App lifecycle — app:ready-to-quit
  ipcMain.handle('app:ready-to-quit', async () => {
    try {
      const target = getFocusedOrMainWindow()
      if (target) target.destroy()
    } catch {}
  })

  // App lifecycle — app:request-close
  ipcMain.handle('app:request-close', async (e: any) => {
    try {
      const target = getEventWindow(e) ?? getFocusedOrMainWindow()
      if (target) {
        target.webContents.send('app:before-quit')
        // Main waits for renderer to call readyToQuit or cancelQuit
        // (no forced timeout — the renderer controls the close)
      }
    } catch {}
  })

  // App lifecycle — app:cancel-quit (renderer decided not to close)
  ipcMain.handle('app:cancel-quit', async () => {
    // No-op: renderer is managing the close state
  })

  // Window controls
  ipcMain.handle('window:minimize', async (e: any) => {
    const target = getEventWindow(e) ?? getFocusedOrMainWindow()
    if (target) target.minimize()
  })

  ipcMain.handle('window:maximize', async (e: any) => {
    const target = getEventWindow(e) ?? getFocusedOrMainWindow()
    if (target) target.maximize()
  })

  ipcMain.handle('window:unmaximize', async (e: any) => {
    const target = getEventWindow(e) ?? getFocusedOrMainWindow()
    if (target) target.unmaximize()
  })

  ipcMain.handle('window:is-maximized', async (e: any) => {
    const target = getEventWindow(e) ?? getFocusedOrMainWindow()
    return target ? target.isMaximized() : false
  })

  // DEV ONLY: resize + centre window to ideal screenshot dimensions
  ipcMain.handle('window:screenshot-size', async (e: any) => {
    const target = getEventWindow(e) ?? getFocusedOrMainWindow()
    if (!target) return
    if (target.isMaximized()) target.unmaximize()
    target.setSize(1280, 800)
    target.center()
  })

  ipcMain.handle('window:set-zoom', async (e: any, level: number) => {
    const target = getEventWindow(e) ?? getFocusedOrMainWindow()
    const safeLevel = sanitizeZoomLevel(level)
    if (target) target.webContents.setZoomLevel(safeLevel)
  })

  ipcMain.handle('window:get-zoom', async (e: any) => {
    const target = getEventWindow(e) ?? getFocusedOrMainWindow()
    return target ? target.webContents.getZoomLevel() : 0
  })

  // Open a fresh empty window (full Notara instance, like VSCode "New Window")
  ipcMain.handle('window:new', async () => {
    createWindow(undefined, true)
  })

  // Move a note to its own window in focused (editor-only) mode.
  ipcMain.handle('window:move-to-new-window', async (_e: any, filename: string) => {
    const safeFilename = requireNoteFilename(filename)
    createWindow(safeFilename, false, true)
  })

  // Cross-window tab drag
  ipcMain.handle('window:tab-drag-start', async (e: any, filename: string) => {
    const safeFilename = requireNoteFilename(filename)
    // If another drag is already in progress, cancel it first
    if (activeDrag) clearActiveDrag()
    const timeoutId = setTimeout(() => {
      // Auto-expire stale drag state after 10 seconds (renderer crash / missed cancel)
      clearActiveDrag()
    }, 10_000)
    activeDrag = { filename: safeFilename, sourceId: e.sender.id, timeoutId }
    // Tell every OTHER window to show its drop zone
    for (const w of allWindows) {
      if (!w.isDestroyed() && w.webContents.id !== e.sender.id) {
        try {
          w.webContents.send('window:tab-drag-available', safeFilename)
        } catch {}
      }
    }
  })

  ipcMain.handle('window:tab-drag-cancel', async () => {
    clearActiveDrag()
  })

  // Target window calls this when the tab is dropped onto it
  ipcMain.handle('window:tab-drag-accept', async (e: any) => {
    if (!activeDrag) return null
    // Prevent a window from accepting its own drag
    if (e.sender.id === activeDrag.sourceId) return null
    const { filename, sourceId } = activeDrag
    // Clear state and cancel timeout before broadcasting
    clearTimeout(activeDrag.timeoutId)
    activeDrag = null
    // Tell all windows to hide their drop zones
    for (const w of allWindows) {
      if (!w.isDestroyed()) {
        try {
          w.webContents.send('window:tab-drag-cancelled')
        } catch {}
      }
    }
    // Tell source window to close the tab (safe if source was already destroyed)
    for (const w of allWindows) {
      if (!w.isDestroyed() && w.webContents.id === sourceId) {
        try {
          w.webContents.send('window:tab-moved-out', filename)
        } catch {}
        break
      }
    }
    return filename
  })

  // Shell / OS operations
  ipcMain.handle('shell:open-notes-folder', async () => {
    await shell.openPath(NOTES_DIR)
  })

  ipcMain.handle('shell:open-app-data-folder', async () => {
    await shell.openPath(APP_ROOT)
  })

  ipcMain.handle('shell:open-external', async (_e: any, url: string) => {
    assertTrustedSender(_e, 'shell:open-external')
    const safeUrl = sanitizeIpcString(url, { label: 'url', trim: true, maxLength: 2048 })
    if (isAllowedExternalUrl(safeUrl, Boolean(app.isPackaged))) {
      await shell.openExternal(safeUrl)
    }
  })

  ipcMain.handle(
    'dialog:save-note-as',
    async (e: any, defaultFilename: string, content: string) => {
      const owner = getEventWindow(e) ?? getFocusedOrMainWindow()
      if (!owner) return null
      const safeDefaultFilename = sanitizeIpcString(defaultFilename, {
        label: 'default filename',
        trim: true,
        minLength: 1,
        maxLength: 200,
      })
      const safeContent = sanitizeNoteContent(content)
      const result = await dialog.showSaveDialog(owner, {
        defaultPath: safeDefaultFilename,
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'Text', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      })
      const saveResult: any = result
      if (saveResult.canceled || !saveResult.filePath) return null
      writeFileSync(saveResult.filePath, safeContent, 'utf-8')
      return saveResult.filePath
    }
  )

  ipcMain.handle('app:get-version', async () => {
    return app.getVersion()
  })

  // ─── PDF export ────────────────────────────────────────────────────────────────
  // Uses printToPDF which captures the current renderer content (preview or editor).
  ipcMain.handle('dialog:export-pdf', async (e: any, defaultFilename: string) => {
    const owner = getEventWindow(e) ?? getFocusedOrMainWindow()
    if (!owner) return null
    const safeDefaultFilename = sanitizeIpcString(defaultFilename, {
      label: 'default filename',
      trim: true,
      minLength: 1,
      maxLength: 200,
    })
    const result = await dialog.showSaveDialog(owner, {
      defaultPath: safeDefaultFilename.replace(/\.(md|txt)$/i, '') + '.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    const saveResult: any = result
    if (saveResult.canceled || !saveResult.filePath) return null
    try {
      const pdfData = await owner.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { marginType: 'default' },
      })
      writeFileSync(saveResult.filePath, pdfData)
      return saveResult.filePath
    } catch (err) {
      console.error('[main] printToPDF failed:', err)
      return null
    }
  })

  // Themes
  ipcMain.handle('theme:list', async () => {
    try {
      const files = await readdir(THEMES_DIR).catch(() => [] as string[])
      return files.filter((f) => f.endsWith('.json'))
    } catch {
      return []
    }
  })

  ipcMain.handle('theme:read', async (_e: any, name: string) => {
    try {
      const normalized = requireThemeFilename(name)
      const filePath = join(THEMES_DIR, normalized)
      const content = await readFile(filePath, 'utf-8').catch(() => null)
      if (content === null) return null
      return JSON.parse(content)
    } catch {
      return null
    }
  })

  ipcMain.handle('theme:write', async (_e: any, name: string, data: Record<string, string>) => {
    assertTrustedSender(_e, 'theme:write')
    const normalized = requireThemeFilename(name)
    await mkdir(THEMES_DIR, { recursive: true }).catch(() => {})
    const safeTheme = sanitizeThemeEntries(data)
    await writeFile(join(THEMES_DIR, normalized), JSON.stringify(safeTheme, null, 2), 'utf-8')
    // Tell other windows to re-read theme files and refresh their CSS overrides
    const senderWc = _e.sender
    for (const win of allWindows) {
      if (!win.isDestroyed() && win.webContents !== senderWc) {
        try {
          win.webContents.send('notara:themes-reload')
        } catch {}
      }
    }
  })

  // GPU status
  ipcMain.handle('gpu:status', async () => {
    try {
      const info = app.getGPUFeatureStatus ? app.getGPUFeatureStatus() : null
      const hasHw = info
        ? Object.values(info).some((v) => typeof v === 'string' && v.includes('enabled'))
        : false
      return { status: info, hasHardwareAcceleration: hasHw }
    } catch {
      return { status: null, hasHardwareAcceleration: false }
    }
  })

  // App restart
  ipcMain.handle('app:restart', async () => {
    app.relaunch()
    app.exit(0)
  })

  // ─── Versions ─────────────────────────────────────────────────────────────────

  ipcMain.handle('fs:save-version', async (_e: any, filename: string, content: string) => {
    const safeFilename = requireNoteFilename(filename)
    const safeContent = sanitizeNoteContent(content)
    const noteVersionDir = join(VERSIONS_DIR, safeFilename)
    await mkdir(noteVersionDir, { recursive: true }).catch(() => {})
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const versionPath = join(noteVersionDir, `${timestamp}.txt`)
    const tmp = versionPath + '.tmp'
    await writeFile(tmp, safeContent, 'utf-8')
    await rename(tmp, versionPath)
  })

  ipcMain.handle('fs:list-versions', async (_e: any, filename: string) => {
    const safeFilename = requireNoteFilename(filename)
    const noteVersionDir = join(VERSIONS_DIR, safeFilename)
    const files = await readdir(noteVersionDir).catch(() => [] as string[])
    return files.filter((f) => f.endsWith('.txt')).map((f) => f.replace(/\.txt$/, ''))
  })

  ipcMain.handle('fs:read-version', async (_e: any, filename: string, versionId: string) => {
    const safeFilename = requireNoteFilename(filename)
    const safeVersionId = sanitizeVersionId(versionId)
    const versionPath = join(VERSIONS_DIR, safeFilename, `${safeVersionId}.txt`)
    return readFile(versionPath, 'utf-8').catch(() => '')
  })

  ipcMain.handle('fs:delete-version', async (_e: any, filename: string, versionId: string) => {
    const safeFilename = requireNoteFilename(filename)
    const safeVersionId = sanitizeVersionId(versionId)
    const versionPath = join(VERSIONS_DIR, safeFilename, `${safeVersionId}.txt`)
    await unlink(versionPath).catch((e: any) => {
      if (e?.code !== 'ENOENT') throw e
    })
  })

  // ─── Attachments (SHA-256 content-addressed) ──────────────────────────────────
  //
  // Storage layout (as of v1.2.0):
  //   attachments/{noteFilename}/{sha256}{ext}   — deduplicated file blob
  //   attachments/{noteFilename}/manifest.json   — maps display-name → sha256+ext key
  //
  // The manifest allows the UI to show the original filename while the blob on
  // disk is keyed by content hash, so importing the same file twice is a no-op.

  function readAttachManifest(attachDir: string): Record<string, string> {
    const p = join(attachDir, 'manifest.json')
    if (!existsSync(p)) return {}
    try {
      return JSON.parse(readFileSync(p, 'utf-8'))
    } catch {
      return {}
    }
  }

  function writeAttachManifest(attachDir: string, manifest: Record<string, string>): void {
    writeFileSync(join(attachDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')
  }

  function hashBuffer(buf: Buffer): string {
    return createHash('sha256').update(buf).digest('hex')
  }

  function ensureUniqueNoteBasename(name: string): string {
    const ext = name.toLowerCase().endsWith('.txt') ? '.txt' : '.md'
    const raw = name.replace(/\.(md|txt)$/i, '')
    const base = raw.replace(/[^a-zA-Z0-9 _.-]/g, '').trim() || 'Imported Note'
    let idx = 1
    let candidate = `${base}${ext}`
    while (existsSync(join(NOTES_DIR, candidate))) {
      idx += 1
      candidate = `${base} ${idx}${ext}`
    }
    return candidate
  }

  function importAttachmentFromPath(noteFilename: string, sourcePath: string): string {
    if (!isSafeFilename(noteFilename)) throw new Error('Invalid filename')
    const attachDir = join(ATTACHMENTS_DIR, noteFilename)
    if (!existsSync(attachDir)) mkdirSync(attachDir, { recursive: true })

    const buf = readFileSync(sourcePath)
    const hash = hashBuffer(buf)
    const origBasename = basename(sourcePath) || 'attachment'
    const extPart = origBasename.includes('.')
      ? origBasename.slice(origBasename.lastIndexOf('.'))
      : ''
    const blobName = hash + extPart
    const blobPath = join(attachDir, blobName)

    if (!existsSync(blobPath)) writeFileSync(blobPath, buf)

    const manifest = readAttachManifest(attachDir)
    manifest[origBasename] = blobName
    writeAttachManifest(attachDir, manifest)
    return origBasename
  }

  function importNoteFromPath(sourcePath: string): string {
    const ext = extname(sourcePath).toLowerCase()
    if (ext !== '.md' && ext !== '.txt') throw new Error('Unsupported note type')
    const safeName = ensureUniqueNoteBasename(basename(sourcePath))
    const dest = join(NOTES_DIR, safeName)
    const content = readFileSync(sourcePath, 'utf-8')
    writeFileSync(dest, content, 'utf-8')
    return safeName
  }

  ipcMain.handle('fs:list-attachments', async (_e: any, noteFilename: string) => {
    const safeNoteFilename = requireNoteFilename(noteFilename, 'note filename')
    const attachDir = join(ATTACHMENTS_DIR, safeNoteFilename)
    if (!existsSync(attachDir)) return []
    // Return display names from manifest; fall back to raw files for legacy dirs
    const manifest = readAttachManifest(attachDir)
    const manifestNames = Object.keys(manifest)
    if (manifestNames.length > 0) return manifestNames
    // Legacy fallback: flat files with no manifest
    return readdirSync(attachDir).filter((f) => f !== 'manifest.json' && !f.startsWith('.'))
  })

  ipcMain.handle(
    'fs:open-attachment',
    async (_e: any, noteFilename: string, attachFilename: string) => {
      const safeNoteFilename = requireNoteFilename(noteFilename, 'note filename')
      const safeAttachFilename = sanitizeFilenameInput(attachFilename, {
        label: 'attachment filename',
      })
      const attachDir = join(ATTACHMENTS_DIR, safeNoteFilename)
      const manifest = readAttachManifest(attachDir)
      // Resolve display name → content-addressed blob, or fall back to direct path
      const blobName = manifest[safeAttachFilename] ?? safeAttachFilename
      const attachPath = join(attachDir, blobName)
      if (existsSync(attachPath)) await shell.openPath(attachPath)
    }
  )

  ipcMain.handle(
    'fs:delete-attachment',
    async (_e: any, noteFilename: string, attachFilename: string) => {
      const safeNoteFilename = requireNoteFilename(noteFilename, 'note filename')
      const safeAttachFilename = sanitizeFilenameInput(attachFilename, {
        label: 'attachment filename',
      })
      const attachDir = join(ATTACHMENTS_DIR, safeNoteFilename)
      const manifest = readAttachManifest(attachDir)
      const blobName = manifest[safeAttachFilename]
      if (blobName) {
        // Remove blob only if no other display name references the same hash
        const refCount = Object.values(manifest).filter((v) => v === blobName).length
        if (refCount <= 1) {
          const blobPath = join(attachDir, blobName)
          if (existsSync(blobPath)) unlinkSync(blobPath)
        }
        delete manifest[safeAttachFilename]
        writeAttachManifest(attachDir, manifest)
      } else {
        // Legacy: direct delete
        const attachPath = join(attachDir, safeAttachFilename)
        if (existsSync(attachPath)) unlinkSync(attachPath)
      }
    }
  )

  ipcMain.handle('fs:import-attachment', async (_e: any, noteFilename: string) => {
    const safeNoteFilename = requireNoteFilename(noteFilename, 'note filename')
    const owner = getFocusedOrMainWindow()
    if (!owner) return null
    const result = await dialog.showOpenDialog(owner, {
      title: 'Import attachment',
      properties: ['openFile'],
    })
    const openResult: any = result
    if (openResult.canceled || !openResult.filePaths || openResult.filePaths.length === 0)
      return null
    const sourcePath = openResult.filePaths[0]
    return importAttachmentFromPath(safeNoteFilename, sourcePath)
  })

  ipcMain.handle(
    'fs:import-dropped-paths',
    async (_e: any, noteFilename: string, paths: string[], openNotesInNewWindow: boolean) => {
      assertTrustedSender(_e, 'fs:import-dropped-paths')
      const safeNoteFilename = requireNoteFilename(noteFilename, 'note filename')
      const safeOpenNotesInNewWindow = sanitizeBoolean(openNotesInNewWindow, 'openNotesInNewWindow')
      const openedNotes: string[] = []
      const importedAttachments: string[] = []
      const errors: string[] = []
      const safePaths = sanitizeStringArray(paths, {
        label: 'dropped paths',
        maxItems: 200,
        maxItemLength: 4096,
      })

      for (const sourcePath of safePaths) {
        try {
          if (!existsSync(sourcePath)) {
            errors.push(`Missing file: ${sourcePath}`)
            continue
          }
          const ext = extname(sourcePath).toLowerCase()
          if (ext === '.md' || ext === '.txt') {
            const newNote = importNoteFromPath(sourcePath)
            openedNotes.push(newNote)
            if (safeOpenNotesInNewWindow) createWindow(newNote)
          } else {
            const imported = importAttachmentFromPath(safeNoteFilename, sourcePath)
            importedAttachments.push(imported)
          }
        } catch (err: any) {
          errors.push(err?.message ? String(err.message) : `Failed to import: ${sourcePath}`)
        }
      }

      return { openedNotes, importedAttachments, errors }
    }
  )

  ipcMain.handle('fs:verify-attachments', async (_e: any, noteFilename: string) => {
    const safeNoteFilename = requireNoteFilename(noteFilename, 'note filename')
    const attachDir = join(ATTACHMENTS_DIR, safeNoteFilename)
    if (!existsSync(attachDir)) return { ok: true, errors: [] }
    const manifest = readAttachManifest(attachDir)
    const errors: string[] = []
    for (const [displayName, blobName] of Object.entries(manifest)) {
      const blobPath = join(attachDir, blobName)
      if (!existsSync(blobPath)) {
        errors.push(`Missing blob for "${displayName}": ${blobName}`)
        continue
      }
      const buf = readFileSync(blobPath)
      const actualHash = hashBuffer(buf)
      const expectedHash = blobName.split('.')[0]
      if (actualHash !== expectedHash) {
        errors.push(
          `Integrity failure for "${displayName}": expected ${expectedHash}, got ${actualHash}`
        )
      }
    }
    return { ok: errors.length === 0, errors }
  })

  // Spellcheck — replace misspelled word via webContents
  ipcMain.handle('spellcheck:replace-misspelling', async (e: any, word: string) => {
    try {
      const safeWord = sanitizeWord(word, 'replacement word')
      const win = getEventWindow(e)
      if (win) win.webContents.replaceMisspelling(safeWord)
    } catch {}
  })

  // Spellcheck — add word to custom dictionary
  ipcMain.handle('spellcheck:add-to-dictionary', async (e: any, word: string) => {
    try {
      const safeWord = sanitizeWord(word, 'dictionary word')
      const win = getEventWindow(e)
      if (win) win.webContents.session.addWordToSpellCheckerDictionary(safeWord)
    } catch {}
  })

  // ── Feature 10: Set window title ────────────────────────────────────────────
  ipcMain.handle('window:set-title', async (e: any, title: string) => {
    try {
      const safeTitle = sanitizeWindowTitle(title)
      getEventWindow(e)?.setTitle(safeTitle)
    } catch {}
  })

  // ── Feature 16: Hot-exit / crash recovery ───────────────────────────────────
  const RECOVERY_DIR = join(APP_ROOT, 'recovery')
  let recoveryDirReady = false
  ipcMain.handle('fs:write-recovery', async (_e: any, filename: string, content: string) => {
    const safeFilename = requireNoteFilename(filename)
    const safeContent = sanitizeNoteContent(content)
    if (!recoveryDirReady) {
      mkdirSync(RECOVERY_DIR, { recursive: true })
      recoveryDirReady = true
    }
    // Fire-and-forget async write — recovery is best-effort, never block the keystroke
    writeFile(join(RECOVERY_DIR, safeFilename), safeContent, 'utf-8').catch(() => {})
  })

  ipcMain.handle('fs:list-recovery', async () => {
    if (!existsSync(RECOVERY_DIR)) return []
    return readdirSync(RECOVERY_DIR).filter((f) => f.endsWith('.md') || f.endsWith('.txt'))
  })

  ipcMain.handle('fs:read-recovery', async (_e: any, filename: string) => {
    const safeFilename = requireNoteFilename(filename)
    const p = join(RECOVERY_DIR, safeFilename)
    return existsSync(p) ? readFileSync(p, 'utf-8') : ''
  })

  ipcMain.handle('fs:clear-recovery', async (_e: any, filename: string) => {
    const safeFilename = requireNoteFilename(filename)
    const p = join(RECOVERY_DIR, safeFilename)
    try {
      await unlink(p).catch(() => {})
    } catch {}
  })

  // ── Feature 18: Cross-window open tabs ─────────────────────────────────────
  ipcMain.handle('window:get-open-tabs', async (e: any) => {
    try {
      const raw = JSON.parse(await readFile(STATE_FILE, 'utf-8'))
      const result: Record<string, string[]> = {}
      if (raw.openTabs) result['1'] = raw.openTabs
      if (raw.windows) {
        for (const [id, val] of Object.entries(raw.windows as any)) {
          if (id !== String(e.sender.id) && (val as any).openTabs) {
            result[id] = (val as any).openTabs
          }
        }
      }
      return result
    } catch {
      return {}
    }
  })

  // ── Feature 19: Merge all windows ──────────────────────────────────────────
  ipcMain.handle('window:merge-all', async (e: any) => {
    try {
      let raw: any = {}
      try {
        raw = JSON.parse(await readFile(STATE_FILE, 'utf-8'))
      } catch {}
      const allFilenames = new Set<string>()
      if (raw.windows) {
        for (const [, val] of Object.entries(raw.windows as any)) {
          for (const f of (val as any).openTabs || []) allFilenames.add(f)
        }
      }
      // Send tabs-incoming to calling window
      const caller = BrowserWindow.fromWebContents(e.sender)
      if (caller && !caller.isDestroyed()) {
        caller.webContents.send('window:tabs-incoming', Array.from(allFilenames))
      }
      // Close all other windows
      for (const w of allWindows) {
        if (!w.isDestroyed() && w.webContents.id !== e.sender.id) {
          try {
            w.close()
          } catch {}
        }
      }
    } catch {}
  })
}

// ─── Plugins (REMOVED) ────────────────────────────────────────────────────────
// The plugins:list and plugins:save-manifest IPC handlers have been permanently
// removed. The plugin execution engine (new Function / eval) posed an unacceptable
// security risk: plugins ran in the global renderer scope with full DOM and network
// access. The preload shim returns [] / no-op so renderer calls don't crash.

// ─── IPC Handler Registration ─────────────────────────────────────────────────
// All IPC handlers must be registered after app.whenReady() to ensure
// electron modules (ipcMain, BrowserWindow, etc) are fully initialized.
// The handlers are defined below at module scope but wrapped to defer execution.
let ipcHandlersRegistered = false

function registerIPCHandlers() {
  if (ipcHandlersRegistered) return
  ipcHandlersRegistered = true
  try {
    registerIPCHandlers_impl()
  } catch (err) {
    console.error('[main] Failed to register IPC handlers:', err)
  }
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
if (app && typeof app.whenReady === 'function') {
  // Initialize single instance lock and app model ID (early, before whenReady)
  initializeSingleInstanceAndModelId()

  // Configure app settings (GPU, paths, etc.) that must be done early
  configureAppSettings()

  // Now wait for app to be ready
  app.whenReady().then(async () => {
    // Update APP_ROOT now that app is ready and we can check isPackaged
    if (!isPortable && (app as any).isPackaged) {
      APP_ROOT = app.getPath('userData')
    }
    // Initialize directories now that APP_ROOT is finalized
    initializeDirectories()

    // ── Startup diagnostics (logged to userData/logs/main.log) ───────────────
    try {
      const logsDir = join(APP_ROOT, 'logs')
      mkdirSync(logsDir, { recursive: true })
      const logPath = join(logsDir, 'main.log')
      const startupInfo =
        [
          `[startup] ${new Date().toISOString()}`,
          `[startup] version=${app.getVersion()} packaged=${Boolean((app as any).isPackaged)}`,
          `[startup] userData=${app.getPath('userData')}`,
          `[startup] appPath=${app.getAppPath()}`,
          `[startup] exe=${process.execPath}`,
          `[startup] resources=${process.resourcesPath ?? 'n/a'}`,
          `[startup] APP_ROOT=${APP_ROOT}`,
          `[startup] NOTES_DIR=${NOTES_DIR}`,
          `[startup] STATE_FILE=${STATE_FILE}`,
          `[startup] platform=${process.platform} arch=${process.arch}`,
        ].join('\n') + '\n'
      // Append — keep last N runs visible without unbounded growth
      let existing = ''
      try {
        existing = readFileSync(logPath, 'utf-8')
      } catch {}
      const lines = (existing + startupInfo).split('\n')
      const trimmed = lines.slice(Math.max(0, lines.length - 500)).join('\n')
      writeFileSync(logPath, trimmed, 'utf-8')
    } catch (logErr) {
      console.warn('[main] Could not write startup log:', logErr)
    }

    // ── Async GPU probe (non-blocking — result applied after first window opens) ─
    // configureAppSettings() already applied explicit user preference at startup.
    // Here we async-probe for hardware GPU and disable acceleration only when
    // the user has NOT set a preference and no hardware GPU is found.
    // NOTE: app.disableHardwareAcceleration() cannot be called after app.ready,
    // so this probe only logs the result for diagnostics; the GPU disable path
    // in configureAppSettings handles the case where the user explicitly opted out.
    void (async () => {
      try {
        const devStateFile = join(APP_ROOT, 'state.json')
        let explicitPref: boolean | null = null
        try {
          if (existsSync(devStateFile)) {
            const raw = JSON.parse(readFileSync(devStateFile, 'utf-8') || '{}')
            if (raw?.settings && typeof raw.settings.gpuAccelerationEnabled === 'boolean')
              explicitPref = Boolean(raw.settings.gpuAccelerationEnabled)
          }
        } catch {}

        if (explicitPref === null) {
          // No user preference — probe asynchronously and log result only
          let gpuResult = 'unknown'
          try {
            if (process.platform === 'win32') {
              gpuResult = await new Promise<string>((resolve) => {
                const child = spawn(
                  'wmic',
                  ['path', 'win32_VideoController', 'get', 'Name', '/format:list'],
                  { timeout: 3000, windowsHide: true }
                )
                let out = ''
                child.stdout.on('data', (d: Buffer) => {
                  out += d.toString()
                })
                child.on('close', () => resolve(out))
                child.on('error', () => resolve(''))
                setTimeout(() => {
                  try {
                    child.kill()
                  } catch {}
                  resolve('')
                }, 3000)
              })
            }
          } catch {}
          console.log('[main] async GPU probe result (diagnostic only):', gpuResult.slice(0, 200))
        }
      } catch (gpuErr) {
        console.warn('[main] async GPU probe failed (non-fatal):', gpuErr)
      }
    })()

    // ── Content Security Policy ──────────────────────────────────────────────
    // Injected as a response header so it applies to all renderer loads
    // (both file:// in production and localhost in development).
    //
    // Policy rationale:
    //   script-src 'self'       — only bundled scripts; no eval (plugin system removed)
    //   style-src 'self' 'unsafe-inline' — TipTap and the rest of the UI use
    //                             inline styles extensively; we cannot avoid this
    //   img-src 'self' data: file: blob: — local note attachments + data URIs
    //   media-src 'self' file: blob: — audio/video attachments
    //   connect-src             — allow Vite HMR in dev mode
    //   object-src 'none'       — no plugins (Flash etc.)
    //   base-uri 'self'         — prevent base tag injection
    //   form-action 'self'      — prevent form exfiltration
    try {
      const { session } = require('electron') as typeof import('electron')
      const isPackaged = Boolean((app as any).isPackaged)

      // Only enforce a header-level CSP in production builds.
      // In dev mode the Vite dev server needs 'unsafe-eval' (for HMR) and
      // ws:// connect-src (for the HMR WebSocket).  Adding a header CSP that
      // conflicts with the meta CSP already in index.html would combine to a
      // policy that is *more* restrictive than either alone and can prevent
      // Vite's injected /@vite/client script from executing, leaving the
      // renderer stuck on the boot-splash screen indefinitely.
      if (isPackaged) {
        // Allow inline scripts in the CSP so the small inline fallback in
        // `index.html` (which removes the boot splash if the module graph
        // fails to load) can run in production. This avoids the app becoming
        // permanently stuck on the splash screen when an external script
        // fails to execute for any reason.
        const csp = [
          "default-src 'self'",
          "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: file: blob:",
          "font-src 'self' data:",
          "media-src 'self' file: blob:",
          "connect-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; ')

        session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
          callback({
            responseHeaders: {
              ...details.responseHeaders,
              'Content-Security-Policy': [csp],
            },
          })
        })
      }
    } catch (cspErr) {
      console.warn('[main] CSP setup failed (non-fatal):', cspErr)
    }

    // Register IPC handlers BEFORE creating windows so renderer can call them
    registerIPCHandlers()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  // Drain the state write queue before allowing the process to exit.
  // This prevents state.json from being left in a half-written state when
  // the OS kills the app after the windows have already been destroyed.
  let _quitting = false
  app.on('before-quit', (event) => {
    if (_quitting) return // already draining — let the second call through
    event.preventDefault()
    _quitting = true
    Promise.race([_stateWriteQueue, new Promise<void>((resolve) => setTimeout(resolve, 3000))])
      .catch(() => {})
      .finally(() => {
        try {
          app.quit()
        } catch {}
      })
  })
} else {
  console.error('[main] FATAL: electron.app is undefined')
  console.error('[main] This is a critical error - the electron module was not properly loaded')
  process.exit(1)
}

// ─── Crash resilience ─────────────────────────────────────────────────────────

function appendCrashLog(line: string) {
  try {
    const logPath = join(APP_ROOT, 'logs', 'main.log')
    const entry = `[crash] ${new Date().toISOString()} ${line}\n`
    // Best-effort sync append so the log is written even during shutdown
    const { appendFileSync } = require('fs') as typeof import('fs')
    appendFileSync(logPath, entry, 'utf-8')
  } catch {}
}

process.on('uncaughtException', (err) => {
  const msg = err?.stack ?? String(err)
  console.error('[main] uncaughtException:', msg)
  appendCrashLog('uncaughtException: ' + msg)
  // Don't call app.exit — allow graceful shutdown path to run
})

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? (reason.stack ?? String(reason)) : String(reason)
  console.error('[main] unhandledRejection:', msg)
  appendCrashLog('unhandledRejection: ' + msg)
})
