/**
 * src/components/VersionHistoryPanel.tsx
 * Panel showing saved version history for the active note.
 * Includes inline diff view comparing a selected version to the current content.
 */
import { useState } from 'react'
import type { NoteVersion } from '../hooks/useVersionHistory'

// ── Minimal inline diff ────────────────────────────────────────────────────────
// Produces a line-level diff between `oldText` and `newText`.
// Returns an array of { type: 'same'|'removed'|'added', line: string }.
export function computeLineDiff(oldText: string, newText: string) {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const result: { type: 'same' | 'removed' | 'added'; line: string }[] = []

  // Simple LCS-based line diff (patience-style: process common prefix/suffix then diff middle)
  let i = 0,
    j = 0
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      result.push({ type: 'same', line: oldLines[i] })
      i++
      j++
    } else {
      // Scan ahead up to 8 lines to find the next common line
      let found = false
      for (let d = 1; d <= 8 && !found; d++) {
        if (i + d < oldLines.length && oldLines[i + d] === newLines[j]) {
          for (let k = 0; k < d; k++) result.push({ type: 'removed', line: oldLines[i + k] })
          i += d
          found = true
        } else if (j + d < newLines.length && oldLines[i] === newLines[j + d]) {
          for (let k = 0; k < d; k++) result.push({ type: 'added', line: newLines[j + k] })
          j += d
          found = true
        }
      }
      if (!found) {
        if (i < oldLines.length) {
          result.push({ type: 'removed', line: oldLines[i] })
          i++
        }
        if (j < newLines.length) {
          result.push({ type: 'added', line: newLines[j] })
          j++
        }
      }
    }
  }
  return result
}

type Props = {
  filename: string
  versions: NoteVersion[]
  loading: boolean
  /** Current editor content — used for diff view. */
  currentContent?: string
  onRestore: (content: string) => void
  onDelete: (filename: string, versionId: string) => void
  loadVersion: (filename: string, versionId: string) => Promise<string>
  showConfirm?: (
    title: string,
    message: string,
    options?: { confirmLabel?: string; cancelLabel?: string; isDangerous?: boolean }
  ) => Promise<boolean>
}

type ViewMode = 'preview' | 'diff'

export default function VersionHistoryPanel({
  filename,
  versions,
  loading,
  currentContent = '',
  onRestore,
  onDelete,
  loadVersion,
  showConfirm,
}: Props) {
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [previewContent, setPreviewContent] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('preview')
  const [restoring, setRestoring] = useState(false)

  async function handleTogglePreview(v: NoteVersion) {
    if (previewing === v.id) {
      setPreviewing(null)
      return
    }
    try {
      const content = await loadVersion(v.filename, v.id)
      setPreviewContent(content)
      setPreviewing(v.id)
    } catch {}
  }

  async function handleRestore(v: NoteVersion) {
    const confirmed = await showConfirm?.(
      'Restore Version',
      `Restore version from ${v.label}?\n\nCurrent content will be replaced.`,
      { confirmLabel: 'Restore' }
    )
    if (!confirmed) return
    setRestoring(true)
    try {
      const content = await loadVersion(v.filename, v.id)
      onRestore(content)
    } catch {
    } finally {
      setRestoring(false)
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        Loading…
      </div>
    )
  }
  if (versions.length === 0) {
    return (
      <div
        className="px-4 py-6 text-center text-xs leading-relaxed"
        style={{ color: 'var(--text-muted)' }}
      >
        No saved versions yet.
        <br />
        Versions are created automatically when you save (Ctrl+S).
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div
        className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: 'var(--text-muted)' }}
        aria-live="polite"
      >
        {filename} — {versions.length} version{versions.length !== 1 ? 's' : ''}
      </div>
      <ul role="list" aria-label={`Version history for ${filename}`}>
        {versions.map((v) => (
          <li key={v.id}>
            <div
              className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2"
              style={{ background: previewing === v.id ? 'var(--hover-bg)' : '' }}
              onClick={() => handleTogglePreview(v)}
              role="button"
              tabIndex={0}
              aria-expanded={previewing === v.id}
              aria-label={`Version from ${v.label}${previewing === v.id ? ', expanded' : ''}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleTogglePreview(v)
                }
              }}
            >
              <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
                {v.label}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRestore(v)
                  }}
                  disabled={restoring}
                  className="rounded px-1.5 py-0.5 text-[10px]"
                  style={{ color: 'var(--accent)', background: 'var(--accent-muted)' }}
                  title="Restore this version"
                  aria-label={`Restore version from ${v.label}`}
                >
                  Restore
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(v.filename, v.id)
                  }}
                  className="rounded px-1.5 py-0.5 text-[10px]"
                  style={{ color: 'var(--destructive)' }}
                  title="Delete this version"
                  aria-label={`Delete version from ${v.label}`}
                >
                  ✕
                </button>
              </div>
            </div>
            {previewing === v.id && (
              <div className="mx-3 mb-2">
                {/* Toggle: Preview / Diff */}
                <div className="mb-1 flex gap-1">
                  {(['preview', 'diff'] as ViewMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setViewMode(m)}
                      className="rounded px-2 py-0.5 text-[10px] font-medium capitalize"
                      style={
                        viewMode === m
                          ? { background: 'var(--accent)', color: '#fff' }
                          : { background: 'var(--surface-elevated)', color: 'var(--text-muted)' }
                      }
                    >
                      {m}
                    </button>
                  ))}
                </div>
                {viewMode === 'preview' ? (
                  <>
                    <pre
                      className="max-h-48 overflow-auto rounded-lg p-2 text-[11px]"
                      style={{
                        background: 'var(--editor-bg)',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--editor-font)',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {previewContent.slice(0, 1200)}
                    </pre>
                    {previewContent.length > 1200 && (
                      <div className="mt-0.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        Preview truncated — {previewContent.length.toLocaleString()} chars total.
                        Restore to see full content.
                      </div>
                    )}
                  </>
                ) : (
                  <div
                    className="max-h-48 overflow-auto rounded-lg p-2 text-[11px]"
                    style={{ background: 'var(--editor-bg)', fontFamily: 'var(--editor-font)' }}
                  >
                    {computeLineDiff(previewContent, currentContent).map((hunk, idx) => (
                      <div
                        key={idx}
                        style={{
                          whiteSpace: 'pre-wrap',
                          color:
                            hunk.type === 'removed'
                              ? 'var(--destructive)'
                              : hunk.type === 'added'
                                ? 'var(--accent)'
                                : 'var(--text-muted)',
                          background:
                            hunk.type === 'removed'
                              ? 'var(--destructive-muted)'
                              : hunk.type === 'added'
                                ? 'var(--accent-muted)'
                                : 'transparent',
                        }}
                      >
                        {hunk.type === 'removed' ? '− ' : hunk.type === 'added' ? '+ ' : '  '}
                        {hunk.line}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
