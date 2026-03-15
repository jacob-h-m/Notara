/**
 * src/hooks/useUI.ts
 * UI-level state: theme, preview panel, and editor display settings.
 *
 * Reads initial values from state.json on mount.
 * Each setter persists the change immediately back to state.json by
 * loading the current full state, patching the relevant field, and saving.
 */

import { useState, useEffect } from 'react'
import { loadState, saveState } from '../utils/jsonStorage'

type ThemeMap = Record<string, string>

// ─── Default theme token sets (exported for SettingsModal) ───────────────────

export const DEFAULT_THEME_TOKENS = {
  dark: {
    "--app-bg":             "#05060a",
    "--titlebar-bg":        "#080b0f",
    "--sidebar-bg":         "#0b0e12",
    "--sidebar-rail-bg":    "#080b0f",
    "--editor-bg":          "#0d1117",
    "--preview-bg":         "#0b0e12",
    "--modal-bg":           "#10141a",
    "--surface-elevated":   "#1a1f26",
    "--text-primary":       "#e6eef8",
    "--text-muted":         "#8a9ab0",
    "--text-accent":        "#c4b5fd",
    "--border-subtle":      "rgba(255,255,255,0.07)",
    "--border-muted":       "rgba(255,255,255,0.04)",
    "--border-strong":      "rgba(255,255,255,0.14)",
    "--accent":             "#8b5cf6",
    "--accent-hover":       "#7c3aed",
    "--accent-muted":       "rgba(139,92,246,0.15)",
    "--btn-ghost-hover":    "rgba(255,255,255,0.06)",
    "--btn-ghost-active":   "rgba(255,255,255,0.10)",
    "--selection-bg":       "rgba(139,92,246,0.30)",
    "--editor-gutter-bg":   "#141820",
    "--editor-line-active": "rgba(255,255,255,0.035)",
    "--destructive":        "#f87171",
    "--destructive-muted":  "rgba(248,113,113,0.12)",
    "--hover-overlay":      "rgba(255,255,255,0.04)",
    "--hover-shadow":       "0 2px 8px rgba(0,0,0,0.4)",
    "--surface-950":        "#05060a",
    "--surface-900":        "#0b0f13",
    "--surface-800":        "#111318",
    "--surface-700":        "#1b1f23",
    "--surface-600":        "#263038",
    "--muted-border":       "rgba(255,255,255,0.08)",
    "--accent-violet":      "#8b5cf6",
    "--on-accent":          "#ffffff",
    "--switch-knob":        "#ffffff",
    /* New semantic tokens */
    "--editor-font":        "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Segoe UI Mono', monospace",
    "--ui-font":            "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    "--code-font":          "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Segoe UI Mono', monospace",
    "--panel-elevated":    "#121417",
    "--tab-bg":             "#0b0f13",
    "--tab-hover-bg":       "rgba(255,255,255,0.02)",
    "--tab-active-bg":      "#111318",
    "--tab-active-border":  "rgba(139,92,246,0.55)",
    "--input-focus-ring":   "rgba(139,92,246,0.18)",
    "--btn-hover-bg":       "rgba(255,255,255,0.03)",
    "--btn-active-bg":      "rgba(255,255,255,0.06)",
  } as ThemeMap,
  light: {
    "--app-bg":             "#f8fafc",
    "--titlebar-bg":        "#f1f5f9",
    "--sidebar-bg":         "#f1f5f9",
    "--sidebar-rail-bg":    "#e8edf3",
    "--editor-bg":          "#ffffff",
    "--preview-bg":         "#f8fafc",
    "--modal-bg":           "#ffffff",
    "--surface-elevated":   "#e2e8f0",
    "--text-primary":       "#0f172a",
    "--text-muted":         "#64748b",
    "--text-accent":        "#5b21b6",
    "--border-subtle":      "rgba(15,23,42,0.08)",
    "--border-muted":       "rgba(15,23,42,0.04)",
    "--border-strong":      "rgba(15,23,42,0.18)",
    "--accent":             "#6d28d9",
    "--accent-hover":       "#5b21b6",
    "--accent-muted":       "rgba(109,40,217,0.10)",
    "--btn-ghost-hover":    "rgba(15,23,42,0.06)",
    "--btn-ghost-active":   "rgba(15,23,42,0.10)",
    "--selection-bg":       "rgba(109,40,217,0.28)",
    "--editor-gutter-bg":   "#f0f2f5",
    "--editor-line-active": "rgba(15,23,42,0.04)",
    "--destructive":        "#dc2626",
    "--destructive-muted":  "rgba(220,38,38,0.10)",
    "--hover-overlay":      "rgba(15,23,42,0.04)",
    "--hover-shadow":       "0 2px 8px rgba(0,0,0,0.12)",
    "--surface-950":        "#f8fafc",
    "--surface-900":        "#f3f4f6",
    "--surface-800":        "#e6e9ee",
    "--surface-700":        "#d1d5db",
    "--surface-600":        "#9ca3af",
    "--muted-border":       "rgba(15,23,42,0.08)",
    "--accent-violet":      "#6d28d9",
    "--on-accent":          "#ffffff",
    "--switch-knob":        "#ffffff",
    /* New semantic tokens */
    "--ui-font":            "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    "--editor-font":        "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Segoe UI Mono', monospace",
    "--code-font":          "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Segoe UI Mono', monospace",
    "--panel-elevated":    "#ffffff",
    "--tab-bg":             "#f7f8fa",
    "--tab-hover-bg":       "rgba(0,0,0,0.04)",
    "--tab-active-bg":      "#ffffff",
    "--tab-active-border":  "rgba(109,40,217,0.30)",
    "--input-focus-ring":   "rgba(109,40,217,0.12)",
    "--btn-hover-bg":       "rgba(0,0,0,0.05)",
    "--btn-active-bg":      "rgba(0,0,0,0.09)",
  } as ThemeMap,
}

function isThemeMap(v: unknown): v is ThemeMap {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

type ThemeSanitizeResult = {
  merged: ThemeMap
  invalidEntries: number
}

function sanitizeThemeWithDefaults(raw: unknown, defaults: ThemeMap): ThemeSanitizeResult {
  const merged: ThemeMap = { ...defaults }
  let invalidEntries = 0

  if (!isThemeMap(raw)) {
    return { merged, invalidEntries }
  }

  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith('--')) {
      invalidEntries += 1
      continue
    }
    if (typeof value !== 'string') {
      invalidEntries += 1
      continue
    }
    const v = value.trim()
    // Basic safety checks: reject values that contain characters that can
    // break the generated CSS block or inject HTML (closing braces, comments,
    // or angle brackets). Also reject empty strings.
    if (v === '' || /[\}\<]|\/\*/.test(v) || v.includes(';')) {
      invalidEntries += 1
      continue
    }
    // Validate common CSS value types where possible. Use CSS.supports to
    // reject malformed tokens (colors, backgrounds, shadows). If the
    // environment doesn't expose CSS.supports (very old runtimes), fall
    // back to accepting the trimmed value.
    let accepted = true
    try {
      const supports = (prop: string, val: string) => (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') ? CSS.supports(prop, val) : true
      // Common heuristics: color-like tokens, background, box-shadow, or
      // border values. Accept if any of these properties accept the value.
      if (typeof CSS !== 'undefined') {
        accepted = (
          supports('color', v) ||
          supports('background-color', v) ||
          supports('box-shadow', v) ||
          supports('border', `1px solid ${v}`)
        )
      }
    } catch (err) {
      accepted = true
    }

    if (!accepted) {
      invalidEntries += 1
      continue
    }

    merged[key] = v
  }

  return { merged, invalidEntries }
}

/** Read computed CSS variables from the document to use as runtime defaults.
 *  Falls back to the provided DEFAULT_THEME_TOKENS when a variable is missing.
 */
function runtimeDefaults(mode: 'dark' | 'light'): ThemeMap {
  const base = DEFAULT_THEME_TOKENS[mode] || {}
  const out: ThemeMap = { ...base }
  try {
    const cs = getComputedStyle(document.documentElement)
    for (const k of Object.keys(base)) {
      const val = cs.getPropertyValue(k).trim()
      if (val) out[k] = val
    }
  } catch {
    // ignore — fallback to defaults
  }
  return out
}

async function loadThemeFilesAndApply() {
  // Read available theme files and generate a ruleset for each. This lets
  // the system support more than just dark/light while keeping the same
  // JSON-driven model. For unknown-named themes we fall back to dark tokens
  // as the baseline so UI remains consistent.
  try {
    const files = (await window.api.listThemes()) || []
    const themesMap: Record<string, ThemeMap> = {}
    const invalidCounts: Record<string, number> = {}

    // Read all theme files in parallel to reduce startup IO latency.
    const reads = files
      .filter((rawName: unknown): rawName is string => typeof rawName === 'string' && rawName.toLowerCase().endsWith('.json'))
      .map(async (rawName) => {
        const name = rawName.replace(/\.json$/i, '')
        const safeName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
        const baseline = safeName.includes('light') ? runtimeDefaults('light') : runtimeDefaults('dark')
        const raw = await window.api.readTheme(rawName)
        const res = sanitizeThemeWithDefaults(raw, baseline)
        return { safeName, res }
      })

    const results = await Promise.all(reads)
    for (const { safeName, res } of results) {
      themesMap[safeName] = res.merged
      invalidCounts[safeName] = res.invalidEntries
    }

    const totalInvalid = Object.values(invalidCounts).reduce((a, b) => a + b, 0)
    if (totalInvalid > 0) console.warn('[theme] Ignored invalid theme entries total:', totalInvalid, invalidCounts)

    applyThemeOverrides(themesMap)
  } catch (err) {
    console.warn('[theme] Could not load theme files:', err)
    // Fallback: ensure built-in dark/light tokens are applied so UI is usable
    applyThemeOverrides({ dark: DEFAULT_THEME_TOKENS.dark, light: DEFAULT_THEME_TOKENS.light })
  }
}
function applyThemeOverrides(themes: Record<string, ThemeMap>) {
  const parts: string[] = []
  for (const [name, map] of Object.entries(themes)) {
    // Sanitize attribute selector value
    const safe = String(name).replace(/[^a-z0-9_-]/g, '-')
    // Deterministic ordering for easier diffs and predictable overrides
    const rules = Object.keys(map).sort().map((k) => `${k}: ${map[k]};`).join('\n')
    parts.push(`[data-theme="${safe}"] {\n${rules}\n}`)
  }

  const id = 'notara-themes'
  let el = document.getElementById(id) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = id
    document.head.appendChild(el)
  }
  // Replace the whole block atomically to avoid half-applied states.
  el.textContent = parts.join('\n\n')
}

export function useUI() {
  const [theme, setThemeState]               = useState<'dark' | 'light' | 'system'>('dark')
  const [previewOpen, setPreviewOpen]        = useState(false)
  const [wordWrap, setWordWrapState]         = useState(true)
  const [lineNumbers, setLineNumbersState]   = useState(true)
  const [fontSize, setFontSizeState]         = useState(14)
  const [tabWidth, setTabWidthState]         = useState<2 | 4>(2)
  const [showWordCount, setShowWordCountState] = useState(false)

  // Hydrate from persisted state on mount
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const state = await loadState()
        if (!mounted) return
        setThemeState(state.theme)
        setPreviewOpen(state.editor.previewEnabled)
        setWordWrapState(state.editor.wordWrap)
        setLineNumbersState(state.editor.lineNumbers)
        setFontSizeState(state.editor.fontSize)
        setTabWidthState(state.editor.tabWidth)
        setShowWordCountState(state.editor.showWordCount)
      } catch (err) {
        console.warn('[useUI] failed loading state:', err)
      }

      // Load theme JSON files (dark.json, light.json) and apply overrides
      try {
        await loadThemeFilesAndApply()
      } catch (err) {
        console.warn('[useUI] loadThemeFilesAndApply failed:', err)
      }
    })()

    // Listen for explicit theme file updates from other UI (Settings)
    const handler = () => { void loadThemeFilesAndApply() }
    window.addEventListener('notara:themes-changed', handler)
    return () => { mounted = false; window.removeEventListener('notara:themes-changed', handler) }
  }, [])

  // Apply theme to the document via data-theme. Support 'system' which follows
  // the user's `prefers-color-scheme` media setting.
  useEffect(() => {
    let active = theme
    const apply = (resolved: 'dark' | 'light') => {
      document.documentElement.setAttribute('data-theme', resolved)
    }

    if (theme === 'system') {
      const m = window.matchMedia('(prefers-color-scheme: dark)')
      active = m.matches ? 'dark' : 'light'
      apply(active)
      const handler = (ev: MediaQueryListEvent) => apply(ev.matches ? 'dark' : 'light')
      // matchMedia.addEventListener is preferred but not available in older browsers
      if (m.addEventListener) m.addEventListener('change', handler)
      else m.addListener(handler)
      return () => {
        if (m.removeEventListener) m.removeEventListener('change', handler)
        else m.removeListener(handler)
      }
    }

    apply(active as 'dark' | 'light')
    return undefined
  }, [theme])

  // ── Shared helper ────────────────────────────────────────────────────────

  function persistEditor(patch: Partial<import('../types').EditorSettings>) {
    loadState()
      .then((state) => saveState({ ...state, editor: { ...state.editor, ...patch } }))
      .catch((err) => console.warn('[useUI] persist editor setting failed:', err))
  }

  // ── Toggles (quick-toggle buttons in sidebar/menu) ──────────────────────

  function togglePreview()       { setPreviewOpen((p) => { const n = !p; persistEditor({ previewEnabled: n }); return n }) }
  function toggleWordWrap()      { setWordWrapState((p) => { const n = !p; persistEditor({ wordWrap: n }); return n }) }
  function toggleLineNumbers()   { setLineNumbersState((p) => { const n = !p; persistEditor({ lineNumbers: n }); return n }) }
  function toggleShowWordCount() { setShowWordCountState((p) => { const n = !p; persistEditor({ showWordCount: n }); return n }) }

  // ── Direct setters (used by Settings modal for non-toggle changes) ────────

  function setTheme(t: 'dark' | 'light' | 'system') {
    setThemeState(t)
    loadState().then((state) => saveState({ ...state, theme: t })).catch(err => console.warn('[useUI] failed setting theme:', err))
  }

  function setWordWrap(v: boolean)      { setWordWrapState(v);       persistEditor({ wordWrap: v }) }
  function setLineNumbers(v: boolean)   { setLineNumbersState(v);    persistEditor({ lineNumbers: v }) }
  function setFontSize(value: number)   { setFontSizeState(value);   persistEditor({ fontSize: value }) }
  function setTabWidth(value: 2 | 4)    { setTabWidthState(value);   persistEditor({ tabWidth: value }) }
  function setShowWordCount(v: boolean) { setShowWordCountState(v);  persistEditor({ showWordCount: v }) }
  function setPreviewEnabled(v: boolean){ setPreviewOpen(v);         persistEditor({ previewEnabled: v }) }

  return {
    // Current values
    theme, previewOpen, wordWrap, lineNumbers, fontSize, tabWidth, showWordCount,
    // Toggles (flip current value + save)
    togglePreview, toggleWordWrap, toggleLineNumbers, toggleShowWordCount,
    // Direct setters (set explicit value + save)
    setTheme, setWordWrap, setLineNumbers, setFontSize, setTabWidth, setShowWordCount, setPreviewEnabled,
  }
}

