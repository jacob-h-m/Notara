/**
 * src/utils/filenames.ts
 * Helpers for sanitising and generating safe filenames for notes.
 */

const FORBIDDEN = /[\\/\?%*:|"<>]/g

/** Ensure a user-provided string is a safe filename (bare name). */
export function sanitizeUserFilename(input: string, defaultExt = 'md'): string {
  if (!input || typeof input !== 'string') {
    return `note-${Date.now()}.${defaultExt}`
  }
  let s = input.trim()
  // If user pasted a path, take basename-like part
  s = s.replace(/.*[\\/]/, '')
  // Remove forbidden chars and traversal
  s = s.replace(FORBIDDEN, '')
  s = s.replace(/\.\./g, '')
  // If empty after sanitisation, fall back
  if (!s) return `note-${Date.now()}.${defaultExt}`
  // Ensure extension
  if (!/\.(md|txt)$/i.test(s)) s = `${s}.${defaultExt}`
  // Truncate long names
  if (s.length > 200) s = s.slice(0, 200)
  return s
}

/** Given a desired filename and a list of existing filenames, return a unique filename. */
export function ensureUniqueFilename(desired: string, existing: string[]): string {
  if (!existing.includes(desired)) return desired
  const extMatch = desired.match(/(\.md|\.txt)$/i)
  const base = extMatch ? desired.slice(0, -extMatch[0].length) : desired
  const ext = extMatch ? extMatch[0] : '.md'
  for (let i = 1; i < 1000; i++) {
    const candidate = `${base}-${i}${ext}`
    if (!existing.includes(candidate)) return candidate
  }
  // Fallback to timestamp
  return `${base}-${Date.now()}${ext}`
}
