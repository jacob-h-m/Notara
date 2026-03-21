/**
 * src/utils/jsonStorage.ts
 * Helpers for loading and saving the app's persistent AppState (state.json).
 *
 * `loadState` always returns a complete AppState by deep-merging the raw
 * disk value with DEFAULT_STATE:
 *   - Missing keys are filled with defaults (safe schema upgrades).
 *   - A missing or corrupted state.json never crashes the app.
 *
 * `saveState` writes the full state object to disk via the IPC bridge.
 */

import type { AppState } from '../types'

export const DEFAULT_STATE: AppState = {
  theme: 'system',
  sidebarCollapsed: false,
  noteSort: 'name',
  activeTab: null,
  openTabs: [],
  pinnedNotes: [],
  recentFiles: [],
  noteOrder: [],
  editor: {
    fontSize: 14,
    wordWrap: true,
    lineNumbers: true,
    tabWidth: 2,
    previewEnabled: false,
    showWordCount: false,
    spellcheck: true,
  },
  settings: {
    defaultNoteFormat: 'md',
    autosaveDelay: 800,
    reopenLastSession: true,
    confirmBeforeDelete: false,
    openLastActiveNote: true,
    reducedMotion: false,
    highContrastMode: false,
    gpuAccelerationEnabled: true,
    openDroppedNotesInNewWindow: false,
  },
}

/**
 * Load the persisted AppState, merging with DEFAULT_STATE for any missing
 * fields. Handles first-run and forward/backward schema migrations.
 */
export async function loadState(): Promise<AppState> {
  try {
    const raw = await window.api.loadState()
    if (!raw)
      return {
        ...DEFAULT_STATE,
        editor: { ...DEFAULT_STATE.editor },
        settings: { ...DEFAULT_STATE.settings },
      }
    return {
      ...DEFAULT_STATE,
      ...raw,
      editor: { ...DEFAULT_STATE.editor, ...raw.editor },
      settings: { ...DEFAULT_STATE.settings, ...(raw as AppState).settings },
    }
  } catch {
    return {
      ...DEFAULT_STATE,
      editor: { ...DEFAULT_STATE.editor },
      settings: { ...DEFAULT_STATE.settings },
    }
  }
}

/** Persist the full AppState to disk. */
export async function saveState(state: AppState): Promise<void> {
  try {
    await window.api.saveState(state)
  } catch (err) {
    console.error('[jsonStorage] saveState failed:', err)
  }
}

/** Remove a filename from all persisted session lists. */
export async function removeStateReferences(filename: string): Promise<AppState> {
  const state = await loadState()
  const next: AppState = {
    ...state,
    activeTab: state.activeTab === filename ? null : state.activeTab,
    openTabs: state.openTabs.filter((item) => item !== filename),
    pinnedNotes: state.pinnedNotes.filter((item) => item !== filename),
    recentFiles: (state.recentFiles ?? []).filter((item) => item !== filename),
  }
  await saveState(next)
  return next
}

/** Replace a filename everywhere it appears in persisted session state. */
export async function renameStateReferences(
  oldFilename: string,
  newFilename: string
): Promise<AppState> {
  const state = await loadState()
  const replace = (items: string[]) =>
    items.map((item) => (item === oldFilename ? newFilename : item))
  const next: AppState = {
    ...state,
    activeTab: state.activeTab === oldFilename ? newFilename : state.activeTab,
    openTabs: replace(state.openTabs),
    pinnedNotes: replace(state.pinnedNotes),
    recentFiles: replace(state.recentFiles ?? []),
  }
  await saveState(next)
  return next
}
