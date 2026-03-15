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

import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppState,
  NotaraAPI,
} from '../src/types'

const _api = {
  // ── Notes ────────────────────────────────────────────────────────────────
  listNotes: (): Promise<string[]> =>
    ipcRenderer.invoke('fs:list-notes'),

  readNote: (filename: string): Promise<string> =>
    ipcRenderer.invoke('fs:read-note', filename),

  writeNote: (filename: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:write-note', filename, content),

  deleteNote: (filename: string): Promise<void> =>
    ipcRenderer.invoke('fs:delete-note', filename),

  createNote: (filename: string): Promise<void> =>
    ipcRenderer.invoke('fs:create-note', filename),

  renameNote: (oldFilename: string, newFilename: string): Promise<void> =>
    ipcRenderer.invoke('fs:rename-note', oldFilename, newFilename),

  // ── App state ─────────────────────────────────────────────────────────────
  loadState: (): Promise<AppState | null> =>
    ipcRenderer.invoke('state:load'),

  saveState: (state: AppState): Promise<void> =>
    ipcRenderer.invoke('state:save', state),

  // ── App lifecycle ─────────────────────────────────────────────────────────
  onBeforeQuit: (callback: () => void): void => {
    ipcRenderer.on('app:before-quit', callback)
  },
  readyToQuit: (): Promise<void> =>
    ipcRenderer.invoke('app:ready-to-quit'),
  // ── Window controls (for custom titlebar) -------------------------------
  minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  maximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
  unmaximize: (): Promise<void> => ipcRenderer.invoke('window:unmaximize'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  requestAppClose: (): Promise<void> => ipcRenderer.invoke('app:request-close'),
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
  readTheme: (name: string): Promise<Record<string, string> | null> => ipcRenderer.invoke('theme:read', name),
  writeTheme: (name: string, data: Record<string, string>): Promise<void> => ipcRenderer.invoke('theme:write', name, data),
} satisfies NotaraAPI

// Prevent the renderer from mutating the exposed API surface.
try { contextBridge.exposeInMainWorld('api', Object.freeze(_api) as unknown as NotaraAPI) } catch {
  // Fallback: in case freezing isn't allowed in some envs, still expose the object.
  contextBridge.exposeInMainWorld('api', _api as unknown as NotaraAPI)
}
