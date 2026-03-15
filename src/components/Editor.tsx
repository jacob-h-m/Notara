/**
 * src/components/Editor.tsx
 * Multi-tab CodeMirror 6 editor panel.
 *
 * Architecture — "all tabs stay mounted":
 *   One CodeMirror instance is rendered per open tab. Non-active tabs are
 *   hidden with `display: none` (not unmounted). This preserves each tab's
 *   full EditorState — including the complete undo/redo history — without
 *   any custom state serialization.
 *
 * Undo/redo contract:
 *   `value` is passed to CodeMirror on first mount (disk content).
 *   On every keystroke `onChange` fires → parent updates contentCache (a ref,
 *   not React state).  On re-renders, `value` equals what CodeMirror already
 *   holds, so the @uiw/react-codemirror effect that would reset the doc never
 *   fires — the undo stack is never disturbed.
 *
 * Scroll sync:
 *   `onCreateEditor` captures each EditorView in a ref-map. A capture-phase
 *   scroll listener on the active tab's `.cm-scroller` fires `onScrollPct`
 *   so the parent can forward the percentage to the Preview panel.
 *
 * Performance:
 *   - TabPanel is wrapped in React.memo with a custom comparator — non-active
 *     panels skip re-renders when only `activeTab` changes.
 *   - Extensions and basicSetup are memoized in the parent; stable function
 *     references (useCallback) prevent spurious re-renders from callbacks.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { indentUnit } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView, keymap, lineNumbers as cmLineNumbers } from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import { search, setSearchQuery, findNext, findPrevious, SearchQuery } from '@codemirror/search'
import EditorSearchBar, { type SearchMode } from './EditorSearchBar'
import type { Tab } from '../types'

// Lightweight helper type for parts of EditorView we access that are not
// declared in the upstream types (e.g. contentDOM, scrollDOM, requestMeasure).
type EditorViewLike = EditorView & {
  scrollDOM?: HTMLElement
  contentDOM?: HTMLElement
  dom?: HTMLElement
  requestMeasure?: () => void
}

// ─── Types ────────────────────────────────────────────────────────────────────

type EditorProps = {
  tabs: Tab[]
  activeTab: string | null
  getContent: (filename: string) => string
  onContentChange: (filename: string, value: string) => void
  onCloseTab: (filename: string) => void
  onSelectTab: (filename: string) => void
  /** Optional: replace the tab order (drag-to-reorder). */
  onReorderTabs?: (newOrder: Tab[]) => void
  /** Called with a 0-1 scroll fraction when the active editor scrolls. */
  onScrollPct?: (pct: number) => void
  appTheme: 'dark' | 'light'
  wordWrap: boolean
  lineNumbers: boolean
  fontSize: number
  tabWidth: 2 | 4
  /** Show word/character count in the status bar. */
  showWordCount?: boolean
  className?: string
}

type TabPanelProps = {
  filename: string
  isActive: boolean
  content: string
  extensions: Extension[]
  basicSetupOptions: object
  appTheme: 'dark' | 'light'
  fontSize: number
  tabWidth: 2 | 4
  onChange: (filename: string, value: string) => void
  onCreateEditor: (view: EditorView, filename: string) => void
}

// ─── TabPanel ─────────────────────────────────────────────────────────────────

/**
 * A single editor pane. Rendered for every open tab; hidden (not unmounted)
 * when not active. memo + custom areEqual prevent re-renders of non-active
 * panes when the active tab switches.
 */
const TabPanel = memo(
  function TabPanel({
    filename, isActive, content, extensions, basicSetupOptions,
    appTheme, fontSize, tabWidth, onChange, onCreateEditor,
  }: TabPanelProps) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: isActive ? 'flex' : 'none',
          flexDirection: 'column',
        }}
      >
        <CodeMirror
          value={content}
          height="100%"
          extensions={extensions}
          theme={appTheme === 'dark' ? 'dark' : 'light'}
          basicSetup={basicSetupOptions}
          onChange={val => onChange(filename, val)}
          onCreateEditor={view => onCreateEditor(view, filename)}
          style={{ fontSize: `${fontSize}px`, height: '100%' }}
        />
      </div>
    )
  },
  // Custom comparator: skip re-render for non-active panels when only
  // isActive flips to false → false (another tab became active).
  (prev, next) =>
    prev.filename        === next.filename &&
    prev.isActive        === next.isActive &&
    prev.content         === next.content  &&
    prev.extensions      === next.extensions &&
    prev.appTheme        === next.appTheme &&
    prev.fontSize        === next.fontSize &&
    prev.tabWidth        === next.tabWidth
)

// ─── TabBar ───────────────────────────────────────────────────────────────────

function TabBar({
  tabs, activeTab, onSelectTab, onCloseTab, onReorderTabs,
}: {
  tabs: Tab[]
  activeTab: string | null
  onSelectTab: (f: string) => void
  onCloseTab: (f: string) => void
  onReorderTabs?: (newOrder: Tab[]) => void
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)

  function reorder(arr: Tab[], from: number, to: number): Tab[] {
    const next = [...arr]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
  }
  /** Strip the extension for display; show it only when needed for disambiguation. */
  function displayName(filename: string, allFilenames: string[]): string {
    const stem = filename.replace(/\.(md|txt)$/, '')
    const hasDuplicate = allFilenames.some(
      f => f !== filename && f.replace(/\.(md|txt)$/, '') === stem
    )
    return hasDuplicate ? filename : stem
  }

  return (
    <div className="tab-bar">
      {tabs.map((tab, i) => {
        const active = tab.filename === activeTab
        const isDragOver = overIdx === i && dragIdx !== null && dragIdx !== i
        return (
          <div
            key={tab.filename}
            tabIndex={0}
            role="tab"
            aria-selected={active}
            draggable={!!onReorderTabs}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectTab(tab.filename) }
            }}
            onDragStart={() => setDragIdx(i)}
            onDragOver={e => { e.preventDefault(); setOverIdx(i) }}
            onDrop={() => {
              if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
                onReorderTabs?.(reorder(tabs, dragIdx, overIdx))
              }
              setDragIdx(null); setOverIdx(null)
            }}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
            className={`tab-item group ${active ? 'active' : ''} ${isDragOver ? 'drag-over' : ''}`}
            onClick={() => onSelectTab(tab.filename)}
            title={tab.filename}
          >
            {/* Dirty indicator */}
            {tab.isDirty && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-dirty" title="Unsaved changes" />
            )}

            {/* Filename — non-selectable */}
            <span className="min-w-0 select-none truncate font-mono">
              {displayName(tab.filename, tabs.map(t => t.filename))}
            </span>

            {/* Close button */}
            <button
              onClick={e => { e.stopPropagation(); onCloseTab(tab.filename) }}
              className={`ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-surface-700 hover:text-destructive ${
                active ? 'text-muted opacity-100' : 'text-on-surface opacity-0 group-hover:opacity-100'
              }`}
              title={`Close ${tab.filename}`}
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
                <line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Empty-state placeholder ──────────────────────────────────────────────────

function EmptyState({ className }: { className: string }) {
  return (
    <div className={`flex items-center justify-center bg-surface-900 ${className}`}>
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-800 ring-1 ring-muted">
          <svg className="h-5 w-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-muted">No note open</p>
        <p className="mt-1.5 text-[11px] text-muted">
          Select a note from the sidebar or create a new one.
        </p>
      </div>
    </div>
  )
}

// ─── Editor ───────────────────────────────────────────────────────────────────

export default function Editor({
  tabs, activeTab, getContent, onContentChange,
  onCloseTab, onSelectTab, onReorderTabs, onScrollPct,
  appTheme, wordWrap, lineNumbers, fontSize, tabWidth,
  showWordCount = false,
  className = '',
}: EditorProps) {

  // Track whether any editor view currently has focus to apply focus styles
  const [isFocused, setIsFocused] = useState(false)
  const isFocusedRef = useRef(false)
  useEffect(() => { isFocusedRef.current = isFocused }, [isFocused])

  // Map of filename → EditorView (populated by onCreateEditor callbacks)
  const editorViews = useRef<Map<string, EditorView>>(new Map())
  // Map of filename → cleanup function for any attached DOM listeners
  const editorListeners = useRef<Map<string, () => void>>(new Map())
  // Keep a ref to the current activeTab to use inside scroll listeners
  const activeTabRef = useRef(activeTab)
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])

  // ── Search bar state ──────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen]         = useState(false)
  const [searchMode, setSearchMode]         = useState<SearchMode>('find')
  const [searchInitialQuery, setSearchInitialQuery] = useState('')
  // Increment to force EditorSearchBar remount (e.g. when Ctrl+F is pressed
  // with a new selection while bar is already open).
  const [searchKey, setSearchKey]           = useState(0)

  // Stable refs so keymap closures can read current React state without
  // becoming stale or triggering extension re-creation.
  const searchOpenRef = useRef(false)
  useEffect(() => { searchOpenRef.current = searchOpen }, [searchOpen])

  // Called from the CM keymap to open the search bar.
  const openSearchRef = useRef<(mode: SearchMode) => void>(() => {})
  const closeSearchRef = useRef<() => void>(() => {})
  useEffect(() => {
    openSearchRef.current = (mode: SearchMode) => {
      // Pre-populate from current selection in the active editor
      const view = activeTabRef.current ? editorViews.current.get(activeTabRef.current) : null
      let selectedText = ''
      if (view) {
        const sel = view.state.selection.main
        if (!sel.empty) selectedText = view.state.sliceDoc(sel.from, sel.to)
      }
      // If bar is already open and there's a new selection, remount to update the query.
      // If bar is closed, always remount (fresh open).
      if (!searchOpenRef.current || selectedText) {
        setSearchKey(k => k + 1)
        setSearchInitialQuery(selectedText)
      }
      setSearchMode(mode)
      setSearchOpen(true)
    }
    closeSearchRef.current = () => {
      setSearchOpen(false)
      // Focus back to the active editor view
      const view = activeTabRef.current ? (editorViews.current.get(activeTabRef.current) as EditorViewLike | undefined) : undefined
      ;(view as unknown as { focus?: () => void })?.focus?.()
    }
  }, [])

  // Keep a ref to onScrollPct so the scroll listener always calls the latest
  const onScrollPctRef = useRef(onScrollPct)
  useEffect(() => { onScrollPctRef.current = onScrollPct }, [onScrollPct])

  // Stable callback: record EditorView + attach scroll listener once
  const handleCreateEditor = useCallback((view: EditorView, filename: string) => {
    editorViews.current.set(filename, view)
    // Remove any previously attached listeners for this filename (recreate path)
    const prevCleanup = editorListeners.current.get(filename)
    if (prevCleanup) {
      try { prevCleanup() } catch {}
      editorListeners.current.delete(filename)
    }

    const v = view as EditorViewLike
    const scroller = v.scrollDOM
    if (scroller) {
      const onScroll = () => {
        if (activeTabRef.current !== filename) return
        const el = scroller
        const max = el.scrollHeight - el.clientHeight
        if (max > 0) onScrollPctRef.current?.(el.scrollTop / max)
      }
      scroller.addEventListener('scroll', onScroll, { passive: true })
      editorListeners.current.set(filename, () => scroller.removeEventListener('scroll', onScroll))
    }

    // Focus/blur handlers to toggle shell focus state
    const dom = v.contentDOM ?? v.dom
    if (dom && !(dom as any)._notara_focus_listeners_attached) {
      const onFocus = () => { isFocusedRef.current = true; setIsFocused(true) }
      const onBlur = () => { isFocusedRef.current = false; setIsFocused(false) }
      dom.addEventListener('focusin', onFocus)
      dom.addEventListener('focusout', onBlur)
      ;(dom as any)._notara_focus_listeners_attached = true
      const prev = editorListeners.current.get(filename)
      editorListeners.current.set(filename, () => {
        try { dom.removeEventListener('focusin', onFocus); dom.removeEventListener('focusout', onBlur) } catch {}
        if (prev) prev()
      })
    }
  }, [])

  // When switching to a tab, ask CodeMirror to recalculate its layout (it
  // might have been hidden when it was mounted, so it doesn't know its size).
  const handleSelectTab = useCallback((filename: string) => {
    onSelectTab(filename)
    requestAnimationFrame(() => {
      const v = editorViews.current.get(filename) as EditorViewLike | undefined
      if (v && typeof v.requestMeasure === 'function') try { v.requestMeasure() } catch {}
      ;(v as unknown as { focus?: () => void })?.focus?.()
    })
  }, [onSelectTab])

  // External focus request (e.g. from sidebar create note). Focus the
  // currently active editor view when requested by other UI pieces.
  useEffect(() => {
    function onFocusReq() {
      const active = activeTabRef.current
      const v = active ? (editorViews.current.get(active) as EditorViewLike | undefined) : undefined
      ;(v as unknown as { focus?: () => void })?.focus?.()
      if (v) setIsFocused(true)
    }
    window.addEventListener('notara:focus-active-editor', onFocusReq)
    return () => window.removeEventListener('notara:focus-active-editor', onFocusReq)
  }, [])

  // ── Custom search keymap (replaces the default CM search keymap) ──────────
  // These are stable because we read state via refs, not captured values.
  const searchKeymapExt = useMemo(() => keymap.of([
    {
      key: 'Mod-f',
      run: () => { openSearchRef.current('find'); return true },
      preventDefault: true,
    },
    {
      key: 'Mod-h',
      run: () => { openSearchRef.current('replace'); return true },
      preventDefault: true,
    },
    {
      key: 'Mod-g',
      run: (view: EditorView) => {
        if (searchOpenRef.current) return findNext(view)
        openSearchRef.current('find')
        return true
      },
      preventDefault: true,
    },
    {
      key: 'Mod-Shift-g',
      run: (view: EditorView) => {
        if (searchOpenRef.current) return findPrevious(view)
        openSearchRef.current('find')
        return true
      },
      preventDefault: true,
    },
    {
      key: 'F3',
      run: (view: EditorView) => searchOpenRef.current ? findNext(view) : false,
    },
    {
      key: 'Shift-F3',
      run: (view: EditorView) => searchOpenRef.current ? findPrevious(view) : false,
    },
    {
      key: 'Escape',
      run: () => {
        if (!searchOpenRef.current) return false
        closeSearchRef.current()
        return true
      },
    },
  ]), []) // empty deps — stable via refs

  // ── Custom theme: maps editor chrome to CSS variable tokens so it
  // reacts to both dark and light modes via the app theme pipeline.
  const themeExt = useMemo(() => (EditorView as any).theme({
    '&': {
      height: '100%',
      backgroundColor: 'var(--editor-bg)',
      color: 'var(--text-primary)',
    },
    '.cm-scroller': {
      overflow: 'auto',
      // Use the theme font token so the editor font is user/theme-configurable.
      fontFamily: 'var(--editor-font)',
    },
    '.cm-content': {
      padding: '20px 24px',
      caretColor: 'var(--accent)',
    },
    '.cm-line': { lineHeight: '1.75' },
    '.cm-focused': { outline: 'none' },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'var(--selection-bg) !important',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--editor-gutter-bg)',
      borderRight: '1px solid var(--border-subtle)',
      color: 'var(--text-muted)',
      // Offset numbers from the panel edge; minWidth prevents collapsing
      // to a sliver when the document has few lines.
      padding: '0 4px 0 8px',
      minWidth: '3rem',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      color: 'var(--text-muted)',
      fontSize: '0.8em',
      padding: '0 4px',
    },
    '.cm-activeLine':       { backgroundColor: 'var(--editor-line-active)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--editor-line-active)' },
    '.cm-cursor': {
      borderLeftColor: 'var(--accent)',
      borderLeftWidth: '2px',
    },
    // Highlight search matches produced by the search() state machine.
    '.cm-searchMatch': {
      backgroundColor: 'var(--accent-muted)',
      outline: '1px solid color-mix(in srgb, var(--accent) 55%, transparent)',
      borderRadius: '2px',
    },
    '.cm-searchMatch-selected': {
      backgroundColor: 'var(--selection-bg)',
    },
  }, { dark: appTheme === 'dark' }), [appTheme])

  const extensions = useMemo<Extension[]>(() => [
    // search() loads the search state field so setSearchQuery / findNext work.
    // The default panel is hidden via CSS; we never call openSearchPanel.
    search({ top: false }),
    searchKeymapExt,
    markdown(),
    themeExt,
    EditorState.tabSize.of(tabWidth),
    indentUnit.of(' '.repeat(tabWidth)),
    ...(wordWrap ? [(EditorView as any).lineWrapping] : []),
    // lineNumbers is placed here (not in basicSetup) so toggling it in
    // settings reconfigures the live editor view immediately.
    ...(lineNumbers ? [cmLineNumbers()] : []),
  ], [tabWidth, themeExt, wordWrap, searchKeymapExt, lineNumbers])

  const basicSetupOptions = useMemo(() => ({
    // lineNumbers is managed via the extensions array for live reactivity;
    // setting it false here prevents a doubled gutter.
    lineNumbers: false,
    highlightActiveLineGutter: true,
    foldGutter: false,
    dropCursor: true,
    allowMultipleSelections: false,
    indentOnInput: true,
    syntaxHighlighting: true,
    autocompletion: false,
    crosshairCursor: false,
    highlightActiveLine: true,
    // Disable the default CM search keymap — we provide our own via searchKeymapExt
    searchKeymap: false,
  }), [])

  const handleCloseTab = useCallback((filename: string) => {
    try { onCloseTab(filename) } catch { onCloseTab(filename) }
    // Focus next active editor (if present) on next tick
    setTimeout(() => {
      const active = activeTabRef.current
      const view = active ? (editorViews.current.get(active) as EditorViewLike | undefined) : undefined
      ;(view as unknown as { focus?: () => void })?.focus?.()
      if (view) { setIsFocused(true) }
    }, 0)
  }, [onCloseTab])

  if (tabs.length === 0) return <EmptyState className={className} />

  const activeContent = activeTab ? getContent(activeTab) : ''
  const wordCount = activeContent.trim() ? activeContent.trim().split(/\s+/).length : 0
  const charCount = activeContent.length

  

  return (
    <div className={`editor-shell flex flex-col overflow-hidden ${className} ${isFocused ? 'editor-focused' : ''}`}>
      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onReorderTabs={onReorderTabs}
      />

      {/* Custom search/replace bar — sits between TabBar and editor content */}
      {searchOpen && (
        <EditorSearchBar
          key={searchKey}
          view={activeTab ? editorViews.current.get(activeTab) ?? null : null}
          mode={searchMode}
          onModeChange={setSearchMode}
          onClose={() => {
            setSearchOpen(false)
            const view = activeTab ? (editorViews.current.get(activeTab) as EditorViewLike | undefined) : undefined
            if (view) {
              try { (view as unknown as { dispatch?: (arg: any) => void }).dispatch?.({ effects: setSearchQuery.of(new SearchQuery({ search: '' })) }) } catch {}
              ;(view as unknown as { focus?: () => void })?.focus?.()
            }
          }}
          initialQuery={searchInitialQuery}
        />
      )}

      {/* Editor pane container — all TabPanels are positioned absolutely inside */}
      <div className="relative flex-1 overflow-hidden editor-pane" style={{ background: 'var(--editor-bg)' }}>
        {tabs.map(tab => (
          <TabPanel
            key={tab.filename}
            filename={tab.filename}
            isActive={tab.filename === activeTab}
            content={getContent(tab.filename)}
            extensions={extensions}
            basicSetupOptions={basicSetupOptions}
            appTheme={appTheme}
            fontSize={fontSize}
            tabWidth={tabWidth}
            onChange={onContentChange}
            onCreateEditor={handleCreateEditor}
          />
        ))}
      </div>
    </div>
  )
}

