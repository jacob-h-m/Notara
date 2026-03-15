import React, { useEffect, useState } from 'react'

// Resolve asset URL in a Vite-friendly way so it works in dev and packaged builds
const logoUrl = new URL('../../assets/logo.svg', import.meta.url).href

type TitleBarProps = {
  /** Basename of the active note, displayed in the centre. */
  activeNote?: string
  /** Optional content (e.g. AppMenuBar) rendered inside the left area. */
  menuContent?: React.ReactNode
}

export default function TitleBar({ activeNote, menuContent }: TitleBarProps) {
  const [isMax, setIsMax] = useState(false)

  useEffect(() => {
    let mounted = true
    async function check() {
      const m = await window.api.isMaximized()
      if (mounted) setIsMax(m)
    }
    check()
    const onResize = async () => { if (mounted) setIsMax(await window.api.isMaximized()) }
    window.addEventListener('resize', onResize)
    return () => { mounted = false; window.removeEventListener('resize', onResize) }
  }, [])

  return (
    <div
      className="titlebar flex items-center bg-titlebar border-b border-subtle"
      style={{ height: '2.75rem', minHeight: '2.75rem' }}
    >
      {/* ── Left: logo + menu ──────────────────────────────── */}
      <div
        className="no-drag titlebar-left flex items-center shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div
          className="titlebar-brand flex items-center gap-2 px-3 py-1"
          onContextMenu={(e) => e.preventDefault()}
          tabIndex={-1}
          aria-hidden
        >
          <img
            src={logoUrl}
            alt="Notara"
            className="h-5 w-5 shrink-0"
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            aria-hidden
          />
        </div>
        {menuContent && (
          <div className="titlebar-menu flex items-center px-1">
            {menuContent}
          </div>
        )}
      </div>

      {/* ── Centre: drag fill + active note name ───────────────────── */}
      <div
        className="drag-region flex-1 h-full flex items-center justify-center overflow-hidden"
      >
        <span
          className="truncate text-xs text-muted select-none px-4"
          style={{ pointerEvents: 'none' }}
        >
          {activeNote ? activeNote.replace(/\.(md|txt)$/, '') : ''}
        </span>
      </div>

      {/* ── Right: window controls ─────────────────────────────────── */}
      <div
        className="no-drag titlebar-controls flex items-center px-2 shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Minimize — horizontal dash */}
        <button onClick={() => window.api.minimize()} className="titlebar-btn" aria-label="Minimize">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2.5 6h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
        {/* Maximize / Restore */}
        {!isMax ? (
          <button onClick={async () => { await window.api.maximize(); setIsMax(true) }} className="titlebar-btn" aria-label="Maximize">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <rect x="2" y="2" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        ) : (
          <button onClick={async () => { await window.api.unmaximize(); setIsMax(false) }} className="titlebar-btn" aria-label="Restore">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              {/* back window — visible top/right edges peeking behind front */}
              <path d="M4 4V2h6v6H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              {/* front window */}
              <rect x="2" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        )}
        {/* Close — ✕ */}
        <button onClick={() => window.api.requestAppClose()} className="titlebar-btn close" aria-label="Close">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
