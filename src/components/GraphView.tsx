/**
 * src/components/GraphView.tsx
 *
 * Full-vault knowledge graph powered by Cytoscape.js.
 * Lazy-loaded by App.tsx — imported with React.lazy()
 *
 * Layout: Cose-Bilkent style via Cytoscape's built-in cose layout (no extra dep).
 * Nodes = notes. Edges = [[wikilinks]].
 * Click a node to open that note.
 * Scroll to zoom, drag to pan, drag nodes to reposition.
 *
 * Visual design:
 *   - Nodes sized by link degree (more links = larger node)
 *   - Active note highlighted with accent colour
 *   - Isolated nodes (no links) rendered smaller and muted
 *   - Dark/light theme-aware via CSS custom properties
 */
import { useEffect, useRef } from 'react'
import cytoscape, { type Core, type NodeSingular } from 'cytoscape'
import type { WikilinkIndex } from '../hooks/useBacklinks'
import { stemFilename } from '../utils/filenames'

type Props = {
  notes: string[]
  wikilinkIndex: WikilinkIndex
  activeNote: string | null
  onOpenNote: (filename: string) => void
  onClose: () => void
  theme: 'dark' | 'light'
}

/** Read a CSS custom property from :root */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export default function GraphView({
  notes,
  wikilinkIndex,
  activeNote,
  onOpenNote,
  onClose,
  theme,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // ── Resolve theme colours ────────────────────────────────────────────────
    const accent = cssVar('--accent') || '#6366f1'
    const textPrimary = cssVar('--text-primary') || (theme === 'dark' ? '#e5e7eb' : '#111827')
    const textMuted = cssVar('--text-muted') || (theme === 'dark' ? '#6b7280' : '#9ca3af')
    const surfaceEl = cssVar('--surface-elevated') || (theme === 'dark' ? '#1f2937' : '#f9fafb')
    const borderSubtle = cssVar('--border-subtle') || (theme === 'dark' ? '#374151' : '#e5e7eb')
    const _bgColor = cssVar('--app-bg') || (theme === 'dark' ? '#111827' : '#ffffff')

    // ── Build graph elements ─────────────────────────────────────────────────
    const edgeSet = new Set<string>()
    const elements: cytoscape.ElementDefinition[] = []

    // Degree map for node sizing
    const degree = new Map<string, number>()
    for (const note of notes) degree.set(note, 0)

    for (const [src, targets] of wikilinkIndex.outgoing) {
      for (const tgt of targets) {
        const edgeId = `${src}→${tgt}`
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId)
          elements.push({ data: { id: edgeId, source: src, target: tgt } })
          degree.set(src, (degree.get(src) ?? 0) + 1)
          degree.set(tgt, (degree.get(tgt) ?? 0) + 1)
        }
      }
    }

    for (const note of notes) {
      const d = degree.get(note) ?? 0
      const isActive = note === activeNote
      const isIsolated = d === 0
      elements.push({
        data: {
          id: note,
          label: stemFilename(note),
          degree: d,
          isActive,
          isIsolated,
        },
      })
    }

    // ── Init Cytoscape ───────────────────────────────────────────────────────
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            width: (ele: NodeSingular) => {
              const d = (ele.data('degree') as number) || 0
              return Math.max(24, Math.min(60, 24 + d * 6))
            },
            height: (ele: NodeSingular) => {
              const d = (ele.data('degree') as number) || 0
              return Math.max(24, Math.min(60, 24 + d * 6))
            },
            'background-color': surfaceEl,
            'border-color': borderSubtle,
            'border-width': 1.5,
            color: textPrimary,
            'font-size': 10,
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 4,
            'text-max-width': '80px',
            'text-wrap': 'ellipsis',
            'text-overflow-wrap': 'anywhere',
            'min-zoomed-font-size': 8,
            cursor: 'pointer',
          } as any,
        },
        {
          selector: 'node[?isActive]',
          style: {
            'background-color': accent,
            'border-color': accent,
            'border-width': 2,
            color: '#ffffff',
            'font-weight': 'bold',
          } as any,
        },
        {
          selector: 'node[?isIsolated]',
          style: {
            'background-color': theme === 'dark' ? '#1a1f2e' : '#f3f4f6',
            'border-color': borderSubtle,
            color: textMuted,
            opacity: 0.7,
          } as any,
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': accent,
            'border-width': 3,
            'background-color': accent,
            color: '#ffffff',
          } as any,
        },
        {
          selector: 'edge',
          style: {
            width: 1,
            'line-color': borderSubtle,
            'target-arrow-color': borderSubtle,
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.7,
            'curve-style': 'bezier',
            opacity: 0.6,
          } as any,
        },
        {
          selector: 'edge:selected, node:selected + edge',
          style: {
            'line-color': accent,
            'target-arrow-color': accent,
            opacity: 1,
            width: 2,
          } as any,
        },
        {
          // Highlight edges connected to hovered node
          selector: '.highlighted',
          style: {
            'line-color': accent,
            'target-arrow-color': accent,
            opacity: 1,
            width: 2,
          } as any,
        },
      ],
      layout: {
        name: 'cose',
        animate: true,
        animationDuration: 400,
        randomize: false,
        nodeRepulsion: () => 8000,
        idealEdgeLength: () => 80,
        edgeElasticity: () => 32,
        gravity: 0.4,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0,
      } as any,
      wheelSensitivity: 0.3,
      minZoom: 0.1,
      maxZoom: 4,
    })

    cyRef.current = cy

    // ── Interactions ─────────────────────────────────────────────────────────

    // Click node → open note
    cy.on('tap', 'node', (evt) => {
      const node = evt.target as NodeSingular
      onOpenNote(node.id())
    })

    // Hover: highlight connected edges
    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target as NodeSingular
      node.connectedEdges().addClass('highlighted')
    })
    cy.on('mouseout', 'node', (evt) => {
      const node = evt.target as NodeSingular
      node.connectedEdges().removeClass('highlighted')
    })

    // Double-click background → fit view
    cy.on('dbltap', (evt) => {
      if (evt.target === cy) cy.fit(undefined, 40)
    })

    // Fit on initial layout complete
    cy.one('layoutstop', () => {
      cy.fit(undefined, 40)
    })

    return () => {
      cy.destroy()
      cyRef.current = null
    }
    // Re-run only when the underlying data changes, not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, wikilinkIndex, activeNote, theme])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
    >
      <div
        className="relative m-auto flex flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{
          width: 'min(900px, 92vw)',
          height: 'min(640px, 88vh)',
          background: cssVar('--app-bg') || (theme === 'dark' ? '#111827' : '#fff'),
          border: '1px solid var(--border-subtle)',
        }}
      >
        {/* Header */}
        <div
          className="flex shrink-0 items-center justify-between px-4 py-2.5"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
              Knowledge Graph
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {notes.length} notes ·{' '}
              {[...wikilinkIndex.outgoing.values()].reduce((s, a) => s + a.length, 0)} links
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Scroll to zoom · Drag to pan · Click node to open · Double-click canvas to fit
            </span>
            <button
              onClick={onClose}
              className="rounded px-2 py-0.5 text-xs"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Close graph"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Graph canvas */}
        <div ref={containerRef} className="flex-1" style={{ background: 'var(--app-bg)' }} />
      </div>
    </div>
  )
}
