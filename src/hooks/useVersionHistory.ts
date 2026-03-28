/**
 * src/hooks/useVersionHistory.ts
 * Version snapshots for individual notes via IPC.
 *
 * Versions are stored by the main process as timestamped files.
 * The list is automatically refreshed whenever the active file changes.
 */
import { useCallback, useEffect, useState } from 'react'

export type NoteVersion = {
  id: string
  filename: string
  label: string
}

/**
 * Convert a version ID (e.g. "2024-01-15T10-30-00-000") to a human-readable
 * date/time string. Falls back to the raw ID if parsing fails.
 */
function formatVersionLabel(id: string): string {
  try {
    // IDs use hyphens as time separators — convert back to colons for Date parsing.
    const dateStr = id.replace(/T(\d{2})-(\d{2})-(\d{2})-\d+$/, 'T$1:$2:$3')
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return id
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return id
  }
}

export function useVersionHistory(activeFilename: string | null) {
  const [versions, setVersions] = useState<NoteVersion[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    if (!activeFilename) {
      setVersions([])
      return
    }
    setLoading(true)
    try {
      const ids = await window.api.listVersions(activeFilename)
      setVersions(
        ids
          .sort((a, b) => b.localeCompare(a))
          .map((id) => ({ id, filename: activeFilename, label: formatVersionLabel(id) }))
      )
    } catch {
      setVersions([])
    } finally {
      setLoading(false)
    }
  }, [activeFilename])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const saveVersion = useCallback(
    async (filename: string, content: string): Promise<void> => {
      try {
        await window.api.saveVersion(filename, content)
        if (filename === activeFilename) void refresh()
      } catch {}
    },
    [activeFilename, refresh]
  )

  const loadVersion = useCallback(async (filename: string, versionId: string): Promise<string> => {
    return window.api.readVersion(filename, versionId)
  }, [])

  const deleteVersion = useCallback(
    async (filename: string, versionId: string): Promise<void> => {
      try {
        await window.api.deleteVersion(filename, versionId)
        void refresh()
      } catch {}
    },
    [refresh]
  )

  return { versions, loading, refresh, saveVersion, loadVersion, deleteVersion }
}
