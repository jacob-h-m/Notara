/**
 * src/components/Sidebar.tsx
 * Left sidebar panel.
 *
 * Sections (top → bottom):
 *   1. Header       — logo + app name
 *   2. Search + New — filter notes by name, create a new note
 *   3. Pinned       — notes pinned by the user, collapsible
 *   4. Notes        — all unpinned notes, collapsible, scrollable
 *   5. Tags         — placeholder for future local tag metadata, collapsible
 *   6. Footer       — note count + theme/preview toggles
 *
 * Each note row shows:
 *   - Pin toggle (★ filled when pinned, ☆ on hover when unpinned)
 *   - Filename (without extension)
 *   - Blue dot when the note is open in a tab but not the active tab
 *   - Delete button (shows inline confirm to avoid accidental deletes)
 */

import { useState, useEffect, useRef, type MouseEvent, type DragEvent } from 'react'
import { useContextMenu } from './ContextMenu'
import { ensureUniqueFilename, stemFilename } from '../utils/filenames'
import type { TagSummary } from '../hooks/useTags'

// ─── Types ────────────────────────────────────────────────────────────────────

type SidebarProps = {
  /** The current list of note filenames, managed by useNoteList in App. */
  notes: string[]
  activeTab: string | null
  openTabs: string[]
  onOpenFile: (filename: string) => void
  onCreateNote: (filename: string) => Promise<string | null>
  onDeleteNote: (filename: string) => Promise<void>
  onRenameNote: (oldFilename: string, newFilename: string) => Promise<boolean>
  onOpenInNewWindow: (filename: string) => void
  pinnedNotes: string[]
  onTogglePin: (filename: string) => void
  /** Collapse this sidebar (called when the ‹ button is clicked). */
  onToggleSidebar: () => void
  /** Open the Settings modal (optionally to a specific tab). */
  onOpenSettings: (tab?: string) => void
  /** Current note sort order (displayed in section header). */
  noteSort: 'name' | 'modified'
  /** Whether the sidebar is currently collapsed (for aria attributes). */
  sidebarCollapsed?: boolean
  /** Tag index computed from all note contents. */
  tagIndex?: TagSummary[]
  /** Currently active tag filter (null = show all). */
  tagFilter?: string | null
  /** Called when the user clicks a tag to filter (or clears the filter). */
  onTagFilterChange?: (tag: string | null) => void
  /** Called when the user drag-reorders unpinned notes. */
  onReorderNotes?: (newOrder: string[]) => void
  /** Open the knowledge graph view. */
  onOpenGraph?: () => void
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({
  label,
  count,
  open,
  onToggle,
  sectionId,
}: {
  label: string
  count: number
  open: boolean
  onToggle: () => void
  /** id of the controlled list element, for aria-controls */
  sectionId?: string
}) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={sectionId}
      className="flex w-full items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted transition-colors hover:text-on-surface focus:outline-none"
    >
      <div className="flex items-center gap-1.5">
        <span
          className="text-muted transition-transform duration-150"
          style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M9 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        {label}
      </div>
      {count > 0 && <span className="tabular-nums text-muted">{count}</span>}
    </button>
  )
}

/**
 * A single note row in the sidebar list.
 * Manages its own delete-confirm state to avoid storing that in the parent.
 */
function NoteItem({
  filename,
  isActive,
  isOpen,
  isPinned,
  onSelect,
  onDelete,
  onRename,
  onTogglePin,
  requestRename,
  onOpenInNewWindow,
  draggable: isDraggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragOver,
}: {
  filename: string
  isActive: boolean
  isOpen: boolean
  isPinned: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: (nextFilename: string) => Promise<boolean>
  onOpenInNewWindow: () => void
  onTogglePin: (e: MouseEvent<HTMLButtonElement>) => void
  requestRename?: boolean
  draggable?: boolean
  onDragStart?: () => void
  onDragOver?: (e: DragEvent) => void
  onDrop?: () => void
  onDragEnd?: () => void
  isDragOver?: boolean
}) {
  const { menu: ctxMenu, openMenu } = useContextMenu()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftName, setDraftName] = useState(filename)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const displayName = stemFilename(filename) || filename

  async function submitRename() {
    const trimmed = draftName.trim()
    const normalized = /\.(md|txt)$/i.test(trimmed) ? trimmed : `${trimmed}.md`
    if (!trimmed || normalized === filename) {
      setDraftName(filename)
      setIsRenaming(false)
      return
    }
    const ok = await onRename(normalized)
    if (ok) {
      setIsRenaming(false)
    } else {
      setDraftName(filename)
      setIsRenaming(false)
    }
  }

  // If a parent requests this item start renaming (e.g. menu → rename active note),
  // open the inline rename input and focus it.
  useEffect(() => {
    if (requestRename) {
      setIsRenaming(true)
      setTimeout(() => {
        renameInputRef.current?.focus()
        renameInputRef.current?.select()
      }, 0)
    }
  }, [requestRename, filename])

  return (
    <>
      {ctxMenu}
      <div
        onClick={onSelect}
        draggable={isDraggable && !isRenaming}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        onDoubleClick={(e) => {
          e.stopPropagation()
          setDraftName(filename)
          setIsRenaming(true)
          setTimeout(() => {
            renameInputRef.current?.focus()
            renameInputRef.current?.select()
          }, 0)
        }}
        onContextMenu={(e) =>
          openMenu(e, [
            { label: 'Open', onClick: onSelect },
            { label: 'Move to New Window', onClick: onOpenInNewWindow },
            {
              label: 'Rename',
              onClick: () => {
                setDraftName(filename)
                setIsRenaming(true)
              },
            },
            { separator: true },
            {
              label: isPinned ? 'Unpin' : 'Pin to top',
              onClick: () => onTogglePin(e as unknown as MouseEvent<HTMLButtonElement>),
            },
            { separator: true },
            { label: 'Delete', onClick: () => setConfirmDelete(true) },
          ])
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSelect()
          if (e.key === 'F2') {
            e.preventDefault()
            setIsRenaming(true)
          }
          if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault()
            setConfirmDelete(true)
          }
        }}
        tabIndex={0}
        role="option"
        aria-selected={isActive}
        aria-label={`${displayName}${isActive ? ', active' : ''}${isOpen && !isActive ? ', open in tab' : ''}${isPinned ? ', pinned' : ''}`}
        title={filename}
        className={`group note-row ${isActive ? 'note-item-active' : ''} relative flex min-h-[30px] cursor-pointer items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
          isActive ? '' : 'text-muted'
        } ${isDragOver ? 'border-t-2' : ''}`}
        style={isDragOver ? { borderTopColor: 'var(--accent)' } : undefined}
      >
        {isActive && (
          <span
            className="absolute inset-y-[6px] left-0 w-[2px] rounded-r-full"
            style={{ background: 'var(--accent)' }}
            aria-hidden="true"
          />
        )}
        {/* Pin toggle */}
        <button
          onClick={onTogglePin}
          title={isPinned ? 'Unpin' : 'Pin to top'}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs leading-none transition-colors ${
            isPinned
              ? 'text-accent opacity-100'
              : 'text-muted opacity-50 hover:bg-surface-700 hover:text-on-surface group-hover:opacity-100'
          }`}
        >
          {isPinned ? '★' : '☆'}
        </button>

        {/* Filename */}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={async (e) => {
              e.stopPropagation()
              if (e.key === 'Enter') {
                e.preventDefault()
                await submitRename()
              }
              if (e.key === 'Escape') {
                setDraftName(filename)
                setIsRenaming(false)
              }
            }}
            onBlur={() => {
              void submitRename()
            }}
            className="min-w-0 flex-1 rounded bg-surface-800 px-1.5 py-0.5 font-mono text-[12.5px] leading-5 text-on-surface outline-none ring-accent"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{displayName}</span>
        )}

        {/* Open-in-tab indicator (dim dot when this note is open but not active) */}
        {isOpen && !isActive && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full opacity-60"
            style={{ background: 'var(--accent)' }}
          />
        )}

        {/* Delete / confirm-delete */}
        <div
          className="note-actions ml-1 flex w-11 shrink-0 items-center justify-end gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          {confirmDelete ? (
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                onClick={() => {
                  onDelete()
                  setConfirmDelete(false)
                }}
                title="Confirm delete"
                className="flex h-5 w-5 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive-muted"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <polyline points="2,8 6,12 14,4" />
                </svg>
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                title="Cancel"
                className="flex h-5 w-5 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-700"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <line x1="3" y1="3" x2="13" y2="13" />
                  <line x1="13" y1="3" x2="3" y2="13" />
                </svg>
              </button>
            </div>
          ) : isRenaming ? null : (
            <>
              <button
                onClick={() => {
                  setDraftName(filename)
                  setIsRenaming(true)
                }}
                title={`Rename ${filename}`}
                className="flex h-5 w-5 items-center justify-center rounded text-muted opacity-0 transition-colors hover:bg-surface-700 hover:text-accent group-hover:opacity-100"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 2L14 4 5 13H3V11L12 2Z" />
                </svg>
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                title={`Delete ${filename}`}
                className="flex h-5 w-5 items-center justify-center rounded text-muted opacity-0 transition-colors hover:bg-surface-700 hover:text-destructive group-hover:opacity-100"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <line x1="3" y1="3" x2="13" y2="13" />
                  <line x1="13" y1="3" x2="3" y2="13" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

export default function Sidebar({
  notes,
  activeTab,
  openTabs,
  onOpenFile,
  onCreateNote,
  onDeleteNote,
  onRenameNote,
  onOpenInNewWindow,
  pinnedNotes,
  onTogglePin,
  onToggleSidebar,
  onOpenSettings,
  noteSort: _noteSort,
  sidebarCollapsed,
  tagIndex = [],
  tagFilter = null,
  onTagFilterChange,
  onReorderNotes,
  onOpenGraph,
}: SidebarProps) {
  const [search, setSearch] = useState('')
  const [pinnedOpen, setPinnedOpen] = useState(true)
  const [notesOpen, setNotesOpen] = useState(true)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [startRenameFor, setStartRenameFor] = useState<string | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  // Listen for external rename requests (dispatched by App/menu)
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent).detail as string | undefined
      if (detail) setStartRenameFor(detail)
    }
    window.addEventListener('notara:start-rename', handler as EventListener)
    return () => window.removeEventListener('notara:start-rename', handler as EventListener)
  }, [])

  // Clear the transient startRenameFor flag shortly after it's set so a
  // subsequent renders don't repeatedly retrigger focus logic.
  useEffect(() => {
    if (!startRenameFor) return
    const t = setTimeout(() => setStartRenameFor(null), 600)
    return () => clearTimeout(t)
  }, [startRenameFor])

  // Ensure focus moves to the active editor after creating/opening a note.
  // Dispatch a global event that the Editor listens for to focus the active view.
  async function handleNewNoteAndFocus() {
    const base = 'Untitled.md'
    const name = ensureUniqueFilename(base, notes)
    const created = await onCreateNote(name)
    if (created) {
      onOpenFile(created)
      // allow the tab system to settle, then request editor focus
      setTimeout(() => window.dispatchEvent(new Event('notara:focus-active-editor')), 50)
    }
  }

  async function handleDeleteNote(filename: string) {
    await onDeleteNote(filename)
    // After delete, ensure focus moves to the active editor (if any)
    setTimeout(() => window.dispatchEvent(new Event('notara:focus-active-editor')), 50)
  }

  async function handleRenameNote(oldFilename: string, newFilename: string): Promise<boolean> {
    return onRenameNote(oldFilename, newFilename)
  }

  function handleTogglePin(filename: string, e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    onTogglePin(filename)
  }

  // Filter + split into pinned / unpinned
  // Tag filter restricts to notes containing the selected tag
  const tagFilteredNotes = tagFilter
    ? (tagIndex.find((t) => t.tag === tagFilter)?.notes ?? [])
    : notes
  const q = search.toLowerCase()
  const filtered = tagFilteredNotes.filter((n) => !q || n.toLowerCase().includes(q))
  const pinned = filtered.filter((n) => pinnedNotes.includes(n))
  const unpinned = filtered.filter((n) => !pinnedNotes.includes(n))

  return (
    <aside
      className="flex h-full w-60 flex-shrink-0 select-none flex-col text-on-surface"
      style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--border-subtle)' }}
    >
      {/* ── Search + New ───────────────────────────────────────────── */}
      <div
        className="flex flex-col gap-2 px-3 py-3"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
              className="search-icon pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
            >
              <circle cx="5" cy="5" r="3.2" stroke="currentColor" strokeWidth="1.2" fill="none" />
              <path
                d="M7.6 7.6l3 3"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes…"
              className="field w-full py-1.5 pl-7 pr-2.5 text-xs"
              style={{ paddingLeft: '1.75rem' }}
              aria-label="Filter notes by name"
              role="searchbox"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="btn-icon absolute right-1.5 top-1/2 -translate-y-1/2"
                aria-label="Clear search"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <line x1="2" y1="2" x2="10" y2="10" />
                  <line x1="10" y1="2" x2="2" y2="10" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={onToggleSidebar}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            aria-expanded={!sidebarCollapsed}
            className="btn-icon shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M15 6l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <button
          onClick={handleNewNoteAndFocus}
          className="btn btn-subtle w-full py-1.5 text-xs font-medium"
        >
          + New Note
        </button>
      </div>

      {/* ── Note list ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {/* Pinned section */}
        {(pinned.length > 0 || pinnedNotes.length > 0) && (
          <div className="mt-1">
            <SectionHeader
              label="Pinned"
              count={pinned.length}
              open={pinnedOpen}
              onToggle={() => setPinnedOpen((o) => !o)}
              sectionId="sidebar-pinned-list"
            />
            {pinnedOpen && (
              <div id="sidebar-pinned-list" role="listbox" aria-label="Pinned notes">
                {pinned.map((note) => (
                  <NoteItem
                    key={note}
                    filename={note}
                    isActive={note === activeTab}
                    isOpen={openTabs.includes(note)}
                    isPinned
                    onSelect={() => onOpenFile(note)}
                    onDelete={() => handleDeleteNote(note)}
                    onOpenInNewWindow={() => onOpenInNewWindow(note)}
                    onRename={async (nextName) => {
                      const ok = await handleRenameNote(note, nextName)
                      if (ok)
                        setTimeout(
                          () => window.dispatchEvent(new Event('notara:focus-active-editor')),
                          50
                        )
                      return ok
                    }}
                    onTogglePin={(e) => handleTogglePin(note, e)}
                    requestRename={startRenameFor === note}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* All notes section */}
        <div className="mt-1">
          <SectionHeader
            label="Notes"
            count={unpinned.length}
            open={notesOpen}
            onToggle={() => setNotesOpen((o) => !o)}
            sectionId="sidebar-notes-list"
          />
          {notesOpen &&
            (unpinned.length === 0 ? (
              <p
                className="px-4 py-6 text-center text-[11px] leading-relaxed text-muted"
                role="status"
                aria-live="polite"
              >
                {q ? 'No matches found.' : 'No notes yet.\nClick + New Note to start.'}
              </p>
            ) : (
              <div id="sidebar-notes-list" role="listbox" aria-label="Notes">
                {unpinned.map((note, idx) => (
                  <NoteItem
                    key={note}
                    filename={note}
                    isActive={note === activeTab}
                    isOpen={openTabs.includes(note)}
                    isPinned={false}
                    onSelect={() => onOpenFile(note)}
                    onDelete={() => handleDeleteNote(note)}
                    onOpenInNewWindow={() => onOpenInNewWindow(note)}
                    onRename={async (nextName) => {
                      const ok = await handleRenameNote(note, nextName)
                      if (ok)
                        setTimeout(
                          () => window.dispatchEvent(new Event('notara:focus-active-editor')),
                          50
                        )
                      return ok
                    }}
                    onTogglePin={(e) => handleTogglePin(note, e)}
                    requestRename={startRenameFor === note}
                    draggable={!!onReorderNotes && !search && !tagFilter}
                    onDragStart={() => setDragIdx(idx)}
                    onDragOver={(e: DragEvent) => {
                      e.preventDefault()
                      setDragOverIdx(idx)
                    }}
                    onDrop={() => {
                      if (dragIdx !== null && dragIdx !== idx) {
                        const next = [...unpinned]
                        const [moved] = next.splice(dragIdx, 1)
                        next.splice(idx, 0, moved)
                        onReorderNotes?.(next)
                      }
                      setDragIdx(null)
                      setDragOverIdx(null)
                    }}
                    onDragEnd={() => {
                      setDragIdx(null)
                      setDragOverIdx(null)
                    }}
                    isDragOver={dragOverIdx === idx && dragIdx !== idx}
                  />
                ))}
              </div>
            ))}
        </div>

        {/* Tags section */}
        <div className="mt-1">
          <SectionHeader
            label="Tags"
            count={tagIndex.length}
            open={tagsOpen}
            onToggle={() => setTagsOpen((o) => !o)}
            sectionId="sidebar-tags-list"
          />
          {tagsOpen &&
            (tagIndex.length === 0 ? (
              <p className="px-4 py-4 text-[11px] italic text-muted">
                No tags yet. Add #hashtags to your notes.
              </p>
            ) : (
              <div
                id="sidebar-tags-list"
                role="listbox"
                aria-label="Tags"
                className="flex flex-col py-0.5"
              >
                {tagFilter && (
                  <button
                    onClick={() => onTagFilterChange?.(null)}
                    className="mx-3 mb-1 flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-accent hover:opacity-80"
                    style={{
                      background:
                        'var(--accent-muted, color-mix(in srgb, var(--accent) 15%, transparent))',
                    }}
                  >
                    <svg
                      width="9"
                      height="9"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      aria-hidden
                    >
                      <line x1="2" y1="2" x2="10" y2="10" />
                      <line x1="10" y1="2" x2="2" y2="10" />
                    </svg>
                    Clear filter
                  </button>
                )}
                {tagIndex.map(({ tag, count }) => (
                  <button
                    key={tag}
                    onClick={() => onTagFilterChange?.(tagFilter === tag ? null : tag)}
                    className={`flex items-center justify-between px-4 py-1 text-[12px] transition-colors ${
                      tagFilter === tag
                        ? 'font-semibold text-accent'
                        : 'text-muted hover:text-on-surface'
                    }`}
                    title={`Filter by #${tag} (${count} note${count === 1 ? '' : 's'})`}
                  >
                    <span className="truncate">#{tag}</span>
                    <span className="ml-2 shrink-0 tabular-nums text-[10px]">{count}</span>
                  </button>
                ))}
              </div>
            ))}
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-2 py-2"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        <span className="pl-1 text-[11px] text-muted">
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </span>
        <div className="flex items-center gap-0.5">
          {onOpenGraph && (
            <button
              onClick={onOpenGraph}
              title="Knowledge Graph (Ctrl+Shift+G)"
              aria-label="Knowledge Graph"
              className="btn-icon"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="5" cy="12" r="2" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="19" cy="5" r="2" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="19" cy="19" r="2" stroke="currentColor" strokeWidth="1.6" />
                <line x1="7" y1="11" x2="17" y2="6" stroke="currentColor" strokeWidth="1.4" />
                <line x1="7" y1="13" x2="17" y2="18" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </button>
          )}
          <button
            onClick={() => onOpenSettings()}
            title="Settings"
            aria-label="Settings"
            className="btn-icon"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
