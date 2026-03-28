/**
 * src/App.tsx
 * Root React component — owns the top-level layout and coordinates state.
 *
 * Layout (top → bottom / left → right):
 *   <TitleBar>
 *   <AppMenuBar>
 *   <Sidebar> | <Editor> | <Preview>  (optional)
 *   [<SettingsModal>]
 *
 * State ownership:
 *   useTabManager  — open tabs, content cache, autosave, rename, reorder
 *   useNoteList    — reactive note list; create / delete / rename mutations
 *   useSession     — restores / persists open tabs + activeTab to state.json
 *   useUI          — theme, preview visibility, editor display settings
 *   pinnedNotes    — loaded from state.json on mount, written on toggle
 *   sidebarCollapsed / noteSort / appSettings — from state.json, local state
 */

import React, { useCallback, useEffect, useRef, useState, Suspense, lazy } from 'react'
import Sidebar from './components/Sidebar'
import TitleBar from './components/TitleBar'
// Lazy-load Editor to avoid bundling heavy TipTap/editor libs into initial chunk
const Editor = lazy(() => import('./components/Editor'))
import AppMenuBar from './components/AppMenuBar'
import MarkdownToolstrip from './components/MarkdownToolstrip'
import SettingsModal from './components/SettingsModal'
import SearchPalette from './components/SearchPalette'
import FindReplacePanel from './components/FindReplacePanel'
import VersionHistoryPanel from './components/VersionHistoryPanel'
import AttachmentsPanel from './components/AttachmentsPanel'
import MarkdownRawPane from './components/MarkdownRawPane'
import BacklinksPanel from './components/BacklinksPanel'
import ErrorBoundary from './components/ErrorBoundary'
import Icon from './components/Icon'
import {
  ConfirmDialog,
  InputDialog,
  useConfirmDialog,
  useInputDialog,
} from './components/SimpleDialog'
const GraphView = lazy(() => import('./components/GraphView'))
import { useTabManager } from './hooks/useTabManager'
import { useNoteList } from './hooks/useNoteList'
import { useSession } from './hooks/useSession'
import { useUI } from './hooks/useUI'
import { useFTSIndex } from './hooks/useFTSIndex'
import { useVersionHistory } from './hooks/useVersionHistory'
import { useTags } from './hooks/useTags'
import { useBacklinks } from './hooks/useBacklinks'
import { matchesKeybinding, useKeybindings } from './hooks/useKeybindings'
import {
  DEFAULT_STATE,
  loadState,
  removeStateReferences,
  renameStateReferences,
  saveState,
} from './utils/jsonStorage'
import { sanitizeUserFilename, ensureUniqueFilename, stemFilename } from './utils/filenames'
import { parseFrontmatter, serializeFrontmatter, stripFrontmatter } from './utils/markdownConvert'
import type { AppSettings, AppState, EditorSettings } from './types'

// Detect focused (editor-only) window mode from URL params
const IS_FOCUSED_MODE =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('focused') === '1'

export default function App() {
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Raw pane width (percentage of the editor+raw-pane area)
  const [rawPanePct, setRawPanePct] = useState(50)
  const dragStateRef = useRef<{ startX: number; startPct: number; containerWidth: number } | null>(
    null
  )

  function onDividerMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault()
    const container = (e.currentTarget as HTMLElement).parentElement
    if (!container) return
    dragStateRef.current = {
      startX: e.clientX,
      startPct: rawPanePct,
      containerWidth: container.getBoundingClientRect().width,
    }
    const onMouseMove = (mv: MouseEvent) => {
      if (!dragStateRef.current) return
      const { startX, startPct, containerWidth } = dragStateRef.current
      const deltaPct = ((startX - mv.clientX) / containerWidth) * 100
      setRawPanePct(Math.min(75, Math.max(20, startPct + deltaPct)))
    }
    const onMouseUp = () => {
      dragStateRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }
  const { state: confirmState, confirm: showConfirm, close: closeConfirm } = useConfirmDialog()
  const { state: inputState, prompt: showPrompt, close: closeInput } = useInputDialog()

  // Helper to show status message with automatic cleanup
  function showStatus(message: string, duration: number = 2500) {
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current)
    }
    setStatusMessage(message)
    statusTimeoutRef.current = setTimeout(() => {
      setStatusMessage(null)
      statusTimeoutRef.current = null
    }, duration)
  }

  const tabManager = useTabManager((filename, error) =>
    showStatus(`Error saving ${filename}: ${error}`, 3000)
  )
  const noteList = useNoteList()
  const {
    theme,
    previewOpen,
    togglePreview,
    wordWrap,
    toggleWordWrap,
    lineNumbers,
    toggleLineNumbers,
    fontSize,
    tabWidth,
    showWordCount,
    toggleShowWordCount,
    spellcheck,
    applyUIState,
  } = useUI(handleSettingsChange)

  // Serialises settings saves so concurrent loadState+saveState calls never
  // race and clobber each other (e.g. when theme + editor change together).
  const settingsWriteQueueRef = useRef<Promise<void>>(Promise.resolve())

  const [pinnedNotes, setPinnedNotes] = useState<string[]>([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState<string | undefined>(undefined)
  const [noteSort, setNoteSort] = useState<'name' | 'modified'>('name')
  const [noteOrder, setNoteOrder] = useState<string[]>([])
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_STATE.settings)
  const [appReady, setAppReady] = useState(false)
  const [searchPaletteOpen, setSearchPaletteOpen] = useState(false)
  const [findReplaceOpen, setFindReplaceOpen] = useState(false)
  const [findReplaceMode, setFindReplaceMode] = useState<'find' | 'replace'>('find')
  const [versionPanelOpen, setVersionPanelOpen] = useState(false)
  const [attachmentsPanelOpen, setAttachmentsPanelOpen] = useState(false)
  const [backlinksPanelOpen, setBacklinksPanelOpen] = useState(false)
  const [graphOpen, setGraphOpen] = useState(false)
  const [splitTab, setSplitTab] = useState<string | null>(null)
  const [recentFiles, setRecentFiles] = useState<string[]>([])
  const [openInOtherWindows, setOpenInOtherWindows] = useState<Set<string>>(new Set())
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const pendingCloseResolveRef = useRef<((action: 'cancel' | 'save' | 'discard') => void) | null>(
    null
  )

  // Ghost files: files deleted in another window while this window had unsaved changes.
  // Saving a ghost file recreates it on disk before writing.
  const ghostFiles = useRef<Set<string>>(new Set())

  const fts = useFTSIndex()
  const versionHistory = useVersionHistory(tabManager.activeTab)
  const { keybindings } = useKeybindings()

  // Content map for tag indexing — stored as state so useMemo in useTags re-runs
  const [noteContentMap, setNoteContentMap] = useState<Record<string, string>>({})
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  // Tracks whether the initial full FTS bulk-index has completed.
  // After that, all updates are incremental (indexNote/removeNote).
  const ftsInitializedRef = useRef(false)
  // Debounce timer for noteContentMap updates during typing
  const tagUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Callback for useTags — re-created when map changes so useMemo sees new deps
  const getTagContent = useCallback(
    (filename: string): string => {
      return noteContentMap[filename] ?? ''
    },
    [noteContentMap]
  )

  const { tagIndex } = useTags(noteList.notes, getTagContent)
  const wikilinkIndex = useBacklinks(noteList.notes, noteContentMap)

  // Restore open tabs + active tab from state.json
  useSession({ tabManager })

  // Update window title when active tab changes
  useEffect(() => {
    const name = tabManager.activeTab ? stemFilename(tabManager.activeTab) : ''
    void window.api?.setWindowTitle?.(name ? `${name} — Notara` : 'Notara')
  }, [tabManager.activeTab])

  // Track recent files when active tab changes
  useEffect(() => {
    if (!tabManager.activeTab) return
    const filename = tabManager.activeTab
    setRecentFiles((prev) => {
      const next = [filename, ...prev.filter((f) => f !== filename)].slice(0, 10)
      // Queue through settingsWriteQueueRef so this never races with other saves.
      settingsWriteQueueRef.current = settingsWriteQueueRef.current.then(async () => {
        try {
          const s = await loadState()
          await saveState({ ...s, recentFiles: next })
        } catch {}
      })
      return next
    })
  }, [tabManager.activeTab])

  // Refresh the open-in-other-windows indicator when tabs change
  const refreshOpenInOtherWindows = useCallback(async () => {
    try {
      const result = await window.api?.getOpenTabsInOtherWindows?.()
      if (!result) return
      const all = new Set<string>()
      for (const filenames of Object.values(result)) {
        for (const f of filenames) all.add(f)
      }
      setOpenInOtherWindows(all)
    } catch {}
  }, [])

  useEffect(() => {
    void refreshOpenInOtherWindows()
  }, [tabManager.tabs, refreshOpenInOtherWindows])

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-contrast',
      appSettings.highContrastMode ? 'high' : 'normal'
    )
  }, [appSettings.highContrastMode])

  // Listen for incoming tabs from merge-all-windows
  useEffect(() => {
    if (!window.api?.onTabsIncoming) return
    const cleanup = window.api.onTabsIncoming((filenames) => {
      for (const filename of filenames) {
        void tabManager.openTab(filename)
      }
    })
    return cleanup
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup status message timeout on unmount
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current)
      }
    }
  }, [])

  // Listen for cross-window tab IPC events from main process
  useEffect(() => {
    if (!window.api?.onTabMovedOut) return
    const cleanupTabMovedOut = window.api.onTabMovedOut((filename) => {
      tabManager.closeTab(filename)
    })
    // Listen for tabs dropped INTO this window from another window
    const handleOpenTab = (e: Event) => {
      const filename = (e as CustomEvent<string>).detail
      if (!filename) return
      // If already open in this window, just switch to it (no duplicate)
      const alreadyOpen = tabManager.tabs.some((t) => t.filename === filename)
      if (alreadyOpen) {
        tabManager.setActiveTab(filename)
      } else {
        void tabManager.openTab(filename).then(() => tabManager.setActiveTab(filename))
      }
    }
    window.addEventListener('notara:open-tab', handleOpenTab)
    return () => {
      cleanupTabMovedOut()
      window.removeEventListener('notara:open-tab', handleOpenTab)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync file changes broadcast from other windows
  useEffect(() => {
    if (!window.api?.onFileSaved) return
    // Another window saved — update the in-memory content if this tab is open
    const cleanupFileSaved = window.api.onFileSaved((filename, content) => {
      const tab = tabManager.tabs.find((t) => t.filename === filename)
      if (tab?.isDirty) {
        showStatus('File updated in another window — your edits may conflict.')
      } else {
        // syncContent updates the cache without marking the tab dirty or scheduling a write —
        // the content is already on disk, so no orange dot should appear
        tabManager.syncContent(filename, content)
      }
    })
    // Another window deleted a note — close its tab or preserve unsaved changes
    const cleanupFileDeleted = window.api.onFileDeleted((filename) => {
      const tab = tabManager.tabs.find((t) => t.filename === filename)
      if (tab?.isDirty) {
        ghostFiles.current.add(filename)
        showStatus('File deleted in another window — unsaved changes preserved.')
      } else {
        tabManager.closeTab(filename)
      }
      void noteList.refresh()
    })
    // Another window created a note — refresh the note list
    const cleanupFileCreated = window.api.onFileCreated(() => {
      void noteList.refresh()
    })
    // Another window renamed a note — migrate in-memory state via syncRenamedNote,
    // which cancels stale timers and re-keys caches without doing a disk write.
    // (The file was already renamed by the other window's IPC call.)
    const cleanupFileRenamed = window.api.onFileRenamed((oldFilename, newFilename) => {
      void noteList.refresh()
      const isOpen = tabManager.tabs.some((t) => t.filename === oldFilename)
      if (isOpen) {
        tabManager.syncRenamedNote(oldFilename, newFilename)
        // Also update FTS and tag map
        fts.indexNote(newFilename, tabManager.getContent(newFilename))
        fts.removeNote(oldFilename)
        setNoteContentMap((prev) => {
          const next = { ...prev, [newFilename]: prev[oldFilename] ?? '' }
          delete next[oldFilename]
          return next
        })
      }
    })
    return () => {
      cleanupFileSaved()
      cleanupFileDeleted()
      cleanupFileCreated()
      cleanupFileRenamed()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Build FTS index (and note content map for tags) on initial load only.
  // After initialization, updates are incremental via indexNote/removeNote.
  useEffect(() => {
    if (ftsInitializedRef.current) return
    if (noteList.notes.length === 0) {
      setNoteContentMap({})
      fts.bulkIndex([])
      ftsInitializedRef.current = true
      return
    }
    let cancelled = false

    void (async () => {
      const entries: { filename: string; content: string }[] = []
      const failures: string[] = []
      const chunkSize = 12

      for (let offset = 0; offset < noteList.notes.length; offset += chunkSize) {
        const batch = noteList.notes.slice(offset, offset + chunkSize)
        const settled = await Promise.all(
          batch.map(async (filename) => {
            try {
              const content = await window.api.readNote(filename)
              return { filename, content }
            } catch (err) {
              console.warn(`[App] Failed to read note "${filename}" for indexing:`, err)
              failures.push(filename)
              return null
            }
          })
        )
        if (cancelled) return
        entries.push(
          ...settled.filter((entry): entry is { filename: string; content: string } => !!entry)
        )
        await new Promise((resolve) => setTimeout(resolve, 0))
      }

      if (entries.length === 0 && failures.length > 0) {
        console.error(`[App] Failed to index any notes (${failures.length} failures)`)
        return
      }
      fts.bulkIndex(entries)
      setNoteContentMap(Object.fromEntries(entries.map((e) => [e.filename, e.content])))
      ftsInitializedRef.current = true
      if (failures.length > 0) {
        console.warn(`[App] Indexed ${entries.length} note(s), ${failures.length} failed`)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteList.notes])

  const openFindReplace = useCallback((mode: 'find' | 'replace') => {
    setFindReplaceMode(mode)
    setFindReplaceOpen(true)
  }, [])

  useEffect(() => {
    const openFind = () => openFindReplace('find')
    const openReplace = () => openFindReplace('replace')
    window.addEventListener('notara:open-find', openFind)
    window.addEventListener('notara:open-replace', openReplace)
    return () => {
      window.removeEventListener('notara:open-find', openFind)
      window.removeEventListener('notara:open-replace', openReplace)
    }
  }, [openFindReplace])

  const getCachedNoteContent = useCallback(
    (filename: string): string | undefined => {
      const openTab = tabManager.tabs.some((tab) => tab.filename === filename)
      if (openTab) return tabManager.getContent(filename)
      return noteContentMap[filename]
    },
    [noteContentMap, tabManager]
  )

  // Keep FTS index up-to-date when a note's content changes (every keystroke).
  // Tag content map is debounced to avoid re-rendering on every keypress.
  const handleContentChangeWithIndex = useCallback(
    (filename: string, value: string) => {
      tabManager.updateContent(filename, value)
      fts.indexNote(filename, value)
      if (tagUpdateTimerRef.current) clearTimeout(tagUpdateTimerRef.current)
      tagUpdateTimerRef.current = setTimeout(() => {
        setNoteContentMap((prev) => ({ ...prev, [filename]: value }))
      }, 500)
    },
    [tabManager, fts]
  )

  /**
   * Update frontmatter tags for a note without touching the body content.
   * Reads the current cached content, rebuilds frontmatter with the new tag
   * list, writes back through handleContentChangeWithIndex so FTS/autosave
   * fire normally.
   */
  const handleTagsChange = useCallback(
    (filename: string, newTags: string[]) => {
      const raw = tabManager.getContent(filename)
      const { otherLines } = parseFrontmatter(raw)
      const body = stripFrontmatter(raw)
      const updated = serializeFrontmatter(body, newTags, otherLines)
      handleContentChangeWithIndex(filename, updated)
    },
    [tabManager, handleContentChangeWithIndex]
  )

  /** Tags extracted from the active note's frontmatter (memoised). */
  const activeNoteTags = React.useMemo(() => {
    if (!tabManager.activeTab) return []
    const content = tabManager.getContent(tabManager.activeTab)
    return parseFrontmatter(content).tags
    // Re-run when noteContentMap changes (debounced after each keystroke)
  }, [tabManager.activeTab, noteContentMap]) // eslint-disable-line react-hooks/exhaustive-deps

  const applySearchReplacement = useCallback(
    async (filename: string, nextContent: string) => {
      const isOpen = tabManager.tabs.some((tab) => tab.filename === filename)
      if (isOpen) {
        handleContentChangeWithIndex(filename, nextContent)
        await tabManager.flushTab(filename).catch(() => {})
      } else {
        await window.api.writeNoteAtomic(filename, nextContent)
        fts.indexNote(filename, nextContent)
        setNoteContentMap((prev) => ({ ...prev, [filename]: nextContent }))
      }
    },
    [fts, handleContentChangeWithIndex, tabManager]
  )

  // Load sidebar collapsed, sort, settings from state.json on mount
  useEffect(() => {
    // Safety timeout: if loadState hangs for any reason, force-show the app after 3s
    const safetyTimer = setTimeout(() => setAppReady(true), 3000)
    loadState()
      .then((s) => {
        setPinnedNotes(s.pinnedNotes)
        setSidebarCollapsed(s.sidebarCollapsed)
        setNoteSort(s.noteSort)
        setNoteOrder(s.noteOrder ?? [])
        setAppSettings(s.settings)
        if (s.recentFiles) setRecentFiles(s.recentFiles)
        // Ensure the tab manager uses the persisted autosave delay
        tabManager.setAutosaveDelay?.(s.settings.autosaveDelay ?? 800)
      })
      .catch((err) => {
        console.warn('[App] failed loading state:', err)
      })
      .finally(() => {
        clearTimeout(safetyTimer)
        setAppReady(true)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Hot-exit / crash recovery — run once after app is ready
  useEffect(() => {
    if (!appReady) return
    void (async () => {
      try {
        const recoveryFiles = await window.api?.listRecovery?.()
        if (!recoveryFiles || recoveryFiles.length === 0) return
        for (const filename of recoveryFiles) {
          try {
            const [recoveryContent, diskContent] = await Promise.all([
              window.api.readRecovery!(filename),
              window.api.readNote(filename).catch(() => ''),
            ])
            if (recoveryContent !== diskContent) {
              await tabManager.openTab(filename)
              tabManager.updateContent(filename, recoveryContent)
              showStatus(`Recovered unsaved changes for ${filename}`)
            }
          } catch {}
        }
      } catch {}
    })()
  }, [appReady, tabManager])

  // Notify the boot splash (in-page) and the Electron main process
  // that the renderer is ready to be shown. This closes the native
  // splash window in the main process and removes the in-page boot
  // splash. Use a separate effect so it's triggered only once when
  // `appReady` becomes true.
  useEffect(() => {
    if (!appReady) return
    // Signal the boot-splash and Electron main process that the app is ready
    try {
      window.dispatchEvent(new Event('notara:app-ready'))
    } catch {}
    try {
      window.api?.notifyReady?.()
    } catch {}
    // Belt-and-suspenders: ensure the in-page splash overlay is gone
    try {
      document.getElementById('boot-splash')?.remove()
    } catch {}
    try {
      const root = document.getElementById('root')
      if (root) root.style.opacity = '1'
    } catch {}
  }, [appReady])

  // Focused window: close automatically when the last tab is closed
  useEffect(() => {
    if (!IS_FOCUSED_MODE) return
    if (!appReady) return
    if (tabManager.tabs.length === 0) {
      window.api?.requestAppClose()
    }
  }, [tabManager.tabs.length, appReady])

  // DEV: Ctrl+Shift+Alt+S → resize window to ideal screenshot size (1280×800) and centre
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.altKey && e.key === 'S') {
        e.preventDefault()
        window.api?.screenshotSize?.()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Theme is applied by `useUI()` via the HTML `data-theme` attribute.

  // Stable ref so event handlers always read the latest state without stale closures
  const actionsRef = useRef({ tabManager, noteList, togglePreview })
  actionsRef.current = { tabManager, noteList, togglePreview }

  // Sync global settings changed in another Notara window.
  //
  // Per-window state is intentionally excluded:
  //   ✗ openTabs, activeTab — each window manages its own session
  //   ✗ sidebarCollapsed    — per-window UI preference
  //   ✗ windows             — per-window bounds/session data
  //
  // Everything else (theme, editor prefs, keybindings, pinned notes, etc.)
  // is applied immediately so all windows stay consistent without a restart.
  // Theme and editor state is handled by useUI; keybindings by useKeybindings.
  useEffect(() => {
    if (!window.api?.onStateChanged) return
    return window.api.onStateChanged((incoming) => {
      setAppSettings((prev) => {
        const next = { ...DEFAULT_STATE.settings, ...incoming.settings }
        // Propagate autosave delay to the tab manager if it changed
        if (next.autosaveDelay !== prev.autosaveDelay) {
          actionsRef.current.tabManager.setAutosaveDelay?.(next.autosaveDelay ?? 800)
        }
        return next
      })
      setPinnedNotes(incoming.pinnedNotes)
      setNoteSort(incoming.noteSort)
      setNoteOrder(incoming.noteOrder ?? [])
      if (incoming.recentFiles) setRecentFiles(incoming.recentFiles)
    })
  }, [])

  // Pre-quit flush — main sends 'app:before-quit' when the window X is clicked.
  // Every window registers its own handler and unregisters on unmount so hot-reload
  // doesn't accumulate duplicates and secondary windows are covered too.
  useEffect(() => {
    if (!window.api?.onBeforeQuit) return
    const cleanup = window.api.onBeforeQuit(async () => {
      const { tabManager: tm } = actionsRef.current
      const dirtyTabs = tm.tabs.filter((t) => t.isDirty)

      if (dirtyTabs.length === 0) {
        // Nothing dirty — flush any pending writes and close immediately
        try {
          await tm.flushAll()
        } catch {}
        try {
          await window.api.readyToQuit()
        } catch {}
        return
      }

      // Show the unsaved changes dialog
      const action = await new Promise<'cancel' | 'save' | 'discard'>((resolve) => {
        pendingCloseResolveRef.current = resolve
        setCloseDialogOpen(true)
      })

      if (action === 'cancel') {
        try {
          await window.api.cancelQuit()
        } catch {}
        return
      }

      if (action === 'save') {
        try {
          await Promise.race([
            tm.flushAll(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('flush timeout')), 5000)),
          ])
        } catch (err) {
          console.warn('[App] flushAll did not complete before quit:', err)
        }
      }

      try {
        await window.api.readyToQuit()
      } catch (err) {
        console.warn('[App] readyToQuit failed:', err)
      }
    })
    return cleanup
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore global shortcuts when a modal is open
      if (window.__notara_settings_open) return
      const { tabManager: tm, togglePreview: tp } = actionsRef.current

      const target = e.target as HTMLElement | null
      const tagName = target?.tagName ?? ''
      const isEditableTarget = Boolean(
        target?.isContentEditable ||
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT'
      )

      if (matchesKeybinding(e, keybindings.save.key)) {
        e.preventDefault()
        if (tm.activeTab) {
          const activeFilename = tm.activeTab
          if (ghostFiles.current.has(activeFilename)) {
            // Ghost file: was deleted externally while dirty — recreate then write
            void (async () => {
              try {
                await window.api.createNote(activeFilename)
                const content = tm.getContent(activeFilename)
                await window.api.writeNote(activeFilename, content)
                ghostFiles.current.delete(activeFilename)
                showStatus('Saved as new file')
              } catch (err) {
                console.warn('[App] ghost file save failed:', err)
              }
            })()
          } else {
            void tm.flushTab(activeFilename)
          }
        }
        return
      }

      if (matchesKeybinding(e, keybindings.newNote.key)) {
        e.preventDefault()
        if (e.shiftKey) {
          void handleNewWindow()
        } else {
          void handleNewNote()
        }
        return
      }

      if (matchesKeybinding(e, keybindings.closeTab.key)) {
        e.preventDefault()
        if (e.shiftKey) {
          // Ctrl+Shift+W — no-op (avoid accidental close all)
        } else {
          if (tm.activeTab) tm.closeTab(tm.activeTab)
        }
        return
      }

      if (matchesKeybinding(e, keybindings.togglePreview.key)) {
        e.preventDefault()
        tp()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        // Prevent Chromium reload (Ctrl/Cmd+R) inside the Electron app
        e.preventDefault()
        return
      }

      if (matchesKeybinding(e, keybindings.searchAll.key)) {
        e.preventDefault()
        setSearchPaletteOpen(true)
        return
      }

      if (matchesKeybinding(e, keybindings.find.key)) {
        e.preventDefault()
        openFindReplace('find')
        return
      }

      if (matchesKeybinding(e, keybindings.findReplace.key)) {
        e.preventDefault()
        openFindReplace('replace')
        return
      }

      if (matchesKeybinding(e, keybindings.zoomIn.key)) {
        e.preventDefault()
        void handleZoom('in')
        return
      }

      if (matchesKeybinding(e, keybindings.zoomOut.key)) {
        e.preventDefault()
        void handleZoom('out')
        return
      }

      if (matchesKeybinding(e, keybindings.zoomReset.key)) {
        e.preventDefault()
        void handleZoom('reset')
        return
      }

      if (matchesKeybinding(e, keybindings.toggleSidebar.key)) {
        e.preventDefault()
        void handleToggleSidebar()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'G') {
        e.preventDefault()
        setGraphOpen(true)
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        if (e.shiftKey) {
          // Ctrl+Shift+Tab — previous tab (MRU order)
          e.preventDefault()
          if (tm.tabs.length > 1) {
            const mru = tm.tabMRU?.current
            if (mru && mru.length > 1) {
              const curIdx = mru.indexOf(tm.activeTab ?? '')
              const prevIdx = curIdx <= 0 ? mru.length - 1 : curIdx - 1
              tm.setActiveTab(mru[prevIdx])
            } else {
              const arr = tm.tabs
              const idx = arr.findIndex((t) => t.filename === tm.activeTab)
              const prev = (idx - 1 + arr.length) % arr.length
              tm.setActiveTab(arr[prev].filename)
            }
          }
        } else {
          // Ctrl+Tab — next tab (MRU order)
          e.preventDefault()
          if (tm.tabs.length > 1) {
            const mru = tm.tabMRU?.current
            if (mru && mru.length > 1) {
              const curIdx = mru.indexOf(tm.activeTab ?? '')
              const nextIdx = (curIdx + 1) % mru.length
              tm.setActiveTab(mru[nextIdx])
            } else {
              const arr = tm.tabs
              const idx = arr.findIndex((t) => t.filename === tm.activeTab)
              const next = (idx + 1) % arr.length
              tm.setActiveTab(arr[next].filename)
            }
          }
        }
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault()
        tm.reopenLastClosedTab?.()
        return
      }

      if (!isEditableTarget) return

      if (matchesKeybinding(e, keybindings.undo.key)) {
        e.preventDefault()
        window.dispatchEvent(new Event('notara:editor-undo'))
        return
      }

      if (matchesKeybinding(e, keybindings.redo.key)) {
        e.preventDefault()
        window.dispatchEvent(new Event('notara:editor-redo'))
        return
      }

      const markdownActions: Array<[typeof keybindings.mdBold.key, string]> = [
        [keybindings.mdBold.key, 'bold'],
        [keybindings.mdItalic.key, 'italic'],
        [keybindings.mdH1.key, 'h1'],
        [keybindings.mdH2.key, 'h2'],
        [keybindings.mdH3.key, 'h3'],
        [keybindings.mdUnorderedList.key, 'list-ul'],
        [keybindings.mdOrderedList.key, 'list-ol'],
        [keybindings.mdCheckbox.key, 'checkbox'],
        [keybindings.mdBlockquote.key, 'quote'],
        [keybindings.mdLink.key, 'link'],
      ]

      for (const [binding, type] of markdownActions) {
        if (binding && binding.includes('+') && matchesKeybinding(e, binding)) {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('notara:md-format', { detail: { type } }))
          return
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keybindings, openFindReplace])

  // Track settings open state globally for keyboard handlers (avoid stale closure)
  useEffect(() => {
    window.__notara_settings_open = settingsOpen
    return () => {
      window.__notara_settings_open = false
    }
  }, [settingsOpen])

  // ── Note operations ──────────────────────────────────────────────────────

  async function handleNewNote() {
    const ext = appSettings.defaultNoteFormat
    // Use "Untitled.md" / "Untitled 2.md" naming convention
    const base = `Untitled.${ext}`
    const name = ensureUniqueFilename(base, noteList.notes)
    const created = await noteList.createNote(name)
    if (created) {
      // Add empty note to FTS and tag map incrementally
      fts.indexNote(created, '')
      setNoteContentMap((prev) => ({ ...prev, [created]: '' }))
      await tabManager.openTab(created)
      // Dispatch focus request to ensure editor is focused after tab opens
      setTimeout(() => {
        window.dispatchEvent(new Event('notara:focus-active-editor'))
      }, 0)
    }
    showStatus('Created new note')
  }

  async function handleTogglePin(filename: string) {
    const state = await loadState()
    const updated = state.pinnedNotes.includes(filename)
      ? state.pinnedNotes.filter((f) => f !== filename)
      : [...state.pinnedNotes, filename]
    await saveState({ ...state, pinnedNotes: updated })
    setPinnedNotes(updated)
  }

  async function handleReorderNotes(newUnpinnedOrder: string[]) {
    setNoteOrder(newUnpinnedOrder)
    const state = await loadState()
    await saveState({ ...state, noteOrder: newUnpinnedOrder })
  }

  async function handleDeleteNote(filename: string) {
    if (appSettings.confirmBeforeDelete) {
      const confirmed = await showConfirm(
        'Delete Note',
        `Delete "${filename}"?\n\nThis cannot be undone.`,
        {
          confirmLabel: 'Delete',
          isDangerous: true,
        }
      )
      if (!confirmed) return
    }
    await tabManager.flushTab(filename)
    const ok = await noteList.deleteNote(filename)
    // Close the tab in the UI after the deletion to avoid a potential
    // race where a pending save might recreate the file after delete.
    try {
      tabManager.closeTab(filename)
    } catch {}
    if (!ok) return
    // Remove from FTS and tag map incrementally — no need to re-index all notes
    fts.removeNote(filename)
    setNoteContentMap((prev) => {
      const next = { ...prev }
      delete next[filename]
      return next
    })
    const state = await removeStateReferences(filename)
    setPinnedNotes(state.pinnedNotes)
    showStatus('Deleted note')
  }

  async function handleRenameNote(oldFilename: string, newFilename: string): Promise<boolean> {
    const desired = sanitizeUserFilename(newFilename)
    // Prevent collisions with existing notes
    if (noteList.notes.includes(desired) && desired !== oldFilename) return false
    const ok = await tabManager.renameNote(oldFilename, desired)
    if (!ok) return false
    // Update FTS and tag map under the new name; remove stale old entry.
    const renamedContent = tabManager.getContent(desired)
    fts.indexNote(desired, renamedContent)
    fts.removeNote(oldFilename)
    setNoteContentMap((prev) => {
      const next = { ...prev, [desired]: renamedContent }
      delete next[oldFilename]
      return next
    })
    await noteList.refresh()
    const state = await renameStateReferences(oldFilename, desired)
    setPinnedNotes(state.pinnedNotes)
    showStatus('Renamed note')
    return true
  }

  async function handleExportAs(ext: 'md' | 'txt') {
    if (!tabManager.activeTab) return
    const content = tabManager.getContent(tabManager.activeTab)
    const basename = stemFilename(tabManager.activeTab)
    await window.api.saveNoteAs(`${basename}.${ext}`, content)
  }

  async function handleExportPdf() {
    if (!tabManager.activeTab) return
    try {
      const basename = stemFilename(tabManager.activeTab)
      await window.api.exportPdf(`${basename}.pdf`)
      showStatus('Exported as PDF')
    } catch (err) {
      console.warn('[App] exportPdf failed:', err)
    }
  }

  async function handleDuplicateNote() {
    if (!tabManager.activeTab) return
    const content = tabManager.getContent(tabManager.activeTab)
    const basename = stemFilename(tabManager.activeTab)
    const ext = tabManager.activeTab.endsWith('.txt') ? 'txt' : 'md'
    const newName = `${basename}-copy.${ext}`
    const created = await noteList.createNote(newName)
    if (created) {
      await window.api.writeNote(created, content)
      void tabManager.openTab(created)
      showStatus('Duplicated note')
    }
  }

  async function handleNewWindow() {
    await window.api.openNewWindow()
  }

  async function handleMoveToNewWindow(filename?: string | null) {
    const target = filename ?? tabManager.activeTab
    if (!target) return
    await window.api.moveToNewWindow(target)
    tabManager.closeTab(target)
  }

  async function handleDroppedFiles(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    // Cross-window tab drags carry this key — handled by Editor/TabBar drop zones, not here
    if (event.dataTransfer.types.includes('application/x-notara-tab')) return
    let active = tabManager.activeTab
    if (!active) {
      const created = await noteList.createNote(
        ensureUniqueFilename(`Untitled.${appSettings.defaultNoteFormat}`, noteList.notes)
      )
      if (created) {
        await tabManager.openTab(created)
        active = created
      }
    }
    if (!active) return
    const paths = Array.from(event.dataTransfer.files)
      .map((f) => (f as unknown as { path?: string }).path)
      .filter((p): p is string => typeof p === 'string' && p.length > 0)
    if (paths.length === 0) return

    const result = await window.api.importDroppedPaths(
      active,
      paths,
      Boolean(appSettings.openDroppedNotesInNewWindow)
    )

    if (!appSettings.openDroppedNotesInNewWindow) {
      for (const note of result.openedNotes) {
        await tabManager.openTab(note)
      }
    }
    if (result.errors.length > 0) {
      showStatus(`Import finished with ${result.errors.length} warning(s)`, 3000)
    } else if (result.openedNotes.length || result.importedAttachments.length) {
      showStatus(
        `Imported ${result.openedNotes.length} note(s), ${result.importedAttachments.length} attachment(s)`,
        3000
      )
    }
  }

  // ── UI state operations ──────────────────────────────────────────────────

  async function handleToggleSidebar() {
    const next = !sidebarCollapsed
    setSidebarCollapsed(next)
    const state = await loadState()
    await saveState({ ...state, sidebarCollapsed: next })
  }

  async function handleZoom(dir: 'in' | 'out' | 'reset') {
    const current = await window.api.getZoomLevel()
    const next = dir === 'in' ? current + 1 : dir === 'out' ? current - 1 : 0
    await window.api.setZoomLevel(Math.max(-5, Math.min(5, next)))
  }

  function handleOpenSettings(tab?: string) {
    setSettingsInitialTab(tab)
    setSettingsOpen(true)
  }

  function handleRenameActiveNote() {
    if (tabManager.activeTab) {
      document.dispatchEvent(
        new CustomEvent('notara:start-rename', { detail: tabManager.activeTab })
      )
    }
  }

  /**
   * Route a Settings modal patch to useUI + disk.
   *
   * Previously this called multiple independent `loadState().then(saveState(…))`
   * chains (one per changed field). Because all reads fired concurrently against
   * the same state.json, the last write won and clobbered earlier changes —
   * most visibly: the theme reverted when editor/settings were changed at the
   * same time, so theme changes never reached other windows via `state:changed`.
   *
   * Fix: apply React state immediately for instant UI feedback, then queue a
   * single atomic loadState+saveState that carries ALL patches together. The
   * Promise chain (`settingsWriteQueueRef`) ensures sequential execution even
   * when the function is called multiple times in quick succession.
   */
  /**
   * Rename a tag globally: update frontmatter in every note that carries it.
   * Open tabs are updated through the content cache (triggering autosave);
   * closed notes are written atomically directly.
   */
  const handleRenameTag = useCallback(
    async (oldTag: string, newTag: string) => {
      const clean = newTag.trim().toLowerCase().replace(/^#/, '')
      if (!clean || clean === oldTag) return
      const affected = tagIndex.find((t) => t.tag === oldTag)?.notes ?? []
      console.debug(`[App] renameTag: #${oldTag} → #${clean} across ${affected.length} note(s)`)
      await Promise.all(
        affected.map(async (filename) => {
          try {
            const raw = tabManager.tabs.some((t) => t.filename === filename)
              ? tabManager.getContent(filename)
              : await window.api.readNote(filename)
            const { tags, otherLines } = parseFrontmatter(raw)
            const newTags = tags.map((t) => (t === oldTag ? clean : t))
            const body = stripFrontmatter(raw)
            const updated = serializeFrontmatter(body, newTags, otherLines)
            if (tabManager.tabs.some((t) => t.filename === filename)) {
              handleContentChangeWithIndex(filename, updated)
            } else {
              await window.api.writeNoteAtomic(filename, updated)
              fts.indexNote(filename, updated)
              setNoteContentMap((prev) => ({ ...prev, [filename]: updated }))
            }
          } catch (err) {
            console.warn(`[App] renameTag failed for ${filename}:`, err)
          }
        })
      )
    },
    [tagIndex, tabManager, handleContentChangeWithIndex, fts]
  )

  /**
   * Delete a tag globally: strip it from frontmatter in every note that has it.
   */
  const handleDeleteTag = useCallback(
    async (tag: string) => {
      const affected = tagIndex.find((t) => t.tag === tag)?.notes ?? []
      console.debug(`[App] deleteTag: #${tag} from ${affected.length} note(s)`)
      await Promise.all(
        affected.map(async (filename) => {
          try {
            const raw = tabManager.tabs.some((t) => t.filename === filename)
              ? tabManager.getContent(filename)
              : await window.api.readNote(filename)
            const { tags, otherLines } = parseFrontmatter(raw)
            const newTags = tags.filter((t) => t !== tag)
            const body = stripFrontmatter(raw)
            const updated = serializeFrontmatter(body, newTags, otherLines)
            if (tabManager.tabs.some((t) => t.filename === filename)) {
              handleContentChangeWithIndex(filename, updated)
            } else {
              await window.api.writeNoteAtomic(filename, updated)
              fts.indexNote(filename, updated)
              setNoteContentMap((prev) => ({ ...prev, [filename]: updated }))
            }
          } catch (err) {
            console.warn(`[App] deleteTag failed for ${filename}:`, err)
          }
        })
      )
    },
    [tagIndex, tabManager, handleContentChangeWithIndex, fts]
  )

  function handleSettingsChange(patch: Partial<AppState>) {
    // 1. Apply UI state immediately — no individual saveState calls here.
    applyUIState({
      theme: patch.theme,
      editor: patch.editor as Partial<EditorSettings> | undefined,
    })

    // 2. Apply app-level settings state.
    if (patch.settings !== undefined) {
      const next = { ...appSettings, ...patch.settings }
      setAppSettings(next)
      if (patch.settings?.autosaveDelay !== undefined) {
        try {
          tabManager.setAutosaveDelay?.(patch.settings.autosaveDelay)
        } catch {}
      }
    }

    // 3. Session-scoped state (recentFiles, pinnedNotes, sidebarCollapsed).
    if (patch.pinnedNotes !== undefined) setPinnedNotes(patch.pinnedNotes)
    if (patch.sidebarCollapsed !== undefined) setSidebarCollapsed(patch.sidebarCollapsed)

    // 4. Single serialised atomic write — queued so rapid calls don't race.
    const patchSnapshot = { ...patch } as Partial<AppState>
    settingsWriteQueueRef.current = settingsWriteQueueRef.current.then(async () => {
      try {
        const s = await loadState()
        const merged: AppState = {
          ...s,
          ...(patchSnapshot.theme !== undefined ? { theme: patchSnapshot.theme } : {}),
          ...(patchSnapshot.editor ? { editor: { ...s.editor, ...patchSnapshot.editor } } : {}),
          ...(patchSnapshot.settings
            ? { settings: { ...s.settings, ...patchSnapshot.settings } }
            : {}),
          ...(patchSnapshot.recentFiles !== undefined
            ? { recentFiles: patchSnapshot.recentFiles }
            : {}),
          ...(patchSnapshot.pinnedNotes !== undefined
            ? { pinnedNotes: patchSnapshot.pinnedNotes }
            : {}),
          ...(patchSnapshot.sidebarCollapsed !== undefined
            ? { sidebarCollapsed: patchSnapshot.sidebarCollapsed }
            : {}),
        }
        await saveState(merged)
      } catch (err) {
        console.warn('[App] handleSettingsChange save failed:', err)
      }
    })
  }

  // ── Derived values ───────────────────────────────────────────────────────
  // Resolve theme for components that expect only 'dark' | 'light'
  const resolvedTheme =
    theme === 'system'
      ? window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme

  const activeContent = tabManager.activeTab ? tabManager.getContent(tabManager.activeTab) : ''
  const isActivePinned = tabManager.activeTab ? pinnedNotes.includes(tabManager.activeTab) : false

  // Preview is only meaningful for Markdown files; auto-suppress for plain text
  const isActiveMarkdown = tabManager.activeTab?.endsWith('.md') ?? false

  // Sort notes by manual noteOrder (unpinned notes only; new notes append at end)
  const sortedNotes = noteOrder.length
    ? [
        ...noteOrder.filter((f) => noteList.notes.includes(f)),
        ...noteList.notes.filter((f) => !noteOrder.includes(f)),
      ]
    : noteList.notes

  // AppState snapshot for SettingsModal
  const appStateForSettings: AppState = {
    theme,
    sidebarCollapsed,
    noteSort,
    activeTab: tabManager.activeTab,
    openTabs: tabManager.tabs.map((t) => t.filename),
    pinnedNotes,
    recentFiles,
    editor: {
      fontSize,
      wordWrap,
      lineNumbers,
      tabWidth,
      previewEnabled: previewOpen,
      showWordCount,
      spellcheck,
    },
    settings: appSettings,
  }

  // ── Focused (editor-only) window — no sidebar, titlebar, or settings ────────
  if (IS_FOCUSED_MODE) {
    return (
      <ErrorBoundary>
        <div
          className={`flex h-screen w-screen flex-col overflow-hidden text-on-surface ${appSettings.reducedMotion ? 'reduced-motion' : ''} ${appSettings.highContrastMode ? 'high-contrast' : ''}`}
          style={{
            background: 'var(--app-bg)',
            opacity: appReady ? 1 : 0,
            transition: appReady ? 'opacity 180ms ease' : 'none',
          }}
        >
          <TitleBar activeNote={tabManager.activeTab ?? undefined} />
          <main className="flex min-w-0 flex-1 overflow-hidden">
            <Editor
              tabs={tabManager.tabs}
              activeTab={tabManager.activeTab}
              getContent={tabManager.getContent}
              getExternalVersion={tabManager.getExternalVersion}
              onContentChange={handleContentChangeWithIndex}
              onCloseTab={tabManager.closeTab}
              onSelectTab={tabManager.setActiveTab}
              onReorderTabs={tabManager.reorderTabs}
              appTheme={resolvedTheme}
              wordWrap={wordWrap}
              spellcheck={spellcheck}
              lineNumbers={lineNumbers}
              fontSize={fontSize}
              tabWidth={tabWidth}
              showPrompt={showPrompt}
              showConfirm={showConfirm}
              className="flex-1 min-w-0"
            />
            {isActiveMarkdown && <MarkdownToolstrip />}
          </main>
          <ConfirmDialog
            state={confirmState}
            onConfirm={confirmState.onConfirm || closeConfirm}
            onCancel={confirmState.onCancel || closeConfirm}
          />
          <InputDialog
            state={inputState}
            onSubmit={inputState.onSubmit || closeInput}
            onCancel={inputState.onCancel || closeInput}
          />
        </div>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <>
        {/* Skip-to-main-content link — hidden until focused, for keyboard/AT users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[9999] focus:rounded focus:bg-accent focus:px-3 focus:py-1.5 focus:text-sm focus:font-medium focus:text-on-accent focus:shadow-lg focus:outline-none"
          style={
            {
              position: 'absolute',
              width: '1px',
              height: '1px',
              padding: '0',
              margin: '-1px',
              overflow: 'hidden',
              clip: 'rect(0,0,0,0)',
              whiteSpace: 'nowrap',
              border: '0',
            } as React.CSSProperties
          }
        >
          Skip to main content
        </a>

        {/* Loading veil — covers the window while initial state is being hydrated */}
        {!appReady && (
          <div className="app-loading-overlay" aria-hidden="true">
            <div className="app-loading-dots">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        <div
          className={`flex h-screen w-screen flex-col overflow-hidden text-on-surface ${appSettings.reducedMotion ? 'reduced-motion' : ''} ${appSettings.highContrastMode ? 'high-contrast' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
          }}
          onDrop={handleDroppedFiles}
          style={{
            background: 'var(--app-bg)',
            opacity: appReady ? 1 : 0,
            transition: appReady ? 'opacity 180ms ease' : 'none',
          }}
        >
          {/* Single unified title + menu header */}
          <TitleBar
            activeNote={tabManager.activeTab ?? undefined}
            menuContent={
              <AppMenuBar
                mode="titlebar"
                activeTab={tabManager.activeTab}
                activeContent={activeContent}
                isPinned={isActivePinned}
                sidebarCollapsed={sidebarCollapsed}
                wordWrap={wordWrap}
                lineNumbers={lineNumbers}
                previewOpen={previewOpen}
                isMarkdownActive={isActiveMarkdown}
                onNewNote={handleNewNote}
                onSave={() => {
                  if (!tabManager.activeTab) return
                  const content = tabManager.getContent(tabManager.activeTab)
                  void tabManager.flushTab(tabManager.activeTab)
                  void versionHistory.saveVersion(tabManager.activeTab, content)
                  // Update tag index with latest saved content
                  const fn = tabManager.activeTab
                  setNoteContentMap((prev) =>
                    prev[fn] === content ? prev : { ...prev, [fn]: content }
                  )
                }}
                onCloseTab={() => {
                  if (tabManager.activeTab) tabManager.closeTab(tabManager.activeTab)
                }}
                onRenameActiveNote={handleRenameActiveNote}
                onDeleteActiveNote={() => {
                  if (tabManager.activeTab) void handleDeleteNote(tabManager.activeTab)
                }}
                onExportAs={handleExportAs}
                onOpenNotesFolder={() => void window.api.openNotesFolder()}
                onOpenSettings={handleOpenSettings}
                onTogglePreview={togglePreview}
                onToggleSidebar={handleToggleSidebar}
                onToggleWordWrap={toggleWordWrap}
                onToggleLineNumbers={toggleLineNumbers}
                onZoom={handleZoom}
                onPinToggle={() => {
                  if (tabManager.activeTab) void handleTogglePin(tabManager.activeTab)
                }}
                onNewWindow={() => void handleNewWindow()}
                onMoveToNewWindow={() => void handleMoveToNewWindow(tabManager.activeTab)}
                onDuplicateNote={handleDuplicateNote}
                onOpenSearchPalette={() => setSearchPaletteOpen(true)}
                onShowVersionHistory={() => setVersionPanelOpen((v) => !v)}
                onShowAttachments={() => setAttachmentsPanelOpen((v) => !v)}
                onExportPdf={() => void handleExportPdf()}
                onOpenGraph={() => setGraphOpen(true)}
                onMergeWindows={() => void window.api?.mergeAllWindows?.()}
              />
            }
          />

          {/* Main work area (sidebar + editor + toolstrip) */}
          <div className="flex flex-1 overflow-hidden">
            {/* ── Animated sidebar (left side) ───────────────────────────── */}
            <div
              className={`sidebar-shell ${sidebarCollapsed ? 'is-collapsed' : 'is-open'}`}
              style={{ borderRight: '1px solid var(--border-subtle)' }}
            >
              {/* Expanded pane */}
              <div className="sidebar-expanded-pane">
                <Sidebar
                  notes={sortedNotes}
                  activeTab={tabManager.activeTab}
                  openTabs={tabManager.tabs.map((t) => t.filename)}
                  onOpenFile={tabManager.openTab}
                  onCreateNote={noteList.createNote}
                  onDeleteNote={handleDeleteNote}
                  onRenameNote={handleRenameNote}
                  onOpenInNewWindow={(filename) => void handleMoveToNewWindow(filename)}
                  pinnedNotes={pinnedNotes}
                  onTogglePin={handleTogglePin}
                  onToggleSidebar={handleToggleSidebar}
                  sidebarCollapsed={sidebarCollapsed}
                  onOpenSettings={handleOpenSettings}
                  noteSort={noteSort}
                  tagIndex={tagIndex}
                  tagFilter={tagFilter}
                  onTagFilterChange={setTagFilter}
                  onReorderNotes={handleReorderNotes}
                  onOpenGraph={() => setGraphOpen(true)}
                />
              </div>

              {/* Rail pane (collapsed icon strip) */}
              <div className="sidebar-rail-pane" style={{ background: 'var(--sidebar-rail-bg)' }}>
                <button
                  onClick={handleToggleSidebar}
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                  aria-expanded={!sidebarCollapsed}
                  className="btn-icon mt-1"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M9 6l6 6-6 6"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => handleOpenSettings()}
                  title="Settings"
                  aria-label="Settings"
                  className="btn-icon mb-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
                    <path
                      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* ── Main work area ─────────────────────────────────────────── */}
            <main id="main-content" className="flex min-w-0 flex-1 overflow-hidden">
              <Editor
                tabs={tabManager.tabs}
                activeTab={tabManager.activeTab}
                getContent={tabManager.getContent}
                getExternalVersion={tabManager.getExternalVersion}
                onContentChange={handleContentChangeWithIndex}
                onCloseTab={tabManager.closeTab}
                onSelectTab={tabManager.setActiveTab}
                onReorderTabs={tabManager.reorderTabs}
                appTheme={resolvedTheme}
                wordWrap={wordWrap}
                spellcheck={spellcheck}
                lineNumbers={lineNumbers}
                fontSize={fontSize}
                tabWidth={tabWidth}
                showPrompt={showPrompt}
                showConfirm={showConfirm}
                className={
                  (previewOpen && isActiveMarkdown) || splitTab ? 'flex-1 min-w-0' : 'w-full'
                }
                onOpenInSplit={(filename) => setSplitTab(filename)}
                recentFiles={recentFiles}
                noteList={noteList.notes}
                onOpenRecentFile={(f) =>
                  void tabManager.openTab(f).then(() => tabManager.setActiveTab(f))
                }
                loadingTabs={tabManager.loadingTabs}
                openInOtherWindows={openInOtherWindows}
                onTagsChange={handleTagsChange}
                activeNoteTags={activeNoteTags}
              />
              {/* Split editor or raw pane */}
              {splitTab ? (
                <>
                  {/* Divider */}
                  <div
                    onMouseDown={onDividerMouseDown}
                    style={{
                      width: 5,
                      flexShrink: 0,
                      cursor: 'col-resize',
                      background: 'var(--border-subtle)',
                      transition: 'background 120ms',
                      zIndex: 1,
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLElement).style.background = 'var(--accent)'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLElement).style.background = 'var(--border-subtle)'
                    }}
                  />
                  <div
                    className="flex flex-col overflow-hidden"
                    style={{ width: `${rawPanePct}%`, flexShrink: 0 }}
                  >
                    {/* Close split button */}
                    <div
                      className="flex items-center justify-between px-2 py-1"
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        background: 'var(--tab-bg)',
                      }}
                    >
                      <span className="text-[11px] text-muted truncate">
                        {stemFilename(splitTab)}
                      </span>
                      <button
                        onClick={() => setSplitTab(null)}
                        className="btn-icon"
                        title="Close split view"
                        style={{ width: '1.25rem', height: '1.25rem' }}
                      >
                        <svg
                          width="9"
                          height="9"
                          viewBox="0 0 12 12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          aria-hidden
                        >
                          <line x1="2" y1="2" x2="10" y2="10" />
                          <line x1="10" y1="2" x2="2" y2="10" />
                        </svg>
                      </button>
                    </div>
                    <Editor
                      tabs={[
                        {
                          filename: splitTab,
                          isDirty:
                            tabManager.tabs.find((t) => t.filename === splitTab)?.isDirty ?? false,
                        },
                      ]}
                      activeTab={splitTab}
                      getContent={tabManager.getContent}
                      getExternalVersion={tabManager.getExternalVersion}
                      onContentChange={handleContentChangeWithIndex}
                      onCloseTab={() => setSplitTab(null)}
                      onSelectTab={() => {}}
                      appTheme={resolvedTheme}
                      wordWrap={wordWrap}
                      spellcheck={spellcheck}
                      lineNumbers={lineNumbers}
                      fontSize={fontSize}
                      tabWidth={tabWidth}
                      showPrompt={showPrompt}
                      showConfirm={showConfirm}
                      className="flex-1 min-w-0"
                    />
                  </div>
                </>
              ) : previewOpen && isActiveMarkdown && tabManager.activeTab ? (
                <>
                  {/* Drag handle between editor and raw pane */}
                  <div
                    onMouseDown={onDividerMouseDown}
                    style={{
                      width: 5,
                      flexShrink: 0,
                      cursor: 'col-resize',
                      background: 'var(--border-subtle)',
                      transition: 'background 120ms',
                      zIndex: 1,
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLElement).style.background = 'var(--accent)'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLElement).style.background = 'var(--border-subtle)'
                    }}
                  />
                  <MarkdownRawPane
                    filename={tabManager.activeTab}
                    content={tabManager.getContent(tabManager.activeTab)}
                    onContentChange={handleContentChangeWithIndex}
                    fontSize={fontSize}
                    spellcheck={spellcheck}
                    width={`${rawPanePct}%`}
                  />
                </>
              ) : null}
            </main>

            {/* ── Markdown toolstrip (right of editor) ───────────────────── */}
            {isActiveMarkdown && <MarkdownToolstrip />}
          </div>

          {/* Full-width bottom utility strip */}
          <footer className="app-footer">
            {/* Left side: status info */}
            <div className="app-footer-left">
              <span className="footer-info text-[11px] select-none">
                {(() => {
                  if (tabManager.activeTab && tabManager.loadingTabs.has(tabManager.activeTab))
                    return '—'
                  const wc = activeContent.trim() ? activeContent.trim().split(/\s+/).length : 0
                  const lc = activeContent ? activeContent.split('\n').length : 0
                  return showWordCount
                    ? `${wc.toLocaleString()} ${wc === 1 ? 'word' : 'words'} · ${lc.toLocaleString()} ${lc === 1 ? 'line' : 'lines'}`
                    : `${lc.toLocaleString()} ${lc === 1 ? 'line' : 'lines'}`
                })()}
              </span>
              {statusMessage && (
                <span className="footer-info text-[11px] select-none ml-3" aria-live="polite">
                  {statusMessage}
                </span>
              )}
              {tabManager.activeTab && (
                <span className="footer-info text-[11px] select-none">
                  {tabManager.activeTab.endsWith('.md') ? 'Markdown' : 'Plain text'}
                </span>
              )}
            </div>

            {/* Right side: toggles */}
            <div className="app-footer-right">
              <button
                onClick={toggleShowWordCount}
                title={showWordCount ? 'Hide word count' : 'Show word count'}
                className="footer-toggle"
                data-active={showWordCount ? 'true' : 'false'}
                aria-label={showWordCount ? 'Hide word count' : 'Show word count'}
              >
                <Icon name="save" size={14} aria-hidden />
              </button>

              <button
                onClick={toggleWordWrap}
                title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
                className="footer-toggle"
                data-active={wordWrap ? 'true' : 'false'}
                aria-label={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
              >
                <Icon name="code-block" size={14} aria-hidden />
              </button>

              <button
                onClick={togglePreview}
                title={
                  !isActiveMarkdown
                    ? 'Raw markdown view (Markdown files only)'
                    : previewOpen
                      ? 'Hide raw markdown'
                      : 'Show raw markdown'
                }
                className="footer-toggle"
                data-active={previewOpen && isActiveMarkdown ? 'true' : 'false'}
                aria-label={previewOpen ? 'Hide raw markdown' : 'Show raw markdown'}
                disabled={!isActiveMarkdown}
                style={
                  !isActiveMarkdown
                    ? ({ opacity: 0.35, cursor: 'default' } as React.CSSProperties)
                    : undefined
                }
              >
                <Icon name="preview" size={14} aria-hidden />
              </button>
            </div>
          </footer>

          {/* Settings modal */}
          {settingsOpen && (
            <SettingsModal
              isOpen={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              state={appStateForSettings}
              onStateChange={handleSettingsChange}
              initialTab={settingsInitialTab}
              tagIndex={tagIndex}
              onOpenNote={(filename) => {
                void tabManager.openTab(filename).then(() => tabManager.setActiveTab(filename))
                setSettingsOpen(false)
              }}
              onRenameTag={handleRenameTag}
              onDeleteTag={handleDeleteTag}
            />
          )}

          {/* Full-text search palette */}
          {searchPaletteOpen && (
            <SearchPalette
              onSearch={fts.search}
              onOpenNote={(filename) => void tabManager.openTab(filename)}
              onClose={() => setSearchPaletteOpen(false)}
            />
          )}

          {findReplaceOpen && (
            <FindReplacePanel
              isOpen={findReplaceOpen}
              mode={findReplaceMode}
              activeFilename={tabManager.activeTab}
              allNotes={noteList.notes}
              getCachedContent={getCachedNoteContent}
              readNote={(filename) => window.api.readNote(filename)}
              applyContent={applySearchReplacement}
              onOpenNote={(filename) =>
                void tabManager.openTab(filename).then(() => tabManager.setActiveTab(filename))
              }
              onClose={() => setFindReplaceOpen(false)}
            />
          )}

          {/* Version history panel */}
          {versionPanelOpen && tabManager.activeTab && (
            <div
              className="fixed right-4 top-12 z-40 w-72 overflow-hidden rounded-2xl shadow-2xl"
              role="dialog"
              aria-modal="false"
              aria-label="Version history"
              style={{ background: 'var(--modal-bg)', border: '1px solid var(--border-subtle)' }}
            >
              <div
                className="flex items-center justify-between px-3 py-2"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Version History
                </span>
                <button
                  type="button"
                  onClick={() => setVersionPanelOpen(false)}
                  className="text-xs"
                  aria-label="Close version history"
                  style={{ color: 'var(--text-muted)' }}
                >
                  ✕
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                <VersionHistoryPanel
                  filename={tabManager.activeTab}
                  versions={versionHistory.versions}
                  loading={versionHistory.loading}
                  currentContent={activeContent}
                  onRestore={(content) => {
                    if (tabManager.activeTab)
                      tabManager.applyExternalContent(tabManager.activeTab, content)
                    setVersionPanelOpen(false)
                  }}
                  onDelete={(filename, versionId) =>
                    void versionHistory.deleteVersion(filename, versionId)
                  }
                  loadVersion={versionHistory.loadVersion}
                  showConfirm={showConfirm}
                />
              </div>
            </div>
          )}

          {/* Backlinks panel */}
          {backlinksPanelOpen && tabManager.activeTab && (
            <div
              className="fixed right-4 top-12 z-40 w-72 overflow-hidden rounded-2xl shadow-2xl"
              role="dialog"
              aria-modal="false"
              aria-label="Backlinks"
              style={{ background: 'var(--modal-bg)', border: '1px solid var(--border-subtle)' }}
            >
              <div
                className="flex items-center justify-between px-3 py-2"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Backlinks
                </span>
                <button
                  type="button"
                  onClick={() => setBacklinksPanelOpen(false)}
                  className="text-xs"
                  aria-label="Close backlinks"
                  style={{ color: 'var(--text-muted)' }}
                >
                  ✕
                </button>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <BacklinksPanel
                  filename={tabManager.activeTab}
                  backlinks={wikilinkIndex.incoming.get(tabManager.activeTab) ?? []}
                  outgoing={wikilinkIndex.outgoing.get(tabManager.activeTab) ?? []}
                  onOpenNote={(filename) => {
                    void tabManager.openTab(filename)
                    setBacklinksPanelOpen(false)
                  }}
                />
              </div>
            </div>
          )}

          {/* Attachments panel */}
          {attachmentsPanelOpen && tabManager.activeTab && (
            <div
              className="fixed right-4 top-12 z-40 w-64 overflow-hidden rounded-2xl shadow-2xl"
              role="dialog"
              aria-modal="false"
              aria-label="Attachments"
              style={{ background: 'var(--modal-bg)', border: '1px solid var(--border-subtle)' }}
            >
              <div
                className="flex items-center justify-between px-3 py-2"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Attachments
                </span>
                <button
                  type="button"
                  onClick={() => setAttachmentsPanelOpen(false)}
                  className="text-xs"
                  aria-label="Close attachments"
                  style={{ color: 'var(--text-muted)' }}
                >
                  ✕
                </button>
              </div>
              <AttachmentsPanel filename={tabManager.activeTab} showConfirm={showConfirm} />
            </div>
          )}
        </div>

        {/* Knowledge graph (lazy-loaded) */}
        {graphOpen && (
          <Suspense
            fallback={
              <div
                className="fixed inset-0 z-40 flex items-center justify-center"
                style={{ background: 'var(--app-bg)' }}
              >
                <span style={{ color: 'var(--text-muted)' }}>Loading graph...</span>
              </div>
            }
          >
            <GraphView
              notes={noteList.notes}
              wikilinkIndex={wikilinkIndex}
              activeNote={tabManager.activeTab}
              onOpenNote={(filename) => {
                void tabManager.openTab(filename)
                setGraphOpen(false)
              }}
              onClose={() => setGraphOpen(false)}
              theme={resolvedTheme}
            />
          </Suspense>
        )}
        {/* Unsaved changes close dialog */}
        {closeDialogOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label="Unsaved changes"
            style={{ background: 'rgba(0,0,0,0.55)' }}
          >
            <div
              className="w-full max-w-sm rounded-xl shadow-2xl p-6"
              style={{ background: 'var(--modal-bg)', border: '1px solid var(--border-subtle)' }}
            >
              <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Unsaved Changes
              </h2>
              <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
                You have unsaved changes. What would you like to do?
              </p>
              <div className="flex flex-col gap-2">
                <button
                  className="w-full rounded-lg px-4 py-2 text-sm font-medium text-left"
                  style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                  onClick={() => {
                    setCloseDialogOpen(false)
                    pendingCloseResolveRef.current?.('save')
                    pendingCloseResolveRef.current = null
                  }}
                >
                  Save All and Close
                </button>
                <button
                  className="w-full rounded-lg px-4 py-2 text-sm text-left"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-primary)' }}
                  onClick={() => {
                    setCloseDialogOpen(false)
                    pendingCloseResolveRef.current?.('discard')
                    pendingCloseResolveRef.current = null
                  }}
                >
                  Close Without Saving
                </button>
                <button
                  className="w-full rounded-lg px-4 py-2 text-sm text-left"
                  style={{ background: 'transparent', color: 'var(--text-muted)' }}
                  onClick={() => {
                    setCloseDialogOpen(false)
                    pendingCloseResolveRef.current?.('cancel')
                    pendingCloseResolveRef.current = null
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmDialog
          state={confirmState}
          onConfirm={confirmState.onConfirm || closeConfirm}
          onCancel={confirmState.onCancel || closeConfirm}
        />
        <InputDialog
          state={inputState}
          onSubmit={inputState.onSubmit || closeInput}
          onCancel={inputState.onCancel || closeInput}
        />
      </>
    </ErrorBoundary>
  )
}
