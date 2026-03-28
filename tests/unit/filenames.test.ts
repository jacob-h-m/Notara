/**
 * tests/unit/filenames.test.ts
 * Unit tests for src/utils/filenames.ts
 *
 * Covers:
 *   - stemFilename      — strip .md / .txt extension
 *   - sanitizeUserFilename — turn user input into a safe filename
 *   - ensureUniqueFilename — collision-free naming
 */
import { describe, it, expect } from 'vitest'
import { stemFilename, sanitizeUserFilename, ensureUniqueFilename } from '../../src/utils/filenames'

// ── stemFilename ─────────────────────────────────────────────────────────────

describe('stemFilename', () => {
  it('strips .md extension', () => {
    expect(stemFilename('my-note.md')).toBe('my-note')
  })

  it('strips .txt extension', () => {
    expect(stemFilename('my-note.txt')).toBe('my-note')
  })

  it('is case-insensitive for the extension', () => {
    expect(stemFilename('Note.MD')).toBe('Note')
    expect(stemFilename('Note.TXT')).toBe('Note')
  })

  it('returns the input unchanged when there is no recognized extension', () => {
    expect(stemFilename('note')).toBe('note')
    expect(stemFilename('note.pdf')).toBe('note.pdf')
    expect(stemFilename('note.markdown')).toBe('note.markdown')
  })

  it('handles empty string', () => {
    expect(stemFilename('')).toBe('')
  })

  it('does not strip extension from middle of name', () => {
    // "my.md.note" should not strip — only trailing extension counts
    expect(stemFilename('my.md.note')).toBe('my.md.note')
  })

  it('strips only the trailing extension, not a mid-name .md', () => {
    expect(stemFilename('my.md.md')).toBe('my.md')
  })
})

// ── sanitizeUserFilename ─────────────────────────────────────────────────────

describe('sanitizeUserFilename', () => {
  it('returns input with .md extension for a plain safe name', () => {
    expect(sanitizeUserFilename('my note')).toBe('my note.md')
  })

  it('preserves an existing .md extension', () => {
    expect(sanitizeUserFilename('my note.md')).toBe('my note.md')
  })

  it('preserves an existing .txt extension', () => {
    expect(sanitizeUserFilename('my note.txt')).toBe('my note.txt')
  })

  it('strips forbidden characters', () => {
    const result = sanitizeUserFilename('bad*file:name?.md')
    expect(result).not.toMatch(/[*:?]/)
    expect(result.endsWith('.md')).toBe(true)
  })

  it('strips path traversal sequences', () => {
    const result = sanitizeUserFilename('../../../etc/passwd.md')
    expect(result).not.toContain('..')
    expect(result).not.toContain('/')
  })

  it('extracts basename when given a full path (Windows separator)', () => {
    const result = sanitizeUserFilename('C:\\Users\\notes\\my note.md')
    expect(result).toBe('my note.md')
  })

  it('extracts basename when given a full path (POSIX separator)', () => {
    const result = sanitizeUserFilename('/home/user/notes/my note.md')
    expect(result).toBe('my note.md')
  })

  it('falls back to a timestamped name for empty input', () => {
    const result = sanitizeUserFilename('')
    expect(result).toMatch(/^note-\d+\.md$/)
  })

  it('falls back to a timestamped name for non-string input', () => {
    // @ts-expect-error — intentional bad input test
    const result = sanitizeUserFilename(null)
    expect(result).toMatch(/^note-\d+\.md$/)
  })

  it('falls back when input becomes empty after sanitization (only forbidden chars)', () => {
    const result = sanitizeUserFilename('***???:::')
    expect(result).toMatch(/^note-\d+\.md$/)
  })

  it('truncates names longer than 200 characters', () => {
    const long = 'a'.repeat(250)
    const result = sanitizeUserFilename(long)
    expect(result.length).toBeLessThanOrEqual(200)
  })

  it('uses custom default extension when provided', () => {
    const result = sanitizeUserFilename('my note', 'txt')
    expect(result.endsWith('.txt')).toBe(true)
  })

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeUserFilename('  trimmed  ')).toBe('trimmed.md')
  })
})

// ── ensureUniqueFilename ─────────────────────────────────────────────────────

describe('ensureUniqueFilename', () => {
  it('returns the desired filename when there is no collision', () => {
    expect(ensureUniqueFilename('new-note.md', ['other.md'])).toBe('new-note.md')
  })

  it('returns the desired filename when existing list is empty', () => {
    expect(ensureUniqueFilename('note.md', [])).toBe('note.md')
  })

  it('appends -2 suffix on first collision for non-Untitled names', () => {
    expect(ensureUniqueFilename('note.md', ['note.md'])).toBe('note-2.md')
  })

  it('increments suffix until unique for non-Untitled names', () => {
    const existing = ['note.md', 'note-2.md', 'note-3.md']
    expect(ensureUniqueFilename('note.md', existing)).toBe('note-4.md')
  })

  it('uses space separator for "Untitled" names', () => {
    expect(ensureUniqueFilename('Untitled.md', ['Untitled.md'])).toBe('Untitled 2.md')
  })

  it('increments space-separated suffix for Untitled names', () => {
    const existing = ['Untitled.md', 'Untitled 2.md']
    expect(ensureUniqueFilename('Untitled.md', existing)).toBe('Untitled 3.md')
  })

  it('preserves .txt extension in the suffixed name', () => {
    expect(ensureUniqueFilename('note.txt', ['note.txt'])).toBe('note-2.txt')
  })

  it('collision check is case-sensitive (no false positive)', () => {
    // 'Note.md' and 'note.md' are different filenames
    expect(ensureUniqueFilename('Note.md', ['note.md'])).toBe('Note.md')
  })

  it('does not modify unrelated entries in the existing list', () => {
    const existing = ['a.md', 'b.md', 'note.md']
    const result = ensureUniqueFilename('note.md', existing)
    expect(result).toBe('note-2.md')
    // Original array is untouched
    expect(existing).toEqual(['a.md', 'b.md', 'note.md'])
  })
})
