/**
 * src/hooks/useSession.ts
 * Session restore and persistence for the multi-tab editor.
 *
 * On mount:
 *   Reads openTabs + activeTab from state.json, confirms each file still
 *   exists on disk, then reopens those tabs in order and restores the
 *   active tab. Silently skips files that no longer exist.
 *
 * On tabs / activeTab change:
 *   Debounces (300 ms) a write of openTabs + activeTab to state.json,
 *   state.json, batching rapid tab switches into a single disk write.
 */

import { useEffect, useRef } from 'react'
import { loadState, saveState } from '../utils/jsonStorage'
import { listNotes } from '../utils/fileIO'
import type { TabManager } from './useTabManager'

const PERSIST_DEBOUNCE_MS = 300

export function useSession({ tabManager }: { tabManager: TabManager }): void {
  const { tabs, activeTab, openTab, setActiveTab } = tabManager
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Restore session on mount ───────────────────────────────────────────────
  useEffect(() => {
    async function restore() {
      const [state, existing] = await Promise.all([
        loadState(),
        listNotes(),
      ])
      const existingSet = new Set(existing)

      // Open only tabs whose files still exist on disk
      const validTabs = state.openTabs.filter(f => existingSet.has(f))
      for (const filename of validTabs) {
        await openTab(filename)
      }

      // Restore active tab — fall back to first valid tab if stored one is gone
      const target =
        state.activeTab && existingSet.has(state.activeTab)
          ? state.activeTab
          : validTabs[0] ?? null
      if (target) setActiveTab(target)
    }
    restore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Persist on change (debounced) ─────────────────────────────────────────
  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(async () => {
      const state = await loadState()
      const filenames = tabs.map((t: { filename: string }) => t.filename)
      await saveState({ ...state, openTabs: filenames, activeTab })
    }, PERSIST_DEBOUNCE_MS)
    return () => {
      if (persistTimer.current) {
        clearTimeout(persistTimer.current)
        persistTimer.current = null
      }
    }
  }, [tabs, activeTab])
}

