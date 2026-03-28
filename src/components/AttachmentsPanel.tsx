/**
 * src/components/AttachmentsPanel.tsx
 * Shows and manages file attachments for the active note.
 */
import { useCallback, useEffect, useState } from 'react'

type Props = {
  filename: string
  showConfirm?: (
    title: string,
    message: string,
    options?: { confirmLabel?: string; cancelLabel?: string; isDangerous?: boolean }
  ) => Promise<boolean>
}

export default function AttachmentsPanel({ filename, showConfirm }: Props) {
  const [attachments, setAttachments] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; errors: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await window.api.listAttachments(filename)
      setAttachments(Array.isArray(list) ? list : [])
    } catch (err) {
      console.error('[AttachmentsPanel] failed to list attachments:', err)
      setAttachments([])
      setError('Failed to load attachments')
    } finally {
      setLoading(false)
    }
  }, [filename])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleImport() {
    setBusy(true)
    setError(null)
    try {
      const added = await window.api.importAttachment(filename)
      if (added) void refresh()
    } catch (err) {
      console.error('[AttachmentsPanel] import failed:', err)
      setError('Failed to import attachment')
    } finally {
      setBusy(false)
    }
  }

  async function handleOpen(name: string) {
    try {
      await window.api.openAttachment(filename, name)
    } catch (err) {
      console.error('[AttachmentsPanel] failed to open attachment:', err)
      setError(`Could not open "${name}"`)
    }
  }

  async function handleVerify() {
    setBusy(true)
    setError(null)
    try {
      const result = await window.api.verifyAttachments(filename)
      setVerifyResult(result)
    } catch (err) {
      console.error('[AttachmentsPanel] verify failed:', err)
      setVerifyResult({ ok: false, errors: ['Verification failed — check console for details'] })
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(name: string) {
    const confirmed = await showConfirm?.('Delete Attachment', `Delete attachment "${name}"?`, {
      confirmLabel: 'Delete',
      isDangerous: true,
    })
    if (!confirmed) return
    setError(null)
    try {
      await window.api.deleteAttachment(filename, name)
      void refresh()
    } catch (err) {
      console.error('[AttachmentsPanel] delete failed:', err)
      setError(`Failed to delete "${name}"`)
    }
  }

  function getIcon(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '🖼'
    if (['pdf'].includes(ext)) return '📄'
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return '🎵'
    if (['mp4', 'mov', 'webm'].includes(ext)) return '🎬'
    if (['zip', 'tar', 'gz'].includes(ext)) return '📦'
    return '📎'
  }

  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: 'var(--text-muted)' }}
        >
          Attachments {attachments.length > 0 ? `(${attachments.length})` : ''}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleVerify}
            disabled={busy || attachments.length === 0}
            className="rounded px-2 py-0.5 text-[11px]"
            style={{ color: 'var(--text-muted)' }}
            title="Verify integrity of all attachments"
          >
            ✓
          </button>
          <button
            onClick={handleImport}
            disabled={busy}
            className="rounded px-2 py-0.5 text-[11px]"
            style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
          >
            {busy ? '…' : '+ Add'}
          </button>
        </div>
      </div>
      {error && (
        <div
          className="rounded px-2 py-1 text-[11px]"
          style={{ background: 'var(--destructive-muted)', color: 'var(--destructive)' }}
        >
          {error}
        </div>
      )}
      {verifyResult && (
        <div
          className="rounded px-2 py-1 text-[11px]"
          style={{
            background: verifyResult.ok ? 'var(--accent-muted)' : 'var(--destructive-muted)',
            color: verifyResult.ok ? 'var(--accent)' : 'var(--destructive)',
          }}
        >
          {verifyResult.ok ? '✓ All attachments OK' : verifyResult.errors.join('; ')}
        </div>
      )}

      {loading && (
        <div className="py-2 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          Loading…
        </div>
      )}

      {!loading && attachments.length === 0 && (
        <div className="py-2 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          No attachments yet
        </div>
      )}

      {attachments.map((name) => (
        <div
          key={name}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5"
          style={{ background: 'var(--surface-elevated)' }}
        >
          <span className="text-sm" role="img" aria-hidden>
            {getIcon(name)}
          </span>
          <button
            onClick={() => handleOpen(name)}
            className="min-w-0 flex-1 truncate text-left text-xs"
            style={{ color: 'var(--text-primary)' }}
            title={`Open ${name}`}
          >
            {name}
          </button>
          <button
            onClick={() => handleDelete(name)}
            className="shrink-0 text-xs"
            style={{ color: 'var(--text-muted)' }}
            title="Delete attachment"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
