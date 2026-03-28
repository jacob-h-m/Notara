/**
 * tests/unit/findReplacePanel.test.ts
 * Unit tests for the pure helper functions exported by FindReplacePanel.
 */
import { describe, expect, it } from 'vitest'
import { countMatches, replaceAll, replaceFirst } from '../../src/components/FindReplacePanel'

describe('countMatches', () => {
  it('counts matches case-insensitively', () => {
    expect(countMatches('Alpha beta ALPHA alpha', 'alpha')).toBe(3)
  })

  it('returns 0 for no matches', () => {
    expect(countMatches('hello world', 'xyz')).toBe(0)
  })

  it('returns 0 for empty query', () => {
    expect(countMatches('hello world', '')).toBe(0)
  })

  it('returns 0 for empty content', () => {
    expect(countMatches('', 'hello')).toBe(0)
  })

  it('counts overlapping-style matches independently (non-overlapping regex)', () => {
    // 'aa' in 'aaaa' matches at positions 0 and 2 (non-overlapping): 2 matches
    expect(countMatches('aaaa', 'aa')).toBe(2)
  })

  it('counts matches across newlines', () => {
    expect(countMatches('word\nword\nword', 'word')).toBe(3)
  })

  it('handles query with regex special characters literally', () => {
    // '.' should match literal dot, not any character
    expect(countMatches('a.b c.d e_f', '.')).toBe(2)
  })
})

describe('replaceFirst', () => {
  it('replaces only the first match', () => {
    expect(replaceFirst('alpha beta alpha', 'alpha', 'omega')).toBe('omega beta alpha')
  })

  it('is case-insensitive', () => {
    expect(replaceFirst('Alpha beta ALPHA', 'alpha', 'omega')).toBe('omega beta ALPHA')
  })

  it('returns content unchanged when query has no match', () => {
    expect(replaceFirst('hello world', 'xyz', 'abc')).toBe('hello world')
  })

  it('returns content unchanged for empty query', () => {
    expect(replaceFirst('hello', '', 'x')).toBe('hello')
  })

  it('handles regex special characters in query literally', () => {
    expect(replaceFirst('price: $10.00', '$10.00', '$20.00')).toBe('price: $20.00')
  })

  it('replaces with empty string (deletion)', () => {
    expect(replaceFirst('remove me please', 'remove me ', '')).toBe('please')
  })
})

describe('replaceAll', () => {
  it('replaces all occurrences', () => {
    expect(replaceAll('alpha beta alpha', 'alpha', 'omega')).toBe('omega beta omega')
  })

  it('is case-insensitive and replaces all case variants', () => {
    expect(replaceAll('Alpha ALPHA alpha', 'alpha', 'omega')).toBe('omega omega omega')
  })

  it('returns content unchanged when query has no match', () => {
    expect(replaceAll('hello world', 'xyz', 'abc')).toBe('hello world')
  })

  it('returns content unchanged for empty query', () => {
    expect(replaceAll('hello', '', 'x')).toBe('hello')
  })

  it('replaces across multiple lines', () => {
    expect(replaceAll('foo\nfoo\nfoo', 'foo', 'bar')).toBe('bar\nbar\nbar')
  })

  it('handles regex special characters in query literally', () => {
    expect(replaceAll('(a) and (a)', '(a)', '[a]')).toBe('[a] and [a]')
  })

  it('replaces with empty string (bulk deletion)', () => {
    expect(replaceAll('x1 x2 x3', 'x', '')).toBe('1 2 3')
  })
})
