/**
 * tests/unit/useBacklinks.test.ts
 *
 * Tests for the useBacklinks hook via its public interface.
 * parseWikilinks and resolveWikilink are private, so we exercise them
 * indirectly through the hook's outgoing/incoming index output.
 *
 * Covers:
 *   - [[wikilink]] parsing (basic, multiple, whitespace-trimmed, over-length ignored)
 *   - Resolution: exact match, case-insensitive, stem-only (no extension)
 *   - Self-links excluded from outgoing
 *   - Duplicate incoming entries de-duplicated per source note
 *   - Unresolved links do not appear in outgoing or incoming
 *   - Empty vault and empty content edge cases
 */
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useBacklinks } from '../../src/hooks/useBacklinks'

// Helper: build outgoing/incoming for a small vault in one call
function buildIndex(notes: string[], contentMap: Record<string, string>) {
  const { result } = renderHook(() => useBacklinks(notes, contentMap))
  return result.current
}

// ── parseWikilinks (exercised via outgoing map) ───────────────────────────────

describe('wikilink parsing', () => {
  it('extracts a single [[wikilink]] and resolves to outgoing', () => {
    const notes = ['alpha.md', 'beta.md']
    const { outgoing } = buildIndex(notes, {
      'alpha.md': 'See also [[beta]]',
      'beta.md': '',
    })
    expect(outgoing.get('alpha.md')).toContain('beta.md')
  })

  it('extracts multiple [[wikilinks]] from the same note', () => {
    const notes = ['a.md', 'b.md', 'c.md']
    const { outgoing } = buildIndex(notes, {
      'a.md': '[[b]] and [[c]]',
      'b.md': '',
      'c.md': '',
    })
    expect(outgoing.get('a.md')).toContain('b.md')
    expect(outgoing.get('a.md')).toContain('c.md')
  })

  it('trims whitespace inside [[ ]] (e.g. [[ my note ]])', () => {
    const notes = ['my note.md', 'source.md']
    const { outgoing } = buildIndex(notes, {
      'source.md': '[[ my note ]]',
      'my note.md': '',
    })
    expect(outgoing.get('source.md')).toContain('my note.md')
  })

  it('ignores wikilinks longer than 200 characters', () => {
    const long = 'x'.repeat(201)
    const notes = ['source.md']
    const { outgoing } = buildIndex(notes, {
      'source.md': `[[${long}]]`,
    })
    expect(outgoing.get('source.md')).toEqual([])
  })

  it('returns empty outgoing for a note with no wikilinks', () => {
    const notes = ['a.md']
    const { outgoing } = buildIndex(notes, { 'a.md': 'Just plain text, no links.' })
    expect(outgoing.get('a.md')).toEqual([])
  })
})

// ── resolveWikilink (exercised via outgoing/incoming) ────────────────────────

describe('wikilink resolution', () => {
  it('resolves exact filename match (with extension)', () => {
    const notes = ['My Note.md', 'source.md']
    const { outgoing } = buildIndex(notes, {
      'source.md': '[[My Note.md]]',
      'My Note.md': '',
    })
    expect(outgoing.get('source.md')).toContain('My Note.md')
  })

  it('resolves case-insensitively (lowercase link → mixed-case file)', () => {
    const notes = ['My Note.md', 'source.md']
    const { outgoing } = buildIndex(notes, {
      'source.md': '[[my note.md]]',
      'My Note.md': '',
    })
    expect(outgoing.get('source.md')).toContain('My Note.md')
  })

  it('resolves stem-only link to .md file ([[My Note]] → My Note.md)', () => {
    const notes = ['My Note.md', 'source.md']
    const { outgoing } = buildIndex(notes, {
      'source.md': '[[My Note]]',
      'My Note.md': '',
    })
    expect(outgoing.get('source.md')).toContain('My Note.md')
  })

  it('resolves stem-only link to .txt file', () => {
    const notes = ['meeting.txt', 'source.md']
    const { outgoing } = buildIndex(notes, {
      'source.md': '[[meeting]]',
      'meeting.txt': '',
    })
    expect(outgoing.get('source.md')).toContain('meeting.txt')
  })

  it('does not resolve a link that matches no note', () => {
    const notes = ['a.md']
    const { outgoing } = buildIndex(notes, { 'a.md': '[[nonexistent]]' })
    expect(outgoing.get('a.md')).toEqual([])
  })

  it('does not include self-links in outgoing', () => {
    const notes = ['self.md']
    const { outgoing } = buildIndex(notes, { 'self.md': '[[self]]' })
    expect(outgoing.get('self.md')).toEqual([])
  })
})

// ── incoming backlinks ───────────────────────────────────────────────────────

describe('incoming backlinks index', () => {
  it('populates incoming for the target note', () => {
    const notes = ['target.md', 'source.md']
    const { incoming } = buildIndex(notes, {
      'source.md': '[[target]]',
      'target.md': '',
    })
    const entries = incoming.get('target.md') ?? []
    expect(entries.some((e) => e.filename === 'source.md')).toBe(true)
  })

  it('collects multiple distinct source notes as separate incoming entries', () => {
    const notes = ['target.md', 'a.md', 'b.md']
    const { incoming } = buildIndex(notes, {
      'a.md': '[[target]]',
      'b.md': '[[target]]',
      'target.md': '',
    })
    const sources = (incoming.get('target.md') ?? []).map((e) => e.filename)
    expect(sources).toContain('a.md')
    expect(sources).toContain('b.md')
  })

  it('does not duplicate the same source note in incoming when it links multiple times', () => {
    const notes = ['target.md', 'source.md']
    const { incoming } = buildIndex(notes, {
      'source.md': '[[target]] and again [[target.md]]',
      'target.md': '',
    })
    const entries = incoming.get('target.md') ?? []
    const fromSource = entries.filter((e) => e.filename === 'source.md')
    expect(fromSource.length).toBe(1)
  })

  it('every note gets an incoming entry even if nothing links to it', () => {
    const notes = ['alone.md']
    const { incoming } = buildIndex(notes, { 'alone.md': 'no links' })
    expect(incoming.has('alone.md')).toBe(true)
    expect(incoming.get('alone.md')).toEqual([])
  })

  it('unresolved links leave no incoming entry for missing note', () => {
    const notes = ['source.md']
    const { incoming } = buildIndex(notes, { 'source.md': '[[ghost]]' })
    expect(incoming.has('ghost.md')).toBe(false)
  })
})

// ── edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles empty vault (no notes)', () => {
    const { outgoing, incoming } = buildIndex([], {})
    expect(outgoing.size).toBe(0)
    expect(incoming.size).toBe(0)
  })

  it('handles a note missing from contentMap (treated as empty content)', () => {
    const notes = ['a.md', 'b.md']
    // 'a.md' has no entry in the content map
    const { outgoing } = buildIndex(notes, { 'b.md': '[[a]]' })
    expect(outgoing.get('a.md')).toEqual([])
  })

  it('deduplicates outgoing links when the same target appears multiple times', () => {
    const notes = ['a.md', 'b.md']
    const { outgoing } = buildIndex(notes, {
      'a.md': '[[b]] [[b.md]] [[B]]',
      'b.md': '',
    })
    // All three resolve to 'b.md' — should appear only once
    expect(outgoing.get('a.md')).toEqual(['b.md'])
  })
})
