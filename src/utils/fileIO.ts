/**
 * src/utils/fileIO.ts
 * Typed wrappers around window.api file operations.
 *
 * All functions follow a never-throw contract: callers receive null / false / []
 * on error, with a console.error for dev visibility.
 */

// ─── Notes ────────────────────────────────────────────────────────────────────

/** List all notes (bare filenames). Returns [] on failure. */
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

/**
 * Atomic write via temp-file → rename. Preferred for autosave.
 * Retries up to 3 times with exponential backoff (200 ms, 400 ms, 800 ms).
 * Returns true on success, false after all retries are exhausted.
 */
export async function writeNoteAtomic(filename: string, content: string): Promise<boolean> {
  const backoffMs = [200, 400, 800]
  for (let attempt = 0; attempt < backoffMs.length + 1; attempt++) {
    try {
      await window.api.writeNoteAtomic(filename, content)
      return true
    } catch (err) {
      if (attempt < backoffMs.length) {
        await new Promise((r) => setTimeout(r, backoffMs[attempt]))
      } else {
        console.error(`[fileIO] writeNoteAtomic("${filename}") failed after retries:`, err)
        return false
      }
    }
  }
  // unreachable — TypeScript requires an explicit return
  return false
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
