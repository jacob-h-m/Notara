/**
 * src/components/SlashCommandMenu.tsx
 * Floating slash-command (/) menu for the TipTap WYSIWYG editor.
 *
 * Triggered when the user types "/" at the beginning of an empty block.
 * Supports keyboard navigation (↑ ↓ Enter Escape) and click selection.
 *
 * Usage:
 *   <SlashCommandMenu
 *     visible={...}
 *     query={...}
 *     anchor={{ x, y }}           // screen-space coords below cursor
 *     selectedIdx={...}
 *     onSelect={(commandId) => {}}
 *     onClose={() => {}}
 *   />
 */

import { useEffect, useRef } from 'react'

// ─── Command definitions ───────────────────────────────────────────────────────

export type SlashCommandId =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'ordered'
  | 'task'
  | 'quote'
  | 'code'
  | 'divider'
  | 'table'

export type SlashCommand = {
  id: SlashCommandId
  label: string
  description: string
  icon: string
  group: 'Text' | 'Lists' | 'Blocks'
  keywords: string[]
}

const SLASH_COMMANDS: SlashCommand[] = [
  // ── Text ──────────────────────────────────────────────────────────────────
  {
    id: 'h1',
    label: 'Heading 1',
    description: 'Large section heading',
    icon: 'H₁',
    group: 'Text',
    keywords: ['h1', 'heading', 'title', 'large'],
  },
  {
    id: 'h2',
    label: 'Heading 2',
    description: 'Medium section heading',
    icon: 'H₂',
    group: 'Text',
    keywords: ['h2', 'heading', 'subtitle', 'medium'],
  },
  {
    id: 'h3',
    label: 'Heading 3',
    description: 'Small section heading',
    icon: 'H₃',
    group: 'Text',
    keywords: ['h3', 'heading', 'small'],
  },
  // ── Lists ─────────────────────────────────────────────────────────────────
  {
    id: 'bullet',
    label: 'Bullet List',
    description: 'Unordered list',
    icon: '•',
    group: 'Lists',
    keywords: ['bullet', 'list', 'ul', 'unordered'],
  },
  {
    id: 'ordered',
    label: 'Numbered List',
    description: 'Ordered list',
    icon: '1.',
    group: 'Lists',
    keywords: ['numbered', 'ordered', 'ol', 'list'],
  },
  {
    id: 'task',
    label: 'Task List',
    description: 'Checkbox checklist',
    icon: '☐',
    group: 'Lists',
    keywords: ['task', 'todo', 'checkbox', 'check'],
  },
  // ── Blocks ────────────────────────────────────────────────────────────────
  {
    id: 'quote',
    label: 'Blockquote',
    description: 'Indented quote block',
    icon: '"',
    group: 'Blocks',
    keywords: ['quote', 'blockquote', 'callout'],
  },
  {
    id: 'code',
    label: 'Code Block',
    description: 'Preformatted code',
    icon: '</>',
    group: 'Blocks',
    keywords: ['code', 'pre', 'snippet', 'block'],
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'Horizontal rule',
    icon: '—',
    group: 'Blocks',
    keywords: ['divider', 'hr', 'horizontal', 'rule', 'separator'],
  },
  {
    id: 'table',
    label: 'Table',
    description: '3×3 table with header',
    icon: '⊞',
    group: 'Blocks',
    keywords: ['table', 'grid', 'spreadsheet'],
  },
]

/** Filter SLASH_COMMANDS by a query string (case-insensitive substring match). */
export function filterSlashCommands(query: string): SlashCommand[] {
  if (!query) return SLASH_COMMANDS
  const q = query.toLowerCase()
  return SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q) ||
      cmd.keywords.some((kw) => kw.includes(q))
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  visible: boolean
  query: string
  /** Screen-space position of the bottom of the cursor (px). */
  anchor: { x: number; y: number }
  selectedIdx: number
  onSelect: (id: SlashCommandId) => void
  onClose: () => void
  onNavigate: (delta: -1 | 1) => void
}

const GROUP_ORDER: SlashCommand['group'][] = ['Text', 'Lists', 'Blocks']

export default function SlashCommandMenu({
  visible,
  query,
  anchor,
  selectedIdx,
  onSelect,
  onClose: _onClose,
  onNavigate,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const results = filterSlashCommands(query)

  // Scroll the selected item into view whenever selectedIdx changes
  useEffect(() => {
    if (!menuRef.current) return
    const el = menuRef.current.querySelector<HTMLElement>(`[data-slash-idx="${selectedIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  if (!visible) return null

  // Compute position — flip up if too close to the bottom of the viewport
  const MENU_HEIGHT = 260
  const MENU_WIDTH = 240
  const viewportH = window.innerHeight
  const viewportW = window.innerWidth
  let top = anchor.y + 4
  let left = anchor.x
  if (top + MENU_HEIGHT > viewportH - 8) top = anchor.y - MENU_HEIGHT - 4
  if (left + MENU_WIDTH > viewportW - 8) left = viewportW - MENU_WIDTH - 8

  // Group results for display
  const byGroup: Partial<Record<SlashCommand['group'], SlashCommand[]>> = {}
  for (const cmd of results) {
    if (!byGroup[cmd.group]) byGroup[cmd.group] = []
    byGroup[cmd.group]!.push(cmd)
  }

  // Build a flat ordered list so we can map idx → command
  const orderedResults: SlashCommand[] = GROUP_ORDER.flatMap((g) => byGroup[g] ?? [])

  return (
    <div
      ref={menuRef}
      role="listbox"
      aria-label="Slash commands"
      style={{
        position: 'fixed',
        top,
        left,
        zIndex: 9999,
        width: MENU_WIDTH,
        maxHeight: MENU_HEIGHT,
        overflowY: 'auto',
        background: 'var(--modal-bg)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.32)',
        padding: '4px 0',
      }}
      onMouseDown={(e) => e.preventDefault()} // prevent editor blur
    >
      {orderedResults.length === 0 ? (
        <p
          style={{
            padding: '10px 12px',
            fontSize: 12,
            color: 'var(--text-muted)',
          }}
        >
          No commands match.
        </p>
      ) : (
        GROUP_ORDER.map((group) => {
          const cmds = byGroup[group]
          if (!cmds || cmds.length === 0) return null
          return (
            <div key={group}>
              <p
                style={{
                  padding: '6px 12px 2px',
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                }}
              >
                {group}
              </p>
              {cmds.map((cmd) => {
                const flatIdx = orderedResults.indexOf(cmd)
                const isSelected = flatIdx === selectedIdx
                return (
                  <button
                    key={cmd.id}
                    role="option"
                    aria-selected={isSelected}
                    data-slash-idx={flatIdx}
                    onClick={() => onSelect(cmd.id)}
                    onMouseMove={() => {
                      // Update selection on hover so keyboard + mouse stay in sync
                      if (flatIdx !== selectedIdx) onNavigate(flatIdx > selectedIdx ? 1 : -1)
                    }}
                    style={
                      {
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        width: 'calc(100% - 8px)',
                        padding: '5px 10px',
                        border: 'none',
                        cursor: 'pointer',
                        background: isSelected ? 'var(--accent-muted)' : 'transparent',
                        color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                        textAlign: 'left',
                        borderRadius: 6,
                        margin: '1px 4px',
                        boxSizing: 'border-box',
                      } as React.CSSProperties
                    }
                  >
                    {/* Icon */}
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        background: isSelected ? 'var(--accent)' : 'var(--surface-elevated)',
                        color: isSelected ? '#fff' : 'var(--text-primary)',
                        fontSize: 11,
                        fontWeight: 700,
                        flexShrink: 0,
                        fontFamily: 'var(--editor-font)',
                      }}
                      aria-hidden
                    >
                      {cmd.icon}
                    </span>
                    {/* Text */}
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, margin: 0, lineHeight: 1.3 }}>
                        {cmd.label}
                      </p>
                      <p
                        style={{
                          fontSize: 11,
                          margin: 0,
                          lineHeight: 1.3,
                          color: isSelected ? 'var(--accent)' : 'var(--text-muted)',
                          opacity: 0.8,
                        }}
                      >
                        {cmd.description}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )
        })
      )}
    </div>
  )
}
