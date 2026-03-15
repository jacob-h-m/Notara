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

import { app, BrowserWindow, ipcMain, dialog, shell, IpcMainInvokeEvent } from 'electron'
import { join, resolve, sep } from 'path'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  renameSync,
} from 'fs'

// ─── Storage Paths ────────────────────────────────────────────────────────────
//
// Dev  → project root  (dist-electron/../  =  project root)
// Prod → directory containing the .exe (portable data next to the binary)
//
// Use a safe writable location for production (userData). During development
// keep using the project root for convenience so files live next to the repo.
const APP_ROOT = app.isPackaged
  ? app.getPath('userData')
  : resolve(__dirname, '..')

const NOTES_DIR       = join(APP_ROOT, 'notes')
const ATTACHMENTS_DIR = join(NOTES_DIR, 'attachments')
const STATE_FILE      = join(APP_ROOT, 'state.json')
const THEMES_DIR      = join(APP_ROOT, 'themes')

// Migration: If the app was previously storing notes next to the executable
// (older behaviour) and the new `userData` location is empty, attempt to
// migrate existing notes into the user's data folder on first run.
if (app.isPackaged) {
  try {
    const legacyRoot = resolve(process.execPath, '..')
    const legacyNotes = join(legacyRoot, 'notes')
    if (existsSync(legacyNotes) && !existsSync(NOTES_DIR)) {
      // create target dirs first
      mkdirSync(NOTES_DIR, { recursive: true })
      mkdirSync(ATTACHMENTS_DIR, { recursive: true })
      const files = readdirSync(legacyNotes).filter(f => f && !f.startsWith('.'))
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

const DEFAULT_DARK_THEME = {
  "--app-bg":             "#05060a",
  "--titlebar-bg":        "#080b0f",
  "--sidebar-bg":         "#0b0e12",
  "--sidebar-rail-bg":    "#080b0f",
  "--editor-bg":          "#0d1117",
  "--preview-bg":         "#0b0e12",
  "--modal-bg":           "#10141a",
  "--surface-elevated":   "#1a1f26",
  "--text-primary":       "#e6eef8",
  "--text-muted":         "#8a9ab0",
  "--text-accent":        "#c4b5fd",
  "--border-subtle":      "rgba(255,255,255,0.07)",
  "--border-muted":       "rgba(255,255,255,0.04)",
  "--border-strong":      "rgba(255,255,255,0.14)",
  "--accent":             "#8b5cf6",
  "--accent-hover":       "#7c3aed",
  "--accent-muted":       "rgba(139,92,246,0.15)",
  "--btn-ghost-hover":    "rgba(255,255,255,0.06)",
  "--btn-ghost-active":   "rgba(255,255,255,0.10)",
  "--selection-bg":       "rgba(139,92,246,0.30)",
  "--editor-gutter-bg":   "#141820",
  "--editor-line-active": "rgba(255,255,255,0.035)",
  "--destructive":        "#f87171",
  "--destructive-muted":  "rgba(248,113,113,0.12)",
  "--hover-overlay":      "rgba(255,255,255,0.04)",
  "--hover-shadow":       "0 2px 8px rgba(0,0,0,0.4)",
  "--surface-950":        "#05060a",
  "--surface-900":        "#0b0f13",
  "--surface-800":        "#111318",
  "--surface-700":        "#1b1f23",
  "--surface-600":        "#263038",
  "--muted-border":       "rgba(255,255,255,0.08)",
  "--accent-violet":      "#8b5cf6"
  ,
  "--on-accent":          "#ffffff",
  "--switch-knob":        "#ffffff"
  ,
  "--editor-font":        "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Segoe UI Mono', monospace",
  "--ui-font":            "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  "--code-font":          "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Segoe UI Mono', monospace",
  "--panel-elevated":    "#121417",
  "--tab-bg":             "#0b0f13",
  "--tab-hover-bg":       "rgba(255,255,255,0.02)",
  "--tab-active-bg":      "#111318",
  "--tab-active-border":  "rgba(139,92,246,0.55)",
  "--input-focus-ring":   "rgba(139,92,246,0.18)",
  "--btn-hover-bg":       "rgba(255,255,255,0.03)",
  "--btn-active-bg":      "rgba(255,255,255,0.06)"
}

const DEFAULT_LIGHT_THEME = {
  "--app-bg":             "#f8fafc",
  "--titlebar-bg":        "#f1f5f9",
  "--sidebar-bg":         "#f1f5f9",
  "--sidebar-rail-bg":    "#e8edf3",
  "--editor-bg":          "#ffffff",
  "--preview-bg":         "#f8fafc",
  "--modal-bg":           "#ffffff",
  "--surface-elevated":   "#e2e8f0",
  "--text-primary":       "#0f172a",
  "--text-muted":         "#64748b",
  "--text-accent":        "#5b21b6",
  "--border-subtle":      "rgba(15,23,42,0.08)",
  "--border-muted":       "rgba(15,23,42,0.04)",
  "--border-strong":      "rgba(15,23,42,0.18)",
  "--accent":             "#6d28d9",
  "--accent-hover":       "#5b21b6",
  "--accent-muted":       "rgba(109,40,217,0.10)",
  "--btn-ghost-hover":    "rgba(15,23,42,0.06)",
  "--btn-ghost-active":   "rgba(15,23,42,0.10)",
  "--selection-bg":       "rgba(109,40,217,0.18)",
  "--editor-gutter-bg":   "#f0f2f5",
  "--editor-line-active": "rgba(15,23,42,0.04)",
  "--destructive":        "#dc2626",
  "--destructive-muted":  "rgba(220,38,38,0.10)",
  "--hover-overlay":      "rgba(15,23,42,0.04)",
  "--hover-shadow":       "0 2px 8px rgba(0,0,0,0.12)",
  "--surface-950":        "#f8fafc",
  "--surface-900":        "#f3f4f6",
  "--surface-800":        "#e6e9ee",
  "--surface-700":        "#d1d5db",
  "--surface-600":        "#9ca3af",
  "--muted-border":       "rgba(15,23,42,0.08)",
  "--accent-violet":      "#6d28d9"
  ,
  "--on-accent":          "#ffffff",
  "--switch-knob":        "#ffffff"
  ,
  "--ui-font":            "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  "--editor-font":        "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Segoe UI Mono', monospace",
  "--code-font":          "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Segoe UI Mono', monospace",
  "--panel-elevated":    "#ffffff",
  "--tab-bg":             "#f7f8fa",
  "--tab-hover-bg":       "rgba(0,0,0,0.04)",
  "--tab-active-bg":      "#ffffff",
  "--tab-active-border":  "rgba(109,40,217,0.30)",
  "--input-focus-ring":   "rgba(109,40,217,0.12)",
  "--btn-hover-bg":       "rgba(0,0,0,0.05)",
  "--btn-active-bg":      "rgba(0,0,0,0.09)"
}

// Ensure required directories exist at launch
for (const dir of [NOTES_DIR, ATTACHMENTS_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

// Ensure themes dir and default theme files exist
if (!existsSync(THEMES_DIR)) mkdirSync(THEMES_DIR, { recursive: true })
try {
  const darkPath = join(THEMES_DIR, 'dark.json')
  const lightPath = join(THEMES_DIR, 'light.json')
  if (!existsSync(darkPath)) writeFileSync(darkPath, JSON.stringify(DEFAULT_DARK_THEME, null, 2), 'utf-8')
  if (!existsSync(lightPath)) writeFileSync(lightPath, JSON.stringify(DEFAULT_LIGHT_THEME, null, 2), 'utf-8')
} catch (err) {
  console.warn('[main] Could not ensure default themes:', err)
}

// ─── Window ───────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: DEFAULT_DARK_THEME['--app-bg'],
    // Use a frameless window so we can render a custom titlebar.
    frame: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,  // renderer isolated from Node.js
      nodeIntegration: false,  // Node.js never exposed to renderer
      // sandbox left false to preserve existing preload behavior; revisit
      // only if packaging flags require it.
      sandbox: false,
    },
  })
  mainWindow = win

  // ── Pre-quit flush ──────────────────────────────────────────────────────────
  // Intercept the close event, ask the renderer to flush all pending saves,
  // then close for real once the renderer confirms it is ready.
  let readyToClose = false
  win.on('close', (event) => {
    if (readyToClose) return
    event.preventDefault()
    win.webContents.send('app:before-quit')
  })

  // De-register any previous handler (safe on first call; needed on macOS
  // re-activation where createWindow may be called more than once).
  ipcMain.removeHandler('app:ready-to-quit')
  ipcMain.handle('app:ready-to-quit', () => {
    readyToClose = true
    win.close()
  })

  // IPC: window controls for the custom titlebar
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => mainWindow?.maximize())
  ipcMain.handle('window:unmaximize', () => mainWindow?.unmaximize())
  ipcMain.handle('window:is-maximized', () => Promise.resolve(mainWindow?.isMaximized() ?? false))

  // Request close from renderer (titlebar close button): trigger the
  // same pre-quit flow as a native close button by sending the
  // 'app:before-quit' message to the renderer.
  ipcMain.removeHandler('app:request-close')
  ipcMain.handle('app:request-close', () => {
    if (!mainWindow) return
    mainWindow.webContents.send('app:before-quit')
  })

  // Production-only: lock zoom and block browser-like shortcuts (reload, devtools, view-source, zoom)
  // Keeps normal editor shortcuts (save, copy/paste, undo/redo, find) intact.
  if (app.isPackaged) {
    try {
      win.webContents.setVisualZoomLevelLimits(1, 1)
      win.webContents.setZoomFactor(1)
    } catch (err) {
      console.warn('[main] could not lock zoom level:', err)
    }

    win.webContents.on('before-input-event', (event, input) => {
      const ctrlOrCmd = !!(input.control || input.meta)
      const shift = !!input.shift
      const key = (input.key || '').toString()

      // Reloads: Ctrl/Cmd+R, Ctrl/Cmd+Shift+R, F5
      if (ctrlOrCmd && !shift && key.toLowerCase() === 'r') { event.preventDefault(); return }
      if (ctrlOrCmd && shift && key.toLowerCase() === 'r') { event.preventDefault(); return }
      if (key === 'F5') { event.preventDefault(); return }

      // Devtools: F12, Ctrl/Cmd+Shift+I, Ctrl/Cmd+Shift+J
      if (key === 'F12') { event.preventDefault(); return }
      if (ctrlOrCmd && shift && (key.toLowerCase() === 'i' || key.toLowerCase() === 'j')) { event.preventDefault(); return }

      // View source / page source: Ctrl/Cmd+U
      if (ctrlOrCmd && key.toLowerCase() === 'u') { event.preventDefault(); return }

      // Zoom shortcuts: Ctrl/Cmd + plus/equal/minus/0
      if (ctrlOrCmd && (key === '+' || key === '=' || key === '-' || key === '0')) {
        event.preventDefault()
        try { win.webContents.setZoomFactor(1) } catch {}
        return
      }
    })
  }

  // Prevent renderer from opening arbitrary new windows or navigating to
  // unexpected URLs. Open only allowed external hosts in the user's browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      const allowed = ALLOWED_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))
      if (allowed) {
        void shell.openExternal(url)
      }
    } catch (e) {
      console.warn('[main] window open blocked, invalid url:', url)
    }
    return { action: 'deny' }
  })

  // Block navigations inside the main window to prevent loading remote content
  // into the app. If navigation is desired (rare), it must be mediated by main.
  win.webContents.on('will-navigate', (event, url) => {
    try {
      const parsed = new URL(url)
      const allowed = ALLOWED_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))
      if (!allowed) {
        event.preventDefault()
        console.warn('[main] blocked navigation to', url)
      }
    } catch {
      event.preventDefault()
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC: Notes ───────────────────────────────────────────────────────────────

/** List all .md and .txt files in the notes directory. */
ipcMain.handle('fs:list-notes', (): string[] => {
  try {
    return readdirSync(NOTES_DIR).filter(
      (f: string) => f.endsWith('.md') || f.endsWith('.txt')
    )
  } catch {
    return []
  }
})

/** Read a note's content by filename. Validates path stays inside NOTES_DIR. */
ipcMain.handle('fs:read-note', (_event: IpcMainInvokeEvent, filename: unknown): string => {
  try {
    const safePath = join(NOTES_DIR, sanitizeFilename(filename))
    assertInsideNotesDir(safePath)
    if (!existsSync(safePath)) return ''
    return readFileSync(safePath, 'utf-8')
  } catch (err) {
    console.warn('[main] fs:read-note error:', (err as Error).message)
    return ''
  }
})

/** Write (or create) a note by filename. */
ipcMain.handle('fs:write-note', (_event: IpcMainInvokeEvent, filename: unknown, content: unknown): void => {
  const safePath = join(NOTES_DIR, sanitizeFilename(filename))
  assertInsideNotesDir(safePath)
  writeFileSync(safePath, assertSafeContent(content, 'content'), 'utf-8')
})

/** Delete a note by filename. No-op if the file doesn't exist. */
ipcMain.handle('fs:delete-note', (_event: IpcMainInvokeEvent, filename: unknown): void => {
  const safePath = join(NOTES_DIR, sanitizeFilename(filename))
  assertInsideNotesDir(safePath)
  if (existsSync(safePath)) unlinkSync(safePath)
})

/** Create a new empty note (no-op if it already exists). */
ipcMain.handle('fs:create-note', (_event: IpcMainInvokeEvent, filename: unknown): void => {
  const safePath = join(NOTES_DIR, sanitizeFilename(filename))
  assertInsideNotesDir(safePath)
  if (!existsSync(safePath)) writeFileSync(safePath, '', 'utf-8')
})

/**
 * Rename a note (atomic filesystem rename).
 * Both arguments must be bare filenames (no directory separators).
 * Throws if the old file is missing or the new filename already exists.
 */
ipcMain.handle(
  'fs:rename-note',
  (_event: IpcMainInvokeEvent, oldFilename: unknown, newFilename: unknown): void => {
    const oldPath = join(NOTES_DIR, sanitizeFilename(oldFilename))
    const newPath = join(NOTES_DIR, sanitizeFilename(newFilename))
    assertInsideNotesDir(oldPath)
    assertInsideNotesDir(newPath)
    if (!existsSync(oldPath)) throw new Error(`Note not found: ${String(oldFilename)}`)
    if (existsSync(newPath))  throw new Error(`A note named "${String(newFilename)}" already exists`)
    renameSync(oldPath, newPath)
  }
)

// ─── IPC: Attachments section removed (no UI) ────────────────────────────────


// ─── IPC: Shell / OS operations ─────────────────────────────────────────────────────

/** Open the notes folder in the system file manager. */
ipcMain.handle('shell:open-notes-folder', async (): Promise<void> => {
  await shell.openPath(NOTES_DIR)
})

/** Open the app data folder (state.json location) in the system file manager. */
ipcMain.handle('shell:open-app-data-folder', async (): Promise<void> => {
  await shell.openPath(APP_ROOT)
})

/** Open a URL in the system default browser. Only allowed hostnames accepted. */
const ALLOWED_HOSTS = ['jacobmollan.xyz', 'notara.jacobmollan.xyz', 'github.com']
ipcMain.handle('shell:open-external', async (_event: IpcMainInvokeEvent, url: string): Promise<void> => {
  try {
    const parsed = new URL(url)
    const allowed = ALLOWED_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))
    if (!allowed) {
      console.warn('[main] Blocked openExternal to:', url)
      return
    }
    await shell.openExternal(url)
  } catch {
    console.warn('[main] openExternal: invalid URL:', url)
  }
})

/** Show a save dialog and write the content to the chosen path. Returns path or null on cancel. */
ipcMain.handle(
  'dialog:save-note-as',
  async (event: IpcMainInvokeEvent, defaultFilename: string, content: string): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export Note',
      defaultPath: defaultFilename,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Plain Text', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (result.canceled || !result.filePath) return null
    writeFileSync(result.filePath, content, 'utf-8')
    return result.filePath
  }
)

/** Return the app version from package.json. */
ipcMain.handle('app:get-version', (): string => app.getVersion())

/** Set the window zoom level. */
ipcMain.handle('window:set-zoom', (_event: IpcMainInvokeEvent, level: number): void => {
  mainWindow?.webContents.setZoomLevel(level)
})

/** Get the current window zoom level. */
ipcMain.handle('window:get-zoom', (): number => {
  return mainWindow?.webContents.getZoomLevel() ?? 0
})

// ─── IPC: App State ───────────────────────────────────────────────────────────

/** Load the app state from state.json. Returns null if the file is missing. */
ipcMain.handle('state:load', (): unknown => {
  try {
    if (!existsSync(STATE_FILE)) return null
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
  } catch {
    return null
  }
})

/** Persist the app state to state.json (pretty-printed). */
ipcMain.handle('state:save', (_event: IpcMainInvokeEvent, state: unknown): void => {
  // Validate the blob is serialisable JSON and within size budget before writing.
  const serialised = JSON.stringify(state, null, 2)
  assertSafeContent(serialised, 'state')
  writeFileSync(STATE_FILE, serialised, 'utf-8')
})

// ─── IPC: Themes ───────────────────────────────────────────────────────────

ipcMain.handle('theme:list', (): string[] => {
  try {
    return readdirSync(THEMES_DIR).filter((f: string) => f.endsWith('.json'))
  } catch {
    return []
  }
})

ipcMain.handle('theme:read', (_event: IpcMainInvokeEvent, name: string): object | null => {
  try {
    const safe = name.replace(/[^a-z0-9._-]/ig, '')
    const p = join(THEMES_DIR, safe)
    if (!existsSync(p)) return null
    const raw = JSON.parse(readFileSync(p, 'utf-8'))
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) {
      if (!k.startsWith('--')) continue
      if (typeof v !== 'string') continue
      const s = v.trim()
      if (s === '' || /[\}\<]|\/\*/.test(s) || s.includes(';')) continue
      out[k] = s
    }
    return out
  } catch {
    return null
  }
})

ipcMain.handle('theme:write', (_event: IpcMainInvokeEvent, name: string, data: object): void => {
  const safe = name.replace(/[^a-z0-9._-]/ig, '')
  const p = join(THEMES_DIR, safe)
  const sanitized: Record<string, string> = {}

  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data)) {
      if (!key.startsWith('--')) continue
      if (typeof value !== 'string') continue
      const s = value.trim()
      // Reject empty values or values that could break generated CSS or
      // attempt simple injection (closing braces, comments, angle brackets,
      // or semicolons). Keep the check conservative to avoid rejecting
      // legitimate CSS like `rgba(...)` or gradients.
      if (s === '' || /[\}\<]|\/\*/.test(s) || s.includes(';')) continue
      sanitized[key] = s
    }
  }

  writeFileSync(p, JSON.stringify(sanitized, null, 2), 'utf-8')
})

// ─── IPC: Dialogs ─────────────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Validation constants ────────────────────────────────────────────────────
const MAX_FILENAME_LENGTH = 200
/** Maximum bytes accepted for note content or persisted state. 10 MB. */
const MAX_CONTENT_BYTES   = 10 * 1024 * 1024

/**
 * Assert that `name` is a safe bare filename.
 *
 * Rules (all must pass; throws otherwise):
 *   • Must be a non-empty string.
 *   • Length ≤ MAX_FILENAME_LENGTH characters.
 *   • Must end in `.md` or `.txt`.
 *   • Must not contain path separators (`/`, `\`) or null bytes.
 *   • Must not contain `..` sequences.
 *   • Must not start with a dot (hidden files / `.git` etc.).
 *
 * This function THROWS rather than silently sanitising so callers can
 * surface the error to the user. It is always called before
 * `assertInsideNotesDir` as a fast first gate.
 */
function sanitizeFilename(name: unknown): string {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('Filename must be a non-empty string')
  }
  if (name.length > MAX_FILENAME_LENGTH) {
    throw new Error(`Filename too long (max ${MAX_FILENAME_LENGTH} chars)`)
  }
  if (/[\/\\\x00]/.test(name)) {
    throw new Error('Filename must not contain path separators or null bytes')
  }
  if (name.includes('..')) {
    throw new Error('Filename must not contain traversal sequences (..)')
  }
  if (name.startsWith('.')) {
    throw new Error('Filename must not start with a dot')
  }
  if (!/\.(md|txt)$/i.test(name)) {
    throw new Error('Filename must end in .md or .txt')
  }
  return name
}

/**
 * Throw if the resolved path is outside of NOTES_DIR.
 * Second line of defence after sanitizeFilename.
 */
function assertInsideNotesDir(resolvedPath: string): void {
  const prefix = NOTES_DIR.endsWith(sep) ? NOTES_DIR : NOTES_DIR + sep
  if (!resolvedPath.startsWith(prefix) && resolvedPath !== NOTES_DIR) {
    throw new Error('Access denied: path escapes notes directory')
  }
}

/**
 * Assert that a value is a string and within the allowed byte budget.
 * Used to validate content / state blobs arriving from the renderer.
 */
function assertSafeContent(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  if (Buffer.byteLength(value, 'utf-8') > MAX_CONTENT_BYTES) {
    throw new Error(`${label} exceeds maximum allowed size`)
  }
  return value
}
