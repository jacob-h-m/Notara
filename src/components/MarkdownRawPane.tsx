/**
 * src/components/MarkdownRawPane.tsx
 * Side-by-side raw markdown editor panel.
 *
 * Shown when previewOpen is true and active file is .md.
 * Displays the raw markdown text in a textarea — edits here
 * are synced immediately to the WYSIWYG editor (and vice versa)
 * via the shared content state in App. Nothing is saved to disk
 * until the normal autosave / Ctrl+S path fires.
 */

import { useEffect, useRef } from 'react'

type MarkdownRawPaneProps = {
  filename: string
  content: string
  onContentChange: (filename: string, value: string) => void
  fontSize: number
  spellcheck: boolean
  /** Width of this pane as a CSS value (e.g. '40%' or '320px'). Defaults to '50%'. */
  width?: string
}

export default function MarkdownRawPane({
  filename,
  content,
  onContentChange,
  fontSize,
  spellcheck,
  width = '50%',
}: MarkdownRawPaneProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Keep textarea value in sync when external changes come in (from WYSIWYG side)
  // We only update if the value truly differs to avoid stealing the cursor
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    if (el.value !== content) {
      const start = el.selectionStart
      const end = el.selectionEnd
      el.value = content
      // Restore cursor if still valid
      try {
        el.setSelectionRange(start, end)
      } catch {}
    }
  }, [content])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid var(--border-subtle)',
        background: 'var(--editor-bg)',
        width,
        flexShrink: 0,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header — same height as the editor tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0.5rem 0.875rem',
          fontSize: '0.8125rem',
          color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border-subtle)',
          /* Reserve 2px top so height matches tab-bar items */
          borderTop: '2px solid transparent',
          background: 'var(--tab-bg)',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        Raw Markdown
      </div>

      <textarea
        ref={textareaRef}
        defaultValue={content}
        onChange={(e) => onContentChange(filename, e.target.value)}
        spellCheck={spellcheck}
        style={{
          flex: 1,
          resize: 'none',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: 'var(--text-primary)',
          fontFamily: 'var(--code-font, monospace)',
          fontSize: `${fontSize}px`,
          lineHeight: 1.7,
          padding: '2rem 3rem',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'break-word',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      />
    </div>
  )
}
