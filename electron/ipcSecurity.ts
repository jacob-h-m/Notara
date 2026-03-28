/**
 * Shared IPC safety helpers used by Electron main handlers.
 */

const DEV_HOSTS = new Set(['localhost', '127.0.0.1'])
const MAX_STATE_BYTES = 1_000_000
const MAX_FILENAME_LENGTH = 180
const MAX_CONTENT_BYTES = 2_000_000

type StringOptions = {
  label?: string
  trim?: boolean
  minLength?: number
  maxLength?: number
}

function toByteLength(input: string): number {
  return Buffer.byteLength(input, 'utf-8')
}

export function sanitizeIpcString(value: unknown, options: StringOptions = {}): string {
  const { label = 'string value', trim = true, minLength = 1, maxLength = 4096 } = options

  if (typeof value !== 'string') {
    throw new Error(`Invalid ${label}`)
  }

  const out = trim ? value.trim() : value

  if (out.length < minLength || out.length > maxLength) {
    throw new Error(`Invalid ${label}`)
  }

  if (/\x00/.test(out)) {
    throw new Error(`Invalid ${label}`)
  }

  return out
}

export function sanitizeFilenameInput(
  value: unknown,
  options: { label?: string; allowedExtensions?: string[] } = {}
): string {
  const { label = 'filename', allowedExtensions = [] } = options
  const filename = sanitizeIpcString(value, {
    label,
    trim: true,
    minLength: 1,
    maxLength: MAX_FILENAME_LENGTH,
  })

  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error(`Invalid ${label}`)
  }

  if (/[<>:"|?*\x00-\x1f]/.test(filename)) {
    throw new Error(`Invalid ${label}`)
  }

  if (allowedExtensions.length > 0) {
    const dot = filename.lastIndexOf('.')
    if (dot >= 0) {
      const ext = filename.slice(dot).toLowerCase()
      const allowed = allowedExtensions.map((v) => v.toLowerCase())
      if (!allowed.includes(ext)) {
        throw new Error(`Invalid ${label}`)
      }
    }
  }

  return filename
}

export function sanitizeNoteContent(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Invalid note content')
  }

  if (toByteLength(value) > MAX_CONTENT_BYTES) {
    throw new Error('Note content too large')
  }

  return value
}

export function sanitizeStringArray(
  value: unknown,
  options: { label?: string; maxItems?: number; maxItemLength?: number } = {}
): string[] {
  const { label = 'string array', maxItems = 200, maxItemLength = 2048 } = options
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${label}`)
  }

  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.length <= maxItemLength)
    .slice(0, maxItems)
}

export function sanitizeBoolean(value: unknown, label = 'boolean'): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

export function sanitizeWindowTitle(value: unknown): string {
  return sanitizeIpcString(value, {
    label: 'window title',
    trim: true,
    minLength: 1,
    maxLength: 120,
  })
}

export function sanitizeZoomLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Invalid zoom level')
  }
  return Math.max(-5, Math.min(5, value))
}

export function sanitizeWord(value: unknown, label = 'word'): string {
  const word = sanitizeIpcString(value, { label, trim: true, minLength: 1, maxLength: 64 })
  if (/\s/.test(word)) {
    throw new Error(`Invalid ${label}`)
  }
  return word
}

export function sanitizeVersionId(value: unknown): string {
  const versionId = sanitizeIpcString(value, {
    label: 'version ID',
    trim: true,
    minLength: 1,
    maxLength: 128,
  })
  if (!/^[\w\-.T]+$/.test(versionId)) {
    throw new Error('Invalid version ID')
  }
  return versionId
}

export function isTrustedRendererUrl(url: string | undefined, isPackaged: boolean): boolean {
  if (!url || typeof url !== 'string') return false

  if (url.startsWith('file://')) return true

  if (isPackaged) return false

  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return false
    if (!DEV_HOSTS.has(parsed.hostname)) return false
    return true
  } catch {
    return false
  }
}

export function isAllowedExternalUrl(raw: string, isPackaged: boolean): boolean {
  if (typeof raw !== 'string') return false

  try {
    const parsed = new URL(raw)
    if (parsed.protocol === 'https:') return true

    if (!isPackaged && parsed.protocol === 'http:' && DEV_HOSTS.has(parsed.hostname)) {
      return true
    }

    return false
  } catch {
    return false
  }
}

export function sanitizeThemeEntries(data: unknown, maxEntries = 400): Record<string, string> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid theme payload')
  }

  const out: Record<string, string> = {}
  let count = 0

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (count >= maxEntries) break
    if (!key.startsWith('--')) continue
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed || trimmed.length > 256) continue
    out[key] = trimmed
    count += 1
  }

  return out
}

export function sanitizeStatePayload(state: unknown): string {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('Invalid state payload')
  }

  const serialized = JSON.stringify(state, null, 2)
  if (typeof serialized !== 'string' || serialized.length === 0) {
    throw new Error('Invalid state payload')
  }

  if (serialized.length > MAX_STATE_BYTES) {
    throw new Error('State payload too large')
  }

  return serialized
}
