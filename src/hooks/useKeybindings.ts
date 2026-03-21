/**
 * src/hooks/useKeybindings.ts
 * Runtime-remappable keybindings for all major Notara actions.
 *
 * - Default bindings are defined below and used on first launch.
 * - User overrides are persisted in state.json under `keybindings`.
 * - Changes are broadcast via a custom event so every hook instance stays in sync.
 */

import { useCallback, useEffect, useState } from 'react'
import { loadState, saveState } from '../utils/jsonStorage'

const KEYBINDINGS_CHANGED_EVENT = 'notara:keybindings-changed'

// ─── Types ────────────────────────────────────────────────────────────────────

/** Every named action Notara supports keybindings for. */
export type ActionId =
  | 'save'
  | 'newNote'
  | 'closeTab'
  | 'undo'
  | 'redo'
  | 'find'
  | 'findReplace'
  | 'searchAll'
  | 'togglePreview'
  | 'toggleSidebar'
  | 'toggleWordWrap'
  | 'exportPdf'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'mdBold'
  | 'mdItalic'
  | 'mdH1'
  | 'mdH2'
  | 'mdH3'
  | 'mdUnorderedList'
  | 'mdOrderedList'
  | 'mdCheckbox'
  | 'mdBlockquote'
  | 'mdCode'
  | 'mdLink'

/** A single keybinding entry. */
export type Keybinding = {
  /** User-facing label for the action. */
  label: string
  /** Group for display in settings. */
  group: 'File' | 'Edit' | 'View' | 'Markdown'
  /** The keyboard shortcut string (e.g. "Ctrl+S"). Empty string = unbound. */
  key: string
}

export type KeybindingsMap = Record<ActionId, Keybinding>

// ─── Shortcut normalisation ───────────────────────────────────────────────────

const MODIFIER_ORDER = ['Ctrl', 'Shift', 'Alt'] as const

/** Ensure modifiers always appear in Ctrl → Shift → Alt order. */
function normalizeShortcutParts(parts: string[]): string {
  const unique = Array.from(new Set(parts.filter(Boolean)))
  const modifiers = unique
    .filter((p) => MODIFIER_ORDER.includes(p as (typeof MODIFIER_ORDER)[number]))
    .sort(
      (a, b) =>
        MODIFIER_ORDER.indexOf(a as (typeof MODIFIER_ORDER)[number]) -
        MODIFIER_ORDER.indexOf(b as (typeof MODIFIER_ORDER)[number])
    )
  const keys = unique.filter((p) => !MODIFIER_ORDER.includes(p as (typeof MODIFIER_ORDER)[number]))
  return [...modifiers, ...keys].join('+')
}

export function normalizeShortcutString(shortcut: string): string {
  return normalizeShortcutParts(
    shortcut
      .split('+')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        if (/^(cmd|meta|control|ctrl)$/i.test(part)) return 'Ctrl'
        if (/^shift$/i.test(part)) return 'Shift'
        if (/^alt$/i.test(part)) return 'Alt'
        if (part === ' ') return 'Space'
        return part.length === 1 ? part.toUpperCase() : part
      })
  )
}

export function keyboardEventToShortcut(event: KeyboardEvent): string {
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
  if (event.shiftKey) parts.push('Shift')
  if (event.altKey) parts.push('Alt')
  const rawKey = event.key === ' ' ? 'Space' : event.key
  if (!['Control', 'Shift', 'Alt', 'Meta'].includes(rawKey)) {
    parts.push(rawKey.length === 1 ? rawKey.toUpperCase() : rawKey)
  }
  return normalizeShortcutParts(parts)
}

export function matchesKeybinding(event: KeyboardEvent, binding: string): boolean {
  return (
    binding.trim() !== '' && keyboardEventToShortcut(event) === normalizeShortcutString(binding)
  )
}

function broadcastKeybindings(next: KeybindingsMap): void {
  window.dispatchEvent(new CustomEvent(KEYBINDINGS_CHANGED_EVENT, { detail: next }))
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_KEYBINDINGS: KeybindingsMap = {
  save: { label: 'Save', group: 'File', key: 'Ctrl+S' },
  newNote: { label: 'New Note', group: 'File', key: 'Ctrl+N' },
  closeTab: { label: 'Close Tab', group: 'File', key: 'Ctrl+W' },
  exportPdf: { label: 'Export as PDF', group: 'File', key: 'Ctrl+Shift+E' },
  undo: { label: 'Undo', group: 'Edit', key: 'Ctrl+Z' },
  redo: { label: 'Redo', group: 'Edit', key: 'Ctrl+Y' },
  find: { label: 'Find', group: 'Edit', key: 'Ctrl+F' },
  findReplace: { label: 'Find & Replace', group: 'Edit', key: 'Ctrl+H' },
  searchAll: { label: 'Search All Notes', group: 'Edit', key: 'Ctrl+Shift+F' },
  togglePreview: { label: 'Toggle Preview', group: 'View', key: 'Ctrl+P' },
  toggleSidebar: { label: 'Toggle Sidebar', group: 'View', key: 'Ctrl+\\' },
  toggleWordWrap: { label: 'Toggle Word Wrap', group: 'View', key: '' },
  zoomIn: { label: 'Zoom In', group: 'View', key: 'Ctrl+=' },
  zoomOut: { label: 'Zoom Out', group: 'View', key: 'Ctrl+-' },
  zoomReset: { label: 'Reset Zoom', group: 'View', key: 'Ctrl+0' },
  mdBold: { label: 'Bold', group: 'Markdown', key: 'Ctrl+B' },
  mdItalic: { label: 'Italic', group: 'Markdown', key: 'Ctrl+I' },
  mdH1: { label: 'Heading 1', group: 'Markdown', key: 'Ctrl+1' },
  mdH2: { label: 'Heading 2', group: 'Markdown', key: 'Ctrl+2' },
  mdH3: { label: 'Heading 3', group: 'Markdown', key: 'Ctrl+3' },
  mdUnorderedList: { label: 'Bullet List', group: 'Markdown', key: 'Ctrl+Shift+U' },
  mdOrderedList: { label: 'Numbered List', group: 'Markdown', key: 'Ctrl+Shift+O' },
  mdCheckbox: { label: 'Task / Checkbox', group: 'Markdown', key: 'Ctrl+Shift+C' },
  mdBlockquote: { label: 'Blockquote', group: 'Markdown', key: 'Ctrl+Shift+>' },
  mdCode: { label: 'Inline Code', group: 'Markdown', key: '`' },
  mdLink: { label: 'Insert Link', group: 'Markdown', key: 'Ctrl+K' },
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useKeybindings() {
  const [keybindings, setKeybindingsState] = useState<KeybindingsMap>(DEFAULT_KEYBINDINGS)

  // Load persisted overrides on mount.
  useEffect(() => {
    loadState()
      .then((s) => {
        const stored = s.keybindings as Partial<KeybindingsMap> | undefined
        if (!stored) return
        // Merge stored key overrides into the defaults so new actions get their defaults.
        setKeybindingsState((prev) => {
          const merged = { ...prev }
          for (const id of Object.keys(stored) as ActionId[]) {
            if (merged[id] && stored[id]) {
              merged[id] = { ...merged[id], key: stored[id]!.key }
            }
          }
          return merged
        })
      })
      .catch(() => {})
  }, [])

  // Stay in sync with changes made by other hook instances in the same window.
  useEffect(() => {
    const handle = (event: Event) => {
      const next = (event as CustomEvent<KeybindingsMap>).detail
      if (next) setKeybindingsState(next)
    }
    window.addEventListener(KEYBINDINGS_CHANGED_EVENT, handle)
    return () => window.removeEventListener(KEYBINDINGS_CHANGED_EVENT, handle)
  }, [])

  // Sync keybinding changes saved in another Notara window.
  // Rebuilds from defaults then re-applies the stored overrides so any
  // bindings reset to defaults in the other window are correctly cleared here.
  useEffect(() => {
    if (!window.api?.onStateChanged) return
    return window.api.onStateChanged((incoming) => {
      const stored = incoming.keybindings
      setKeybindingsState(() => {
        const merged = { ...DEFAULT_KEYBINDINGS }
        if (stored) {
          for (const id of Object.keys(stored) as ActionId[]) {
            if (merged[id] && stored[id]) {
              merged[id] = { ...merged[id], key: stored[id]!.key }
            }
          }
        }
        broadcastKeybindings(merged)
        return merged
      })
    })
  }, [])

  /** Update a single keybinding and persist the change to state.json. */
  const setKeybinding = useCallback(async (action: ActionId, key: string): Promise<void> => {
    const state = await loadState().catch(() => null)
    if (!state) return
    setKeybindingsState((prev) => {
      const next = { ...prev, [action]: { ...prev[action], key } }
      // Persist only the key overrides, not the full label/group metadata.
      const persisted = Object.fromEntries(
        Object.entries(next).map(([k, v]) => [k, { key: v.key }])
      )
      saveState({ ...state, keybindings: persisted as never }).catch(() => {})
      broadcastKeybindings(next)
      return next
    })
  }, [])

  /** Reset all keybindings to defaults. */
  const resetKeybindings = useCallback(async (): Promise<void> => {
    setKeybindingsState(DEFAULT_KEYBINDINGS)
    broadcastKeybindings(DEFAULT_KEYBINDINGS)
    try {
      const s = await loadState()
      await saveState({ ...s, keybindings: undefined as never })
    } catch {}
  }, [])

  /** Get the keyboard shortcut string for a given action (for menu display). */
  const getKey = useCallback(
    (action: ActionId): string => keybindings[action]?.key ?? '',
    [keybindings]
  )

  return { keybindings, setKeybinding, resetKeybindings, getKey }
}
