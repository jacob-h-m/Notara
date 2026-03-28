/**
 * src/components/SettingsModal.tsx
 * Tabbed settings modal panel.
 *
 * Tabs: General | Editor | Appearance | Advanced | About
 * All settings changes save immediately via the IPC bridge.
 */

import React from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AppState, AppSettings, EditorSettings } from '../types'
import { stemFilename } from '../utils/filenames'
import { DEFAULT_THEME_TOKENS } from '../hooks/useUI'
import { DEFAULT_KEYBINDINGS, useKeybindings, type ActionId } from '../hooks/useKeybindings'
import type { TagSummary } from '../hooks/useTags'
import logoSvg from '../../assets/logo.svg?url'

// ─── Types ────────────────────────────────────────────────────────────────────

type SettingsModalProps = {
  isOpen: boolean
  onClose: () => void
  state: AppState
  onStateChange: (patch: Partial<AppState>) => void
  /** Optional tab to open immediately (e.g. 'about' from Help menu). */
  initialTab?: string
  /** Full tag index from useTags, for the Tags management tab. */
  tagIndex?: TagSummary[]
  /** Callback to open a note and close the modal. */
  onOpenNote?: (filename: string) => void
  /**
   * Rename a tag globally across all notes that use it.
   * Called with (oldTag, newTag). Parent is responsible for updating files.
   */
  onRenameTag?: (oldTag: string, newTag: string) => Promise<void>
  /**
   * Remove a tag globally from all notes that have it.
   * Called with the tag name. Parent is responsible for updating files.
   */
  onDeleteTag?: (tag: string) => Promise<void>
}

type Tab =
  | 'general'
  | 'editor'
  | 'rendering'
  | 'appearance'
  | 'tags'
  | 'privacy'
  | 'export'
  | 'keybindings'
  | 'about'

const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'editor', label: 'Editor' },
  { id: 'rendering', label: 'Rendering' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'tags', label: 'Tags' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'export', label: 'Export / Import' },
  { id: 'keybindings', label: 'Keybindings' },
  { id: 'about', label: 'About' },
]

// ─── Helper: toggle row ───────────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2.5">
      <div>
        <p className="text-sm text-on-surface">{label}</p>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        className="switch"
        onMouseDown={(e: React.MouseEvent<HTMLButtonElement>) => {
          e.preventDefault()
          onChange(!checked)
        }}
        onKeyDown={(e: React.KeyboardEvent<HTMLButtonElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onChange(!checked)
          }
        }}
      />
    </label>
  )
}

function Divider() {
  return (
    <div
      className="my-1"
      style={{ borderTop: '1px solid var(--border-subtle)' } as React.CSSProperties}
    />
  )
}

const SECTION_STORAGE_KEY = 'notara:settings-sections'

function getSectionState(title: string, defaultOpen: boolean): boolean {
  try {
    const stored = localStorage.getItem(SECTION_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, boolean>
      if (typeof parsed[title] === 'boolean') return parsed[title]
    }
  } catch {}
  return defaultOpen
}

function setSectionState(title: string, open: boolean) {
  try {
    const stored = localStorage.getItem(SECTION_STORAGE_KEY)
    const parsed: Record<string, boolean> = stored ? JSON.parse(stored) : {}
    parsed[title] = open
    localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(parsed))
  } catch {}
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(() => getSectionState(title, defaultOpen))

  function toggle() {
    setOpen((o) => {
      setSectionState(title, !o)
      return !o
    })
  }

  return (
    <div className="mt-4 first:mt-0">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between py-0.5 mb-1 group"
      >
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted">{title}</h3>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted transition-transform duration-150"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' } as React.CSSProperties}
        >
          <polyline points="2,4 6,8 10,4" />
        </svg>
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}

// ─── Tab content panels ───────────────────────────────────────────────────────

function GeneralTab({
  settings,
  onSettings,
  onOpenNotes,
}: {
  settings: AppSettings
  onSettings: (patch: Partial<AppSettings>) => void
  onOpenNotes: () => void
}) {
  return (
    <div>
      <CollapsibleSection title="Notes">
        <div className="space-y-0.5">
          <label className="flex items-center justify-between py-2.5">
            <div>
              <p className="text-sm text-on-surface">New note format</p>
              <p className="mt-0.5 text-xs text-muted">File type used when creating a note</p>
            </div>
            <select
              value={settings.defaultNoteFormat}
              onChange={(e) => onSettings({ defaultNoteFormat: e.target.value as 'md' | 'txt' })}
              className="field text-xs"
            >
              <option value="md">Markdown (.md)</option>
              <option value="txt">Plain text (.txt)</option>
            </select>
          </label>
          <Divider />
          <label className="flex items-center justify-between py-2.5">
            <div>
              <p className="text-sm text-on-surface">Autosave speed</p>
              <p className="mt-0.5 text-xs text-muted">
                How quickly changes are saved automatically
              </p>
            </div>
            <select
              value={settings.autosaveDelay}
              onChange={(e) => onSettings({ autosaveDelay: Number(e.target.value) })}
              className="field text-xs"
            >
              <option value={0}>Off</option>
              <option value={500}>0.5 s</option>
              <option value={800}>0.8 s</option>
              <option value={1000}>1 s</option>
              <option value={2000}>2 s</option>
              <option value={5000}>5 s</option>
            </select>
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Storage">
        <div className="space-y-0.5">
          <div className="flex items-center justify-between py-2.5">
            <div>
              <p className="text-sm text-on-surface">Notes folder</p>
              <p className="mt-0.5 text-xs text-muted">
                Open the folder where your notes are stored
              </p>
            </div>
            <button onClick={onOpenNotes} className="btn btn-subtle text-xs px-3 py-1.5">
              Open folder
            </button>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Session">
        <div className="space-y-0.5">
          <ToggleRow
            label="Reopen last session"
            description="Restore open tabs on launch"
            checked={settings.reopenLastSession}
            onChange={(v) => onSettings({ reopenLastSession: v })}
          />
          <Divider />
          <ToggleRow
            label="Open last note on launch"
            checked={settings.openLastActiveNote}
            onChange={(v) => onSettings({ openLastActiveNote: v })}
          />
          <Divider />
          <ToggleRow
            label="Open dropped notes in new window"
            description="When dropping .md/.txt files into the app, open each in a dedicated window"
            checked={Boolean(settings.openDroppedNotesInNewWindow)}
            onChange={(v) => onSettings({ openDroppedNotesInNewWindow: v })}
          />
        </div>
      </CollapsibleSection>
    </div>
  )
}

function RenderingTab({
  settings,
  onSettings,
  gpuAvailable,
  restartRequired,
  onRestart,
}: {
  settings: AppSettings
  onSettings: (patch: Partial<AppSettings>) => void
  gpuAvailable: boolean | null
  restartRequired: boolean
  onRestart: () => void
}) {
  const gpuEnabled = settings.gpuAccelerationEnabled ?? true
  const noHardware = gpuAvailable === false
  return (
    <div>
      <CollapsibleSection title="Hardware Acceleration">
        <div className="space-y-0.5">
          <div className="flex items-center justify-between py-2.5">
            <div>
              <p className="text-sm text-on-surface">GPU acceleration</p>
              <p className="mt-0.5 text-xs text-muted">
                {noHardware
                  ? 'No hardware GPU detected — toggle is unavailable'
                  : 'Uses the GPU to accelerate rendering (requires restart)'}
              </p>
            </div>
            <button
              role="switch"
              aria-checked={gpuEnabled}
              onClick={() => !noHardware && onSettings({ gpuAccelerationEnabled: !gpuEnabled })}
              className="switch"
              disabled={noHardware}
              title={noHardware ? 'No hardware GPU detected' : undefined}
              style={
                (noHardware
                  ? { opacity: 0.4, cursor: 'not-allowed' }
                  : undefined) as unknown as React.CSSProperties
              }
            />
          </div>
          {restartRequired && !noHardware && (
            <div
              className="mt-2 flex items-center justify-between rounded-lg px-3 py-2"
              style={{ background: 'var(--accent-muted)' } as React.CSSProperties}
            >
              <p className="text-xs" style={{ color: 'var(--text-accent)' } as React.CSSProperties}>
                Restart required to apply change.
              </p>
              <button onClick={onRestart} className="btn btn-primary text-xs px-3 py-1">
                Restart now
              </button>
            </div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Accessibility">
        <div className="space-y-0.5">
          <ToggleRow
            label="Reduced motion"
            description="Disables animations — matches OS accessibility setting"
            checked={settings.reducedMotion}
            onChange={(v) => onSettings({ reducedMotion: v })}
          />
          <Divider />
          <ToggleRow
            label="High contrast mode"
            description="Increases contrast in UI controls and focus indicators"
            checked={Boolean(settings.highContrastMode)}
            onChange={(v) => onSettings({ highContrastMode: v })}
          />
        </div>
      </CollapsibleSection>
    </div>
  )
}

function EditorTab({
  editor,
  onEditor,
}: {
  editor: EditorSettings
  onEditor: (patch: Partial<EditorSettings>) => void
}) {
  return (
    <div>
      <CollapsibleSection title="Display">
        <div className="space-y-0.5">
          <label className="flex items-center justify-between py-2.5">
            <div>
              <p className="text-sm text-on-surface">Font size</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onEditor({ fontSize: Math.max(10, editor.fontSize - 1) })}
                className="btn btn-ghost h-6 w-6 justify-center text-xs"
              >
                −
              </button>
              <span className="w-8 text-center text-sm text-on-surface">{editor.fontSize}</span>
              <button
                onClick={() => onEditor({ fontSize: Math.min(24, editor.fontSize + 1) })}
                className="btn btn-ghost h-6 w-6 justify-center text-xs"
              >
                +
              </button>
            </div>
          </label>
          <Divider />
          <label className="flex items-center justify-between py-2.5">
            <div>
              <p className="text-sm text-on-surface">Indent size</p>
              <p className="mt-0.5 text-xs text-muted">Spaces per indentation level</p>
            </div>
            <select
              value={editor.tabWidth}
              onChange={(e) => onEditor({ tabWidth: Number(e.target.value) as 2 | 4 })}
              className="field text-xs"
            >
              <option value={2}>2 spaces</option>
              <option value={4}>4 spaces</option>
            </select>
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Features">
        <div className="space-y-0.5">
          <ToggleRow
            label="Word wrap"
            checked={editor.wordWrap}
            onChange={(v) => onEditor({ wordWrap: v })}
          />
          <Divider />
          <ToggleRow
            label="Line numbers"
            checked={editor.lineNumbers}
            onChange={(v) => onEditor({ lineNumbers: v })}
          />
          <Divider />
          <ToggleRow
            label="Word count"
            checked={editor.showWordCount}
            onChange={(v) => onEditor({ showWordCount: v })}
          />
          <Divider />
          <ToggleRow
            label="Show preview by default"
            checked={editor.previewEnabled}
            onChange={(v) => onEditor({ previewEnabled: v })}
          />
          <Divider />
          <ToggleRow
            label="Spellcheck"
            description="Show red underlines for misspelled words in the editor"
            checked={editor.spellcheck ?? true}
            onChange={(v) => onEditor({ spellcheck: v })}
          />
        </div>
      </CollapsibleSection>
    </div>
  )
}

function AppearanceTab({
  theme,
  onTheme,
}: {
  theme: 'dark' | 'light' | 'system'
  onTheme: (t: 'dark' | 'light' | 'system') => void
}) {
  const [manualTheme, setManualTheme] = useState<'dark' | 'light'>(
    theme === 'system' ? 'dark' : theme
  )
  const usingSystem = theme === 'system'
  useEffect(() => {
    if (theme !== 'system') setManualTheme(theme)
  }, [theme])

  type ThemeMode = 'dark' | 'light'

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [themePreviews, setThemePreviews] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)

  const resolvedSystem =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  const activeMode: ThemeMode = theme === 'system' ? resolvedSystem : theme

  function isSafeThemeValue(v: string): boolean {
    const s = v.trim()
    if (s === '' || /[\}\<]|\/\*/.test(s) || s.includes(';')) return false
    try {
      if (typeof CSS !== 'undefined') {
        return (
          CSS.supports('color', s) ||
          CSS.supports('background-color', s) ||
          CSS.supports('box-shadow', s) ||
          CSS.supports('border', `1px solid ${s}`)
        )
      }
    } catch {
      return true
    }
    return true
  }

  function validateThemeObject(
    raw: unknown,
    mode: ThemeMode
  ): { normalized: Record<string, string>; validCount: number } {
    const normalized: Record<string, string> = { ...DEFAULT_THEME_TOKENS[mode] }
    let validCount = 0
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      for (const [key, value] of Object.entries(raw)) {
        if (!key.startsWith('--') || typeof value !== 'string') continue
        if (!isSafeThemeValue(value)) continue
        normalized[key] = value.trim()
        validCount += 1
      }
    }
    return { normalized, validCount }
  }

  async function refreshThemePreviews() {
    try {
      const modeOf = (name: string): ThemeMode | null => {
        const l = name.toLowerCase()
        if (l.includes('dark')) return 'dark'
        if (l.includes('light')) return 'light'
        return null
      }
      const files = (await window.api.listThemes()).filter((n) => n.toLowerCase().endsWith('.json'))
      const previewMap: Record<string, string> = {}
      const reads = files.map(async (name) => ({ name, raw: await window.api.readTheme(name) }))
      for (const { name, raw } of await Promise.all(reads)) {
        const mode = modeOf(name)
        const asObj =
          raw && typeof raw === 'object' && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : null
        const bg =
          asObj && typeof asObj['--app-bg'] === 'string' ? (asObj['--app-bg'] as string) : null
        previewMap[name] = bg ?? DEFAULT_THEME_TOKENS[mode ?? 'dark']['--app-bg']
      }
      setThemePreviews(previewMap)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    void refreshThemePreviews()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function triggerImport() {
    setErrorMessage(null)
    setInfoMessage(null)
    fileInputRef.current?.click()
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setErrorMessage(null)
    setInfoMessage(null)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const { normalized, validCount } = validateThemeObject(parsed, activeMode)
      if (validCount === 0) {
        setErrorMessage('Import failed: no valid color tokens were found in this file.')
        return
      }
      await window.api.writeTheme(`${activeMode}.json`, normalized)
      window.dispatchEvent(new Event('notara:themes-changed'))
      await refreshThemePreviews()
      setInfoMessage('Theme imported successfully.')
    } catch (err) {
      console.error(err)
      setErrorMessage(
        'Import failed: the file could not be read. Make sure it is a valid JSON theme.'
      )
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const themes = [
    {
      id: 'dark',
      label: 'Dark',
      preview: themePreviews['dark.json'] ?? DEFAULT_THEME_TOKENS.dark['--app-bg'],
    },
    {
      id: 'light',
      label: 'Light',
      preview: themePreviews['light.json'] ?? DEFAULT_THEME_TOKENS.light['--app-bg'],
    },
  ]

  function handleSelectTheme(id: 'dark' | 'light') {
    setManualTheme(id)
    if (!usingSystem) onTheme(id)
  }

  function handleToggleSystem(v: boolean) {
    if (v) {
      onTheme('system')
    } else {
      onTheme(manualTheme)
    }
  }

  return (
    <div>
      <CollapsibleSection title="Theme">
        <ToggleRow
          label="Use system theme"
          description="Follow your OS light/dark setting"
          checked={usingSystem}
          onChange={handleToggleSystem}
        />
        <div className="grid grid-cols-2 gap-2 pt-1.5">
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => handleSelectTheme(t.id as 'dark' | 'light')}
              className="flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all"
              style={
                (!usingSystem && theme === t.id
                  ? {
                      borderColor: 'var(--accent)',
                      background: 'var(--accent-muted)',
                      boxShadow: '0 0 0 1px var(--accent)',
                    }
                  : {
                      borderColor: 'var(--border-subtle)',
                      background: 'var(--surface-elevated)',
                    }) as unknown as React.CSSProperties
              }
            >
              <div
                className="h-10 w-full rounded-lg border border-muted"
                style={{ background: t.preview } as React.CSSProperties}
              />
              <div className="flex w-full items-center justify-between">
                <span className="text-xs font-medium text-on-surface">{t.label}</span>
                {!usingSystem && theme === t.id && (
                  <span
                    className="text-[10px]"
                    style={{ color: 'var(--accent)' } as React.CSSProperties}
                  >
                    Active
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Custom Theme" defaultOpen={false}>
        <p className="pb-2 text-xs text-muted">
          Import a .json file to apply a custom color scheme to the {activeMode} theme.
        </p>
        <button
          onClick={triggerImport}
          className="btn btn-subtle text-sm px-4 py-2"
          disabled={busy}
        >
          {busy ? 'Importing…' : 'Import Theme…'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImportFile}
          className="hidden"
        />
        {errorMessage && (
          <div
            className="mt-2 rounded-md px-3 py-2 text-xs"
            style={
              {
                background: 'var(--destructive-muted)',
                color: 'var(--destructive)',
              } as React.CSSProperties
            }
          >
            {errorMessage}
          </div>
        )}
        {infoMessage && (
          <div
            className="mt-2 rounded-md px-3 py-2 text-xs"
            style={
              {
                background: 'var(--accent-muted)',
                color: 'var(--text-primary)',
              } as React.CSSProperties
            }
          >
            {infoMessage}
          </div>
        )}
      </CollapsibleSection>

      <ThemeEditorSection activeMode={activeMode} />
    </div>
  )
}

// ─── Theme Editor ─────────────────────────────────────────────────────────────

const EDITABLE_TOKENS: { key: string; label: string; group: string }[] = [
  { key: '--app-bg', label: 'App background', group: 'Backgrounds' },
  { key: '--sidebar-bg', label: 'Sidebar', group: 'Backgrounds' },
  { key: '--editor-bg', label: 'Editor', group: 'Backgrounds' },
  { key: '--modal-bg', label: 'Modal / panel', group: 'Backgrounds' },
  { key: '--surface-elevated', label: 'Elevated surface', group: 'Backgrounds' },
  { key: '--text-primary', label: 'Primary text', group: 'Text' },
  { key: '--text-muted', label: 'Muted text', group: 'Text' },
  { key: '--accent', label: 'Accent', group: 'Accent' },
  { key: '--accent-hover', label: 'Accent hover', group: 'Accent' },
  { key: '--selection-bg', label: 'Selection', group: 'Accent' },
  { key: '--border-subtle', label: 'Border', group: 'Borders' },
  { key: '--destructive', label: 'Destructive', group: 'States' },
]

function ThemeEditorSection({ activeMode }: { activeMode: 'dark' | 'light' }) {
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Load current live values from CSS variables
  React.useEffect(() => {
    const root = document.documentElement
    const map: Record<string, string> = {}
    for (const { key } of EDITABLE_TOKENS) {
      map[key] = getComputedStyle(root).getPropertyValue(key).trim()
    }
    setTokens(map)
  }, [activeMode])

  async function handleSave() {
    setSaving(true)
    try {
      const existing = (await window.api.readTheme(`${activeMode}.json`)) ?? {}
      await window.api.writeTheme(`${activeMode}.json`, { ...existing, ...tokens })
      window.dispatchEvent(new Event('notara:themes-changed'))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
    } finally {
      setSaving(false)
    }
  }

  function updateToken(key: string, value: string) {
    setTokens((prev) => ({ ...prev, [key]: value }))
    // Apply live to the page so the user sees the change immediately
    document.documentElement.style.setProperty(key, value)
  }

  // Group tokens
  const groups = Array.from(new Set(EDITABLE_TOKENS.map((t) => t.group)))

  return (
    <CollapsibleSection title="Theme Editor" defaultOpen={false}>
      <p className="pb-2 text-xs text-muted">
        Edit key color tokens for the current {activeMode} theme. Changes apply instantly — click
        Save to persist.
      </p>
      {groups.map((group) => (
        <div key={group} className="mb-3">
          <p
            className="mb-1 text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' } as React.CSSProperties}
          >
            {group}
          </p>
          {EDITABLE_TOKENS.filter((t) => t.group === group).map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between py-1.5">
              <span
                className="text-xs"
                style={{ color: 'var(--text-primary)' } as React.CSSProperties}
              >
                {label}
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={cssValueToHex(tokens[key] ?? '#000000')}
                  onChange={(e) => updateToken(key, e.target.value)}
                  className="h-6 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                  style={{ outline: 'none' } as React.CSSProperties}
                  title={key}
                />
                <input
                  type="text"
                  value={tokens[key] ?? ''}
                  onChange={(e) => updateToken(key, e.target.value)}
                  className="field w-32 text-xs py-1 px-2"
                  spellCheck={false}
                />
              </div>
            </div>
          ))}
        </div>
      ))}
      <button
        onClick={handleSave}
        disabled={saving}
        className="btn btn-primary text-xs px-4 py-1.5 mt-1"
      >
        {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save theme'}
      </button>
    </CollapsibleSection>
  )
}

/** Best-effort conversion of any CSS colour value to a hex string for the color picker. */
function cssValueToHex(value: string): string {
  const s = value.trim()
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) {
    // Expand 3-digit hex
    if (s.length === 4) return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]
    return s.slice(0, 7)
  }
  // rgba(r,g,b,a) → hex
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (m) {
    return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
  }
  return '#8b5cf6'
}

// ─── Privacy tab ─────────────────────────────────────────────────────────────

function PrivacyTab({
  settings,
  onSettings,
  onResetState,
}: {
  settings: AppSettings
  onSettings: (patch: Partial<AppSettings>) => void
  onResetState: () => void
}) {
  const [resetConfirm, setResetConfirm] = useState(false)
  return (
    <div>
      <CollapsibleSection title="Data & Storage">
        <div className="space-y-0.5">
          <ToggleRow
            label="Confirm before deleting a note"
            description="Show a confirmation dialog before permanently deleting"
            checked={settings.confirmBeforeDelete}
            onChange={(v) => onSettings({ confirmBeforeDelete: v })}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Reset" defaultOpen={false}>
        <div className="space-y-2 pt-1">
          {!resetConfirm ? (
            <button
              onClick={() => setResetConfirm(true)}
              className="btn btn-destructive w-full text-left text-sm py-2.5"
            >
              Reset app state…
            </button>
          ) : (
            <div
              className="rounded-lg border px-3 py-3"
              style={
                {
                  background: 'var(--destructive-muted)',
                  borderColor: 'var(--destructive)',
                } as React.CSSProperties
              }
            >
              <p
                className="mb-3 text-xs"
                style={{ color: 'var(--destructive)' } as React.CSSProperties}
              >
                Clears open tabs, pinned notes, and settings. Notes on disk are not affected.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    onResetState()
                    setResetConfirm(false)
                  }}
                  className="btn btn-destructive flex-1 text-xs py-1.5"
                >
                  Confirm reset
                </button>
                <button
                  onClick={() => setResetConfirm(false)}
                  className="btn btn-subtle flex-1 text-xs py-1.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Privacy Statement" defaultOpen={false}>
        <p
          className="pt-1 text-xs leading-relaxed"
          style={{ color: 'var(--text-muted)' } as React.CSSProperties}
        >
          Notara is entirely local. No data is ever sent to any server. Notes, settings, and themes
          are stored only on your device. There is no telemetry, no analytics, and no account
          required.
        </p>
      </CollapsibleSection>
    </div>
  )
}

// ─── Export / Import tab ──────────────────────────────────────────────────────

function ExportTab({
  state,
  onImport,
  onClearRecent,
  onOpenNotes,
  onOpenData,
}: {
  state: { settings: AppSettings; editor: EditorSettings; theme: string }
  onImport: (raw: unknown) => void
  onClearRecent: () => void
  onOpenNotes: () => void
  onOpenData: () => void
}) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  function exportSettings() {
    const json = JSON.stringify(state, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'notara-settings.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      onImport(parsed)
      setMsg({ type: 'ok', text: 'Settings imported successfully.' })
    } catch {
      setMsg({ type: 'err', text: 'Import failed: invalid JSON.' })
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
    setTimeout(() => setMsg(null), 4000)
  }

  return (
    <div>
      <CollapsibleSection title="Settings">
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-on-surface">Export settings</p>
              <p className="mt-0.5 text-xs text-muted">Save your settings as a JSON file</p>
            </div>
            <button onClick={exportSettings} className="btn btn-subtle text-xs px-3 py-1.5">
              Export…
            </button>
          </div>
          <Divider />
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-on-surface">Import settings</p>
              <p className="mt-0.5 text-xs text-muted">
                Load settings from a previously exported file
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-subtle text-xs px-3 py-1.5"
            >
              Import…
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            className="hidden"
          />
          {msg && (
            <div
              className="rounded-md px-3 py-2 text-xs"
              style={
                {
                  background:
                    msg.type === 'ok' ? 'var(--accent-muted)' : 'var(--destructive-muted)',
                  color: msg.type === 'ok' ? 'var(--text-primary)' : 'var(--destructive)',
                } as React.CSSProperties
              }
            >
              {msg.text}
            </div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Files & Folders">
        <div className="space-y-2 pt-1">
          <button onClick={onOpenNotes} className="btn btn-subtle w-full text-left text-sm py-2.5">
            Open notes folder
          </button>
          <button onClick={onOpenData} className="btn btn-subtle w-full text-left text-sm py-2.5">
            Open app data folder
          </button>
          <button
            onClick={onClearRecent}
            className="btn btn-subtle w-full text-left text-sm py-2.5"
          >
            Clear recent files list
          </button>
        </div>
      </CollapsibleSection>
    </div>
  )
}

// ─── Tags management tab ───────────────────────────────────────────────────────

function TagsTab({
  tagIndex,
  onOpenNote,
  onClose,
  onRenameTag,
  onDeleteTag,
}: {
  tagIndex: TagSummary[]
  onOpenNote?: (filename: string) => void
  onClose: () => void
  onRenameTag?: (oldTag: string, newTag: string) => Promise<void>
  onDeleteTag?: (tag: string) => Promise<void>
}) {
  const [search, setSearch] = useState('')
  const [expandedTag, setExpandedTag] = useState<string | null>(null)
  const [renamingTag, setRenamingTag] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const filtered = search.trim()
    ? tagIndex.filter((t) => t.tag.toLowerCase().includes(search.toLowerCase()))
    : tagIndex

  function startRename(tag: string) {
    setRenamingTag(tag)
    setRenameValue(tag)
    requestAnimationFrame(() => renameInputRef.current?.select())
  }

  async function commitRename(tag: string) {
    const newTag = renameValue.trim().toLowerCase().replace(/^#/, '')
    setRenamingTag(null)
    if (!newTag || newTag === tag) return
    if (!onRenameTag) return
    setPending(tag)
    try {
      await onRenameTag(tag, newTag)
    } finally {
      setPending(null)
    }
  }

  async function handleDelete(tag: string) {
    if (!onDeleteTag) return
    setPending(tag)
    try {
      await onDeleteTag(tag)
    } finally {
      setPending(null)
    }
  }

  return (
    <div>
      <CollapsibleSection title="All Tags">
        <p className="mb-3 text-xs text-muted">
          Tags come from frontmatter (<code className="font-mono">tags: [a, b]</code>) and{' '}
          <code className="font-mono">#hashtags</code> in note text. Click a tag to expand its note
          list. Rename or delete tags globally here.
        </p>
        {tagIndex.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted">
            No tags found. Add tags to notes using the tag bar or #hashtags.
          </p>
        ) : (
          <>
            {/* Search filter */}
            <div
              className="mb-3 flex items-center gap-1.5 field"
              style={{ padding: '0.25rem 0.5rem' } as React.CSSProperties}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden="true"
                className="shrink-0 text-muted"
              >
                <circle cx="5" cy="5" r="3.2" stroke="currentColor" strokeWidth="1.2" />
                <path
                  d="M7.6 7.6l3 3"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tags…"
                className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                style={{ color: 'var(--text-primary)' } as React.CSSProperties}
                aria-label="Search tags"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="btn-icon shrink-0"
                  aria-label="Clear search"
                >
                  <svg
                    width="9"
                    height="9"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden
                  >
                    <line x1="2" y1="2" x2="10" y2="10" />
                    <line x1="10" y1="2" x2="2" y2="10" />
                  </svg>
                </button>
              )}
            </div>

            {filtered.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted">No tags match "{search}".</p>
            ) : (
              <div className="space-y-0.5" role="list" aria-label="Tag list">
                {filtered.map(({ tag, count, notes }) => (
                  <div key={tag} role="listitem">
                    {/* Tag row */}
                    <div className="group flex w-full items-center gap-1 rounded-lg px-3 py-1.5 transition-colors hover:bg-surface-800">
                      {renamingTag === tag ? (
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void commitRename(tag)
                            else if (e.key === 'Escape') setRenamingTag(null)
                          }}
                          onBlur={() => void commitRename(tag)}
                          className="field flex-1 py-0.5 px-1 text-xs font-mono"
                          style={{ color: 'var(--accent)' }}
                        />
                      ) : (
                        <button
                          onClick={() => setExpandedTag(expandedTag === tag ? null : tag)}
                          className="flex flex-1 items-center gap-2 text-left"
                          aria-expanded={expandedTag === tag}
                          disabled={pending === tag}
                        >
                          <span
                            className="font-mono text-[12.5px]"
                            style={{ color: 'var(--accent)', opacity: pending === tag ? 0.5 : 1 }}
                          >
                            #{tag}
                          </span>
                          <span className="tabular-nums text-xs text-muted">
                            {count} {count === 1 ? 'note' : 'notes'}
                          </span>
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 12 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-muted transition-transform duration-150"
                            style={
                              {
                                transform: expandedTag === tag ? 'rotate(90deg)' : 'rotate(0deg)',
                              } as React.CSSProperties
                            }
                            aria-hidden
                          >
                            <polyline points="4,2 8,6 4,10" />
                          </svg>
                        </button>
                      )}
                      {/* Rename / delete actions */}
                      {renamingTag !== tag && (
                        <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          {onRenameTag && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                startRename(tag)
                              }}
                              title={`Rename #${tag}`}
                              className="btn-icon h-5 w-5"
                              disabled={pending === tag}
                            >
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 14 14"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden
                              >
                                <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z" />
                              </svg>
                            </button>
                          )}
                          {onDeleteTag && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                void handleDelete(tag)
                              }}
                              title={`Delete #${tag} from all notes`}
                              className="btn-icon h-5 w-5 hover:text-destructive"
                              disabled={pending === tag}
                            >
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 14 14"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden
                              >
                                <polyline points="2,4 12,4" />
                                <path d="M5 4V2h4v2" />
                                <rect x="3" y="4" width="8" height="8" rx="1" />
                              </svg>
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Expanded: list of notes with this tag */}
                    {expandedTag === tag && (
                      <div
                        className="ml-4 mt-0.5 space-y-0.5 pb-1"
                        role="list"
                        aria-label={`Notes tagged #${tag}`}
                      >
                        {notes.map((noteFilename) => (
                          <button
                            key={noteFilename}
                            role="listitem"
                            onClick={() => {
                              onOpenNote?.(noteFilename)
                              onClose()
                            }}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-muted transition-colors hover:bg-surface-800 hover:text-on-surface"
                            title={`Open ${noteFilename}`}
                          >
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden
                            >
                              <path d="M13 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V3a1 1 0 00-1-1z" />
                              <path d="M5 6h6M5 9h4" />
                            </svg>
                            <span className="truncate font-mono">{stemFilename(noteFilename)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CollapsibleSection>
    </div>
  )
}

function AboutTab() {
  const [version, setVersion] = useState('...')

  useEffect(() => {
    window.api
      .getAppVersion()
      .then(setVersion)
      .catch(() => setVersion('2.0.0'))
  }, [])

  function openLink(url: string) {
    window.api.openExternal(url).catch(console.error)
  }

  return (
    <div className="flex flex-col items-center py-4 text-center">
      <div
        className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={
          {
            background: 'var(--surface-elevated)',
            boxShadow: '0 0 0 1px var(--border-subtle)',
          } as React.CSSProperties
        }
      >
        <img src={logoSvg} alt="" className="h-8 w-8" />
      </div>
      <h2 className="text-lg font-semibold text-on-surface">Notara</h2>
      <p className="mt-1 text-xs text-muted">Version {version}</p>
      <p className="mt-4 text-sm text-muted">
        Created by{' '}
        <button
          onClick={() => openLink('https://jacobmollan.xyz')}
          className="underline underline-offset-2"
          style={{ color: 'var(--accent)' } as React.CSSProperties}
        >
          Jacob Mollan
        </button>
      </p>

      <div className="mt-6 flex flex-col gap-2 w-full max-w-[200px]">
        <button
          onClick={() => openLink('https://notara.jacobmollan.xyz')}
          className="btn btn-subtle text-sm px-4 py-2"
        >
          Product page ↗
        </button>
        <button
          onClick={() => openLink('https://github.com/jacob-h-m/Notara')}
          className="btn btn-subtle text-sm px-4 py-2"
        >
          GitHub ↗
        </button>
      </div>

      <p className="mt-8 text-[11px] text-muted">
        Local-only. No cloud. No accounts. No telemetry.
      </p>
    </div>
  )
}

// ─── Keybindings tab ────────────────────────────────────────────────────────

const GROUP_ORDER = ['File', 'Edit', 'View', 'Navigation', 'Markdown', 'Notes']

function KeybindingsTab() {
  const { keybindings, setKeybinding, resetKeybindings } = useKeybindings()
  const [capturing, setCapturing] = useState<ActionId | null>(null)
  const [capturedKey, setCapturedKey] = useState('')

  // Group actions by their group field
  const groups: Record<string, ActionId[]> = {}
  for (const [id, kb] of Object.entries(DEFAULT_KEYBINDINGS) as [
    ActionId,
    (typeof DEFAULT_KEYBINDINGS)[ActionId],
  ][]) {
    const g = kb.group ?? 'Other'
    if (!groups[g]) groups[g] = []
    groups[g].push(id)
  }

  function startCapture(id: ActionId) {
    setCapturing(id)
    setCapturedKey('')
  }

  function handleKeyDown(e: React.KeyboardEvent, id: ActionId) {
    e.preventDefault()
    e.stopPropagation()
    const parts: string[] = []
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
    if (e.shiftKey) parts.push('Shift')
    if (e.altKey) parts.push('Alt')
    const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
      parts.push(key)
      const combo = parts.join('+')
      setCapturedKey(combo)
      setKeybinding(id, combo)
      setCapturing(null)
    }
  }

  const orderedGroups = [
    ...GROUP_ORDER.filter((g) => groups[g]),
    ...Object.keys(groups).filter((g) => !GROUP_ORDER.includes(g)),
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted">
          Click a key binding to reassign it. Press a new key combination to apply.
        </p>
        <button onClick={resetKeybindings} className="btn btn-subtle text-xs px-3 py-1.5">
          Reset All
        </button>
      </div>
      {orderedGroups.map((group) => (
        <div key={group} className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted mb-1">
            {group}
          </p>
          <div className="space-y-0.5">
            {(groups[group] ?? []).map((id) => {
              const def = DEFAULT_KEYBINDINGS[id]
              const current = keybindings[id]?.key ?? def.key
              const isCapturing = capturing === id
              return (
                <div key={id} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-on-surface">{def.label}</span>
                  <button
                    className={`min-w-[120px] rounded px-2 py-1 text-xs font-mono border text-right transition-colors ${
                      isCapturing
                        ? 'border-accent bg-accent-muted text-accent'
                        : 'border-muted bg-surface-800 text-on-surface hover:border-accent'
                    }`}
                    style={
                      (isCapturing
                        ? { outline: '2px solid var(--accent)', outlineOffset: '1px' }
                        : {}) as unknown as React.CSSProperties
                    }
                    onClick={() => startCapture(id)}
                    onKeyDown={isCapturing ? (e) => handleKeyDown(e, id) : undefined}
                    onBlur={() => {
                      if (capturing === id) setCapturing(null)
                    }}
                  >
                    {isCapturing ? capturedKey || 'Press a key…' : current}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main modal ─────────────────────────────────────────────────────────────

export default function SettingsModal({
  isOpen,
  onClose,
  state,
  onStateChange,
  initialTab,
  tagIndex = [],
  onOpenNote,
  onRenameTag,
  onDeleteTag,
}: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>((initialTab as Tab) ?? 'general')
  const modalRef = React.useRef<HTMLDivElement | null>(null)
  const previouslyFocused = React.useRef<Element | null>(null)

  const [gpuAvailable, setGpuAvailable] = useState<boolean | null>(null)

  // Local copies to reduce re-renders and batch updates for performance
  const [localSettings, setLocalSettings] = useState(state.settings)
  const [localEditor, setLocalEditor] = useState(state.editor)
  const [localTheme, setLocalTheme] = useState(state.theme)
  const commitTimer = useRef<number | null>(null)
  const lastInteractionWasMouse = useRef(false)
  // Ref always holds latest values so the debounced commit avoids stale closures
  const latestLocalRef = useRef({ settings: localSettings, editor: localEditor, theme: localTheme })

  useEffect(() => {
    setLocalSettings(state.settings)
    setLocalEditor(state.editor)
    setLocalTheme(state.theme)
  }, [state.settings, state.editor, state.theme])

  // Keep ref in sync after every render (useLayoutEffect to satisfy react-hooks/refs)
  useLayoutEffect(() => {
    latestLocalRef.current = { settings: localSettings, editor: localEditor, theme: localTheme }
  })

  useEffect(() => {
    let mounted = true
    try {
      window.api
        .getGpuStatus()
        .then((res) => {
          if (!mounted) return
          setGpuAvailable(Boolean(res?.hasHardwareAcceleration))
        })
        .catch(() => setGpuAvailable(false))
    } catch {
      setGpuAvailable(false)
    }
    return () => {
      mounted = false
    }
  }, [])

  function scheduleCommit() {
    try {
      if (commitTimer.current) window.clearTimeout(commitTimer.current)
    } catch {}
    commitTimer.current = window.setTimeout(() => {
      try {
        const { settings, editor, theme } = latestLocalRef.current
        onStateChange({ settings, editor, theme })
      } catch {}
      // If the last interaction was a mouse, blur the active element to avoid
      // persistent focus outlines that feel like the modal is sluggish.
      try {
        if (lastInteractionWasMouse.current) {
          try {
            ;(document.activeElement as HTMLElement)?.blur()
          } catch {}
          lastInteractionWasMouse.current = false
        }
      } catch {}
      commitTimer.current = null
    }, 180)
  }

  function patchEditor(patch: Partial<EditorSettings>) {
    setLocalEditor((prev) => ({ ...prev, ...patch }))
    scheduleCommit()
  }

  function patchSettings(patch: Partial<AppSettings>) {
    setLocalSettings((prev) => ({ ...prev, ...patch }))
    scheduleCommit()
  }

  function handleClearRecent() {
    setLocalSettings((prev) => ({ ...prev, recentFiles: [] }))
    scheduleCommit()
  }

  function handleImportSettings(raw: unknown) {
    if (typeof raw !== 'object' || !raw) return
    const r = raw as Record<string, unknown>
    if (r.settings && typeof r.settings === 'object')
      patchSettings(r.settings as Partial<AppSettings>)
    if (r.editor && typeof r.editor === 'object') patchEditor(r.editor as Partial<EditorSettings>)
    if (r.theme && (r.theme === 'dark' || r.theme === 'light' || r.theme === 'system')) {
      setLocalTheme(r.theme)
      scheduleCommit()
    }
  }

  async function handleResetState() {
    try {
      onStateChange({
        activeTab: null,
        openTabs: [],
        pinnedNotes: [],
        recentFiles: [],
        sidebarCollapsed: false,
      })
    } catch {}
  }

  React.useEffect(() => {
    if (!isOpen) return
    previouslyFocused.current = document.activeElement
    // Focus the modal container for keyboard handling
    setTimeout(() => {
      modalRef.current?.focus()
    }, 0)

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
      if (e.key === 'Tab') {
        // Simple focus trap: cycle focus within the modal
        const root = modalRef.current
        if (!root) return
        const foc = Array.from(
          root.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        )
        if (foc.length === 0) return
        const idx = foc.indexOf(document.activeElement as HTMLElement)
        if (e.shiftKey) {
          if (idx <= 0) {
            foc[foc.length - 1].focus()
            e.preventDefault()
          }
        } else {
          if (idx === -1 || idx === foc.length - 1) {
            foc[0].focus()
            e.preventDefault()
          }
        }
      }
    }

    // Mouse/key interaction tracking to avoid mouse-driven focus outlines
    function onMouseDown() {
      lastInteractionWasMouse.current = true
    }
    function onAnyKey() {
      lastInteractionWasMouse.current = false
    }
    function onFocusIn(e: FocusEvent) {
      try {
        if (!lastInteractionWasMouse.current) return
        const target = e.target as HTMLElement | null
        if (!target) return
        const tag = (target.tagName || '').toUpperCase()
        if (tag === 'BUTTON' || tag === 'A') {
          try {
            ;(target as HTMLElement).blur()
          } catch {}
        }
      } catch {}
      lastInteractionWasMouse.current = false
    }

    document.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('keydown', onAnyKey, true)
    document.addEventListener('focusin', onFocusIn, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      try {
        ;(previouslyFocused.current as HTMLElement | null)?.focus?.()
      } catch {}
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('keydown', onAnyKey, true)
      document.removeEventListener('focusin', onFocusIn, true)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 backdrop-backdrop" />

      {/* Modal card */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className="settings-modal modal-card relative flex h-[580px] w-[720px] overflow-hidden rounded-2xl shadow-2xl"
      >
        {/* Left tab column */}
        <nav className="settings-nav flex w-40 shrink-0 flex-col py-4" aria-label="Settings">
          <p className="settings-nav-title" aria-hidden="true">
            Settings
          </p>
          <div role="tablist" aria-label="Settings" className="flex flex-col">
            {TABS.map((tabItem) => (
              <button
                key={tabItem.id}
                role="tab"
                id={`settings-tab-${tabItem.id}`}
                aria-controls={`settings-panel-${tabItem.id}`}
                aria-selected={tab === tabItem.id}
                onClick={() => setTab(tabItem.id)}
                onMouseDown={(e) => e.preventDefault()}
                className={`settings-tab px-4 py-2 text-left text-sm transition-colors`}
                data-active={tab === tabItem.id}
              >
                {tabItem.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="settings-header flex items-center justify-between px-6 py-4">
            <h2
              id="settings-modal-title"
              className="settings-header-title text-base font-semibold text-on-surface"
            >
              {TABS.find((tb) => tb.id === tab)?.label ?? ''}
            </h2>
            <button
              onClick={onClose}
              className="btn-icon settings-close p-1"
              aria-label="Close settings"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              >
                <line x1="2" y1="2" x2="12" y2="12" />
                <line x1="12" y1="2" x2="2" y2="12" />
              </svg>
            </button>
          </div>

          {/* Scrollable content */}
          <div
            className="settings-content flex-1 overflow-y-auto px-6 py-4"
            role="tabpanel"
            id={`settings-panel-${tab}`}
            aria-labelledby={`settings-tab-${tab}`}
          >
            {tab === 'general' && (
              <GeneralTab
                settings={localSettings}
                onSettings={patchSettings}
                onOpenNotes={() => window.api.openNotesFolder().catch(console.error)}
              />
            )}
            {tab === 'editor' && <EditorTab editor={localEditor} onEditor={patchEditor} />}
            {tab === 'rendering' && (
              <RenderingTab
                settings={localSettings}
                onSettings={patchSettings}
                gpuAvailable={gpuAvailable}
                restartRequired={
                  (localSettings.gpuAccelerationEnabled ?? true) !==
                  (state.settings.gpuAccelerationEnabled ?? true)
                }
                onRestart={async () => {
                  try {
                    await window.api.restartApp()
                  } catch (e) {
                    console.error(e)
                  }
                }}
              />
            )}
            {tab === 'appearance' && (
              <AppearanceTab
                theme={localTheme}
                onTheme={(t) => {
                  setLocalTheme(t)
                  latestLocalRef.current = { ...latestLocalRef.current, theme: t }
                  onStateChange({
                    settings: latestLocalRef.current.settings,
                    editor: latestLocalRef.current.editor,
                    theme: t,
                  })
                }}
              />
            )}
            {tab === 'privacy' && (
              <PrivacyTab
                settings={localSettings}
                onSettings={patchSettings}
                onResetState={handleResetState}
              />
            )}
            {tab === 'export' && (
              <ExportTab
                state={{ settings: localSettings, editor: localEditor, theme: localTheme }}
                onImport={handleImportSettings}
                onClearRecent={handleClearRecent}
                onOpenNotes={() => window.api.openNotesFolder().catch(console.error)}
                onOpenData={() => window.api.openAppDataFolder().catch(console.error)}
              />
            )}
            {tab === 'tags' && (
              <TagsTab
                tagIndex={tagIndex}
                onOpenNote={onOpenNote}
                onClose={onClose}
                onRenameTag={onRenameTag}
                onDeleteTag={onDeleteTag}
              />
            )}
            {tab === 'about' && <AboutTab />}
            {tab === 'keybindings' && <KeybindingsTab />}
          </div>
        </div>
      </div>
    </div>
  )
}
