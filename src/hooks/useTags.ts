/**
 * src/hooks/useTags.ts
 * Parses #hashtags from note content for tag-based filtering.
 */
import { useMemo } from 'react'

const TAG_REGEX = /(?:^|[\s,;.!?()\[\]{}'"\/\\])#([a-zA-Z][a-zA-Z0-9_-]*)/g

function parseTags(content: string): string[] {
  const tags = new Set<string>()
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
