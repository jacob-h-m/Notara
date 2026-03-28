/**
 * tests/unit/useFTSIndex.test.ts
 * Unit tests for the bigram full-text search index.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFTSIndex } from '../../src/hooks/useFTSIndex'

describe('useFTSIndex', () => {
  it('returns empty results when index is empty', () => {
    const { result } = renderHook(() => useFTSIndex())
    expect(result.current.search('hello')).toEqual([])
  })

  it('finds a note after indexing', () => {
    const { result } = renderHook(() => useFTSIndex())
    act(() => {
      result.current.indexNote('note-a.md', 'Hello world, this is a test')
    })
    const hits = result.current.search('hello')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].filename).toBe('note-a.md')
  })

  it('bulk indexes multiple notes', () => {
    const { result } = renderHook(() => useFTSIndex())
    act(() => {
      result.current.bulkIndex([
        { filename: 'alpha.md', content: 'Alpha content about cats' },
        { filename: 'beta.md', content: 'Beta content about dogs' },
      ])
    })
    const catHits = result.current.search('cats')
    const dogHits = result.current.search('dogs')
    expect(catHits[0].filename).toBe('alpha.md')
    expect(dogHits[0].filename).toBe('beta.md')
  })

  it('returns snippet containing the matched term', () => {
    const { result } = renderHook(() => useFTSIndex())
    act(() => {
      result.current.indexNote('note-b.md', 'The quick brown fox jumps over the lazy dog')
    })
    const hits = result.current.search('quick')
    expect(hits[0].snippet).toMatch(/quick/i)
  })

  it('limits results to at most 20', () => {
    const { result } = renderHook(() => useFTSIndex())
    const entries = Array.from({ length: 30 }, (_, i) => ({
      filename: `note-${i}.md`,
      content: 'common search term here',
    }))
    act(() => {
      result.current.bulkIndex(entries)
    })
    const hits = result.current.search('common')
    expect(hits.length).toBeLessThanOrEqual(20)
  })

  it('updates index when a note is re-indexed', () => {
    const { result } = renderHook(() => useFTSIndex())
    act(() => {
      result.current.indexNote('note-c.md', 'original content')
    })
    expect(result.current.search('original')[0]?.filename).toBe('note-c.md')
    act(() => {
      result.current.indexNote('note-c.md', 'completely different')
    })
    expect(result.current.search('original')).toEqual([])
    expect(result.current.search('different')[0]?.filename).toBe('note-c.md')
  })

  it('returns empty for blank query', () => {
    const { result } = renderHook(() => useFTSIndex())
    act(() => {
      result.current.indexNote('note-d.md', 'something')
    })
    expect(result.current.search('')).toEqual([])
    expect(result.current.search('   ')).toEqual([])
  })

  it('removeNote removes a note from the index', () => {
    const { result } = renderHook(() => useFTSIndex())
    act(() => {
      result.current.indexNote('note-e.md', 'unique content xyz')
    })
    expect(result.current.search('unique').length).toBeGreaterThan(0)
    act(() => {
      result.current.removeNote('note-e.md')
    })
    expect(result.current.search('unique')).toEqual([])
  })
})
