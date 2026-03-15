/**
 * src/types.ts
 * Shared TypeScript type definitions for Notara v2.
 *
 * This is the single source of truth for every data shape in the app.
 * Imported by both the Electron main/preload process and all src/ renderer code.
 *
 * Sections:
 *   ① Editor primitives — Tab, EditorSettings
 *   ② App state         — AppState  (shape of state.json)
 *   ③ IPC API           — NotaraAPI  (window.api surface)
 *   ④ Window augmentation
 */

// ─── ① Editor primitives ─────────────────────────────────────────────────────

/** A single open editor tab. */
export type Tab = {
  filename: string
  /** true while a debounced autosave flush is pending. Shows amber dot in tab bar. */
  isDirty: boolean
}

/** Per-session editor display settings. Persisted in state.json. */
export type EditorSettings = {
  /** Base font size in px for the CodeMirror editor. */
  fontSize: number
  /** Enable soft word-wrap. */
  wordWrap: boolean
  /** Show line-number gutter. */
  lineNumbers: boolean
  /** Spaces per tab stop (2 or 4). */
  tabWidth: 2 | 4
  /** Whether the preview panel is currently visible. */
  previewEnabled: boolean
  /** Show word/character count in editor footer. */
  showWordCount: boolean
}

/** App-level behavioural settings. Persisted in state.json. */
export type AppSettings = {
  /** Default file extension when creating new notes. */
  defaultNoteFormat: 'md' | 'txt'
  /** Autosave debounce delay in ms. */
  autosaveDelay: number
  /** Reopen previous session tabs on launch. */
  reopenLastSession: boolean
  /** Show confirmation dialog before deleting a note. */
  confirmBeforeDelete: boolean
  /** Open the last active note automatically on launch. */
  openLastActiveNote: boolean
  /** Respect OS/user preference for reduced animation. */
  reducedMotion: boolean
}

// ─── ② App State ─────────────────────────────────────────────────────────────

/** The complete shape of state.json (application-level session state). */
export type AppState = {
  /** Active theme name. Built-in: 'dark' | 'light'. 'system' follows OS preference. */
  theme: 'dark' | 'light' | 'system'
  /** Whether the left sidebar is collapsed. */
  sidebarCollapsed: boolean
  /** Note list sort order. */
  noteSort: 'name' | 'modified'
  /** Filename of the currently active tab. Null when no tabs are open. */
  activeTab: string | null
  /** Ordered list of open tab filenames. Restored on startup. */
  openTabs: string[]
  /** Filenames pinned to the top of the sidebar note list. */
  pinnedNotes: string[]
  /** MRU list of filenames (max 10). */
  recentFiles: string[]
  editor: EditorSettings
  settings: AppSettings
}

// ─── ③ IPC API ───────────────────────────────────────────────────────────────

/** The typed surface of window.api, exposed by electron/preload.ts. */
export type NotaraAPI = {
  // ── Notes ──────────────────────────────────────────────────────────────
  /** List all .md / .txt basenames in notes/. */
  listNotes: () => Promise<string[]>
  /** Read full text content of a note. */
  readNote: (filename: string) => Promise<string>
  /** Write (upsert) a note's content. Creates the file if absent. */
  writeNote: (filename: string, content: string) => Promise<void>
  /** Delete a note. No-op if the file does not exist. */
  deleteNote: (filename: string) => Promise<void>
  /** Create a new empty note. No-op if it already exists. */
  createNote: (filename: string) => Promise<void>
  /** Rename a note in-place (atomic via fs.renameSync). */
  renameNote: (oldFilename: string, newFilename: string) => Promise<void>

  // ── App state ──────────────────────────────────────────────────────────
  /** Load AppState from state.json. Returns null if absent. */
  loadState: () => Promise<AppState | null>
  /** Save AppState to state.json. */
  saveState: (state: AppState) => Promise<void>

  // ── App lifecycle ─────────────────────────────────────────────────────────
  /** Register a callback to run immediately before the window closes. */
  onBeforeQuit: (callback: () => void) => void
  /** Signal the main process that all pending saves are flushed and it is
   *  safe to close the window. Must be called from the onBeforeQuit callback. */
  readyToQuit: () => Promise<void>

  // ── Window controls (for custom titlebar)
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  unmaximize: () => Promise<void>
  isMaximized: () => Promise<boolean>
  requestAppClose: () => Promise<void>

  // ── Shell / OS operations ────────────────────────────────────────────────
  /** Open the notes folder in the system file manager. */
  openNotesFolder: () => Promise<void>
  /** Open the app data folder (state.json, etc.) in the system file manager. */
  openAppDataFolder: () => Promise<void>
  /** Open the themes folder (APP_ROOT/themes) in the system file manager. */
  openThemesFolder: () => Promise<void>
  /** Open a URL in the system default browser. Only whitelisted URLs allowed. */
  openExternal: (url: string) => Promise<void>
  /** Show a native save dialog and write content to the chosen path.
   *  Returns the saved path on success, or null if cancelled. */
  saveNoteAs: (defaultFilename: string, content: string) => Promise<string | null>
  /** Get the running app version from package.json. */
  getAppVersion: () => Promise<string>
  /** Set the window zoom level (0 = 100%, 1 = 120%, -1 = 80% etc.). */
  setZoomLevel: (level: number) => Promise<void>
  /** Get the current window zoom level. */
  getZoomLevel: () => Promise<number>
  // ── Themes
  listThemes: () => Promise<string[]>
  readTheme: (name: string) => Promise<Record<string, string> | null>
  writeTheme: (name: string, data: Record<string, string>) => Promise<void>
}

// ─── ④ Window augmentation ───────────────────────────────────────────────────

declare global {
  interface Window {
    /** Typed IPC bridge injected by electron/preload.ts via contextBridge. */
    api: NotaraAPI
    /** Internal runtime flags used by the renderer (hot reload / modal state). */
    __notara_before_quit_installed?: boolean
    __notara_settings_open?: boolean
  }
}
