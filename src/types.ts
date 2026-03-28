/**
 * src/types.ts
 * Shared TypeScript type definitions for Notara.
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
  /** True while a debounced autosave flush is pending. Shows amber dot in the tab bar. */
  isDirty: boolean
}

/** Per-session editor display settings. Persisted in state.json. */
export type EditorSettings = {
  /** Base font size in px. */
  fontSize: number
  /** Enable soft word-wrap. */
  wordWrap: boolean
  /** Show line-number gutter. */
  lineNumbers: boolean
  /** Spaces per tab stop (2 or 4). */
  tabWidth: 2 | 4
  /** Whether the preview panel is currently visible. */
  previewEnabled: boolean
  /** Show word/character count in the editor footer. */
  showWordCount: boolean
  /** Enable browser spellcheck underlining in the editor. */
  spellcheck: boolean
}

/** App-level behavioural settings. Persisted in state.json. */
export type AppSettings = {
  /** Default file extension when creating new notes. */
  defaultNoteFormat: 'md' | 'txt'
  /** Autosave debounce delay in ms. 0 disables autosave. */
  autosaveDelay: number
  /** Reopen previous session tabs on launch. */
  reopenLastSession: boolean
  /** Show confirmation dialog before permanently deleting a note. */
  confirmBeforeDelete: boolean
  /** Open the last active note automatically on launch. */
  openLastActiveNote: boolean
  /** Respect the OS reduced-motion preference. */
  reducedMotion: boolean
  /** Boost contrast for low-vision accessibility. */
  highContrastMode?: boolean
  /** Open dropped notes in a new window instead of the current one. */
  openDroppedNotesInNewWindow?: boolean
  /** Enable Chromium GPU acceleration. Restart required to apply. */
  gpuAccelerationEnabled?: boolean
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
  /** MRU list of recently opened filenames (max 10). */
  recentFiles?: string[]
  editor: EditorSettings
  settings: AppSettings
  /** User-customised keybindings stored as overrides on top of defaults. */
  keybindings?: Record<string, { key: string }>
  /** Manual drag-to-reorder order for unpinned notes. */
  noteOrder?: string[]
  /** Per-window session state for secondary windows. */
  windows?: Record<
    string,
    {
      openTabs: string[]
      activeTab: string | null
      bounds?: { x: number; y: number; width: number; height: number }
    }
  >
}

// ─── ③ IPC API ───────────────────────────────────────────────────────────────

/** The typed surface of window.api, exposed by electron/preload.ts. */
export type NotaraAPI = {
  // ── Notes ──────────────────────────────────────────────────────────────────
  /** List all .md / .txt basenames in notes/. */
  listNotes: () => Promise<string[]>
  /** Read the full text content of a note. */
  readNote: (filename: string) => Promise<string>
  /** Write (upsert) a note's content. Creates the file if absent. */
  writeNote: (filename: string, content: string) => Promise<void>
  /** Atomic write via temp-file rename (crash-safe). */
  writeNoteAtomic: (filename: string, content: string) => Promise<void>
  /** Delete a note. No-op if the file does not exist. */
  deleteNote: (filename: string) => Promise<void>
  /** Create a new empty note. No-op if it already exists. */
  createNote: (filename: string) => Promise<void>
  /** Rename a note in-place (atomic via fs.renameSync). */
  renameNote: (oldFilename: string, newFilename: string) => Promise<void>

  // ── App state ──────────────────────────────────────────────────────────────
  /** Load AppState from state.json. Returns null if absent. */
  loadState: () => Promise<AppState | null>
  /** Save AppState to state.json. */
  saveState: (state: AppState) => Promise<void>

  // ── App lifecycle ──────────────────────────────────────────────────────────
  /** Register a callback to run immediately before the window closes. */
  onBeforeQuit: (callback: () => void) => () => void
  /**
   * Signal the main process that all pending saves are flushed and it is
   * safe to close the window. Must be called from the onBeforeQuit callback.
   */
  readyToQuit: () => Promise<void>
  /** Cancel a pending close initiated by app:request-close. */
  cancelQuit: () => Promise<void>
  /** Notify the main process that the renderer has finished hydrating. */
  notifyReady: () => void

  // ── Window management ──────────────────────────────────────────────────────
  /** Open a fresh empty Notara window. */
  openNewWindow: () => Promise<void>
  /** Move a note to its own dedicated window. */
  moveToNewWindow: (filename: string) => Promise<void>
  /** Announce that the user started dragging a tab out of this window. */
  tabDragStart: (filename: string) => Promise<void>
  /** Cancel an in-progress cross-window tab drag. */
  tabDragCancel: () => Promise<void>
  /** Accept the dragged tab into this window. Returns the filename or null. */
  tabDragAccept: () => Promise<string | null>
  /** Listen for a tab being dragged from another window (to show the drop zone). */
  onTabDragAvailable: (callback: (filename: string) => void) => () => void
  /** Listen for a cross-window drag being cancelled or resolved. */
  onTabDragCancelled: (callback: () => void) => () => void
  /** Listen for a tab that was moved to another window (close it here). */
  onTabMovedOut: (callback: (filename: string) => void) => () => void
  /** Get all tabs open in other windows, keyed by windowId. */
  getOpenTabsInOtherWindows?: () => Promise<Record<string, string[]>>
  /** Merge all secondary windows' tabs into this window. */
  mergeAllWindows?: () => Promise<void>
  /** Listen for tabs being sent to this window from a merge. */
  onTabsIncoming?: (callback: (filenames: string[]) => void) => () => void

  // ── Cross-window file change notifications ─────────────────────────────────
  /** Fired when another window saves a file. */
  onFileSaved: (callback: (filename: string, content: string) => void) => () => void
  onFileDeleted: (callback: (filename: string) => void) => () => void
  onFileCreated: (callback: (filename: string) => void) => () => void
  onFileRenamed: (callback: (oldFilename: string, newFilename: string) => void) => () => void

  // ── Spellcheck ─────────────────────────────────────────────────────────────
  /** Register a listener for spellcheck suggestions from Electron's context-menu event. */
  onSpellcheckSuggestions: (
    callback: (data: {
      misspelled: string | null
      suggestions: string[]
      x: number
      y: number
    }) => void
  ) => () => void
  /** Tell Electron to replace the misspelled word with the given correction. */
  replaceMisspelling: (word: string) => Promise<void>
  /** Add a word to the custom spellcheck dictionary. */
  addWordToDictionary: (word: string) => Promise<void>

  // ── Window controls (for custom titlebar) ──────────────────────────────────
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  unmaximize: () => Promise<void>
  isMaximized: () => Promise<boolean>
  screenshotSize: () => Promise<void>
  requestAppClose: () => Promise<void>
  setWindowTitle?: (title: string) => Promise<void>
  setZoomLevel: (level: number) => Promise<void>
  getZoomLevel: () => Promise<number>

  // ── Shell / OS operations ──────────────────────────────────────────────────
  /** Open the notes folder in the system file manager. */
  openNotesFolder: () => Promise<void>
  /** Open the app data folder (state.json, etc.) in the system file manager. */
  openAppDataFolder: () => Promise<void>
  /** Open a URL in the system default browser. Only whitelisted URLs are allowed. */
  openExternal: (url: string) => Promise<void>
  /** Show a native save dialog and write content to the chosen path. Returns the saved path or null. */
  saveNoteAs: (defaultFilename: string, content: string) => Promise<string | null>
  /** Get the running app version from package.json. */
  getAppVersion: () => Promise<string>
  /** Export the given Markdown content as a PDF. Shows a save dialog. */
  exportPdf: (defaultFilename: string) => Promise<string | null>
  /** Get GPU feature status from Chromium. */
  getGpuStatus: () => Promise<{
    status: Record<string, string> | null
    hasHardwareAcceleration: boolean
  }>
  /** Relaunch and exit — used after settings that require a restart. */
  restartApp: () => Promise<void>

  // ── Themes ─────────────────────────────────────────────────────────────────
  listThemes: () => Promise<string[]>
  readTheme: (name: string) => Promise<Record<string, string> | null>
  writeTheme: (name: string, data: Record<string, string>) => Promise<void>

  // ── Version history ────────────────────────────────────────────────────────
  saveVersion: (filename: string, content: string) => Promise<void>
  listVersions: (filename: string) => Promise<string[]>
  readVersion: (filename: string, versionId: string) => Promise<string>
  deleteVersion: (filename: string, versionId: string) => Promise<void>

  // ── Attachments ────────────────────────────────────────────────────────────
  listAttachments: (noteFilename: string) => Promise<string[]>
  openAttachment: (noteFilename: string, attachFilename: string) => Promise<void>
  deleteAttachment: (noteFilename: string, attachFilename: string) => Promise<void>
  importAttachment: (noteFilename: string) => Promise<string | null>
  verifyAttachments: (noteFilename: string) => Promise<{ ok: boolean; errors: string[] }>
  importDroppedPaths: (
    noteFilename: string,
    paths: string[],
    openNotesInNewWindow: boolean
  ) => Promise<{ openedNotes: string[]; importedAttachments: string[]; errors: string[] }>

  // ── Crash recovery ─────────────────────────────────────────────────────────
  /** Write a hot-exit recovery snapshot for a note. */
  writeRecovery?: (filename: string, content: string) => Promise<void>
  listRecovery?: () => Promise<string[]>
  readRecovery?: (filename: string) => Promise<string>
  clearRecovery?: (filename: string) => Promise<void>

  // ── Cross-instance settings synchronisation ───────────────────────────────
  /**
   * Fired when any other Notara window saves its state. The callback receives
   * the full AppState snapshot so the listener can apply globally-shared fields
   * (theme, editor prefs, keybindings, pinned notes, etc.) while ignoring
   * per-window state (openTabs, activeTab, sidebarCollapsed, windows).
   * Returns a cleanup function to unregister the listener.
   */
  onStateChanged?: (callback: (state: AppState) => void) => () => void
  /**
   * Fired when another window writes a custom theme file (themes/*.json).
   * Receivers should re-read and re-apply theme CSS overrides without reload.
   */
  onThemesReloaded?: (callback: () => void) => () => void

  // ── Legacy plugin shims (permanently removed; kept for API compatibility) ──
  listPlugins: () => Promise<never[]>
  savePluginManifest: () => Promise<void>
}

// ─── ④ Window augmentation ───────────────────────────────────────────────────

declare global {
  interface Window {
    /** Typed IPC bridge injected by electron/preload.ts via contextBridge. */
    api: NotaraAPI
    /** Internal runtime flag — true while the settings modal is open. */
    __notara_settings_open?: boolean
  }
}
