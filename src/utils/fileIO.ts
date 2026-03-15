/**
 * src/utils/fileIO.ts
 * Typed wrappers around window.api file operations.
 *
 * Never throw — callers get `null` / `false` / `[]` on error, with a
 * console.error for dev visibility.
 */

// ─── Note read/write ──────────────────────────────────────────────────────────

/** List all notes (basenames). Returns [] on failure. */
export async function listNotes(): Promise<string[]> {
  try {
    return await window.api.listNotes()
  } catch (err) {
    console.error('[fileIO] listNotes failed:', err)
    return []
  }
}

/** Read note content. Returns '' on failure. */
export async function readNote(filename: string): Promise<string> {
  try {
    return await window.api.readNote(filename)
  } catch (err) {
    console.error(`[fileIO] readNote("${filename}") failed:`, err)
    return ''
  }
}

/** Write content to a note. Returns true on success. */
export async function writeNote(filename: string, content: string): Promise<boolean> {
  try {
    await window.api.writeNote(filename, content)
    return true
  } catch (err) {
    console.error(`[fileIO] writeNote("${filename}") failed:`, err)
    return false
  }
}

/** Create a new empty note. Returns true on success. */
export async function createNote(filename: string): Promise<boolean> {
  try {
    await window.api.createNote(filename)
    return true
  } catch (err) {
    console.error(`[fileIO] createNote("${filename}") failed:`, err)
    return false
  }
}

/** Delete a note. Returns true on success. */
export async function deleteNote(filename: string): Promise<boolean> {
  try {
    await window.api.deleteNote(filename)
    return true
  } catch (err) {
    console.error(`[fileIO] deleteNote("${filename}") failed:`, err)
    return false
  }
}

/**
 * Rename a note in-place.
 * Both arguments must be bare filenames (no path separators).
 * Returns true on success.
 */
export async function renameNote(oldFilename: string, newFilename: string): Promise<boolean> {
  try {
    await window.api.renameNote(oldFilename, newFilename)
    return true
  } catch (err) {
    console.error(`[fileIO] renameNote("${oldFilename}" → "${newFilename}") failed:`, err)
    return false
  }
}



