/**
 * src/hooks/useSession.ts
 * Session restore and persistence for the multi-tab editor.
 *
 * On mount:
 *   - If a `?note=` URL param is present (detached window), opens that single
 *     note and skips session restore entirely.
 *   - Otherwise reads openTabs + activeTab from state.json, honours the
 *     `reopenLastSession` and `openLastActiveNote` settings, confirms each
 *     file still exists on disk, then reopens those tabs in order and
 *     restores the active tab.
 *
 * On tabs / activeTab change:
 *   Debounces (300 ms) a write of openTabs + activeTab to state.json,
 *   batching rapid tab switches into a single disk write.
 */

import { useEffect, useRef } from 'react'
import { loadState, saveState } from '../utils/jsonStorage'
import { listNotes } from '../utils/fileIO'
import type { TabManager } from './useTabManager'

const PERSIST_DEBOUNCE_MS = 300

export function useSession({ tabManager }: { tabManager: TabManager }): void {
  const { tabs, activeTab, openTab, setActiveTab } = tabManager
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Parse URL params once — they never change for the lifetime of a window.
  const params = new URLSearchParams(window.location.search)
  const windowId = params.get('windowId')
  const isFocusedOrEmpty = params.get('focused') === '1' || params.get('empty') === '1'

  // ── Restore session on mount ───────────────────────────────────────────────
  useEffect(() => {
    async function restore() {
      // ?note=filename — open only that note (detached / move-to-new-window)
      const noteParam = params.get('note')
      if (noteParam) {
        await openTab(noteParam)
        setActiveTab(noteParam)
        return
      }

      // Focused or empty windows skip session restore entirely
      if (isFocusedOrEmpty) return

      const [state, existing] = await Promise.all([loadState(), listNotes()])
      const existingSet = new Set(existing)
      const { reopenLastSession = true, openLastActiveNote = true } = state.settings ?? {}

      if (!reopenLastSession) return

      // Secondary windows restore from state.windows[windowId] when available
      let savedTabs: string[] = state.openTabs
      let savedActiveTab: string | null = state.activeTab
      if (windowId && windowId !== '1' && state.windows?.[windowId]) {
        savedTabs = state.windows[windowId].openTabs
        savedActiveTab = state.windows[windowId].activeTab
      }

      // Discard tabs whose files no longer exist on disk
      const validTabs = savedTabs.filter((f) => existingSet.has(f))

      // If every saved tab has been deleted, prune the stale window entry and bail
      if (
        windowId &&
        windowId !== '1' &&
        state.windows?.[windowId] &&
        validTabs.length === 0 &&
        savedTabs.length > 0
      ) {
        const { [windowId]: _, ...restWindows } = state.windows
        await saveState({
          ...state,
          windows: Object.keys(restWindows).length ? restWindows : undefined,
        })
        return
      }

      for (const filename of validTabs) {
        await openTab(filename)
      }

      if (!openLastActiveNote) return

      // Restore active tab — fall back to first valid tab if the stored one is gone
      const target =
        savedActiveTab && existingSet.has(savedActiveTab) ? savedActiveTab : (validTabs[0] ?? null)
      if (target) setActiveTab(target)
    }

    void restore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Persist on change (debounced) ─────────────────────────────────────────
  useEffect(() => {
    // Focused/empty windows must not overwrite the main window's session state
    if (isFocusedOrEmpty) return

    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(async () => {
      const state = await loadState()
      const filenames = tabs.map((t) => t.filename)
      if (windowId && windowId !== '1') {
        // Secondary windows write to their own slot in state.windows
        await saveState({
          ...state,
          windows: { ...state.windows, [windowId]: { openTabs: filenames, activeTab } },
        })
      } else {
        await saveState({ ...state, openTabs: filenames, activeTab })
      }
    }, PERSIST_DEBOUNCE_MS)
    return () => {
      if (persistTimer.current) {
        clearTimeout(persistTimer.current)
        persistTimer.current = null
      }
    }
  }, [tabs, activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Prune stale window entry on close ─────────────────────────────────────
  // When a secondary window unmounts, remove its slot from state.windows so
  // orphaned entries don't accumulate across sessions.
  useEffect(() => {
    if (!windowId || windowId === '1' || isFocusedOrEmpty) return
    return () => {
      void (async () => {
        try {
          const state = await loadState()
          if (!state.windows?.[windowId]) return
          const { [windowId]: _, ...rest } = state.windows
          await saveState({ ...state, windows: Object.keys(rest).length ? rest : undefined })
        } catch {
          // Non-critical: a stale entry is harmless and will be pruned next session
        }
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
