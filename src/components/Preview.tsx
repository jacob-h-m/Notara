/**
 * src/components/Preview.tsx
 * Live Markdown preview panel.
 *
 * Security:
 *   All user content is HTML-escaped before any pattern is applied. Only the
 *   specific HTML tags produced here can appear in the output. The CSP in
 *   index.html further prevents injected scripts from executing.
 *
 * Scroll sync (opt-in):
 *   Receives a 0-1 scroll fraction (`scrollPct`) from the Editor via App.tsx,
 *   but only applies it when the user enables "Sync Scroll" in the header bar.
 *   This allows the preview to be scrolled independently by default.
 *
 * Markdown features rendered:
 *   h1-h3, bold, italic, strikethrough, inline code, code blocks (triple-tick),
 *   blockquote, unordered list, ordered list, horizontal rule, [link](url) text.
 */

import { useEffect, useRef, useState, useMemo } from 'react'

type PreviewProps = {
  content: string
  /** Scroll fraction (0-1) from the active editor's scroll position. */
  scrollPct?: number
  className?: string
  style?: React.CSSProperties
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Apply inline formatting to an already-HTML-escaped line.
 * Code spans are extracted first (placeholder tokens) so that bold/italic
 * patterns never corrupt content inside `backticks`.
 */
function applyInlineFormatting(escaped: string): string {
  const codeSpans: string[] = []
  // Protect code spans with null-byte delimited placeholders
  const withPlaceholders = escaped.replace(/`([^`]+)`/g, (_, inner) => {
    codeSpans.push(`<code>${inner}</code>`)
    return `\x00CODE${codeSpans.length - 1}\x00`
  })

  const formatted = withPlaceholders
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    // Render [label](url) as a span — no external hrefs in a local-only app
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '<span class="preview-link">$1</span>')

  // Restore code spans
  return formatted.replace(/\x00CODE(\d+)\x00/g, (_, i) => codeSpans[parseInt(i, 10)])
}

function renderMarkdown(md: string): string {
  const lines = md.split('\n')
  const parts: string[] = []
  let inUl = false
  let inOl = false
  let inCodeBlock = false
  let olCounter = 0

  function closeList() {
    if (inUl) { parts.push('</ul>'); inUl = false }
    if (inOl) { parts.push('</ol>'); inOl = false; olCounter = 0 }
  }

  for (const raw of lines) {
    // ── Fenced code block ──────────────────────────────────────────────────
    if (raw.startsWith('```')) {
      if (inCodeBlock) {
        parts.push('</code></pre>')
        inCodeBlock = false
      } else {
        closeList()
        const lang = raw.slice(3).trim()
        parts.push(`<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>`)
        inCodeBlock = true
      }
      continue
    }
    if (inCodeBlock) {
      // Inside a code block: only escape HTML, no inline formatting
      parts.push(escapeHtml(raw))
      continue
    }

    // Escape then apply inline formatting for everything outside code blocks
    const line = applyInlineFormatting(escapeHtml(raw))

    // ── Block patterns ─────────────────────────────────────────────────────
    if (/^### /.test(raw)) {
      closeList()
      parts.push(`<h3>${line.slice(4)}</h3>`)
    } else if (/^## /.test(raw)) {
      closeList()
      parts.push(`<h2>${line.slice(3)}</h2>`)
    } else if (/^# /.test(raw)) {
      closeList()
      parts.push(`<h1>${line.slice(2)}</h1>`)
    } else if (/^---+$/.test(raw.trim())) {
      closeList()
      parts.push('<hr />')
    } else if (/^> /.test(raw)) {
      closeList()
      parts.push(`<blockquote>${line.slice(2)}</blockquote>`)
    } else if (/^[-*] /.test(raw)) {
      if (inOl) { parts.push('</ol>'); inOl = false; olCounter = 0 }
      if (!inUl) { parts.push('<ul>'); inUl = true }
      parts.push(`<li>${line.slice(2)}</li>`)
    } else if (/^\d+\. /.test(raw)) {
      if (inUl) { parts.push('</ul>'); inUl = false }
      if (!inOl) { parts.push('<ol>'); inOl = true; olCounter = 0 }
      olCounter++
      parts.push(`<li>${line.replace(/^\d+\. /, '')}</li>`)
    } else if (raw.trim() === '') {
      closeList()
      parts.push('<div class="preview-spacer"></div>')
    } else {
      closeList()
      parts.push(`<p>${line}</p>`)
    }
  }

  if (inCodeBlock) parts.push('</code></pre>')
  closeList()
  return parts.join('\n')
}

// ─── Component ────────────────────────────────────────────────────────────────

  export default function Preview({ content, scrollPct, className = '', style }: PreviewProps) {
  const scrollRef    = useRef<HTMLDivElement>(null)
  const [syncOn, setSyncOn] = useState(false)

  // Apply editor scroll fraction when sync is enabled
  useEffect(() => {
    if (!syncOn || scrollPct === undefined || !scrollRef.current) return
    const el  = scrollRef.current
    const max = el.scrollHeight - el.clientHeight
    if (max > 0) el.scrollTop = scrollPct * max
  }, [syncOn, scrollPct])

  // Memoize rendered HTML to avoid recomputing markdown on unrelated renders
  const rendered = useMemo(() => renderMarkdown(content), [content])

  // Prevent images in preview from being draggable and intercept anchor clicks
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    function onDragStart(e: Event) {
      const t = e.target as HTMLElement | null
      if (t && t.tagName === 'IMG') e.preventDefault()
    }
    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement)
      const a = el.closest('a') as HTMLAnchorElement | null
      if (a && a.href) {
        e.preventDefault()
        void window.api.openExternal(a.href).catch(console.error)
        return
      }
      // If preview uses .preview-link spans, they are non-navigable by design
    }
    root.addEventListener('dragstart', onDragStart)
    root.addEventListener('click', onClick)
    return () => {
      root.removeEventListener('dragstart', onDragStart)
      root.removeEventListener('click', onClick)
    }
  }, [])

  return (
    <div className={`flex flex-col overflow-hidden bg-preview ${className}`} style={style}>
      {/* Header bar */}
      <div className="preview-header flex shrink-0 items-center justify-between px-4 py-2" role="toolbar" aria-label="Preview controls">
        <span className="preview-title text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Preview</span>
        <button
          onClick={() => setSyncOn(s => !s)}
          title="Sync Preview scroll with Editor"
          className="btn-toggle preview-sync"
          data-active={syncOn ? 'true' : 'false'}
          aria-pressed={syncOn}
        >
          ⇅ Sync
        </button>
      </div>

      {/* Scrollable content area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-7 preview-scroll">
        {content.trim()
          ? (
            <article
              className="preview-content"
              // Input is HTML-escaped before pattern application — safe usage
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: rendered }}
            />
          )
          : (
            <p className="pt-10 text-center text-xs text-muted">
              Nothing to preview yet. Start writing in the editor.
            </p>
          )
        }
      </div>
    </div>
  )
}

