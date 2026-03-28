/**
 * tests/unit/useTags.test.ts
 *
 * Tests for the useTags hook via its public interface.
 * parseTags is private, so we exercise it indirectly through the hook's
 * tagIndex output — which is what the rest of the app consumes.
 *
 * Covers:
 *   - Basic #tag extraction
 *   - Tags are normalized to lowercase
 *   - Tags deduplicated within a single note
 *   - Tags accumulate across multiple notes, counts are correct
 *   - Tag sorting: by count descending, then alphabetically
 *   - Edge cases: punctuation boundaries, numeric-only tags not parsed,
 *     tags at start of string, mid-sentence tags
 *   - Notes with no tags produce no index entries
 *   - getContent errors are handled gracefully
 */
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTags } from '../../src/hooks/useTags'

function buildIndex(notes: string[], contentMap: Record<string, string>) {
  const getContent = (f: string) => contentMap[f] ?? ''
  const { result } = renderHook(() => useTags(notes, getContent))
  return result.current.tagIndex
}

// ── basic parsing ─────────────────────────────────────────────────────────────

describe('tag parsing', () => {
  it('extracts a single #tag', () => {
    const index = buildIndex(['a.md'], { 'a.md': 'Hello #world' })
    expect(index.some((t) => t.tag === 'world')).toBe(true)
  })

  it('normalizes tags to lowercase', () => {
    const index = buildIndex(['a.md'], { 'a.md': '#React #TypeScript #RUST' })
    const tags = index.map((t) => t.tag)
    expect(tags).toContain('react')
    expect(tags).toContain('typescript')
    expect(tags).toContain('rust')
    // Should not contain mixed-case originals
    expect(tags).not.toContain('React')
    expect(tags).not.toContain('TypeScript')
  })

  it('deduplicates repeated tags within the same note', () => {
    const index = buildIndex(['a.md'], { 'a.md': '#todo first item #todo second item' })
    const todo = index.filter((t) => t.tag === 'todo')
    expect(todo.length).toBe(1)
    expect(todo[0].count).toBe(1) // appears in 1 note, not counted twice
  })

  it('parses tags that follow common punctuation boundaries', () => {
    const index = buildIndex(['a.md'], {
      'a.md': 'done,#work done;#home done.#life done!#urgent',
    })
    const tags = index.map((t) => t.tag)
    expect(tags).toContain('work')
    expect(tags).toContain('home')
    expect(tags).toContain('life')
    expect(tags).toContain('urgent')
  })

  it('parses a tag at the very start of content', () => {
    const index = buildIndex(['a.md'], { 'a.md': '#startoftag rest of content' })
    expect(index.some((t) => t.tag === 'startoftag')).toBe(true)
  })

  it('does not parse a tag that begins with a digit (must start with a letter)', () => {
    const index = buildIndex(['a.md'], { 'a.md': '#1invalid #2nope' })
    expect(index.every((t) => !/^\d/.test(t.tag))).toBe(true)
  })

  it('parses hyphenated and underscored tag names', () => {
    const index = buildIndex(['a.md'], { 'a.md': '#to-do #in_progress' })
    const tags = index.map((t) => t.tag)
    expect(tags).toContain('to-do')
    expect(tags).toContain('in_progress')
  })

  it('returns empty index for a note with no tags', () => {
    const index = buildIndex(['a.md'], { 'a.md': 'plain text, no hashtags here' })
    expect(index).toEqual([])
  })

  it('returns empty index for an empty vault', () => {
    const index = buildIndex([], {})
    expect(index).toEqual([])
  })
})

// ── cross-note aggregation ────────────────────────────────────────────────────

describe('cross-note tag aggregation', () => {
  it('counts how many notes use each tag', () => {
    const index = buildIndex(['a.md', 'b.md', 'c.md'], {
      'a.md': '#work planning',
      'b.md': '#work report',
      'c.md': '#personal diary',
    })
    const work = index.find((t) => t.tag === 'work')
    expect(work?.count).toBe(2)
    expect(work?.notes).toContain('a.md')
    expect(work?.notes).toContain('b.md')

    const personal = index.find((t) => t.tag === 'personal')
    expect(personal?.count).toBe(1)
    expect(personal?.notes).toContain('c.md')
  })

  it('includes the note filename in the notes list for that tag', () => {
    const index = buildIndex(['note.md'], { 'note.md': '#project' })
    const proj = index.find((t) => t.tag === 'project')
    expect(proj?.notes).toContain('note.md')
  })
})

// ── sorting ───────────────────────────────────────────────────────────────────

describe('tag index sorting', () => {
  it('sorts by count descending', () => {
    const index = buildIndex(['a.md', 'b.md', 'c.md'], {
      'a.md': '#common #rare',
      'b.md': '#common',
      'c.md': '#common',
    })
    expect(index[0].tag).toBe('common') // 3 notes
    expect(index[0].count).toBe(3)
  })

  it('sorts alphabetically when counts are equal', () => {
    const index = buildIndex(['a.md', 'b.md'], {
      'a.md': '#zebra #apple',
      'b.md': '#zebra #apple',
    })
    // Both have count 2 — alphabetical: apple before zebra
    expect(index[0].tag).toBe('apple')
    expect(index[1].tag).toBe('zebra')
  })
})

// ── error resilience ──────────────────────────────────────────────────────────

describe('error resilience', () => {
  it('handles getContent throwing for a note without crashing', () => {
    const notes = ['bad.md', 'good.md']
    const getContent = (f: string) => {
      if (f === 'bad.md') throw new Error('read error')
      return '#tag'
    }
    const { result } = renderHook(() => useTags(notes, getContent))
    const index = result.current.tagIndex
    // 'good.md' tag should still be indexed
    expect(index.some((t) => t.tag === 'tag')).toBe(true)
  })

  it('handles a note missing from contentMap (treated as empty)', () => {
    const index = buildIndex(['missing.md'], {})
    expect(index).toEqual([])
  })
})
