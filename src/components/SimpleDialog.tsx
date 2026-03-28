/**
 * src/components/SimpleDialog.tsx
 * Simple confirm and input dialogs to replace window.prompt/window.confirm
 */

import React, { useEffect, useRef, useState } from 'react'

// ─── Confirm Dialog ────────────────────────────────────────────────────────

export type ConfirmDialogState = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm?: () => void
  onCancel?: () => void
  isDangerous?: boolean
}

export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmDialogState>({ open: false, title: '', message: '' })

  const confirm = (
    title: string,
    message: string,
    options?: {
      confirmLabel?: string
      cancelLabel?: string
      isDangerous?: boolean
    }
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        open: true,
        title,
        message,
        confirmLabel: options?.confirmLabel,
        cancelLabel: options?.cancelLabel,
        isDangerous: options?.isDangerous,
        onConfirm: () => {
          setState((s) => ({ ...s, open: false }))
          resolve(true)
        },
        onCancel: () => {
          setState((s) => ({ ...s, open: false }))
          resolve(false)
        },
      })
    })
  }

  return { state, confirm, close: () => setState((s) => ({ ...s, open: false })) }
}

export function ConfirmDialog({
  state,
  onConfirm,
  onCancel,
}: {
  state: ConfirmDialogState
  onConfirm: () => void
  onCancel: () => void
}) {
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (state.open) {
      setTimeout(() => btnRef.current?.focus(), 0)
    }
  }, [state.open])

  if (!state.open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="w-96 rounded-lg border border-muted bg-surface-900 shadow-2xl"
        style={{ background: 'var(--surface-900)' } as React.CSSProperties}
      >
        <div className="border-b border-muted px-6 py-4">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {state.title}
          </h2>
        </div>
        <div className="px-6 py-4">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {state.message}
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-muted px-6 py-3">
          <button
            onClick={onCancel}
            className="rounded px-4 py-2 text-sm font-medium transition-colors"
            style={
              {
                background: 'var(--btn-ghost-hover)',
                color: 'var(--text-primary)',
              } as React.CSSProperties
            }
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'var(--btn-ghost-active)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'var(--btn-ghost-hover)'
            }}
          >
            {state.cancelLabel || 'Cancel'}
          </button>
          <button
            ref={btnRef}
            onClick={onConfirm}
            className="rounded px-4 py-2 text-sm font-medium text-white transition-colors"
            style={
              {
                background: state.isDangerous ? 'var(--destructive)' : 'var(--accent)',
              } as React.CSSProperties
            }
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = state.isDangerous
                ? 'color-mix(in srgb, var(--destructive) 80%, black)'
                : 'var(--accent-hover)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = state.isDangerous
                ? 'var(--destructive)'
                : 'var(--accent)'
            }}
          >
            {state.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Input Dialog ─────────────────────────────────────────────────────────

export type InputDialogState = {
  open: boolean
  title: string
  label: string
  placeholder?: string
  defaultValue?: string
  submitLabel?: string
  cancelLabel?: string
  onSubmit?: (value: string) => void
  onCancel?: () => void
}

export function useInputDialog() {
  const [state, setState] = useState<InputDialogState>({ open: false, title: '', label: '' })

  const prompt = (
    title: string,
    label: string,
    options?: {
      placeholder?: string
      defaultValue?: string
      submitLabel?: string
      cancelLabel?: string
    }
  ): Promise<string | null> => {
    return new Promise((resolve) => {
      setState({
        open: true,
        title,
        label,
        placeholder: options?.placeholder,
        defaultValue: options?.defaultValue,
        submitLabel: options?.submitLabel,
        cancelLabel: options?.cancelLabel,
        onSubmit: (value: string) => {
          setState((s) => ({ ...s, open: false }))
          resolve(value)
        },
        onCancel: () => {
          setState((s) => ({ ...s, open: false }))
          resolve(null)
        },
      })
    })
  }

  return { state, prompt, close: () => setState((s) => ({ ...s, open: false })) }
}

export function InputDialog({
  state,
  onSubmit,
  onCancel,
}: {
  state: InputDialogState
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(state.defaultValue || '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setValue(state.defaultValue || '')
  }, [state.defaultValue])

  useEffect(() => {
    if (state.open) {
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [state.open])

  const handleSubmit = () => {
    onSubmit(value)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
    if (e.key === 'Escape') onCancel()
  }

  if (!state.open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="w-96 rounded-lg border border-muted shadow-2xl"
        style={{ background: 'var(--surface-900)' } as React.CSSProperties}
      >
        <div className="border-b border-muted px-6 py-4">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {state.title}
          </h2>
        </div>
        <div className="px-6 py-4">
          <label className="mb-3 block text-sm" style={{ color: 'var(--text-muted)' }}>
            {state.label}
          </label>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={state.placeholder}
            className="w-full rounded border px-3 py-2 text-sm outline-none"
            style={
              {
                background: 'var(--surface-800)',
                color: 'var(--text-primary)',
                borderColor: 'var(--subtle)',
              } as React.CSSProperties
            }
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-muted px-6 py-3">
          <button
            onClick={onCancel}
            className="rounded px-4 py-2 text-sm font-medium transition-colors"
            style={
              {
                background: 'var(--btn-ghost-hover)',
                color: 'var(--text-primary)',
              } as React.CSSProperties
            }
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'var(--btn-ghost-active)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'var(--btn-ghost-hover)'
            }}
          >
            {state.cancelLabel || 'Cancel'}
          </button>
          <button
            onClick={handleSubmit}
            className="rounded px-4 py-2 text-sm font-medium text-white transition-colors"
            style={
              {
                background: 'var(--accent)',
              } as React.CSSProperties
            }
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'var(--accent-hover)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'var(--accent)'
            }}
          >
            {state.submitLabel || 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}
