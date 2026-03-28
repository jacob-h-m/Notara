/**
 * src/hooks/useTabManager.ts
 * Core multi-tab state manager for the Notara editor.
 *
 * Responsibilities:
 *  - Opening, closing, and switching between editor tabs
 *  - In-memory content cache with dirty-state tracking
 *  - Debounced autosave (configurable delay; 0 = manual-only)
 *  - Atomic disk writes with error reporting
 *  - MRU (Most Recently Used) ordering for tab switching
 *  - Closed-tab history for reopen-last-closed (capped at 10)
 *  - Hot-exit recovery snapshots written on every keystroke
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import type { Tab } from '../types'
import { readNote, renameNote as renameNoteFile, writeNoteAtomic } from '../utils/fileIO'
import { DEFAULT_STATE } from '../utils/jsonStorage'

// A value of 0 disables autosave (manual save only).
const AUTOSAVE_DEFAULT_MS = DEFAULT_STATE.settings?.autosaveDelay ?? 800

export function useTabManager(onSaveError?: (filename: string, error: string) => void) {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTab, setActiveTabState] = useState<string | null>(null)
  const [loadingTabs, setLoadingTabs] = useState<Set<string>>(new Set())

  // Non-reactive refs — mutations here never trigger re-renders.
  const contentCache = useRef<Map<string, string>>(new Map())
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const autosaveMs = useRef<number>(AUTOSAVE_DEFAULT_MS)
  const dirtyFiles = useRef<Set<string>>(new Set())
  const onSaveErrorRef = useRef(onSaveError)
  const closedTabHistory = useRef<string[]>([])
  const tabMRU = useRef<string[]>([])
  // Incremented only on external content changes (cross-window sync, version restore).
  // TipTapTabPanel watches this to know when to call setContent — not on normal edits.
  const externalVersions = useRef<Map<string, number>>(new Map())
  // Debounce recovery writes — no need to hit IPC on every single keystroke
  const recoveryTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Keep the error callback ref in sync without triggering re-renders.
  useEffect(() => {
    onSaveErrorRef.current = onSaveError
  }, [onSaveError])

  // ── Internal helpers ──────────────────────────────────────────────────────

  async function loadContent(filename: string): Promise<string> {
    const cached = contentCache.current.get(filename)
    if (cached !== undefined) return cached
    const text = await readNote(filename)
    contentCache.current.set(filename, text)
    return text
  }

  /**
   * Write content for `filename` to disk immediately, cancelling any pending
   * debounce timer. Works even when autosave is disabled (delay = 0), so
   * manual Save always flushes and clears the dirty indicator.
   */
  async function flushSave(filename: string): Promise<void> {
    const timer = saveTimers.current.get(filename)
    if (timer) {
      clearTimeout(timer)
      saveTimers.current.delete(filename)
    }
    if (!dirtyFiles.current.has(filename)) return

    const content = contentCache.current.get(filename)
    if (content === undefined) return

    console.debug(`[TabManager] flushSave start: ${filename}`)
    const ok = await writeNoteAtomic(filename, content)
    if (ok) {
      dirtyFiles.current.delete(filename)
      setTabs((prev) => prev.map((t) => (t.filename === filename ? { ...t, isDirty: false } : t)))
      void window.api?.clearRecovery?.(filename).catch(() => {})
      console.debug(`[TabManager] flushSave ok: ${filename}`)
    } else {
      console.warn(`[TabManager] flushSave FAILED: ${filename}`)
      onSaveErrorRef.current?.(filename, 'Failed to save note')
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Open a note as a tab. Loads content from disk if not already cached. */
  const openTab = useCallback(async (filename: string): Promise<void> => {
    setLoadingTabs((prev) => new Set(prev).add(filename))
    await loadContent(filename)
    setLoadingTabs((prev) => {
      const next = new Set(prev)
      next.delete(filename)
      return next
    })
    setTabs((prev) =>
      prev.some((t) => t.filename === filename) ? prev : [...prev, { filename, isDirty: false }]
    )
    setActiveTabState(filename)
    tabMRU.current = [filename, ...tabMRU.current.filter((f) => f !== filename)]
  }, [])

  /**
   * Close a tab. Flushes any pending write first (awaited).
   * If the closed tab was active, the adjacent tab (or null) is activated.
   */
  const closeTab = useCallback((filename: string): void => {
    // Update UI immediately so the tab closes without waiting for disk write.
    closedTabHistory.current = [
      filename,
      ...closedTabHistory.current.filter((f) => f !== filename),
    ].slice(0, 10)
    tabMRU.current = tabMRU.current.filter((f) => f !== filename)
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.filename === filename)
      const next = prev.filter((t) => t.filename !== filename)
      setActiveTabState((cur) => {
        if (cur !== filename) return cur
        if (next.length === 0) return null
        return next[Math.min(idx, next.length - 1)].filename
      })
      return next
    })
    // Flush save in background after UI update.
    void flushSave(filename).then(() => {
      contentCache.current.delete(filename)
      dirtyFiles.current.delete(filename)
      externalVersions.current.delete(filename)
    })
  }, [])

  /** Switch to an already-open tab by filename. */
  const setActiveTab = useCallback((filename: string): void => {
    setActiveTabState(filename)
    tabMRU.current = [filename, ...tabMRU.current.filter((f) => f !== filename)]
  }, [])

  /**
   * Record a content change for `filename`.
   * Updates the cache immediately, marks the tab dirty,
   * and schedules a debounced disk write.
   */
  const updateContent = useCallback((filename: string, value: string): void => {
    contentCache.current.set(filename, value)
    // Debounce recovery writes to 2s — avoids an IPC call on every keystroke
    const existingRecovery = recoveryTimers.current.get(filename)
    if (existingRecovery) clearTimeout(existingRecovery)
    recoveryTimers.current.set(
      filename,
      setTimeout(() => {
        recoveryTimers.current.delete(filename)
        void window.api
          ?.writeRecovery?.(filename, contentCache.current.get(filename) ?? value)
          .catch(() => {})
      }, 2000)
    )
    dirtyFiles.current.add(filename)

    // Only update tab state if the dirty flag actually changes.
    setTabs((prev) =>
      prev.map((t) => (t.filename === filename && !t.isDirty ? { ...t, isDirty: true } : t))
    )

    // Cancel any existing debounce timer.
    const existing = saveTimers.current.get(filename)
    if (existing) clearTimeout(existing)

    // Autosave disabled — leave the tab dirty for manual save.
    if (autosaveMs.current === 0) return

    const timer = setTimeout(() => {
      saveTimers.current.delete(filename)
      // Always read from cache at fire-time so we save the LATEST content,
      // not the value captured when the timer was scheduled.
      const latest = contentCache.current.get(filename)
      if (latest === undefined) return // tab was closed before timer fired
      console.debug(`[TabManager] autosave fire: ${filename}`)
      void writeNoteAtomic(filename, latest).then((ok) => {
        if (!ok) {
          console.warn(`[TabManager] autosave FAILED: ${filename}`)
          onSaveErrorRef.current?.(filename, 'Failed to save note')
          return
        }
        // Only clear dirty if the cache still matches what we just saved —
        // i.e. no further edits arrived while the write was in flight.
        if (contentCache.current.get(filename) === latest) {
          dirtyFiles.current.delete(filename)
          setTabs((prev) =>
            prev.map((t) => (t.filename === filename ? { ...t, isDirty: false } : t))
          )
          void window.api?.clearRecovery?.(filename).catch(() => {})
          console.debug(`[TabManager] autosave ok: ${filename}`)
        }
      })
    }, autosaveMs.current)
    saveTimers.current.set(filename, timer)
  }, [])

  /** Read current content for `filename` from the in-memory cache (sync). */
  const getContent = useCallback((filename: string): string => {
    return contentCache.current.get(filename) ?? ''
  }, [])

  /**
   * Update cached content without marking the tab dirty or scheduling a write.
   * Used when another window has already saved the file to disk and this window
   * needs to reflect the latest content.
   */
  const syncContent = useCallback((filename: string, value: string): void => {
    contentCache.current.set(filename, value)
    const existing = saveTimers.current.get(filename)
    if (existing) {
      clearTimeout(existing)
      saveTimers.current.delete(filename)
    }
    dirtyFiles.current.delete(filename)
    externalVersions.current.set(filename, (externalVersions.current.get(filename) ?? 0) + 1)
    setTabs((prev) =>
      prev.map((t) => (t.filename === filename && t.isDirty ? { ...t, isDirty: false } : t))
    )
  }, [])

  /** Get the external-change version counter for a filename. */
  const getExternalVersion = useCallback((filename: string): number => {
    return externalVersions.current.get(filename) ?? 0
  }, [])

  /**
   * Apply an external content change (e.g. version restore) — updates the cache,
   * marks dirty, and increments the external version so TipTapTabPanel re-syncs.
   */
  const applyExternalContent = useCallback((filename: string, value: string): void => {
    contentCache.current.set(filename, value)
    dirtyFiles.current.add(filename)
    externalVersions.current.set(filename, (externalVersions.current.get(filename) ?? 0) + 1)
    setTabs((prev) =>
      prev.map((t) => (t.filename === filename && !t.isDirty ? { ...t, isDirty: true } : t))
    )
    // Schedule autosave if enabled
    const existing = saveTimers.current.get(filename)
    if (existing) clearTimeout(existing)
    if (autosaveMs.current > 0) {
      const timer = setTimeout(() => {
        saveTimers.current.delete(filename)
        const latest = contentCache.current.get(filename)
        if (latest === undefined) return
        void writeNoteAtomic(filename, latest).then((ok) => {
          if (ok && contentCache.current.get(filename) === latest) {
            dirtyFiles.current.delete(filename)
            setTabs((prev) =>
              prev.map((t) => (t.filename === filename ? { ...t, isDirty: false } : t))
            )
            void window.api?.clearRecovery?.(filename).catch(() => {})
          }
        })
      }, autosaveMs.current)
      saveTimers.current.set(filename, timer)
    }
  }, [])

  /**
   * Flush all open tabs with pending writes to disk.
   * Returns a Promise that resolves when all writes are complete.
   */
  const flushAll = useCallback(async (): Promise<void> => {
    await Promise.all(Array.from(dirtyFiles.current).map((f) => flushSave(f)))
  }, [])

  const flushTab = useCallback(async (filename: string): Promise<void> => {
    await flushSave(filename)
  }, [])

  /** Rename a note, migrating all in-memory state to the new filename. */
  const renameNote = useCallback(
    async (oldFilename: string, newFilename: string): Promise<boolean> => {
      console.debug(`[TabManager] renameNote: ${oldFilename} -> ${newFilename}`)
      // Flush before rename so the file on disk is up-to-date before the OS rename.
      await flushSave(oldFilename)
      const ok = await renameNoteFile(oldFilename, newFilename)
      if (!ok) {
        console.error(`[useTabManager] renameNote failed: ${oldFilename} -> ${newFilename}`)
        return false
      }

      // Cancel pending save timer for old path — closure captured oldFilename.
      const pendingTimer = saveTimers.current.get(oldFilename)
      if (pendingTimer) {
        clearTimeout(pendingTimer)
        saveTimers.current.delete(oldFilename)
      }

      // Cancel pending recovery timer for old path.
      const pendingRecovery = recoveryTimers.current.get(oldFilename)
      if (pendingRecovery) {
        clearTimeout(pendingRecovery)
        recoveryTimers.current.delete(oldFilename)
      }

      // Migrate content cache.
      const cached = contentCache.current.get(oldFilename)
      if (cached !== undefined) {
        contentCache.current.set(newFilename, cached)
        contentCache.current.delete(oldFilename)
      }

      // Migrate dirty tracking — preserve dirty state, don't force-clear it.
      // flushSave above already cleared it if the write succeeded; if it failed
      // the tab stays dirty under the new name so the user can retry.
      const wasDirty = dirtyFiles.current.has(oldFilename)
      dirtyFiles.current.delete(oldFilename)
      if (wasDirty) dirtyFiles.current.add(newFilename)

      // Migrate external version counter.
      const extVer = externalVersions.current.get(oldFilename)
      externalVersions.current.delete(oldFilename)
      if (extVer !== undefined) externalVersions.current.set(newFilename, extVer)

      setTabs((prev) =>
        prev.map((t) =>
          t.filename === oldFilename ? { ...t, filename: newFilename, isDirty: wasDirty } : t
        )
      )
      setActiveTabState((cur) => (cur === oldFilename ? newFilename : cur))

      // Clear old recovery file from disk (best-effort).
      void window.api?.clearRecovery?.(oldFilename).catch(() => {})

      return true
    },
    []
  )

  /**
   * Update cached tabs after another layer already renamed the underlying file
   * (e.g. cross-window rename notification).
   *
   * The pending save timer for oldFilename is CANCELLED (not re-keyed) because
   * its closure still references oldFilename. Any dirty content is preserved
   * under newFilename; a fresh autosave will be scheduled on the next edit.
   */
  const syncRenamedNote = useCallback((oldFilename: string, newFilename: string): void => {
    const cached = contentCache.current.get(oldFilename)
    if (cached !== undefined) {
      contentCache.current.set(newFilename, cached)
      contentCache.current.delete(oldFilename)
    }
    // Cancel the old-path timer — its closure would write to oldFilename.
    const pendingTimer = saveTimers.current.get(oldFilename)
    if (pendingTimer) {
      clearTimeout(pendingTimer)
      saveTimers.current.delete(oldFilename)
    }
    // Cancel old recovery timer too.
    const pendingRecovery = recoveryTimers.current.get(oldFilename)
    if (pendingRecovery) {
      clearTimeout(pendingRecovery)
      recoveryTimers.current.delete(oldFilename)
    }
    if (dirtyFiles.current.has(oldFilename)) {
      dirtyFiles.current.delete(oldFilename)
      dirtyFiles.current.add(newFilename)
    }
    externalVersions.current.delete(oldFilename)
    setTabs((prev) =>
      prev.map((t) => (t.filename === oldFilename ? { ...t, filename: newFilename } : t))
    )
    setActiveTabState((cur) => (cur === oldFilename ? newFilename : cur))
  }, [])

  /** True when at least one open tab has an unsaved pending write. */
  const hasDirtyTabs = tabs.some((t) => t.isDirty)

  /** Reorder tabs by replacing the entire tabs array (used for drag-to-reorder). */
  const reorderTabs = useCallback((newOrder: Tab[]): void => {
    setTabs(newOrder)
  }, [])

  /** Reopen the last closed tab. */
  const reopenLastClosedTab = useCallback((): string | null => {
    const filename = closedTabHistory.current.shift()
    if (!filename) return null
    void openTab(filename)
    return filename
  }, [openTab])

  /** Update the autosave debounce delay in milliseconds. 0 = disabled. */
  const setAutosaveDelay = useCallback((ms: number): void => {
    autosaveMs.current = ms === 0 ? 0 : Math.max(50, Math.floor(ms))
  }, [])

  return {
    tabs,
    activeTab,
    openTab,
    closeTab,
    setActiveTab,
    updateContent,
    syncContent,
    getContent,
    getExternalVersion,
    applyExternalContent,
    flushTab,
    flushAll,
    renameNote,
    syncRenamedNote,
    hasDirtyTabs,
    reorderTabs,
    setAutosaveDelay,
    reopenLastClosedTab,
    tabMRU,
    loadingTabs,
  }
}

export type TabManager = ReturnType<typeof useTabManager>
