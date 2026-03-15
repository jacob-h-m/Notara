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

import React, { useEffect, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import TitleBar from './components/TitleBar'
import Editor from './components/Editor'
import Preview from './components/Preview'
import AppMenuBar from './components/AppMenuBar'
import SettingsModal from './components/SettingsModal'
import { useTabManager } from './hooks/useTabManager'
import { useNoteList } from './hooks/useNoteList'
import { useSession } from './hooks/useSession'
import { useUI } from './hooks/useUI'
import { DEFAULT_STATE, loadState, removeStateReferences, renameStateReferences, saveState } from './utils/jsonStorage'
import { sanitizeUserFilename } from './utils/filenames'
import type { AppSettings, AppState, EditorSettings } from './types'

export default function App() {
  const tabManager = useTabManager()
  const noteList   = useNoteList()
  const {
    theme, setTheme,
    previewOpen, togglePreview, setPreviewEnabled,
    wordWrap, toggleWordWrap, setWordWrap,
    lineNumbers, toggleLineNumbers, setLineNumbers,
    fontSize, setFontSize,
    tabWidth, setTabWidth,
    showWordCount, setShowWordCount, toggleShowWordCount,
  } = useUI()

  const [pinnedNotes, setPinnedNotes]               = useState<string[]>([])
  const [editorScrollPct, setEditorScrollPct]       = useState(0)
  const [sidebarCollapsed, setSidebarCollapsed]     = useState(false)
  const [settingsOpen, setSettingsOpen]             = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState<string | undefined>(undefined)
  const [noteSort, setNoteSort]                     = useState<'name' | 'modified'>('name')
  const [appSettings, setAppSettings]               = useState<AppSettings>(DEFAULT_STATE.settings)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [appReady, setAppReady]             = useState(false)

  // Restore open tabs + active tab from state.json
  useSession({ tabManager })

  // Load sidebar collapsed, sort, settings from state.json on mount
  useEffect(() => {
    loadState()
      .then(s => {
        setPinnedNotes(s.pinnedNotes)
        setSidebarCollapsed(s.sidebarCollapsed)
        setNoteSort(s.noteSort)
        setAppSettings(s.settings)
        // Ensure the tab manager uses the persisted autosave delay
        try { tabManager.setAutosaveDelay?.(s.settings.autosaveDelay ?? 800) } catch {}
      })
      .catch(err => {
        console.warn('[App] failed loading state:', err)
      })
      .finally(() => {
        // Always remove the loading veil even if state load fails
        setAppReady(true)
      })
  }, [])

  // Theme is applied by `useUI()` via the HTML `data-theme` attribute.

  // Stable ref so event handlers always read the latest state without stale closures
  const actionsRef = useRef({ tabManager, noteList, togglePreview })
  actionsRef.current = { tabManager, noteList, togglePreview }

  // Pre-quit flush — main sends 'app:before-quit' when the window X is clicked
  useEffect(() => {
    // Prevent duplicate before-quit handlers if the renderer hot-reloads
    const flag = window.__notara_before_quit_installed
    if (!flag) {
      window.api.onBeforeQuit(async () => {
        // Wait for flushAll but with a timeout so we don't hang indefinitely
        try {
          await Promise.race([
            actionsRef.current.tabManager.flushAll(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('flush timeout')), 5000)),
          ])
        } catch (err) {
          console.warn('[App] flushAll did not complete before quit:', err)
        }
        try { await window.api.readyToQuit() } catch (err) { console.warn('[App] readyToQuit failed:', err) }
      })
      window.__notara_before_quit_installed = true
    }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore global shortcuts when a modal is open
      if (window.__notara_settings_open) return
      if (!e.ctrlKey && !e.metaKey) return
      const { tabManager: tm, noteList: nl, togglePreview: tp } = actionsRef.current
      switch (e.key) {
        case 's':
          e.preventDefault()
          if (tm.activeTab) void tm.flushTab(tm.activeTab)
          break
        case 'n': {
          e.preventDefault()
          void handleNewNote()
          break
        }
        case 'w':
          e.preventDefault()
          if (tm.activeTab) tm.closeTab(tm.activeTab)
          break
        case 'p':
          e.preventDefault()
          tp()
          break
        case 'r':
          // Prevent Chromium reload (Ctrl/Cmd+R) inside the Electron app
          e.preventDefault()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Track settings open state globally for keyboard handlers (avoid stale closure)
  useEffect(() => { window.__notara_settings_open = settingsOpen; return () => { window.__notara_settings_open = false } }, [settingsOpen])

  // ── Note operations ──────────────────────────────────────────────────────

  async function handleNewNote() {
    const ext = appSettings.defaultNoteFormat
    const name = `note-${Date.now()}.${ext}`
    const created = await noteList.createNote(name)
    if (created) void tabManager.openTab(created)
    setStatusMessage('Created new note')
    setTimeout(() => setStatusMessage(null), 2500)
  }

  async function handleTogglePin(filename: string) {
    const state = await loadState()
    const updated = state.pinnedNotes.includes(filename)
      ? state.pinnedNotes.filter(f => f !== filename)
      : [...state.pinnedNotes, filename]
    await saveState({ ...state, pinnedNotes: updated })
    setPinnedNotes(updated)
  }

  async function handleDeleteNote(filename: string) {
    if (appSettings.confirmBeforeDelete) {
      if (!window.confirm(`Delete "${filename}"?\n\nThis cannot be undone.`)) return
    }
    await tabManager.flushTab(filename)
    const ok = await noteList.deleteNote(filename)
    // Close the tab in the UI after the deletion to avoid a potential
    // race where a pending save might recreate the file after delete.
    try { tabManager.closeTab(filename) } catch {}
    if (!ok) return
    const state = await removeStateReferences(filename)
    setPinnedNotes(state.pinnedNotes)
    setStatusMessage('Deleted note')
    setTimeout(() => setStatusMessage(null), 2500)
  }

  async function handleRenameNote(oldFilename: string, newFilename: string): Promise<boolean> {
    const desired = sanitizeUserFilename(newFilename)
    // Prevent collisions with existing notes
    if (noteList.notes.includes(desired) && desired !== oldFilename) return false
    const ok = await tabManager.renameNote(oldFilename, desired)
    if (!ok) return false
    await noteList.refresh()
    const state = await renameStateReferences(oldFilename, desired)
    setPinnedNotes(state.pinnedNotes)
    setStatusMessage('Renamed note')
    setTimeout(() => setStatusMessage(null), 2500)
    return true
  }

  async function handleExportAs(ext: 'md' | 'txt') {
    if (!tabManager.activeTab) return
    const content = tabManager.getContent(tabManager.activeTab)
    const basename = tabManager.activeTab.replace(/\.(md|txt)$/, '')
    await window.api.saveNoteAs(`${basename}.${ext}`, content)
  }

  async function handleDuplicateNote() {
    if (!tabManager.activeTab) return
    const content = tabManager.getContent(tabManager.activeTab)
    const basename = tabManager.activeTab.replace(/\.(md|txt)$/, '')
    const ext = tabManager.activeTab.endsWith('.txt') ? 'txt' : 'md'
    const newName = `${basename}-copy.${ext}`
    const created = await noteList.createNote(newName)
    if (created) {
      await window.api.writeNote(created, content)
      void tabManager.openTab(created)
      setStatusMessage('Duplicated note')
      setTimeout(() => setStatusMessage(null), 2500)
    }
  }

  // ── UI state operations ──────────────────────────────────────────────────

  async function handleToggleSidebar() {
    const next = !sidebarCollapsed
    setSidebarCollapsed(next)
    const state = await loadState()
    await saveState({ ...state, sidebarCollapsed: next })
  }

  async function handleSortChange(sort: 'name' | 'modified') {
    setNoteSort(sort)
    const state = await loadState()
    await saveState({ ...state, noteSort: sort })
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

  /** Route a Settings modal patch to useUI setters + disk. */
  function handleSettingsChange(patch: Partial<AppState>) {
    if (patch.editor) {
      const e = patch.editor as Partial<EditorSettings>
      if (e.wordWrap      !== undefined) setWordWrap(e.wordWrap)
      if (e.lineNumbers   !== undefined) setLineNumbers(e.lineNumbers)
      if (e.fontSize      !== undefined) setFontSize(e.fontSize)
      if (e.tabWidth      !== undefined) setTabWidth(e.tabWidth)
      if (e.showWordCount !== undefined) setShowWordCount(e.showWordCount)
      if (e.previewEnabled !== undefined) setPreviewEnabled(e.previewEnabled)
    }
    if (patch.theme !== undefined) setTheme(patch.theme)
    if (patch.settings !== undefined) {
      const next = { ...appSettings, ...patch.settings }
      setAppSettings(next)
      loadState().then(s => saveState({ ...s, settings: next })).catch(err => console.warn('[App] failed saving settings:', err))
      // If autosave delay changed, inform the tab manager so it updates its debounce
      if (patch.settings?.autosaveDelay !== undefined) {
        try { tabManager.setAutosaveDelay?.(patch.settings.autosaveDelay) } catch {}
      }
    }
    if (patch.recentFiles !== undefined || patch.pinnedNotes !== undefined || patch.sidebarCollapsed !== undefined) {
      loadState().then(s => {
        void saveState({ ...s, ...patch }).catch(err => console.warn('[App] failed saving patch state:', err))
        if (patch.pinnedNotes      !== undefined) setPinnedNotes(patch.pinnedNotes)
        if (patch.sidebarCollapsed !== undefined) setSidebarCollapsed(patch.sidebarCollapsed)
      })
      .catch(err => console.warn('[App] failed loading state for patch:', err))
    }
  }

  // ── Derived values ───────────────────────────────────────────────────────
  // Resolve theme for components that expect only 'dark' | 'light'
  const resolvedTheme = theme === 'system'
    ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme

  const activeContent = tabManager.activeTab
    ? tabManager.getContent(tabManager.activeTab)
    : ''
  const isActivePinned = tabManager.activeTab
    ? pinnedNotes.includes(tabManager.activeTab)
    : false

  // AppState snapshot for SettingsModal
  const appStateForSettings: AppState = {
    theme,
    sidebarCollapsed,
    noteSort,
    activeTab: tabManager.activeTab,
    openTabs: tabManager.tabs.map((t: { filename: string }) => t.filename),
    pinnedNotes,
    recentFiles: [],
    editor: { fontSize, wordWrap, lineNumbers, tabWidth, previewEnabled: previewOpen, showWordCount },
    settings: appSettings,
  }

  return (
    <>
    {/* Loading veil — covers the window while initial state is being hydrated */}
    {!appReady && (
      <div className="app-loading-overlay" aria-hidden="true">
        <div className="app-loading-dots">
          <span /><span /><span />
        </div>
      </div>
    )}
    <div
      className={`flex h-screen w-screen flex-col overflow-hidden text-on-surface ${appSettings.reducedMotion ? 'reduced-motion' : ''}`}
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
            onNewNote={handleNewNote}
            onSave={() => { if (tabManager.activeTab) void tabManager.flushTab(tabManager.activeTab) }}
            onRenameActiveNote={handleRenameActiveNote}
            onDeleteActiveNote={() => { if (tabManager.activeTab) void handleDeleteNote(tabManager.activeTab) }}
            onExportAs={handleExportAs}
            onOpenNotesFolder={() => void window.api.openNotesFolder()}
            onOpenSettings={handleOpenSettings}
            onTogglePreview={togglePreview}
            onToggleSidebar={handleToggleSidebar}
            onToggleWordWrap={toggleWordWrap}
            onToggleLineNumbers={toggleLineNumbers}
            onZoom={handleZoom}
            onPinToggle={() => { if (tabManager.activeTab) void handleTogglePin(tabManager.activeTab) }}
            onDuplicateNote={handleDuplicateNote}
            onSortChange={handleSortChange}
            currentSort={noteSort}
          />
        }
      />

      {/* Main work area (sidebar + editor + preview) */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Animated sidebar ────────────────────────────────────────── */}
        <div
          className={`sidebar-shell ${sidebarCollapsed ? 'is-collapsed' : 'is-open'}`}
          style={{ borderRight: '1px solid var(--border-subtle)' }}
        >
          {/* Expanded pane */}
          <div className="sidebar-expanded-pane">
            <Sidebar
              notes={noteList.notes}
              activeTab={tabManager.activeTab}
              openTabs={tabManager.tabs.map((t: { filename: string }) => t.filename)}
              onOpenFile={tabManager.openTab}
              onCreateNote={noteList.createNote}
              onDeleteNote={handleDeleteNote}
              onRenameNote={handleRenameNote}
              pinnedNotes={pinnedNotes}
              onTogglePin={handleTogglePin}
              onToggleSidebar={handleToggleSidebar}
              sidebarCollapsed={sidebarCollapsed}
              onOpenSettings={handleOpenSettings}
              noteSort={noteSort}
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
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Main work area ─────────────────────────────────────────── */}
        <main className="flex min-w-0 flex-1 overflow-hidden">
          <Editor
            tabs={tabManager.tabs}
            activeTab={tabManager.activeTab}
            getContent={tabManager.getContent}
            onContentChange={tabManager.updateContent}
            onCloseTab={tabManager.closeTab}
            onSelectTab={tabManager.setActiveTab}
            onReorderTabs={tabManager.reorderTabs}
            onScrollPct={setEditorScrollPct}
            appTheme={resolvedTheme}
            wordWrap={wordWrap}
            lineNumbers={lineNumbers}
            fontSize={fontSize}
            tabWidth={tabWidth}
            showWordCount={showWordCount}
            className={previewOpen ? 'w-1/2' : 'w-full'}
          />

          {previewOpen && (
            <Preview
              content={activeContent}
              scrollPct={editorScrollPct}
              className="w-1/2"
              style={{ borderLeft: '1px solid var(--border-subtle)' } as React.CSSProperties}
            />
          )}
        </main>
      </div>

      {/* Full-width bottom utility strip */}
      <footer className="app-footer">
        {/* Left side: status info */}
        <div className="app-footer-left">
          <span className="footer-info text-[11px] select-none">
            {(() => {
              const wc = activeContent.trim() ? activeContent.trim().split(/\s+/).length : 0
              const lc = activeContent ? activeContent.split('\n').length : 0
              return showWordCount
                ? `${wc.toLocaleString()} ${wc === 1 ? 'word' : 'words'} · ${lc.toLocaleString()} ${lc === 1 ? 'line' : 'lines'}`
                : `${lc.toLocaleString()} ${lc === 1 ? 'line' : 'lines'}`
            })()}
          </span>
          {statusMessage && (
            <span className="footer-info text-[11px] select-none ml-3" aria-live="polite">{statusMessage}</span>
          )}
          {tabManager.activeTab && (
            <span className="footer-info text-[11px] select-none">{tabManager.activeTab.endsWith('.md') ? 'Markdown' : 'Plain text'}</span>
          )}
        </div>

        {/* Right side: toggles */}
        <div className="app-footer-right">
          <button
            onClick={toggleShowWordCount}
            title={showWordCount ? 'Hide word count' : 'Show word count'}
            className="footer-toggle"
            data-active={showWordCount ? 'true' : 'false'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.2" />
              <path d="M7 8h10M7 12h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>

          <button
            onClick={toggleWordWrap}
            title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
            className="footer-toggle"
            data-active={wordWrap ? 'true' : 'false'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 7h12a3 3 0 0 1 3 3v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 11l-4 4 4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <button
            onClick={toggleLineNumbers}
            title={lineNumbers ? 'Hide line numbers' : 'Show line numbers'}
            className="footer-toggle"
            data-active={lineNumbers ? 'true' : 'false'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M8 6v12M12 6v12M16 6v12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>

          <button
            onClick={togglePreview}
            title={previewOpen ? 'Hide preview' : 'Show preview'}
            className="footer-toggle"
            data-active={previewOpen ? 'true' : 'false'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="3" y="4" width="8" height="16" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <rect x="13" y="4" width="8" height="16" rx="1" stroke="currentColor" strokeWidth="1.2" />
            </svg>
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
        />
      )}
    </div>
    </>
  )
}

