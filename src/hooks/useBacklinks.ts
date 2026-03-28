/**
 * src/hooks/useBacklinks.ts
 *
 * Parses [[wikilink]] syntax from all note content and builds two indexes:
 *   - outgoing: filename → Set of note names this note links to
 *   - incoming: note name → Set of filenames that link to it (backlinks)
 *
 * Fuzzy matching: [[My Note]] resolves against note filenames case-insensitively,
 * with and without extension, so [[my note]], [[My Note]], [[My Note.md]] all match.
 *
 * The hook is purely in-memory and re-computed when noteContentMap changes.
 */
import { useMemo } from 'react'

/** Regex to extract [[wikilink]] targets from markdown content. */
const WIKILINK_REGEX = /\[\[([^\]]{1,200})\]\]/g

/** Extract all wikilink targets from a string. */
function parseWikilinks(content: string): string[] {
  const links: string[] = []
  for (const match of content.matchAll(WIKILINK_REGEX)) {
    links.push(match[1].trim())
  }
  return links
}

/**
 * Resolve a wikilink target to an actual filename in the vault.
 * Tries exact match, then case-insensitive, then without extension.
 */
function resolveWikilink(target: string, allNotes: string[]): string | null {
  const t = target.toLowerCase()
  // 1. Exact filename match (e.g. [[My Note.md]])
  if (allNotes.includes(target)) return target
  // 2. Case-insensitive exact
  const exact = allNotes.find((n) => n.toLowerCase() === t)
  if (exact) return exact
  // 3. Target without extension vs filename without extension (fuzzy)
  const tStem = t.replace(/\.(md|txt)$/i, '')
  const fuzzy = allNotes.find((n) => n.toLowerCase().replace(/\.(md|txt)$/i, '') === tStem)
  if (fuzzy) return fuzzy
  return null
}

export type BacklinkEntry = {
  /** The filename of a note that links to the current note. */
  filename: string
  /** The raw wikilink targets found in that note. */
  links: string[]
}

export type WikilinkIndex = {
  /** filename → resolved filenames it links to */
  outgoing: Map<string, string[]>
  /** filename → list of filenames that link to it */
  incoming: Map<string, BacklinkEntry[]>
}

export function useBacklinks(
  notes: string[],
  noteContentMap: Record<string, string>
): WikilinkIndex {
  return useMemo(() => {
    const outgoing = new Map<string, string[]>()
    const incoming = new Map<string, BacklinkEntry[]>()

    // Pre-populate incoming map for all notes so every note has an entry
    for (const note of notes) incoming.set(note, [])

    for (const note of notes) {
      const content = noteContentMap[note] ?? ''
      const rawLinks = parseWikilinks(content)
      const resolved: string[] = []

      for (const raw of rawLinks) {
        const target = resolveWikilink(raw, notes)
        if (target && target !== note) {
          resolved.push(target)
          const existing = incoming.get(target) ?? []
          // Avoid duplicate entries for same source note
          if (!existing.some((e) => e.filename === note)) {
            existing.push({ filename: note, links: rawLinks })
            incoming.set(target, existing)
          }
        }
      }

      outgoing.set(note, [...new Set(resolved)])
    }

    return { outgoing, incoming }
  }, [notes, noteContentMap])
}
