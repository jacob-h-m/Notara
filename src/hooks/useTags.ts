/**
 * src/hooks/useTags.ts
 * Parses tags from note content for tag-based filtering.
 *
 * Two sources are combined per note:
 *   1. YAML frontmatter  — `tags: [a, b, c]` in the leading --- block
 *   2. #hashtags          — #word patterns anywhere in the body text
 */
import { useMemo } from 'react'
import { parseFrontmatter } from '../utils/markdownConvert'

// Matches #word preceded by whitespace/punctuation (not inside words)
const TAG_REGEX = /(?:^|[\s,;.!?()\[\]{}'"\/\\])#([a-zA-Z][a-zA-Z0-9_-]*)/g

function parseTags(content: string): string[] {
  const tags = new Set<string>()

  // Source 1: frontmatter tags
  const { tags: fmTags } = parseFrontmatter(content)
  for (const t of fmTags) tags.add(t.toLowerCase())

  // Source 2: #hashtags in body text
  for (const match of content.matchAll(TAG_REGEX)) {
    tags.add(match[1].toLowerCase())
  }

  return Array.from(tags).sort()
}

export type TagSummary = {
  tag: string
  count: number
  notes: string[]
}

export function useTags(notes: string[], getContent: (f: string) => string) {
  const tagIndex = useMemo(() => {
    const index = new Map<string, Set<string>>()
    for (const note of notes) {
      let content = ''
      try {
        content = getContent(note)
      } catch {}
      for (const tag of parseTags(content)) {
        if (!index.has(tag)) index.set(tag, new Set())
        index.get(tag)!.add(note)
      }
    }
    return Array.from(index.entries())
      .map(([tag, noteSet]) => ({ tag, count: noteSet.size, notes: Array.from(noteSet) }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
  }, [notes, getContent])

  return { tagIndex }
}

/**
 * Get the tags for a single note's content (frontmatter + #hashtags).
 * Exported for use by the tag editor in Editor.tsx.
 */
export function getTagsForContent(content: string): string[] {
  return parseTags(content)
}
