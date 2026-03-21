/**
 * src/hooks/useFTSIndex.ts
 * In-memory full-text search index for notes.
 *
 * Uses bigram indexing for fast substring search with two scoring tiers:
 *  - Exact substring match  → score 100–150 (higher for longer query : content ratio)
 *  - Bigram overlap match   → score 0–80   (proportional to shared bigrams)
 */
import { useCallback, useRef } from 'react'

export type SearchResult = {
  filename: string
  snippet: string
  score: number
}

type IndexEntry = {
  filename: string
  content: string
  lower: string
  bigrams: Set<string>
}

function buildBigrams(text: string): Set<string> {
  const bigrams = new Set<string>()
  const lower = text.toLowerCase()
  for (let i = 0; i < lower.length - 1; i++) {
    bigrams.add(lower.slice(i, i + 2))
  }
  return bigrams
}

function buildEntry(filename: string, content: string): IndexEntry {
  return { filename, content, lower: content.toLowerCase(), bigrams: buildBigrams(content) }
}

/** Extract a context snippet around the first occurrence of `query` in `content`. */
function getSnippet(content: string, query: string, maxLen = 120): string {
  const lower = content.toLowerCase()
  const q = query.toLowerCase()
  const idx = lower.indexOf(q)

  if (idx === -1) {
    // No exact match — show the beginning of the note.
    const head = content.slice(0, maxLen).replace(/\n+/g, ' ').trim()
    return content.length > maxLen ? `${head}…` : head
  }

  const start = Math.max(0, idx - 40)
  const end = Math.min(content.length, idx + q.length + 80)
  const snippet = content.slice(start, end).replace(/\n+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${snippet}${end < content.length ? '…' : ''}`
}

export function useFTSIndex() {
  const indexRef = useRef<Map<string, IndexEntry>>(new Map())

  const indexNote = useCallback((filename: string, content: string): void => {
    indexRef.current.set(filename, buildEntry(filename, content))
  }, [])

  const removeNote = useCallback((filename: string): void => {
    indexRef.current.delete(filename)
  }, [])

  const search = useCallback((query: string, limit = 20): SearchResult[] => {
    const q = query.trim().toLowerCase()
    if (!q) return []

    const qBigrams = buildBigrams(q)
    const results: SearchResult[] = []

    for (const entry of indexRef.current.values()) {
      if (entry.lower.includes(q)) {
        // Exact match: favour shorter documents (the query makes up more of the content).
        const score = 100 + (q.length / Math.max(entry.content.length, 1)) * 50
        results.push({ filename: entry.filename, snippet: getSnippet(entry.content, query), score })
        continue
      }

      if (qBigrams.size === 0) continue

      let overlap = 0
      for (const bg of qBigrams) {
        if (entry.bigrams.has(bg)) overlap++
      }
      const score = (overlap / qBigrams.size) * 80
      if (score > 30) {
        results.push({ filename: entry.filename, snippet: getSnippet(entry.content, query), score })
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit)
  }, [])

  /** Replace the entire index from a list of note objects. More efficient than
   *  calling indexNote() in a loop because it rebuilds in one pass. */
  const bulkIndex = useCallback((notes: { filename: string; content: string }[]): void => {
    const next = new Map<string, IndexEntry>()
    for (const { filename, content } of notes) {
      next.set(filename, buildEntry(filename, content))
    }
    indexRef.current = next
  }, [])

  return { indexNote, removeNote, search, bulkIndex }
}
