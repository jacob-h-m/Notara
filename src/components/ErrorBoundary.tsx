/**
 * src/components/ErrorBoundary.tsx
 * React error boundary for catching runtime errors in the component tree.
 * Displays a recovery UI instead of a blank white screen on component crash.
 */

import React, { ReactNode } from 'react'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = { error: Error | null; hasError: boolean }

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { error: null, hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] caught error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: 'var(--app-bg)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--ui-font)',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              marginBottom: '1rem',
              fontSize: '3rem',
            }}
          >
            ⚠️
          </div>
          <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem' }}>Something went wrong</h1>
          <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '0.4rem',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 500,
            }}
          >
            Reload app
          </button>
          {process.env.NODE_ENV === 'development' && (
            <details style={{ marginTop: '1rem', textAlign: 'left' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>
                Error details (dev only)
              </summary>
              <pre
                style={{
                  marginTop: '0.5rem',
                  padding: '0.5rem',
                  background: 'var(--surface-800)',
                  borderRadius: '0.3rem',
                  fontSize: '0.75rem',
                  overflow: 'auto',
                  maxWidth: '400px',
                  color: 'var(--text-muted)',
                }}
              >
                {this.state.error?.stack}
              </pre>
            </details>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
