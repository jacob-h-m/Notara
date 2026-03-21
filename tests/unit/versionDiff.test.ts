/**
 * tests/unit/versionDiff.test.ts
 * Unit tests for the inline diff algorithm in VersionHistoryPanel.
 * Imports the real implementation so changes to the algorithm are caught here.
 */
import { describe, it, expect } from 'vitest'
import { computeLineDiff } from '../../src/components/VersionHistoryPanel'

describe('computeLineDiff', () => {
  it('returns all same for identical texts', () => {
    const diff = computeLineDiff('a\nb\nc', 'a\nb\nc')
    expect(diff.every((h) => h.type === 'same')).toBe(true)
    expect(diff.length).toBe(3)
  })

  it('marks added lines', () => {
    const diff = computeLineDiff('line1\nline2', 'line1\nnew line\nline2')
    const added = diff.filter((h) => h.type === 'added')
    expect(added.length).toBe(1)
    expect(added[0].line).toBe('new line')
  })

  it('marks removed lines', () => {
    const diff = computeLineDiff('line1\nremoved\nline2', 'line1\nline2')
    const removed = diff.filter((h) => h.type === 'removed')
    expect(removed.length).toBe(1)
    expect(removed[0].line).toBe('removed')
  })

  it('handles completely different texts', () => {
    const diff = computeLineDiff('foo\nbar', 'baz\nqux')
    expect(diff.some((h) => h.type === 'removed')).toBe(true)
    expect(diff.some((h) => h.type === 'added')).toBe(true)
  })

  it('handles empty old text: new lines appear as added', () => {
    const diff = computeLineDiff('', 'hello\nworld')
    const added = diff.filter((h) => h.type === 'added').map((h) => h.line)
    expect(added).toContain('hello')
    expect(added).toContain('world')
  })

  it('handles empty new text: old lines appear as removed', () => {
    const diff = computeLineDiff('hello\nworld', '')
    const removed = diff.filter((h) => h.type === 'removed').map((h) => h.line)
    expect(removed).toContain('hello')
    expect(removed).toContain('world')
  })

  it('preserves common prefix and suffix lines as same', () => {
    const diff = computeLineDiff('header\nold body\nfooter', 'header\nnew body\nfooter')
    const same = diff.filter((h) => h.type === 'same').map((h) => h.line)
    expect(same).toContain('header')
    expect(same).toContain('footer')
  })

  it('handles single-line old and new', () => {
    const diff = computeLineDiff('old', 'new')
    expect(diff.some((h) => h.type === 'removed' && h.line === 'old')).toBe(true)
    expect(diff.some((h) => h.type === 'added' && h.line === 'new')).toBe(true)
  })
})
