/**
 * src/hooks/useNoteList.ts
 * Centralised reactive note-list hook for the Notara v2 renderer.
 *
 * Provides:
 *   - `notes`         — current list of bare filenames (triggers re-renders)
 *   - `refresh()`     — re-reads the list from disk
 *   - `createNote()`  — creates a note and refreshes
 *   - `deleteNote()`  — deletes a note and refreshes
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { listNotes, createNote, deleteNote } from '../utils/fileIO'
import { sanitizeUserFilename, ensureUniqueFilename } from '../utils/filenames'

export type NoteListManager = {
  notes: string[]
  refresh: () => Promise<void>
  /** Returns the actual filename created, or null on failure. */
  createNote: (filename: string) => Promise<string | null>
  deleteNote: (filename: string) => Promise<boolean>
}

export function useNoteList(): NoteListManager {
  const [notes, setNotes] = useState<string[]>([])
  const ops = useRef<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    const list = await listNotes()
    setNotes([...list].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleCreate = useCallback(async (filename: string): Promise<string | null> => {
    const desired = sanitizeUserFilename(filename || `note-${Date.now()}`)
    const unique = ensureUniqueFilename(desired, notes)
    if (ops.current.has(unique)) return null
    ops.current.add(unique)
    try {
      const ok = await createNote(unique)
      if (ok) {
        await refresh()
        return unique
      }
      return null
    } finally {
      ops.current.delete(unique)
    }
  }, [refresh, notes])

  const handleDelete = useCallback(async (filename: string): Promise<boolean> => {
    if (ops.current.has(filename)) return false
    ops.current.add(filename)
    try {
      const ok = await deleteNote(filename)
      if (ok) await refresh()
      return ok
    } finally {
      ops.current.delete(filename)
    }
  }, [refresh])

  return { notes, refresh, createNote: handleCreate, deleteNote: handleDelete }
}
