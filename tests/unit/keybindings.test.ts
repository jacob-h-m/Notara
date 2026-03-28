import { describe, expect, it } from 'vitest'
import {
  keyboardEventToShortcut,
  matchesKeybinding,
  normalizeShortcutString,
} from '../../src/hooks/useKeybindings'

describe('keybinding helpers', () => {
  it('normalizes shortcut aliases and ordering', () => {
    expect(normalizeShortcutString('Shift+cmd+f')).toBe('Ctrl+Shift+F')
    expect(normalizeShortcutString('alt+ctrl+k')).toBe('Ctrl+Alt+K')
  })

  it('converts keyboard events to canonical shortcuts', () => {
    const event = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, shiftKey: true })
    expect(keyboardEventToShortcut(event)).toBe('Ctrl+Shift+F')
  })

  it('matches equivalent keybinding strings', () => {
    const event = new KeyboardEvent('keydown', { key: 'h', metaKey: true })
    expect(matchesKeybinding(event, 'Ctrl+H')).toBe(true)
  })
})
