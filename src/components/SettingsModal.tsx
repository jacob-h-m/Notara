/**
 * src/components/SettingsModal.tsx
 * Tabbed settings modal panel.
 *
 * Tabs: General | Editor | Appearance | Advanced | About
 * All settings changes save immediately via the IPC bridge.
 */

import React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { AppState, AppSettings, EditorSettings } from '../types'
import { DEFAULT_THEME_TOKENS } from '../hooks/useUI'

// ─── Types ────────────────────────────────────────────────────────────────────

type SettingsModalProps = {
  isOpen: boolean
  onClose: () => void
  state: AppState
  onStateChange: (patch: Partial<AppState>) => void
  /** Optional tab to open immediately (e.g. 'about' from Help menu). */
  initialTab?: string
}

type Tab = 'general' | 'editor' | 'appearance' | 'advanced' | 'about'

const TABS: { id: Tab; label: string }[] = [
  { id: 'general',    label: 'General' },
  { id: 'editor',     label: 'Editor' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'advanced',   label: 'Advanced' },
  { id: 'about',      label: 'About' },
]

// ─── Helper: toggle row ───────────────────────────────────────────────────────

function ToggleRow({
  label, description, checked, onChange,
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
        onClick={() => onChange(!checked)}
        className="switch"
      />
    </label>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1 mt-5 text-[11px] font-semibold uppercase tracking-widest text-muted first:mt-0">
      {children}
    </h3>
  )
}

function Divider() {
  return <div className="my-1" style={{ borderTop: '1px solid var(--border-subtle)' }} />
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
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mt-4 first:mt-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between py-0.5 mb-1 group"
      >
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          {title}
        </h3>
        <svg
          width="12" height="12" viewBox="0 0 12 12"
          fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round"
          className="text-muted transition-transform duration-150"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
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
  settings, editor, onSettings, onEditor,
}: {
  settings: AppSettings
  editor: EditorSettings
  onSettings: (patch: Partial<AppSettings>) => void
  onEditor: (patch: Partial<EditorSettings>) => void
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
              onChange={e => onSettings({ defaultNoteFormat: e.target.value as 'md' | 'txt' })}
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
              <p className="mt-0.5 text-xs text-muted">How quickly changes are saved automatically</p>
            </div>
            <select
              value={settings.autosaveDelay}
              onChange={e => onSettings({ autosaveDelay: Number(e.target.value) })}
              className="field text-xs"
            >
              <option value={400}>Fast</option>
              <option value={800}>Normal</option>
              <option value={1500}>Slow</option>
              <option value={3000}>Very slow</option>
            </select>
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Session">
        <div className="space-y-0.5">
          <ToggleRow
            label="Reopen last session"
            description="Restore open tabs on launch"
            checked={settings.reopenLastSession}
            onChange={v => onSettings({ reopenLastSession: v })}
          />
          <Divider />
          <ToggleRow
            label="Open last note on launch"
            checked={settings.openLastActiveNote}
            onChange={v => onSettings({ openLastActiveNote: v })}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Behaviour">
        <div className="space-y-0.5">
          <ToggleRow
            label="Confirm before deleting a note"
            checked={settings.confirmBeforeDelete}
            onChange={v => onSettings({ confirmBeforeDelete: v })}
          />
        </div>
      </CollapsibleSection>
    </div>
  )
}

function EditorTab({
  editor, onEditor,
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
              >−</button>
              <span className="w-8 text-center text-sm text-on-surface">{editor.fontSize}</span>
              <button
                onClick={() => onEditor({ fontSize: Math.min(24, editor.fontSize + 1) })}
                className="btn btn-ghost h-6 w-6 justify-center text-xs"
              >+</button>
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
              onChange={e => onEditor({ tabWidth: Number(e.target.value) as 2 | 4 })}
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
          <ToggleRow label="Word wrap" checked={editor.wordWrap} onChange={v => onEditor({ wordWrap: v })} />
          <Divider />
          <ToggleRow label="Line numbers" checked={editor.lineNumbers} onChange={v => onEditor({ lineNumbers: v })} />
          <Divider />
          <ToggleRow label="Word count" checked={editor.showWordCount} onChange={v => onEditor({ showWordCount: v })} />
          <Divider />
          <ToggleRow
            label="Show preview by default"
            checked={editor.previewEnabled}
            onChange={v => onEditor({ previewEnabled: v })}
          />
        </div>
      </CollapsibleSection>
    </div>
  )
}

function AppearanceTab({
  theme, reducedMotion, onTheme, onReducedMotion,
}: {
  theme: 'dark' | 'light' | 'system'
  reducedMotion: boolean
  onTheme: (t: 'dark' | 'light' | 'system') => void
  onReducedMotion: (v: boolean) => void
}) {
  const [manualTheme, setManualTheme] = useState<'dark'|'light'>(theme === 'system' ? 'dark' : theme)
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

  const resolvedSystem = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
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
    } catch { return true }
    return true
  }

  function validateThemeObject(raw: unknown, mode: ThemeMode): { normalized: Record<string, string>; validCount: number } {
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
      const files = (await window.api.listThemes()).filter(n => n.toLowerCase().endsWith('.json'))
      const previewMap: Record<string, string> = {}
      const reads = files.map(async name => ({ name, raw: await window.api.readTheme(name) }))
      for (const { name, raw } of await Promise.all(reads)) {
        const mode = modeOf(name)
        const asObj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null
        const bg = asObj && typeof asObj['--app-bg'] === 'string' ? asObj['--app-bg'] as string : null
        previewMap[name] = bg ?? DEFAULT_THEME_TOKENS[mode ?? 'dark']['--app-bg']
      }
      setThemePreviews(previewMap)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => { void refreshThemePreviews() }, [])

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
      setErrorMessage('Import failed: the file could not be read. Make sure it is a valid JSON theme.')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const themes = [
    { id: 'dark',  label: 'Dark',  preview: themePreviews['dark.json']  ?? DEFAULT_THEME_TOKENS.dark['--app-bg'] },
    { id: 'light', label: 'Light', preview: themePreviews['light.json'] ?? DEFAULT_THEME_TOKENS.light['--app-bg'] },
  ]

  function handleSelectTheme(id: 'dark'|'light') {
    setManualTheme(id)
    if (!usingSystem) onTheme(id)
  }

  function handleToggleSystem(v: boolean) {
    if (v) { onTheme('system') } else { onTheme(manualTheme) }
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
          {themes.map(t => (
            <button
              key={t.id}
              onClick={() => handleSelectTheme(t.id as 'dark'|'light')}
              className="flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all"
              style={(!usingSystem && theme === t.id)
                ? { borderColor: 'var(--accent)', background: 'var(--accent-muted)', boxShadow: '0 0 0 1px var(--accent)' }
                : { borderColor: 'var(--border-subtle)', background: 'var(--surface-elevated)' }
              }
            >
              <div className="h-10 w-full rounded-lg border border-muted" style={{ background: t.preview }} />
              <div className="flex w-full items-center justify-between">
                <span className="text-xs font-medium text-on-surface">{t.label}</span>
              {(!usingSystem && theme === t.id) && (
                <span className="text-[10px]" style={{ color: 'var(--accent)' }}>Active</span>
              )}
            </div>
          </button>
        ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Motion">
        <ToggleRow
          label="Reduce motion"
          description="Minimise animations and transitions"
          checked={reducedMotion}
          onChange={onReducedMotion}
        />
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
          <div className="mt-2 rounded-md px-3 py-2 text-xs" style={{ background: 'var(--destructive-muted)', color: 'var(--destructive)' }}>
            {errorMessage}
          </div>
        )}
        {infoMessage && (
          <div className="mt-2 rounded-md px-3 py-2 text-xs" style={{ background: 'var(--accent-muted)', color: 'var(--text-primary)' }}>
            {infoMessage}
          </div>
        )}
      </CollapsibleSection>
    </div>
  )
}

function AdvancedTab({ onClearRecent, onResetState, onOpenNotes, onOpenData }: {
  onClearRecent: () => void
  onResetState: () => void
  onOpenNotes: () => void
  onOpenData: () => void
}) {
  const [resetConfirm, setResetConfirm] = useState(false)

  return (
    <div>
      <CollapsibleSection title="Data">
        <div className="space-y-2 pt-1">
          <button
            onClick={onClearRecent}
            className="btn btn-subtle w-full text-left text-sm py-2.5"
          >
            Clear recent files
          </button>
          <button
            onClick={onOpenNotes}
            className="btn btn-subtle w-full text-left text-sm py-2.5"
          >
            Open notes folder
          </button>
          <button
            onClick={onOpenData}
            className="btn btn-subtle w-full text-left text-sm py-2.5"
          >
            Open app data folder
          </button>
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
            <div className="rounded-lg border px-3 py-3" style={{ background: 'var(--destructive-muted)', borderColor: 'var(--destructive)' }}>
              <p className="mb-3 text-xs" style={{ color: 'var(--destructive)' }}>
                This will clear session data (open tabs, pinned notes, settings). Notes on disk are not affected.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { onResetState(); setResetConfirm(false) }}
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
    </div>
  )
}

function AboutTab() {
  const [version, setVersion] = useState('...')

  useEffect(() => {
    window.api.getAppVersion().then(setVersion).catch(() => setVersion('2.0.0'))
  }, [])

  function openLink(url: string) {
    window.api.openExternal(url).catch(console.error)
  }

  return (
    <div className="flex flex-col items-center py-4 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'var(--surface-elevated)', boxShadow: '0 0 0 1px var(--border-subtle)' }}>
        <img src="/assets/logo.svg" alt="" className="h-8 w-8" />
      </div>
      <h2 className="text-lg font-semibold text-on-surface">Notara</h2>
      <p className="mt-1 text-xs text-muted">Version {version}</p>
      <p className="mt-4 text-sm text-muted">
        Created by{' '}
        <button
          onClick={() => openLink('https://jacobmollan.xyz')}
          className="underline underline-offset-2"
          style={{ color: 'var(--accent)' }}
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

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function SettingsModal({ isOpen, onClose, state, onStateChange, initialTab }: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>((initialTab as Tab) ?? 'general')
  const modalRef = React.useRef<HTMLDivElement | null>(null)
  const previouslyFocused = React.useRef<Element | null>(null)

  function patchEditor(patch: Partial<EditorSettings>) {
    onStateChange({ editor: { ...state.editor, ...patch } })
  }

  function patchSettings(patch: Partial<AppSettings>) {
    onStateChange({ settings: { ...state.settings, ...patch } })
  }

  function handleClearRecent() {
    onStateChange({ recentFiles: [] })
  }

  async function handleResetState() {
    onStateChange({
      activeTab: null,
      openTabs: [],
      pinnedNotes: [],
      recentFiles: [],
      sidebarCollapsed: false,
    })
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
        const foc = Array.from(root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ))
        if (foc.length === 0) return
        const idx = foc.indexOf(document.activeElement as HTMLElement)
        if (e.shiftKey) {
          if (idx <= 0) { foc[foc.length - 1].focus(); e.preventDefault() }
        } else {
          if (idx === -1 || idx === foc.length - 1) { foc[0].focus(); e.preventDefault() }
        }
      }
    }

    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      // restore focus
      try { (previouslyFocused.current as HTMLElement | null)?.focus?.() } catch {}
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 backdrop-backdrop" />

      {/* Modal card */}
      <div ref={modalRef} tabIndex={-1} className="settings-modal modal-card relative flex h-[540px] w-[680px] overflow-hidden rounded-2xl shadow-2xl">

        {/* Left tab column */}
        <nav className="settings-nav flex w-40 shrink-0 flex-col py-4">
          <p className="settings-nav-title">Settings</p>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`settings-tab px-4 py-2 text-left text-sm transition-colors`}
              data-active={tab === t.id}
              aria-current={tab === t.id ? 'true' : undefined}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="settings-header flex items-center justify-between px-6 py-4">
            <h2 className="settings-header-title text-base font-semibold text-on-surface">
              {TABS.find(t => t.id === tab)?.label}
            </h2>
            <button
              onClick={onClose}
              className="btn-icon settings-close p-1"
              aria-label="Close settings"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" />
              </svg>
            </button>
          </div>

          {/* Scrollable content */}
          <div className="settings-content flex-1 overflow-y-auto px-6 py-4">
            {tab === 'general' && (
              <GeneralTab
                settings={state.settings}
                editor={state.editor}
                onSettings={patchSettings}
                onEditor={patchEditor}
              />
            )}
            {tab === 'editor' && (
              <EditorTab
                editor={state.editor}
                onEditor={patchEditor}
              />
            )}
            {tab === 'appearance' && (
              <AppearanceTab
                theme={state.theme}
                reducedMotion={state.settings.reducedMotion}
                onTheme={t => onStateChange({ theme: t })}
                onReducedMotion={v => patchSettings({ reducedMotion: v })}
              />
            )}
            {tab === 'advanced' && (
              <AdvancedTab
                onClearRecent={handleClearRecent}
                onResetState={handleResetState}
                onOpenNotes={() => window.api.openNotesFolder().catch(console.error)}
                onOpenData={() => window.api.openAppDataFolder().catch(console.error)}
              />
            )}
            {tab === 'about' && <AboutTab />}
          </div>
        </div>
      </div>
    </div>
  )
}
