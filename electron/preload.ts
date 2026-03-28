/**
 * electron/preload.ts
 * Secure IPC bridge between the Electron main process and the React renderer.
 *
 * Uses Electron's contextBridge to expose a minimal, typed API at window.api.
 * The renderer has NO access to Node.js or Electron internals — only the
 * explicit methods listed here are callable from renderer code.
 *
 * Keep this file lean: each method delegates to a named IPC channel handled
 * in electron/main.ts. Type definitions are shared via src/types.ts.
 *
 * Channels exposed (matches electron/main.ts 1-to-1):
 *   Notes       — fs:list-notes, fs:read-note, fs:write-note, fs:delete-note,
 *                 fs:create-note, fs:rename-note
 *   App state   — state:load, state:save
 */

import * as electron from 'electron'
import type { AppState, NotaraAPI } from '../src/types'
const ipcRenderer = (electron as any).ipcRenderer
const contextBridge = (electron as any).contextBridge

const _api = {
  // ── Notes ────────────────────────────────────────────────────────────────
  listNotes: (): Promise<string[]> => ipcRenderer.invoke('fs:list-notes'),

  readNote: (filename: string): Promise<string> => ipcRenderer.invoke('fs:read-note', filename),

  writeNote: (filename: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:write-note', filename, content),

  writeNoteAtomic: (filename: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:write-note-atomic', filename, content),

  deleteNote: (filename: string): Promise<void> => ipcRenderer.invoke('fs:delete-note', filename),

  createNote: (filename: string): Promise<void> => ipcRenderer.invoke('fs:create-note', filename),

  renameNote: (oldFilename: string, newFilename: string): Promise<void> =>
    ipcRenderer.invoke('fs:rename-note', oldFilename, newFilename),

  // ── App state ─────────────────────────────────────────────────────────────
  loadState: (): Promise<AppState | null> => ipcRenderer.invoke('state:load'),

  saveState: (state: AppState): Promise<void> => ipcRenderer.invoke('state:save', state),

  // ── App lifecycle ─────────────────────────────────────────────────────────
  onBeforeQuit: (callback: () => void): (() => void) => {
    function handler() {
      callback()
    }
    ipcRenderer.on('app:before-quit', handler)
    return () => ipcRenderer.removeListener('app:before-quit', handler)
  },
  readyToQuit: (): Promise<void> => ipcRenderer.invoke('app:ready-to-quit'),
  cancelQuit: (): Promise<void> => ipcRenderer.invoke('app:cancel-quit'),
  // Notify main that the renderer has finished hydrating and is ready to be shown
  notifyReady: (): void => ipcRenderer.send('notara:renderer-ready'),
  // ── Window controls (for custom titlebar) -------------------------------
  minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  maximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
  unmaximize: (): Promise<void> => ipcRenderer.invoke('window:unmaximize'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  screenshotSize: (): Promise<void> => ipcRenderer.invoke('window:screenshot-size'),
  requestAppClose: (): Promise<void> => ipcRenderer.invoke('app:request-close'),
  /** Open a fresh empty Notara window (like VSCode "New Window"). */
  openNewWindow: (): Promise<void> => ipcRenderer.invoke('window:new'),
  /** Move a note to its own window. Caller should close the tab in source window after resolving. */
  moveToNewWindow: (filename: string): Promise<void> =>
    ipcRenderer.invoke('window:move-to-new-window', filename),
  /** Announce that the user started dragging a tab out of this window. */
  tabDragStart: (filename: string): Promise<void> =>
    ipcRenderer.invoke('window:tab-drag-start', filename),
  /** Cancel an in-progress cross-window tab drag. */
  tabDragCancel: (): Promise<void> => ipcRenderer.invoke('window:tab-drag-cancel'),
  /** Accept the dragged tab into this window. Returns the filename or null. */
  tabDragAccept: (): Promise<string | null> => ipcRenderer.invoke('window:tab-drag-accept'),
  /** Listen for a tab being dragged from another window. */
  onTabDragAvailable: (callback: (filename: string) => void): (() => void) => {
    function handler(_e: any, filename: any) {
      callback(filename)
    }
    ipcRenderer.on('window:tab-drag-available', handler)
    return () => ipcRenderer.removeListener('window:tab-drag-available', handler)
  },
  /** Listen for the cross-window drag being cancelled or resolved. */
  onTabDragCancelled: (callback: () => void): (() => void) => {
    function handler() {
      callback()
    }
    ipcRenderer.on('window:tab-drag-cancelled', handler)
    return () => ipcRenderer.removeListener('window:tab-drag-cancelled', handler)
  },
  /** Listen for a notification that a tab was moved to another window (close it here). */
  onTabMovedOut: (callback: (filename: string) => void): (() => void) => {
    function handler(_e: any, filename: any) {
      callback(filename)
    }
    ipcRenderer.on('window:tab-moved-out', handler)
    return () => ipcRenderer.removeListener('window:tab-moved-out', handler)
  },
  // ── Cross-window file change notifications --------------------------------
  onFileSaved: (callback: (filename: string, content: string) => void): (() => void) => {
    function handler(_e: any, data: any) {
      callback(data.filename, data.content)
    }
    ipcRenderer.on('notara:file-saved', handler)
    return () => ipcRenderer.removeListener('notara:file-saved', handler)
  },
  onFileDeleted: (callback: (filename: string) => void): (() => void) => {
    function handler(_e: any, data: any) {
      callback(data.filename)
    }
    ipcRenderer.on('notara:file-deleted', handler)
    return () => ipcRenderer.removeListener('notara:file-deleted', handler)
  },
  onFileCreated: (callback: (filename: string) => void): (() => void) => {
    function handler(_e: any, data: any) {
      callback(data.filename)
    }
    ipcRenderer.on('notara:file-created', handler)
    return () => ipcRenderer.removeListener('notara:file-created', handler)
  },
  onFileRenamed: (callback: (oldFilename: string, newFilename: string) => void): (() => void) => {
    function handler(_e: any, data: any) {
      callback(data.oldFilename, data.newFilename)
    }
    ipcRenderer.on('notara:file-renamed', handler)
    return () => ipcRenderer.removeListener('notara:file-renamed', handler)
  },
  onSpellcheckSuggestions: (
    callback: (data: {
      misspelled: string | null
      suggestions: string[]
      x: number
      y: number
    }) => void
  ): (() => void) => {
    function handler(_event: any, data: any) {
      callback(data)
    }
    ipcRenderer.on('spellcheck:suggestions', handler)
    return () => ipcRenderer.removeListener('spellcheck:suggestions', handler)
  },
  replaceMisspelling: (word: string): Promise<void> =>
    ipcRenderer.invoke('spellcheck:replace-misspelling', word),
  addWordToDictionary: (word: string): Promise<void> =>
    ipcRenderer.invoke('spellcheck:add-to-dictionary', word),
  // ── Shell / OS operations -----------------------------------------------
  openNotesFolder: (): Promise<void> => ipcRenderer.invoke('shell:open-notes-folder'),
  openAppDataFolder: (): Promise<void> => ipcRenderer.invoke('shell:open-app-data-folder'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url),
  saveNoteAs: (defaultFilename: string, content: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:save-note-as', defaultFilename, content),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  setZoomLevel: (level: number): Promise<void> => ipcRenderer.invoke('window:set-zoom', level),
  getZoomLevel: (): Promise<number> => ipcRenderer.invoke('window:get-zoom'),
  // ── Themes (stored in APP_ROOT/themes/*.json)
  listThemes: (): Promise<string[]> => ipcRenderer.invoke('theme:list'),
  readTheme: (name: string): Promise<Record<string, string> | null> =>
    ipcRenderer.invoke('theme:read', name),
  writeTheme: (name: string, data: Record<string, string>): Promise<void> =>
    ipcRenderer.invoke('theme:write', name, data),
  // ── GPU status
  getGpuStatus: (): Promise<{
    status: Record<string, string> | null
    hasHardwareAcceleration: boolean
  }> => ipcRenderer.invoke('gpu:status'),
  // Request main to restart the application (relaunch + exit)
  restartApp: (): Promise<void> => ipcRenderer.invoke('app:restart'),
  // ── Versions
  saveVersion: (filename: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:save-version', filename, content),
  listVersions: (filename: string): Promise<string[]> =>
    ipcRenderer.invoke('fs:list-versions', filename),
  readVersion: (filename: string, versionId: string): Promise<string> =>
    ipcRenderer.invoke('fs:read-version', filename, versionId),
  deleteVersion: (filename: string, versionId: string): Promise<void> =>
    ipcRenderer.invoke('fs:delete-version', filename, versionId),
  // ── Attachments
  listAttachments: (noteFilename: string): Promise<string[]> =>
    ipcRenderer.invoke('fs:list-attachments', noteFilename),
  openAttachment: (noteFilename: string, attachFilename: string): Promise<void> =>
    ipcRenderer.invoke('fs:open-attachment', noteFilename, attachFilename),
  deleteAttachment: (noteFilename: string, attachFilename: string): Promise<void> =>
    ipcRenderer.invoke('fs:delete-attachment', noteFilename, attachFilename),
  importAttachment: (noteFilename: string): Promise<string | null> =>
    ipcRenderer.invoke('fs:import-attachment', noteFilename),
  verifyAttachments: (noteFilename: string): Promise<{ ok: boolean; errors: string[] }> =>
    ipcRenderer.invoke('fs:verify-attachments', noteFilename),
  importDroppedPaths: (
    noteFilename: string,
    paths: string[],
    openNotesInNewWindow: boolean
  ): Promise<{ openedNotes: string[]; importedAttachments: string[]; errors: string[] }> =>
    ipcRenderer.invoke('fs:import-dropped-paths', noteFilename, paths, openNotesInNewWindow),
  // ── PDF export
  exportPdf: (defaultFilename: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:export-pdf', defaultFilename),
  // ── Plugins (REMOVED — shim for backwards compatibility; returns empty data, no-ops writes)
  // The plugin execution engine (new Function / eval) has been permanently removed.
  // These shims prevent crashes in any renderer code that still calls these methods.
  listPlugins: async (): Promise<never[]> => [],
  savePluginManifest: async (): Promise<void> => {},

  // ── Window title
  setWindowTitle: (title: string): Promise<void> => ipcRenderer.invoke('window:set-title', title),

  // ── Cross-instance settings synchronisation
  /**
   * Fired by the main process when ANY other Notara window saves state.
   * The callback receives the complete new AppState so callers can apply
   * only the globally-shared fields they care about. Returns a cleanup fn.
   */
  onStateChanged: (callback: (state: AppState) => void): (() => void) => {
    function handler(_e: any, state: AppState) {
      callback(state)
    }
    ipcRenderer.on('state:changed', handler)
    return () => ipcRenderer.removeListener('state:changed', handler)
  },
  /**
   * Fired when another window writes a theme file (themes/*.json).
   * Receivers should reload their theme CSS without a full page reload.
   */
  onThemesReloaded: (callback: () => void): (() => void) => {
    function handler() {
      callback()
    }
    ipcRenderer.on('notara:themes-reload', handler)
    return () => ipcRenderer.removeListener('notara:themes-reload', handler)
  },

  // ── Hot-exit / crash recovery
  writeRecovery: (filename: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:write-recovery', filename, content),
  listRecovery: (): Promise<string[]> => ipcRenderer.invoke('fs:list-recovery'),
  readRecovery: (filename: string): Promise<string> =>
    ipcRenderer.invoke('fs:read-recovery', filename),
  clearRecovery: (filename: string): Promise<void> =>
    ipcRenderer.invoke('fs:clear-recovery', filename),

  // ── Cross-window open tabs
  getOpenTabsInOtherWindows: (): Promise<Record<string, string[]>> =>
    ipcRenderer.invoke('window:get-open-tabs'),

  // ── Merge windows
  mergeAllWindows: (): Promise<void> => ipcRenderer.invoke('window:merge-all'),
  onTabsIncoming: (callback: (filenames: string[]) => void): (() => void) => {
    function handler(_e: any, filenames: any) {
      callback(filenames)
    }
    ipcRenderer.on('window:tabs-incoming', handler)
    return () => ipcRenderer.removeListener('window:tabs-incoming', handler)
  },
} satisfies NotaraAPI

// Prevent the renderer from mutating the exposed API surface.
try {
  ;(contextBridge as any).exposeInMainWorld('api', Object.freeze(_api) as unknown as NotaraAPI)
} catch {
  // Fallback: in case freezing isn't allowed in some envs, still expose the object.
  ;(contextBridge as any).exposeInMainWorld('api', _api as unknown as NotaraAPI)
}
