/**
 * src/components/AppMenuBar.tsx
 * Custom desktop-style application menu bar.
 * Renders below the titlebar with File / Edit / View / Notes / Help dropdowns.
 */

import React, { useEffect, useRef, useState } from 'react'
import { useKeybindings } from '../hooks/useKeybindings'

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
  /** Whether the active tab is a Markdown file (gates preview toggle). */
  isMarkdownActive?: boolean
  onNewNote: () => void
  onSave: () => void
  onCloseTab: () => void
  onRenameActiveNote: () => void
  onDeleteActiveNote: () => void
  onExportAs: (ext: 'md' | 'txt') => void
  onExportPdf?: () => void
  onOpenNotesFolder: () => void
  onOpenSettings: (tab?: string) => void
  onTogglePreview: () => void
  onToggleSidebar: () => void
  onToggleWordWrap: () => void
  onToggleLineNumbers: () => void
  onZoom: (dir: 'in' | 'out' | 'reset') => void
  onPinToggle: () => void
  onDuplicateNote: () => void
  onNewWindow: () => void
  onMoveToNewWindow: () => void
  onOpenSearchPalette: () => void
  onShowVersionHistory: () => void
  onShowAttachments: () => void
  onOpenGraph?: () => void
  onMergeWindows?: () => void
}

// ─── Dropdown component ───────────────────────────────────────────────────────

function Dropdown({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  return (
    <div
      className="menu-dropdown absolute top-full z-50 mt-1 min-w-[210px] overflow-hidden rounded-xl border border-muted py-1.5 shadow-2xl"
      style={{ background: 'var(--modal-bg)' } as React.CSSProperties}
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
            onClick={() => {
              action.onClick()
              onClose()
            }}
            className="flex w-full items-center justify-between px-3.5 py-1.5 text-left text-[13px] transition-colors"
            style={
              {
                color: action.disabled ? 'var(--text-muted)' : 'var(--text-primary)',
                opacity: action.disabled ? 0.5 : 1,
                cursor: action.disabled ? 'default' : 'pointer',
              } as React.CSSProperties
            }
            onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
              if (!action.disabled)
                (e.currentTarget as HTMLElement).style.background = 'var(--btn-ghost-hover)'
            }}
            onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
              ;(e.currentTarget as HTMLElement).style.background = ''
            }}
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
  activeTab,
  isPinned,
  sidebarCollapsed,
  wordWrap,
  lineNumbers,
  previewOpen,
  isMarkdownActive = false,
  onNewNote,
  onSave,
  onCloseTab,
  onRenameActiveNote,
  onDeleteActiveNote,
  onExportAs,
  onOpenNotesFolder,
  onOpenSettings,
  onTogglePreview,
  onToggleSidebar,
  onToggleWordWrap,
  onToggleLineNumbers,
  onZoom,
  onPinToggle,
  onDuplicateNote,
  onNewWindow,
  onMoveToNewWindow,
  onOpenSearchPalette,
  onShowVersionHistory,
  onShowAttachments,
  onExportPdf,
  onOpenGraph,
  onMergeWindows,
}: AppMenuBarProps) {
  function dispatch(name: string) {
    window.dispatchEvent(new Event(name))
  }
  const { getKey } = useKeybindings()
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
    setOpen((prev) => (prev === id ? null : id))
  }

  const noNote = !activeTab

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: 'New Note', shortcut: getKey('newNote'), onClick: onNewNote },
        { label: 'New Window', shortcut: 'Ctrl+Shift+N', onClick: onNewWindow },
        { label: 'Save', shortcut: getKey('save'), disabled: noNote, onClick: onSave },
        { label: 'Close Tab', shortcut: getKey('closeTab'), disabled: noNote, onClick: onCloseTab },
        { separator: true },
        { label: 'Rename Note', disabled: noNote, onClick: onRenameActiveNote },
        { label: 'Delete Note', disabled: noNote, onClick: onDeleteActiveNote },
        { separator: true },
        { label: 'Export as Markdown', disabled: noNote, onClick: () => onExportAs('md') },
        { label: 'Export as Plain Text', disabled: noNote, onClick: () => onExportAs('txt') },
        {
          label: 'Export as PDF',
          shortcut: getKey('exportPdf'),
          disabled: noNote || !onExportPdf,
          onClick: () => onExportPdf?.(),
        },
        { separator: true },
        { label: 'Open Notes Folder', onClick: onOpenNotesFolder },
        { separator: true },
        { label: 'Settings', onClick: () => onOpenSettings() },
      ],
    },
    {
      label: 'Edit',
      items: [
        {
          label: 'Undo',
          shortcut: getKey('undo'),
          disabled: noNote,
          onClick: () => dispatch('notara:editor-undo'),
        },
        {
          label: 'Redo',
          shortcut: getKey('redo'),
          disabled: noNote,
          onClick: () => dispatch('notara:editor-redo'),
        },
        { separator: true },
        {
          label: 'Find…',
          shortcut: getKey('find'),
          disabled: noNote,
          onClick: () => dispatch('notara:open-find'),
        },
        {
          label: 'Find & Replace…',
          shortcut: getKey('findReplace'),
          disabled: noNote,
          onClick: () => dispatch('notara:open-replace'),
        },
        { label: 'Search All Notes…', shortcut: getKey('searchAll'), onClick: onOpenSearchPalette },
        { separator: true },
        {
          label: 'Cut',
          shortcut: 'Ctrl+X',
          onClick: () => {
            try {
              ;(document as unknown as { execCommand: (cmd: string) => void }).execCommand('cut')
            } catch {}
          },
        },
        {
          label: 'Copy',
          shortcut: 'Ctrl+C',
          onClick: () => {
            try {
              ;(document as unknown as { execCommand: (cmd: string) => void }).execCommand('copy')
            } catch {}
          },
        },
        {
          label: 'Paste',
          shortcut: 'Ctrl+V',
          onClick: () => {
            try {
              ;(document as unknown as { execCommand: (cmd: string) => void }).execCommand('paste')
            } catch {}
          },
        },
        { separator: true },
        {
          label: 'Select All',
          shortcut: 'Ctrl+A',
          onClick: () => {
            try {
              ;(document as unknown as { execCommand: (cmd: string) => void }).execCommand(
                'selectAll'
              )
            } catch {}
          },
        },
      ],
    },
    {
      label: 'Note',
      items: [
        { label: isPinned ? '✓ Pin Note' : 'Pin Note', disabled: noNote, onClick: onPinToggle },
        { separator: true },
        { label: 'Move to New Window', disabled: noNote, onClick: onMoveToNewWindow },
        { label: 'Merge All Windows', onClick: () => onMergeWindows?.() },
        { label: 'Duplicate Note', disabled: noNote, onClick: onDuplicateNote },
        { label: 'Version History…', disabled: noNote, onClick: onShowVersionHistory },
        { label: 'Attachments…', disabled: noNote, onClick: onShowAttachments },
        { separator: true },
        { label: '✓ Sort by Name', disabled: true, onClick: () => {} },
      ],
    },
    {
      label: 'View',
      items: [
        {
          label: previewOpen ? '✓ Preview Panel' : 'Preview Panel',
          shortcut: getKey('togglePreview'),
          disabled: !isMarkdownActive,
          onClick: onTogglePreview,
        },
        { label: sidebarCollapsed ? 'Show Sidebar' : '✓ Show Sidebar', onClick: onToggleSidebar },
        { separator: true },
        { label: wordWrap ? '✓ Word Wrap' : 'Word Wrap', onClick: onToggleWordWrap },
        { label: lineNumbers ? '✓ Line Numbers' : 'Line Numbers', onClick: onToggleLineNumbers },
        { separator: true },
        { label: 'Zoom In', shortcut: getKey('zoomIn'), onClick: () => onZoom('in') },
        { label: 'Zoom Out', shortcut: getKey('zoomOut'), onClick: () => onZoom('out') },
        { label: 'Reset Zoom', shortcut: getKey('zoomReset'), onClick: () => onZoom('reset') },
        { separator: true },
        { label: 'Knowledge Graph', shortcut: 'Ctrl+Shift+G', onClick: () => onOpenGraph?.() },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'About Notara', onClick: () => onOpenSettings('about') },
        { separator: true },
        { label: 'Product Page ↗', onClick: () => openLink('https://notara.jacobmollan.xyz') },
        { label: 'GitHub ↗', onClick: () => openLink('https://github.com/jacob-h-m/Notara') },
        { separator: true },
        { label: 'Open Notes Folder', onClick: onOpenNotesFolder },
        {
          label: 'Open App Data Folder',
          onClick: () => window.api.openAppDataFolder().catch(console.error),
        },
      ],
    },
  ]

  const isTitlebar = mode === 'titlebar'

  return (
    <div
      ref={barRef}
      className={`app-menu-bar flex items-stretch px-0.5 ${
        isTitlebar ? 'h-full' : 'h-7 border-b border-subtle bg-titlebar'
      }`}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {menus.map((menu) => (
        <div key={menu.label} className="relative flex items-stretch">
          <button
            onClick={() => toggle(menu.label)}
            className={`flex items-center rounded-md px-2.5 text-[12px] transition-colors ${
              open === menu.label
                ? 'bg-btn-ghost-active text-on-surface'
                : 'text-muted hover:text-on-surface'
            }`}
            style={
              {
                background: open === menu.label ? 'var(--btn-ghost-active)' : undefined,
              } as React.CSSProperties
            }
            onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
              if (open !== null) setOpen(menu.label)
              else e.currentTarget.style.background = 'var(--btn-ghost-hover)'
            }}
            onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
              if (open !== menu.label) e.currentTarget.style.background = ''
            }}
          >
            {menu.label}
          </button>
          {open === menu.label && <Dropdown items={menu.items} onClose={() => setOpen(null)} />}
        </div>
      ))}
    </div>
  )
}
