/**
 * src/components/BacklinksPanel.tsx
 *
 * Shows all notes that link to the currently active note via [[wikilinks]].
 * Also shows outgoing links (notes this note links to).
 * Clicking any entry opens that note.
 */
import type { BacklinkEntry } from '../hooks/useBacklinks'
import { stemFilename } from '../utils/filenames'

type Props = {
  /** The currently active note filename. */
  filename: string
  /** Notes that link TO this note. */
  backlinks: BacklinkEntry[]
  /** Resolved filenames this note links out to. */
  outgoing: string[]
  /** Called when the user clicks a note name. */
  onOpenNote: (filename: string) => void
}

export default function BacklinksPanel({ filename, backlinks, outgoing, onOpenNote }: Props) {
  return (
    <div className="flex flex-col gap-0 py-1">
      {/* ── Backlinks (incoming) ────────────────────────────────────────── */}
      <section className="px-3 py-2" aria-label={`Notes linking to ${stemFilename(filename)}`}>
        <div
          className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: 'var(--text-muted)' }}
          aria-hidden="true"
        >
          Linked from{backlinks.length > 0 ? ` (${backlinks.length})` : ''}
        </div>
        {backlinks.length === 0 ? (
          <p className="text-[11px] italic" style={{ color: 'var(--text-muted)' }}>
            No notes link to{' '}
            <span style={{ color: 'var(--text-primary)' }}>{stemFilename(filename)}</span> yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5" role="list" aria-label="Backlinks">
            {backlinks.map(({ filename: src }) => (
              <li key={src}>
                <button
                  onClick={() => onOpenNote(src)}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[12px] transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-bg)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  title={`Open ${src}`}
                  aria-label={`Open note ${stemFilename(src)}`}
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  <span className="truncate">{stemFilename(src)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div
        className="mx-3 my-1"
        style={{ height: 1, background: 'var(--border-subtle)' }}
        aria-hidden="true"
      />

      {/* ── Outgoing links ──────────────────────────────────────────────── */}
      <section className="px-3 py-2" aria-label={`Notes linked from ${stemFilename(filename)}`}>
        <div
          className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: 'var(--text-muted)' }}
          aria-hidden="true"
        >
          Links to{outgoing.length > 0 ? ` (${outgoing.length})` : ''}
        </div>
        {outgoing.length === 0 ? (
          <p className="text-[11px] italic" style={{ color: 'var(--text-muted)' }}>
            No outgoing links. Use{' '}
            <code style={{ color: 'var(--accent)', fontSize: 10 }}>[[Note Name]]</code> to link
            notes.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5" role="list" aria-label="Outgoing links">
            {outgoing.map((target) => (
              <li key={target}>
                <button
                  onClick={() => onOpenNote(target)}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[12px] transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-bg)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  title={`Open ${target}`}
                  aria-label={`Open note ${stemFilename(target)}`}
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-muted)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <line x1="7" y1="17" x2="17" y2="7" />
                    <polyline points="7 7 17 7 17 17" />
                  </svg>
                  <span className="truncate">{stemFilename(target)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
