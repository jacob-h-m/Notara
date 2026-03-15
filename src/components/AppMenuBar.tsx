/**
 * src/components/AppMenuBar.tsx
 * Custom desktop-style application menu bar.
 * Renders below the titlebar with File / Edit / View / Notes / Help dropdowns.
 */

import { useEffect, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type MenuAction = {
  label: string
  shortcut?: string
  disabled?: boolean
  separator?: false
  onClick: () => void
}
type MenuSeparator = { separator: true }
type MenuItem = MenuAction | MenuSeparator

type MenuDef = {
  label: string
  items: MenuItem[]
}

type AppMenuBarProps = {
  /** When 'titlebar', renders inline (transparent bg, no outer border). */
  mode?: 'standalone' | 'titlebar'
  activeTab: string | null
  activeContent: string
  isPinned: boolean
  sidebarCollapsed: boolean
  wordWrap: boolean
  lineNumbers: boolean
  previewOpen: boolean
  onNewNote: () => void
  onSave: () => void
  onRenameActiveNote: () => void
  onDeleteActiveNote: () => void
  onExportAs: (ext: 'md' | 'txt') => void
  onOpenNotesFolder: () => void
  onOpenSettings: (tab?: string) => void
  onTogglePreview: () => void
  onToggleSidebar: () => void
  onToggleWordWrap: () => void
  onToggleLineNumbers: () => void
  onZoom: (dir: 'in' | 'out' | 'reset') => void
  onPinToggle: () => void
  onDuplicateNote: () => void
  onSortChange: (sort: 'name' | 'modified') => void
  currentSort: 'name' | 'modified'
}

// ─── Dropdown component ───────────────────────────────────────────────────────

function Dropdown({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  return (
    <div
      className="menu-dropdown absolute top-full z-50 mt-1 min-w-[210px] overflow-hidden rounded-xl border border-muted py-1.5 shadow-2xl"
      style={{ background: 'var(--modal-bg)' }}
    >
      {items.map((item, i) => {
        if ('separator' in item && item.separator) {
          return <div key={i} className="my-1 border-t border-subtle" />
        }
        const action = item as MenuAction
        return (
          <button
            key={i}
            disabled={action.disabled}
            onClick={() => { action.onClick(); onClose() }}
            className="flex w-full items-center justify-between px-3.5 py-1.5 text-left text-[13px] transition-colors"
            style={{
              color: action.disabled ? 'var(--text-muted)' : 'var(--text-primary)',
              opacity: action.disabled ? 0.5 : 1,
              cursor: action.disabled ? 'default' : 'pointer',
            }}
            onMouseEnter={e => { if (!action.disabled) (e.currentTarget as HTMLElement).style.background = 'var(--btn-ghost-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
          >
            <span>{action.label}</span>
            {action.shortcut && (
              <span className="ml-8 text-[11px] text-muted">{action.shortcut}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── AppMenuBar ───────────────────────────────────────────────────────────────

export default function AppMenuBar({
  mode = 'standalone',
  activeTab, activeContent, isPinned,
  sidebarCollapsed, wordWrap, lineNumbers, previewOpen,
  onNewNote, onSave, onRenameActiveNote, onDeleteActiveNote,
  onExportAs, onOpenNotesFolder, onOpenSettings,
  onTogglePreview, onToggleSidebar, onToggleWordWrap, onToggleLineNumbers,
  onZoom, onPinToggle, onDuplicateNote, onSortChange, currentSort,
}: AppMenuBarProps) {
  const [open, setOpen] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpen(null)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // Close on Escape
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(null)
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [])

  function openLink(url: string) {
    window.api.openExternal(url).catch(console.error)
  }

  function toggle(id: string) {
    setOpen(prev => (prev === id ? null : id))
  }

  const noNote = !activeTab

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: 'New Note',           shortcut: 'Ctrl+N', onClick: onNewNote },
        { label: 'Save',               shortcut: 'Ctrl+S', disabled: noNote, onClick: onSave },
        { separator: true },
        { label: 'Rename Note',        disabled: noNote, onClick: onRenameActiveNote },
        { label: 'Delete Note',        disabled: noNote, onClick: onDeleteActiveNote },
        { separator: true },
        { label: 'Export as Markdown', disabled: noNote, onClick: () => onExportAs('md') },
        { label: 'Export as Plain Text', disabled: noNote, onClick: () => onExportAs('txt') },
        { separator: true },
        { label: 'Open Notes Folder',  onClick: onOpenNotesFolder },
        { separator: true },
        { label: 'Settings',           onClick: () => onOpenSettings() },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo',       shortcut: 'Ctrl+Z', onClick: () => document.execCommand('undo') },
        { label: 'Redo',       shortcut: 'Ctrl+Y', onClick: () => document.execCommand('redo') },
        { separator: true },
        { label: 'Cut',        shortcut: 'Ctrl+X', onClick: () => document.execCommand('cut') },
        { label: 'Copy',       shortcut: 'Ctrl+C', onClick: () => document.execCommand('copy') },
        { label: 'Paste',      shortcut: 'Ctrl+V', onClick: () => document.execCommand('paste') },
        { separator: true },
        { label: 'Select All', shortcut: 'Ctrl+A', onClick: () => document.execCommand('selectAll') },
      ],
    },
    {
      label: 'Note',
      items: [
        { label: isPinned ? '✓ Pin Note' : 'Pin Note', disabled: noNote, onClick: onPinToggle },
        { separator: true },
        { label: 'Duplicate Note', disabled: noNote, onClick: onDuplicateNote },
        { separator: true },
        { label: currentSort === 'name'     ? '✓ Sort by Name'     : 'Sort by Name',     onClick: () => onSortChange('name') },
        { label: currentSort === 'modified' ? '✓ Sort by Modified' : 'Sort by Modified', onClick: () => onSortChange('modified') },
      ],
    },
    {
      label: 'View',
      items: [
        { label: previewOpen     ? '✓ Preview Panel' : 'Preview Panel', shortcut: 'Ctrl+P', onClick: onTogglePreview },
        { label: sidebarCollapsed ? 'Show Sidebar'   : '✓ Show Sidebar',                  onClick: onToggleSidebar },
        { separator: true },
        { label: wordWrap    ? '✓ Word Wrap'    : 'Word Wrap',    onClick: onToggleWordWrap },
        { label: lineNumbers ? '✓ Line Numbers' : 'Line Numbers', onClick: onToggleLineNumbers },
        { separator: true },
        { label: 'Zoom In',    shortcut: 'Ctrl++', onClick: () => onZoom('in') },
        { label: 'Zoom Out',   shortcut: 'Ctrl+−', onClick: () => onZoom('out') },
        { label: 'Reset Zoom', shortcut: 'Ctrl+0', onClick: () => onZoom('reset') },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'About Notara', onClick: () => onOpenSettings('about') },
        { separator: true },
        { label: 'Product Page ↗', onClick: () => openLink('https://notara.jacobmollan.xyz') },
        { label: 'GitHub ↗',       onClick: () => openLink('https://github.com/jacob-h-m/Notara') },
        { separator: true },
        { label: 'Open Notes Folder',    onClick: onOpenNotesFolder },
        { label: 'Open App Data Folder', onClick: () => window.api.openAppDataFolder().catch(console.error) },
      ],
    },
  ]

  const isTitlebar = mode === 'titlebar'

  return (
    <div
      ref={barRef}
      className={`app-menu-bar flex items-stretch px-0.5 ${
        isTitlebar
          ? 'h-full'
          : 'h-7 border-b border-subtle bg-titlebar'
      }`}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {menus.map(menu => (
        <div key={menu.label} className="relative flex items-stretch">
          <button
            onClick={() => toggle(menu.label)}
            className={`flex items-center rounded-md px-2.5 text-[12px] transition-colors ${
              open === menu.label
                ? 'bg-btn-ghost-active text-on-surface'
                : 'text-muted hover:text-on-surface'
            }`}
            style={{
              background: open === menu.label ? 'var(--btn-ghost-active)' : undefined,
            }}
            onMouseEnter={e => {
              if (open !== null) setOpen(menu.label)
              else e.currentTarget.style.background = 'var(--btn-ghost-hover)'
            }}
            onMouseLeave={e => {
              if (open !== menu.label)
                e.currentTarget.style.background = ''
            }}
          >
            {menu.label}
          </button>
          {open === menu.label && (
            <Dropdown items={menu.items} onClose={() => setOpen(null)} />
          )}
        </div>
      ))}
    </div>
  )
}
