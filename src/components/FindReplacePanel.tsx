import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { stemFilename } from '../utils/filenames'

type FindReplaceResult = {
  filename: string
  count: number
  preview: string
}

type Props = {
  isOpen: boolean
  mode: 'find' | 'replace'
  activeFilename: string | null
  allNotes: string[]
  getCachedContent: (filename: string) => string | undefined
  readNote: (filename: string) => Promise<string>
  applyContent: (filename: string, content: string) => Promise<void>
  onOpenNote: (filename: string) => void | Promise<void>
  onClose: () => void
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildMatcher(query: string): RegExp | null {
  if (!query.trim()) return null
  return new RegExp(escapeRegExp(query), 'gi')
}

export function countMatches(content: string, query: string): number {
  const matcher = buildMatcher(query)
  if (!matcher) return 0
  return Array.from(content.matchAll(matcher)).length
}

function getPreview(content: string, query: string): string {
  const lower = content.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx === -1) return content.slice(0, 120).replace(/\n+/g, ' ').trim()
  const start = Math.max(0, idx - 40)
  const end = Math.min(content.length, idx + query.length + 80)
  return `${start > 0 ? '…' : ''}${content.slice(start, end).replace(/\n+/g, ' ').trim()}${end < content.length ? '…' : ''}`
}

export function replaceFirst(content: string, query: string, replacement: string): string {
  const matcher = query.trim() ? new RegExp(escapeRegExp(query), 'i') : null
  if (!matcher) return content
  return content.replace(matcher, replacement)
}

export function replaceAll(content: string, query: string, replacement: string): string {
  const matcher = buildMatcher(query)
  if (!matcher) return content
  return content.replace(matcher, replacement)
}

export default function FindReplacePanel({
  isOpen,
  mode,
  activeFilename,
  allNotes,
  getCachedContent,
  readNote,
  applyContent,
  onOpenNote,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [scope, setScope] = useState<'current' | 'all'>('current')
  const [results, setResults] = useState<FindReplaceResult[]>([])
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState(0)

  const targets = useMemo(() => {
    if (scope === 'current') return activeFilename ? [activeFilename] : []
    return allNotes
  }, [activeFilename, allNotes, scope])

  useEffect(() => {
    if (!isOpen) return
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handle, true)
    return () => document.removeEventListener('keydown', handle, true)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen || !query.trim()) {
      setResults([])
      setBusy(false)
      return
    }

    let cancelled = false

    void (async () => {
      setBusy(true)
      const nextResults: FindReplaceResult[] = []

      for (let index = 0; index < targets.length; index += 12) {
        const batch = targets.slice(index, index + 12)
        const settled = await Promise.all(
          batch.map(async (filename) => {
            const content = getCachedContent(filename) ?? (await readNote(filename).catch(() => ''))
            const count = countMatches(content, query)
            if (count === 0) return null
            return {
              filename,
              count,
              preview: getPreview(content, query),
            }
          })
        )

        if (cancelled) return
        nextResults.push(...settled.filter((entry): entry is FindReplaceResult => !!entry))
        await new Promise((resolve) => setTimeout(resolve, 0))
      }

      if (!cancelled) {
        setResults(nextResults)
        setSelected(0)
        setBusy(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [getCachedContent, isOpen, query, readNote, targets])

  async function handleReplaceFirstInCurrent() {
    if (!activeFilename || !query.trim()) return
    const current =
      getCachedContent(activeFilename) ?? (await readNote(activeFilename).catch(() => ''))
    const next = replaceFirst(current, query, replacement)
    if (next !== current) await applyContent(activeFilename, next)
  }

  async function handleReplaceAll() {
    if (!query.trim()) return
    setBusy(true)
    try {
      for (const filename of targets) {
        const current = getCachedContent(filename) ?? (await readNote(filename).catch(() => ''))
        const next = replaceAll(current, query, replacement)
        if (next !== current) await applyContent(filename, next)
      }
    } finally {
      setBusy(false)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelected((value) => (results.length === 0 ? 0 : Math.min(value + 1, results.length - 1)))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected((value) => Math.max(value - 1, 0))
    }
    if (event.key === 'Enter' && results[selected]) {
      void onOpenNote(results[selected].filename)
      onClose()
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-20"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'replace' ? 'Find and replace' : 'Find in notes'}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{ background: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="relative w-full max-w-[680px] overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: 'var(--modal-bg)', border: '1px solid var(--border-subtle)' }}
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={scope === 'all' ? 'Find across all notes…' : 'Find in current note…'}
            aria-label="Find text"
            className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
            style={{
              color: 'var(--text-primary)',
              background: 'var(--surface-900)',
              borderColor: 'var(--border-subtle)',
            }}
          />
          <div
            className="flex items-center gap-1 rounded-lg p-1"
            style={{ background: 'var(--surface-900)' }}
          >
            <button
              type="button"
              onClick={() => setScope('current')}
              className="rounded px-2 py-1 text-xs"
              style={{
                background: scope === 'current' ? 'var(--accent-muted)' : 'transparent',
                color: scope === 'current' ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              Current
            </button>
            <button
              type="button"
              onClick={() => setScope('all')}
              className="rounded px-2 py-1 text-xs"
              style={{
                background: scope === 'all' ? 'var(--accent-muted)' : 'transparent',
                color: scope === 'all' ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              All Notes
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            Esc
          </button>
        </div>

        {mode === 'replace' && (
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <input
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
              placeholder="Replace with…"
              aria-label="Replace with"
              className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
              style={{
                color: 'var(--text-primary)',
                background: 'var(--surface-900)',
                borderColor: 'var(--border-subtle)',
              }}
            />
            <button
              type="button"
              onClick={() => void handleReplaceFirstInCurrent()}
              disabled={!activeFilename || !query.trim() || busy}
              className="rounded-lg px-3 py-2 text-xs font-medium"
              style={{
                background: 'var(--btn-ghost-hover)',
                color: 'var(--text-primary)',
                opacity: !activeFilename || !query.trim() || busy ? 0.5 : 1,
              }}
            >
              Replace Current
            </button>
            <button
              type="button"
              onClick={() => void handleReplaceAll()}
              disabled={!query.trim() || busy}
              className="rounded-lg px-3 py-2 text-xs font-medium"
              style={{
                background: 'var(--accent)',
                color: 'var(--on-accent, #fff)',
                opacity: !query.trim() || busy ? 0.5 : 1,
              }}
            >
              Replace All
            </button>
          </div>
        )}

        <div className="max-h-96 overflow-y-auto py-1">
          {!query.trim() && (
            <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Type to search {scope === 'all' ? 'across all notes' : 'in the current note'}.
            </div>
          )}
          {query.trim() && busy && (
            <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Searching…
            </div>
          )}
          {query.trim() && !busy && results.length === 0 && (
            <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No matches found for "{query}".
            </div>
          )}
          {results.map((result, index) => (
            <button
              key={result.filename}
              type="button"
              onClick={() => {
                void onOpenNote(result.filename)
                onClose()
              }}
              onMouseEnter={() => setSelected(index)}
              className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left"
              style={{ background: index === selected ? 'var(--btn-ghost-hover)' : '' }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {stemFilename(result.filename)}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {result.count} match{result.count === 1 ? '' : 'es'}
                </span>
              </div>
              <span className="line-clamp-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                {result.preview}
              </span>
            </button>
          ))}
        </div>

        <div
          className="px-4 py-2 text-[10px]"
          style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)' }}
        >
          {results.reduce((sum, result) => sum + result.count, 0)} total match
          {results.reduce((sum, result) => sum + result.count, 0) === 1 ? '' : 'es'} · ↑↓ navigate ·
          ↵ open
        </div>
      </div>
    </div>,
    document.body
  )
}
