/**
 * src/components/EditorSearchBar.tsx
 * Custom Notara-themed find/replace bar for the CodeMirror editor.
 *
 * Piggybacks on @codemirror/search state machine for all match logic
 * (highlighting, navigation, replace). The default CodeMirror search
 * panel is suppressed; this React component is the only UI surface.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'
import {
  SearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
} from '@codemirror/search'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SearchMode = 'find' | 'replace'

type Props = {
  /** The active CodeMirror EditorView to operate on. */
  view: EditorView | null
  /** Whether to show the replace row. */
  mode: SearchMode
  /** Called when the user toggles between find and replace modes. */
  onModeChange(mode: SearchMode): void
  /** Called when the user closes the bar (Esc / close button). */
  onClose(): void
  /** Optional pre-populated query text (e.g. current editor selection). */
  initialQuery?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Count total matches using @codemirror/search's own cursor. Capped at 999. */
function countMatches(sq: SearchQuery, view: EditorView): number {
  if (!sq.valid || !sq.search) return 0
  try {
    const cursor = sq.getCursor(view.state)
    let n = 0
    while (!cursor.next().done && n < 999) n++
    return n
  } catch {
    return 0
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditorSearchBar({
  view,
  mode,
  onModeChange,
  onClose,
  initialQuery = '',
}: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [replaceText, setReplaceText] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [useRegexp, setUseRegexp] = useState(false)
  const [matchCount, setMatchCount] = useState<number | null>(null)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)

  // Focus search input on open
  useEffect(() => {
    searchInputRef.current?.focus()
    if (initialQuery) searchInputRef.current?.select()
  }, [initialQuery])

  // Focus search input when mode switches to 'find'
  useEffect(() => {
    if (mode === 'find') searchInputRef.current?.focus()
  }, [mode])

  // ── Build & dispatch SearchQuery to CodeMirror ────────────────────────────

  const buildQuery = useCallback(
    (q: string, cs: boolean, ww: boolean, re: boolean, rp: string): SearchQuery | null => {
      try {
        return new SearchQuery({ search: q, caseSensitive: cs, wholeWord: ww, regexp: re, replace: rp })
      } catch {
        return null // invalid regexp
      }
    },
    []
  )

  // Re-dispatch the search query to CM whenever any option changes
  useEffect(() => {
    if (!view) return
    const sq = buildQuery(query, caseSensitive, wholeWord, useRegexp, replaceText)
    if (!sq) return
    view.dispatch({ effects: setSearchQuery.of(sq) })
    // Recount matches (throttled by effect deps)
    if (query) {
      setMatchCount(countMatches(sq, view))
    } else {
      setMatchCount(null)
    }
  }, [view, query, caseSensitive, wholeWord, useRegexp, replaceText, buildQuery])

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleFindNext = useCallback(() => {
    if (!view || !query) return
    findNext(view)
    // Update match count (selection may have changed)
    const sq = buildQuery(query, caseSensitive, wholeWord, useRegexp, replaceText)
    if (sq) setMatchCount(countMatches(sq, view))
  }, [view, query, caseSensitive, wholeWord, useRegexp, replaceText, buildQuery])

  const handleFindPrev = useCallback(() => {
    if (!view || !query) return
    findPrevious(view)
    const sq = buildQuery(query, caseSensitive, wholeWord, useRegexp, replaceText)
    if (sq) setMatchCount(countMatches(sq, view))
  }, [view, query, caseSensitive, wholeWord, useRegexp, replaceText, buildQuery])

  const handleReplaceNext = useCallback(() => {
    if (!view || !query) return
    replaceNext(view)
  }, [view, query])

  const handleReplaceAll = useCallback(() => {
    if (!view || !query) return
    replaceAll(view)
    setMatchCount(0)
  }, [view, query])

  const handleClose = useCallback(() => {
    // Clear search highlights and return focus to editor
    if (view) {
      view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '' })) })
      view.focus()
    }
    onClose()
  }, [view, onClose])

  // ── Key handlers ──────────────────────────────────────────────────────────

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const mod = e.ctrlKey || e.metaKey
    if (e.key === 'Escape') { e.preventDefault(); handleClose(); return }
    if (e.key === 'Enter')  { e.preventDefault(); e.shiftKey ? handleFindPrev() : handleFindNext(); return }
    if (e.key === 'F3')     { e.preventDefault(); e.shiftKey ? handleFindPrev() : handleFindNext(); return }
    if (mod && e.key === 'g') { e.preventDefault(); e.shiftKey ? handleFindPrev() : handleFindNext(); return }
    if (mod && e.key === 'h') { e.preventDefault(); onModeChange('replace'); return }
  }

  function handleReplaceKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const mod = e.ctrlKey || e.metaKey
    if (e.key === 'Escape') { e.preventDefault(); handleClose(); return }
    if (e.key === 'Enter')  { e.preventDefault(); handleReplaceNext(); return }
    if (e.key === 'F3')     { e.preventDefault(); e.shiftKey ? handleFindPrev() : handleFindNext(); return }
    if (mod && e.key === 'g') { e.preventDefault(); e.shiftKey ? handleFindPrev() : handleFindNext(); return }
  }

  // ── Match count label ─────────────────────────────────────────────────────

  const noMatch = matchCount === 0 && !!query
  const countLabel =
    matchCount === null ? null :
    matchCount === 0    ? 'No results' :
    matchCount === 999  ? '999+ matches' :
    `${matchCount} match${matchCount === 1 ? '' : 'es'}`

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="editor-search-bar"
      role="search"
      aria-label={mode === 'replace' ? 'Find and replace' : 'Find'}
      // Prevent click from stealing focus away from editor (handled explicitly)
      onMouseDown={e => {
        // Only prevent if clicking non-interactive areas
        if ((e.target as HTMLElement).tagName !== 'INPUT' &&
            (e.target as HTMLElement).tagName !== 'BUTTON') {
          e.preventDefault()
        }
      }}
    >
      {/* ── Row 1: Find ──────────────────────────────────────────────────── */}
      <div className="search-bar-row">

        {/* Expand/collapse replace toggle */}
        <button
          type="button"
          className="search-chevron-btn"
          onClick={() => onModeChange(mode === 'find' ? 'replace' : 'find')}
          title={mode === 'find' ? 'Show replace (Ctrl+H)' : 'Hide replace'}
          aria-expanded={mode === 'replace'}
        >
          <svg
            width="10" height="10" viewBox="0 0 10 10"
            fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: mode === 'replace' ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms ease' }}
          >
            <polyline points="3,2 7,5 3,8" />
          </svg>
        </button>

        {/* Search input + no-results indicator */}
        <div className="search-input-wrap">
          <input
            ref={searchInputRef}
            type="text"
            className={`search-input${noMatch ? ' no-match' : ''}`}
            placeholder="Find"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            aria-label="Search query"
            spellCheck={false}
            autoComplete="off"
          />
          {countLabel && (
            <span className={`search-count-label${noMatch ? ' no-match' : ''}`} aria-live="polite">
              {countLabel}
            </span>
          )}
        </div>

        {/* Option toggles: case / whole-word / regex */}
        <div className="search-opts" role="toolbar" aria-label="Search options">
          <button
            type="button"
            className={`search-opt-btn${caseSensitive ? ' active' : ''}`}
            onClick={() => setCaseSensitive(v => !v)}
            title="Match case"
            aria-pressed={caseSensitive}
          >Aa</button>
          <button
            type="button"
            className={`search-opt-btn${wholeWord ? ' active' : ''}`}
            onClick={() => setWholeWord(v => !v)}
            title="Match whole word"
            aria-pressed={wholeWord}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M2 11 L2 3 M12 11 L12 3 M2 11 L12 11" opacity="0.8"/>
              <text x="4.5" y="9" fontSize="7" fill="currentColor" stroke="none" fontFamily="monospace" fontWeight="700">W</text>
            </svg>
          </button>
          <button
            type="button"
            className={`search-opt-btn font-mono${useRegexp ? ' active' : ''}`}
            onClick={() => setUseRegexp(v => !v)}
            title="Use regular expression"
            aria-pressed={useRegexp}
          >.*</button>
        </div>

        {/* Prev / next navigation */}
        <div className="search-nav">
          <button
            type="button"
            className="search-nav-btn"
            onClick={handleFindPrev}
            title="Previous match (Shift+F3 / Shift+Enter)"
            disabled={!query}
            aria-disabled={!query}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3,9 7,5 11,9" />
            </svg>
          </button>
          <button
            type="button"
            className="search-nav-btn"
            onClick={handleFindNext}
            title="Next match (F3 / Enter)"
            disabled={!query}
            aria-disabled={!query}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3,5 7,9 11,5" />
            </svg>
          </button>
        </div>

        {/* Close */}
        <button
          type="button"
          className="search-close-btn"
          onClick={handleClose}
          title="Close (Esc)"
          aria-label="Close search"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="1" y1="1" x2="11" y2="11" />
            <line x1="11" y1="1" x2="1"  y2="11" />
          </svg>
        </button>
      </div>

      {/* ── Row 2: Replace (conditional) ─────────────────────────────────── */}
      {mode === 'replace' && (
        <div className="search-bar-row search-bar-replace-row">
          {/* Spacer to align replace input under find input */}
          <div className="search-chevron-btn" style={{ visibility: 'hidden' }} aria-hidden />

          <div className="search-input-wrap">
            <input
              ref={replaceInputRef}
              type="text"
              className="search-input"
              placeholder="Replace"
              value={replaceText}
              onChange={e => setReplaceText(e.target.value)}
              onKeyDown={handleReplaceKeyDown}
              aria-label="Replace text"
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          <div className="search-replace-actions">
            <button
              type="button"
              className="search-replace-btn"
              onClick={handleReplaceNext}
              title="Replace current match"
              disabled={!query}
              aria-disabled={!query}
            >Replace</button>
            <button
              type="button"
              className="search-replace-btn"
              onClick={handleReplaceAll}
              title="Replace all matches"
              disabled={!query}
              aria-disabled={!query}
            >All</button>
          </div>
        </div>
      )}
    </div>
  )
}
