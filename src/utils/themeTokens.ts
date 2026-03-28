/**
 * src/utils/themeTokens.ts
 * Theme object validation and safe-merge utilities.
 *
 * Rules:
 *   - Only keys that start with '--' (CSS custom properties) are accepted.
 *   - Only string values are allowed; non-strings are discarded.
 *   - Missing keys fall back to the provided defaults.
 */

/** A map of CSS custom-property names to string values. */
export type ThemeMap = Record<string, string>

type SanitizeResult = {
  merged: ThemeMap
  invalidEntries: number
}

/**
 * Accepts only `--`-prefixed keys with string values from `raw`.
 * Merges validated entries on top of `defaults` and returns both
 * the merged map and a count of rejected entries.
 */
export function sanitizeThemeObject(raw: unknown, defaults: ThemeMap): SanitizeResult {
  const merged: ThemeMap = { ...defaults }
  let invalidEntries = 0

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { merged, invalidEntries: -1 }
  }

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key === 'string' && key.startsWith('--') && typeof value === 'string') {
      merged[key] = value
    } else {
      invalidEntries++
    }
  }

  return { merged, invalidEntries }
}
