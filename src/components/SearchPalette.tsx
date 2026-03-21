/**
 * src/components/SearchPalette.tsx
 * Modal command palette for full-text cross-note search.
 * Triggered via Ctrl+Shift+F.
 */
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import type { SearchResult } from '../hooks/useFTSIndex'
import { stemFilename } from '../utils/filenames'

type Props = {
  onSearch: (query: string) => SearchResult[]
  onOpenNote: (filename: string) => void
  onClose: () => void
}

export default function SearchPalette({ onSearch, onOpenNote, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const r = onSearch(query)
      setResults(r)
      setSelected(0)
    }, 80)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, onSearch])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => (results.length === 0 ? 0 : Math.min(s + 1, results.length - 1)))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    }
    if (e.key === 'Enter' && results[selected]) {
      onOpenNote(results[selected].filename)
      onClose()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-20"
      role="dialog"
      aria-modal="true"
      aria-label="Search all notes"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{ background: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="relative w-full max-w-[560px] overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: 'var(--modal-bg)', border: '1px solid var(--border-subtle)' }}
        onKeyDown={handleKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all notes…"
            aria-label="Search all notes"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              style={{ color: 'var(--text-muted)', fontSize: 12 }}
            >
              ✕
            </button>
          )}
          <kbd
            className="rounded px-1.5 py-0.5 text-[10px]"
            style={{ background: 'var(--surface-elevated)', color: 'var(--text-muted)' }}
          >
            Esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 && query.trim() && (
            <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No notes found for "{query}"
            </div>
          )}
          {results.length === 0 && !query.trim() && (
            <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Type to search across all notes
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={r.filename}
              type="button"
              onClick={() => {
                onOpenNote(r.filename)
                onClose()
              }}
              className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left"
              style={{ background: i === selected ? 'var(--hover-bg)' : '' }}
              onMouseEnter={() => setSelected(i)}
            >
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {stemFilename(r.filename)}
              </span>
              {r.snippet && (
                <span className="line-clamp-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {r.snippet}
                </span>
              )}
            </button>
          ))}
        </div>

        {results.length > 0 && (
          <div
            className="px-4 py-2 text-[10px]"
            style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)' }}
          >
            {results.length} result{results.length !== 1 ? 's' : ''} · ↑↓ navigate · ↵ open
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
