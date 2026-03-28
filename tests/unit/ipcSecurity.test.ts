import { describe, expect, it } from 'vitest'
import {
  isAllowedExternalUrl,
  isTrustedRendererUrl,
  sanitizeBoolean,
  sanitizeFilenameInput,
  sanitizeIpcString,
  sanitizeNoteContent,
  sanitizeStatePayload,
  sanitizeStringArray,
  sanitizeThemeEntries,
  sanitizeVersionId,
  sanitizeWindowTitle,
  sanitizeWord,
  sanitizeZoomLevel,
} from '../../electron/ipcSecurity'

describe('ipcSecurity helpers', () => {
  it('accepts trusted renderer URLs', () => {
    expect(isTrustedRendererUrl('file:///index.html', true)).toBe(true)
    expect(isTrustedRendererUrl('http://localhost:5173', false)).toBe(true)
    expect(isTrustedRendererUrl('http://127.0.0.1:5173/?a=1', false)).toBe(true)
  })

  it('rejects untrusted renderer URLs', () => {
    expect(isTrustedRendererUrl('https://example.com', false)).toBe(false)
    expect(isTrustedRendererUrl('http://192.168.1.10:5173', false)).toBe(false)
    expect(isTrustedRendererUrl('', false)).toBe(false)
  })

  it('only allows safe external URLs', () => {
    expect(isAllowedExternalUrl('https://example.com/docs', true)).toBe(true)
    expect(isAllowedExternalUrl('http://localhost:3000/callback', false)).toBe(true)
    expect(isAllowedExternalUrl('http://example.com', true)).toBe(false)
    expect(isAllowedExternalUrl('javascript:alert(1)', false)).toBe(false)
  })

  it('sanitizes theme payload keys and values', () => {
    const safe = sanitizeThemeEntries({
      '--accent': '#8b5cf6',
      '--text-primary': ' #fff ',
      foo: 'bar',
      '--bad': 123,
    })

    expect(safe).toEqual({
      '--accent': '#8b5cf6',
      '--text-primary': '#fff',
    })
  })

  it('serializes valid state payload and rejects invalid payload', () => {
    const state = { theme: 'dark', editor: { fontSize: 14 } }
    expect(sanitizeStatePayload(state)).toContain('"theme": "dark"')
    expect(() => sanitizeStatePayload(null)).toThrow()
    expect(() => sanitizeStatePayload([])).toThrow()
  })

  it('validates and sanitizes core IPC primitives', () => {
    expect(sanitizeIpcString('  hello  ', { label: 'value' })).toBe('hello')
    expect(() => sanitizeIpcString('', { label: 'value' })).toThrow()

    expect(sanitizeFilenameInput('note.md', { allowedExtensions: ['.md'] })).toBe('note.md')
    expect(() => sanitizeFilenameInput('../bad.md')).toThrow()
    expect(() => sanitizeFilenameInput('bad.exe', { allowedExtensions: ['.md'] })).toThrow()

    expect(sanitizeNoteContent('x'.repeat(1024))).toContain('x')
    expect(() => sanitizeNoteContent(123)).toThrow()

    expect(sanitizeStringArray(['a', '  b  ', '', 'c'], { maxItems: 2 })).toEqual(['a', 'b'])
    expect(() => sanitizeStringArray('not-an-array')).toThrow()

    expect(sanitizeBoolean(true)).toBe(true)
    expect(() => sanitizeBoolean('true')).toThrow()
  })

  it('sanitizes title, zoom, words, and version IDs', () => {
    expect(sanitizeWindowTitle('  Notara  ')).toBe('Notara')
    expect(() => sanitizeWindowTitle('')).toThrow()

    expect(sanitizeZoomLevel(10)).toBe(5)
    expect(sanitizeZoomLevel(-10)).toBe(-5)
    expect(() => sanitizeZoomLevel(Number.NaN)).toThrow()

    expect(sanitizeWord('hello')).toBe('hello')
    expect(() => sanitizeWord('two words')).toThrow()

    expect(sanitizeVersionId('2026-03-23T10-00-00Z')).toBe('2026-03-23T10-00-00Z')
    expect(() => sanitizeVersionId('../oops')).toThrow()
  })
})
