/**
 * src/components/ContextMenu.tsx
 * Portal-rendered right-click context menu.
 *
 * Usage:
 *   const { menu, openMenu } = useContextMenu()
 *   <div onContextMenu={e => openMenu(e, items)}>...</div>
 *   {menu}
 */

import { createPortal } from 'react-dom'
import { useCallback, useEffect, useRef, useState } from 'react'

export type ContextMenuItem =
  | {
      label: string
      shortcut?: string
      disabled?: boolean
      onClick: () => void | Promise<void>
      separator?: never
    }
  | { separator: true; label?: never; onClick?: never }

type MenuState = {
  x: number
  y: number
  items: ContextMenuItem[]
} | null

export function useContextMenu() {
  const [menu, setMenuState] = useState<MenuState>(null)

  const openMenu = useCallback((e: React.MouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuState({ x: e.clientX, y: e.clientY, items })
  }, [])

  const closeMenu = useCallback(() => setMenuState(null), [])

  const menuEl = menu
    ? createPortal(
        <ContextMenuOverlay x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />,
        document.body
      )
    : null

  return { menu: menuEl, openMenu, closeMenu }
}

// ─── Overlay ──────────────────────────────────────────────────────────────────

function ContextMenuOverlay({
  x,
  y,
  items,
  onClose,
}: {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Clamp position to viewport
  const [pos, setPos] = useState({ x, y })
  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    setPos({
      x: x + rect.width > vw ? Math.max(0, vw - rect.width - 4) : x,
      y: y + rect.height > vh ? Math.max(0, vh - rect.height - 4) : y,
    })
  }, [x, y])

  // Close on outside click, Escape, or scroll
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  // Focus first item on open for keyboard navigation
  useEffect(() => {
    const first = menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')
    first?.focus()
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []
    )
    const idx = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      buttons[(idx + 1) % buttons.length]?.focus()
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      buttons[(idx - 1 + buttons.length) % buttons.length]?.focus()
    }
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Context menu"
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 9999,
        minWidth: 180,
        background: 'var(--modal-bg)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
        padding: '4px 0',
        outline: 'none',
      }}
    >
      {items.map((item, i) => {
        if ('separator' in item && item.separator) {
          return (
            <div key={i} style={{ borderTop: '1px solid var(--border-subtle)', margin: '3px 0' }} />
          )
        }
        const action = item as Extract<ContextMenuItem, { label: string }>
        return (
          <button
            key={i}
            role="menuitem"
            disabled={action.disabled}
            onClick={() => {
              void Promise.resolve(action.onClick()).then(() => onClose())
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '5px 14px',
              fontSize: 13,
              color: action.disabled ? 'var(--text-muted)' : 'var(--text-primary)',
              background: 'transparent',
              border: 'none',
              cursor: action.disabled ? 'default' : 'pointer',
              opacity: action.disabled ? 0.5 : 1,
              outline: 'none',
              gap: 24,
            }}
            onMouseEnter={(e) => {
              if (!action.disabled)
                (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = ''
            }}
            onFocus={(e) => {
              if (!action.disabled)
                (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)'
            }}
            onBlur={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = ''
            }}
          >
            <span>{action.label}</span>
            {action.shortcut && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                {action.shortcut}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
