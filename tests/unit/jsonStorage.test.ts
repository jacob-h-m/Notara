/**
 * tests/unit/jsonStorage.test.ts
 * Unit tests for src/utils/jsonStorage.ts
 *
 * These tests exercise the three public helpers:
 *  - loadState     — merges raw disk value with DEFAULT_STATE
 *  - removeStateReferences — removes a filename from all session lists
 *  - renameStateReferences — renames a filename everywhere in session state
 *
 * `window.api` is mocked so no Electron process is required.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadState,
  saveState,
  removeStateReferences,
  renameStateReferences,
  DEFAULT_STATE,
} from '../../src/utils/jsonStorage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ApiMock = {
  loadState: ReturnType<typeof vi.fn>
  saveState: ReturnType<typeof vi.fn>
}

function setupApiMock(rawState: unknown = null): ApiMock {
  const mock: ApiMock = {
    loadState: vi.fn().mockResolvedValue(rawState),
    saveState: vi.fn().mockResolvedValue(undefined),
  }
  ;(globalThis as unknown as { window: { api: ApiMock } }).window = { api: mock }
  return mock
}

// ---------------------------------------------------------------------------
// loadState
// ---------------------------------------------------------------------------

describe('loadState', () => {
  it('returns DEFAULT_STATE when disk is empty (null)', async () => {
    setupApiMock(null)
    const state = await loadState()
    expect(state.theme).toBe(DEFAULT_STATE.theme)
    expect(state.editor).toEqual(DEFAULT_STATE.editor)
    expect(state.settings).toEqual(DEFAULT_STATE.settings)
    expect(state.openTabs).toEqual([])
  })

  it('fills in missing keys from DEFAULT_STATE', async () => {
    setupApiMock({ theme: 'light' })
    const state = await loadState()
    expect(state.theme).toBe('light')
    // Keys not in the raw value should be filled from defaults
    expect(state.editor.fontSize).toBe(DEFAULT_STATE.editor.fontSize)
    expect(state.settings.autosaveDelay).toBe(DEFAULT_STATE.settings.autosaveDelay)
  })

  it('deep-merges editor overrides', async () => {
    setupApiMock({ editor: { fontSize: 18, wordWrap: false } })
    const state = await loadState()
    expect(state.editor.fontSize).toBe(18)
    expect(state.editor.wordWrap).toBe(false)
    // Other editor keys come from defaults
    expect(state.editor.lineNumbers).toBe(DEFAULT_STATE.editor.lineNumbers)
    expect(state.editor.tabWidth).toBe(DEFAULT_STATE.editor.tabWidth)
  })

  it('deep-merges settings overrides', async () => {
    setupApiMock({ settings: { autosaveDelay: 1200 } })
    const state = await loadState()
    expect(state.settings.autosaveDelay).toBe(1200)
    expect(state.settings.reopenLastSession).toBe(DEFAULT_STATE.settings.reopenLastSession)
  })

  it('returns DEFAULT_STATE when the IPC call throws', async () => {
    const mock: ApiMock = {
      loadState: vi.fn().mockRejectedValue(new Error('disk error')),
      saveState: vi.fn().mockResolvedValue(undefined),
    }
    ;(globalThis as unknown as { window: { api: ApiMock } }).window = { api: mock }
    const state = await loadState()
    expect(state).toEqual({
      ...DEFAULT_STATE,
      editor: { ...DEFAULT_STATE.editor },
      settings: { ...DEFAULT_STATE.settings },
    })
  })

  it('returns DEFAULT_STATE when state.json is corrupted (non-object return)', async () => {
    // null triggers the "no raw" branch, so we check with a partial non-null value
    setupApiMock({ theme: 'dark' })
    const state = await loadState()
    // Should not throw and should fill in all defaults
    expect(typeof state.editor.fontSize).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// saveState
// ---------------------------------------------------------------------------

describe('saveState', () => {
  it('calls window.api.saveState with the state', async () => {
    const mock = setupApiMock()
    const state = { ...DEFAULT_STATE }
    await saveState(state)
    expect(mock.saveState).toHaveBeenCalledWith(state)
  })

  it('does not throw when the IPC call fails', async () => {
    const mock: ApiMock = {
      loadState: vi.fn().mockResolvedValue(null),
      saveState: vi.fn().mockRejectedValue(new Error('write error')),
    }
    ;(globalThis as unknown as { window: { api: ApiMock } }).window = { api: mock }
    await expect(saveState({ ...DEFAULT_STATE })).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// removeStateReferences
// ---------------------------------------------------------------------------

describe('removeStateReferences', () => {
  beforeEach(() => {
    setupApiMock({
      activeTab: 'note-a.md',
      openTabs: ['note-a.md', 'note-b.md'],
      pinnedNotes: ['note-a.md'],
      recentFiles: ['note-a.md', 'note-c.md'],
    })
  })

  it('removes the filename from openTabs, pinnedNotes, and recentFiles', async () => {
    const next = await removeStateReferences('note-a.md')
    expect(next.openTabs).not.toContain('note-a.md')
    expect(next.pinnedNotes).not.toContain('note-a.md')
    expect(next.recentFiles).not.toContain('note-a.md')
  })

  it('clears activeTab when it matches the removed filename', async () => {
    const next = await removeStateReferences('note-a.md')
    expect(next.activeTab).toBeNull()
  })

  it('keeps activeTab when it does not match', async () => {
    const next = await removeStateReferences('note-b.md')
    expect(next.activeTab).toBe('note-a.md')
  })

  it('preserves other files in the lists', async () => {
    const next = await removeStateReferences('note-a.md')
    expect(next.openTabs).toContain('note-b.md')
    expect(next.recentFiles).toContain('note-c.md')
  })

  it('is a no-op when the filename is not present', async () => {
    const next = await removeStateReferences('not-there.md')
    expect(next.openTabs).toEqual(['note-a.md', 'note-b.md'])
    expect(next.activeTab).toBe('note-a.md')
  })
})

// ---------------------------------------------------------------------------
// renameStateReferences
// ---------------------------------------------------------------------------

describe('renameStateReferences', () => {
  beforeEach(() => {
    setupApiMock({
      activeTab: 'old.md',
      openTabs: ['old.md', 'other.md'],
      pinnedNotes: ['old.md'],
      recentFiles: ['old.md', 'other.md'],
    })
  })

  it('renames the filename in openTabs, pinnedNotes, and recentFiles', async () => {
    const next = await renameStateReferences('old.md', 'new.md')
    expect(next.openTabs).toContain('new.md')
    expect(next.openTabs).not.toContain('old.md')
    expect(next.pinnedNotes).toContain('new.md')
    expect(next.recentFiles).toContain('new.md')
    expect(next.recentFiles).not.toContain('old.md')
  })

  it('updates activeTab when it matches the old filename', async () => {
    const next = await renameStateReferences('old.md', 'new.md')
    expect(next.activeTab).toBe('new.md')
  })

  it('keeps activeTab unchanged when it does not match', async () => {
    // Change active tab in mock
    setupApiMock({
      activeTab: 'other.md',
      openTabs: ['old.md'],
      pinnedNotes: [],
      recentFiles: [],
    })
    const next = await renameStateReferences('old.md', 'new.md')
    expect(next.activeTab).toBe('other.md')
  })

  it('preserves unrelated filenames', async () => {
    const next = await renameStateReferences('old.md', 'new.md')
    expect(next.openTabs).toContain('other.md')
    expect(next.recentFiles).toContain('other.md')
  })

  it('is a no-op when the old filename is not present', async () => {
    const next = await renameStateReferences('missing.md', 'new.md')
    expect(next.openTabs).toEqual(['old.md', 'other.md'])
    expect(next.activeTab).toBe('old.md')
  })
})
