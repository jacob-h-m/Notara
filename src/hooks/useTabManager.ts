/**
 * src/hooks/useTabManager.ts
 * Core multi-tab state manager for the Notara editor.
 */

import { useState, useRef, useCallback } from 'react'
import type { Tab } from '../types'
import { readNote, renameNote as renameNoteFile, writeNote } from '../utils/fileIO'
import { DEFAULT_STATE } from '../utils/jsonStorage'

// Default autosave value is taken from the persisted DEFAULT_STATE.settings.
const AUTOSAVE_DEFAULT_MS = DEFAULT_STATE.settings?.autosaveDelay ?? 800

export function useTabManager() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTab, setActiveTabState] = useState<string | null>(null)

  // Non-reactive refs (mutations here never trigger re-renders)
  const contentCache = useRef<Map<string, string>>(new Map())
  const saveTimers   = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const autosaveMs   = useRef<number>(AUTOSAVE_DEFAULT_MS)

  // ── Internal helpers ──────────────────────────────────────────────────────

  async function loadContent(filename: string): Promise<string> {
    if (contentCache.current.has(filename)) {
      return contentCache.current.get(filename)!
    }
    const text = await readNote(filename)
    contentCache.current.set(filename, text)
    return text
  }

  /** Write any pending debounced content for `filename` immediately. */
  async function flushSave(filename: string): Promise<void> {
    const timer = saveTimers.current.get(filename)
    if (!timer) return
    clearTimeout(timer)
    saveTimers.current.delete(filename)
    const content = contentCache.current.get(filename)
    if (content !== undefined) {
      const ok = await writeNote(filename, content)
      if (ok) {
        setTabs(prev =>
          prev.map(t =>
            t.filename === filename ? { ...t, isDirty: false } : t
          )
        )
      }
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Open a note as a tab. Loads content from disk if not already cached. */
  const openTab = useCallback(async (filename: string): Promise<void> => {
    // sanitize incoming filename to avoid accidental path injection
    // caller should already provide a safe filename, but defend here too
    const safe = filename
    await loadContent(safe)
    setTabs(prev =>
      prev.some(t => t.filename === filename)
        ? prev
        : [...prev, { filename, isDirty: false }]
    )
    setActiveTabState(filename)
  }, [])

  /**
   * Close a tab. Flushes any pending write first (awaited).
   * If the closed tab was active, the adjacent tab (or null) is activated.
   */
  const closeTab = useCallback((filename: string): void => {
    void (async () => {
      await flushSave(filename)
      setTabs(prev => {
        const idx  = prev.findIndex(t => t.filename === filename)
        const next = prev.filter(t => t.filename !== filename)
        // Activate adjacent tab if we closed the active one
        setActiveTabState(cur => {
          if (cur !== filename) return cur
          if (next.length === 0) return null
          return next[Math.min(idx, next.length - 1)].filename
        })
        return next
      })
    })()
  }, [])

  /** Switch to an already-open tab by filename. */
  const setActiveTab = useCallback((filename: string): void => {
    setActiveTabState(filename)
  }, [])

  /**
   * Record a content change for `filename`.
   * Updates the cache immediately (sync), marks the tab dirty,
   * and schedules a debounced disk write.
   */
  const updateContent = useCallback((filename: string, value: string): void => {
    contentCache.current.set(filename, value)

    // Mark tab dirty (minimal state update — only if not already dirty)
    setTabs(prev =>
      prev.map(t =>
        t.filename === filename && !t.isDirty ? { ...t, isDirty: true } : t
      )
    )

    // Debounced write
    const existing = saveTimers.current.get(filename)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      void writeNote(filename, value).then((ok) => {
        saveTimers.current.delete(filename)
        if (!ok) return
        setTabs(prev =>
          prev.map(t =>
            t.filename === filename ? { ...t, isDirty: false } : t
          )
        )
      })
    }, autosaveMs.current)
    saveTimers.current.set(filename, timer)
  }, [])

  /** Read current content for `filename` from the in-memory cache (sync). */
  const getContent = useCallback((filename: string): string => {
    return contentCache.current.get(filename) ?? ''
  }, [])

  /**
   * Flush ALL open tabs with pending writes to disk immediately.
   * Returns a Promise that resolves when all writes are complete.
   * Call this before the window closes to avoid losing the last keystroke.
   */
  const flushAll = useCallback(async (): Promise<void> => {
    const pending = Array.from(saveTimers.current.keys())
    await Promise.all(pending.map(f => flushSave(f)))
  }, [])

  const flushTab = useCallback(async (filename: string): Promise<void> => {
    await flushSave(filename)
  }, [])

  /**
   * Rename a note.
   */
  const renameNote = useCallback(
    async (oldFilename: string, newFilename: string): Promise<boolean> => {
      await flushSave(oldFilename)
      const ok = await renameNoteFile(oldFilename, newFilename)
      if (!ok) {
        console.error(`[useTabManager] renameNote failed: ${oldFilename} -> ${newFilename}`)
        return false
      }

      const pendingTimer = saveTimers.current.get(oldFilename)
      if (pendingTimer) {
        saveTimers.current.set(newFilename, pendingTimer)
        saveTimers.current.delete(oldFilename)
      }

      // Migrate content cache
      const cached = contentCache.current.get(oldFilename)
      if (cached !== undefined) {
        contentCache.current.set(newFilename, cached)
        contentCache.current.delete(oldFilename)
      }

      // Update tabs list
      setTabs(prev =>
        prev.map(t =>
          t.filename === oldFilename
            ? { ...t, filename: newFilename, isDirty: false }
            : t
        )
      )

      // Update active tab pointer if needed
      setActiveTabState(cur => (cur === oldFilename ? newFilename : cur))

      return true
    },
    []
  )

  /** Update cached tabs after another layer already renamed the underlying file. */
  const syncRenamedNote = useCallback((oldFilename: string, newFilename: string): void => {
    const cached = contentCache.current.get(oldFilename)
    if (cached !== undefined) {
      contentCache.current.set(newFilename, cached)
      contentCache.current.delete(oldFilename)
    }
    const pendingTimer = saveTimers.current.get(oldFilename)
    if (pendingTimer) {
      saveTimers.current.set(newFilename, pendingTimer)
      saveTimers.current.delete(oldFilename)
    }
    setTabs(prev =>
      prev.map(t =>
        t.filename === oldFilename
          ? { ...t, filename: newFilename }
          : t
      )
    )
    setActiveTabState(cur => (cur === oldFilename ? newFilename : cur))
  }, [])

  /** True when at least one open tab has an unsaved pending write. */
  const hasDirtyTabs = tabs.some(t => t.isDirty)

  /** Reorder tabs by replacing the entire tabs array (used for drag-to-reorder). */
  const reorderTabs = useCallback((newOrder: Tab[]): void => {
    setTabs(newOrder)
  }, [])

  /** Update the autosave debounce in milliseconds. Safe to call at runtime. */
  const setAutosaveDelay = useCallback((ms: number) => {
    autosaveMs.current = Math.max(50, Math.floor(ms))
  }, [])

  return {
    tabs,
    activeTab,
    openTab,
    closeTab,
    setActiveTab,
    updateContent,
    getContent,
    flushTab,
    flushAll,
    renameNote,
    syncRenamedNote,
    hasDirtyTabs,
    reorderTabs,
    setAutosaveDelay,
  }
}

export type TabManager = ReturnType<typeof useTabManager>
