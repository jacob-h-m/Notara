/**
 * src/components/MarkdownToolstrip.tsx
 * Vertical formatting toolstrip shown to the right of the editor for .md files.
 *
 * Each button dispatches a 'notara:md-format' CustomEvent with a `detail.type`
 * key that Editor.tsx listens to and handles via the active TipTap editor.
 */

import React from 'react'
import Icon, { type IconName } from './Icon'

// ─── Formatting action types ──────────────────────────────────────────────────

export type MdFormatType =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'list-ul'
  | 'list-ol'
  | 'checkbox'
  | 'quote'
  | 'code'
  | 'code-block'
  | 'link'
  | 'image'
  | 'table'
  | 'hr'

function dispatchMdFormat(type: MdFormatType) {
  window.dispatchEvent(new CustomEvent('notara:md-format', { detail: { type } }))
}

// ─── Strip button ─────────────────────────────────────────────────────────────

function StripBtn({ icon, title, type }: { icon: IconName; title: string; type: MdFormatType }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={() => dispatchMdFormat(type)}
      className="md-strip-btn"
      style={{ cursor: 'pointer' } as React.CSSProperties}
    >
      <Icon name={icon} size={14} aria-hidden />
    </button>
  )
}

function StripSep() {
  return <div className="md-strip-sep" />
}

// ─── MarkdownToolstrip ───────────────────────────────────────────────────────
// Not memoised: parent re-renders on every theme change, so this must
// re-render too to keep inline-style CSS-variable references in sync.

export default function MarkdownToolstrip() {
  return (
    <div
      className="md-strip"
      aria-label="Markdown formatting"
      role="toolbar"
      aria-orientation="vertical"
    >
      {/* Inline text */}
      <StripBtn icon="bold" title="Bold (Ctrl+B)" type="bold" />
      <StripBtn icon="italic" title="Italic (Ctrl+I)" type="italic" />
      <StripBtn icon="strikethrough" title="Strikethrough" type="strikethrough" />
      <StripSep />

      {/* Headings */}
      <StripBtn icon="h1" title="Heading 1" type="h1" />
      <StripBtn icon="h2" title="Heading 2" type="h2" />
      <StripBtn icon="h3" title="Heading 3" type="h3" />
      <StripSep />

      {/* Lists */}
      <StripBtn icon="list-ul" title="Bullet list" type="list-ul" />
      <StripBtn icon="list-ol" title="Numbered list" type="list-ol" />
      <StripBtn icon="checkbox" title="Task / checkbox" type="checkbox" />
      <StripSep />

      {/* Block */}
      <StripBtn icon="quote" title="Blockquote" type="quote" />
      <StripBtn icon="code" title="Inline code" type="code" />
      <StripBtn icon="code-block" title="Code block" type="code-block" />
      <StripSep />

      {/* Rich content */}
      <StripBtn icon="link" title="Insert link" type="link" />
      <StripBtn icon="image" title="Insert image" type="image" />
      <StripBtn icon="table" title="Insert table" type="table" />
      <StripBtn icon="hr" title="Horizontal rule" type="hr" />
    </div>
  )
}
