/**
 * src/components/Icon.tsx
 * Shared SVG icon component – single source of truth for all icons in Notara.
 * All icons use a 24×24 viewBox, `stroke="currentColor"`, `fill="none"` unless noted.
 */

import { memo } from 'react'

export type IconName =
  // Editor actions
  | 'save'
  | 'undo'
  | 'redo'
  | 'find'
  | 'replace'
  // View / panels
  | 'preview'
  | 'history'
  | 'attachments'
  // File operations
  | 'export-md'
  | 'import'
  | 'pdf'
  // Markdown formatting
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'list-ul'
  | 'list-ol'
  | 'checkbox'
  | 'quote'
  | 'code'
  | 'code-block'
  | 'link'
  | 'image'
  | 'table'
  | 'hr'
  // Graph
  | 'graph'

type IconProps = {
  name: IconName
  size?: number
  className?: string
  'aria-hidden'?: boolean
  'aria-label'?: string
}

const S = 'currentColor' // stroke shorthand
const SW = '1.6' // strokeWidth shorthand
const SL = 'round' // strokeLinecap shorthand
const SJ = 'round' // strokeLinejoin shorthand

// Inline SVG element sets, keyed by icon name.
// Each entry is rendered inside a <svg viewBox="0 0 24 24"> wrapper.
const PATHS: Record<IconName, React.ReactNode> = {
  save: (
    <>
      <path
        d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"
        stroke={S}
        strokeWidth={SW}
        strokeLinecap={SL}
        strokeLinejoin={SJ}
      />
      <polyline
        points="17 21 17 13 7 13 7 21"
        stroke={S}
        strokeWidth={SW}
        strokeLinecap={SL}
        strokeLinejoin={SJ}
      />
      <polyline
        points="7 3 7 8 15 8"
        stroke={S}
        strokeWidth={SW}
        strokeLinecap={SL}
        strokeLinejoin={SJ}
      />
    </>
  ),
  undo: (
    <path
      d="M3 7v6h6M3.5 13A9 9 0 1021 12"
      stroke={S}
      strokeWidth={SW}
      strokeLinecap={SL}
      strokeLinejoin={SJ}
    />
  ),
  redo: (
    <path
      d="M21 7v6h-6M20.5 13A9 9 0 113 12"
      stroke={S}
      strokeWidth={SW}
      strokeLinecap={SL}
      strokeLinejoin={SJ}
    />
  ),
  find: (
    <>
      <circle cx="11" cy="11" r="8" stroke={S} strokeWidth={SW} />
      <path d="M21 21l-4.35-4.35" stroke={S} strokeWidth={SW} strokeLinecap={SL} />
    </>
  ),
  replace: (
    <>
      <path
        d="M15 3H9a9 9 0 00-5.8 15.8M3 12l3 3 3-3"
        stroke={S}
        strokeWidth={SW}
        strokeLinecap={SL}
        strokeLinejoin={SJ}
      />
      <path
        d="M9 21h6a9 9 0 005.8-15.8M21 12l-3-3-3 3"
        stroke={S}
        strokeWidth={SW}
        strokeLinecap={SL}
        strokeLinejoin={SJ}
      />
    </>
  ),
  preview: (
    <>
      <rect x="3" y="4" width="8" height="16" rx="1" stroke={S} strokeWidth="1.2" />
      <rect x="13" y="4" width="8" height="16" rx="1" stroke={S} strokeWidth="1.2" />
    </>
  ),
  history: (
    <>
      <circle cx="12" cy="12" r="9" stroke={S} strokeWidth={SW} />
      <path d="M12 7v5l3 3" stroke={S} strokeWidth={SW} strokeLinecap={SL} strokeLinejoin={SJ} />
    </>
  ),
  attachments: (
    <path
      d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66L9.41 17.71a2 2 0 01-2.83-2.83l8.49-8.48"
      stroke={S}
      strokeWidth={SW}
      strokeLinecap={SL}
      strokeLinejoin={SJ}
    />
  ),
  'export-md': (
    <>
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
        stroke={S}
        strokeWidth={SW}
        strokeLinecap={SL}
        strokeLinejoin={SJ}
      />
      <path
        d="M14 2v6h6M16 13H8M16 17H8M10 9H8"
        stroke={S}
        strokeWidth={SW}
        strokeLinecap={SL}
        strokeLinejoin={SJ}
      />
    </>
  ),
  import: (
    <>
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
        stroke={S}
        strokeWidth={SW}
        strokeLinecap={SL}
        strokeLinejoin={SJ}
      />
      <path
        d="M14 2v6h6M12 18v-6M9 15l3 3 3-3"
        stroke={S}
        strokeWidth={SW}
        strokeLinecap={SL}
        strokeLinejoin={SJ}
      />
    </>
  ),
  pdf: (
    <>
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
        stroke={S}
        strokeWidth={SW}
        strokeLinecap={SL}
        strokeLinejoin={SJ}
      />
      <path d="M14 2v6h6" stroke={S} strokeWidth={SW} strokeLinecap={SL} strokeLinejoin={SJ} />
      <text
        x="5.5"
        y="19.5"
        fontSize="6.5"
        fontWeight="bold"
        fill="currentColor"
        stroke="none"
        fontFamily="sans-serif"
      >
        PDF
      </text>
    </>
  ),
  bold: (
    <path
      d="M6 4h8a4 4 0 010 8H6zM6 12h9a4 4 0 010 8H6z"
      stroke={S}
      strokeWidth={SW}
      strokeLinecap={SL}
      strokeLinejoin={SJ}
    />
  ),
  italic: (
    <>
      <line x1="19" y1="4" x2="10" y2="4" stroke={S} strokeWidth={SW} strokeLinecap={SL} />
      <line x1="14" y1="20" x2="5" y2="20" stroke={S} strokeWidth={SW} strokeLinecap={SL} />
      <line x1="15" y1="4" x2="9" y2="20" stroke={S} strokeWidth={SW} strokeLinecap={SL} />
    </>
  ),
  strikethrough: (
    <>
      <line x1="4" y1="12" x2="20" y2="12" stroke={S} strokeWidth={SW} strokeLinecap={SL} />
      <path d="M8 5.5h8M7.5 18.5h9" stroke={S} strokeWidth="1.4" strokeLinecap={SL} />
      <path
        d="M8 5.5c0-1.38 1.79-2.5 4-2.5s4 1.12 4 2.5"
        stroke={S}
        strokeWidth="1.4"
        strokeLinecap={SL}
        strokeLinejoin={SJ}
      />
      <path
        d="M16 18.5c0 1.38-1.79 2.5-4 2.5s-4-1.12-4-2.5"
        stroke={S}
        strokeWidth="1.4"
        strokeLinecap={SL}
        strokeLinejoin={SJ}
      />
    </>
  ),
  h1: (
    <>
      <line x1="4" y1="12" x2="12" y2="12" stroke={S} strokeWidth="2" strokeLinecap={SL} />
      <line x1="4" y1="6" x2="4" y2="18" stroke={S} strokeWidth="2" strokeLinecap={SL} />
      <line x1="12" y1="6" x2="12" y2="18" stroke={S} strokeWidth="2" strokeLinecap={SL} />
      <text
        x="15"
        y="19"
        fontSize="8"
        fontWeight="bold"
        fill="currentColor"
        stroke="none"
        fontFamily="sans-serif"
      >
        1
      </text>
    </>
  ),
  h2: (
    <>
      <line x1="4" y1="12" x2="12" y2="12" stroke={S} strokeWidth="2" strokeLinecap={SL} />
      <line x1="4" y1="6" x2="4" y2="18" stroke={S} strokeWidth="2" strokeLinecap={SL} />
      <line x1="12" y1="6" x2="12" y2="18" stroke={S} strokeWidth="2" strokeLinecap={SL} />
      <text
        x="15"
        y="19"
        fontSize="8"
        fontWeight="bold"
        fill="currentColor"
        stroke="none"
        fontFamily="sans-serif"
      >
        2
      </text>
    </>
  ),
  h3: (
    <>
      <line x1="4" y1="12" x2="12" y2="12" stroke={S} strokeWidth="2" strokeLinecap={SL} />
      <line x1="4" y1="6" x2="4" y2="18" stroke={S} strokeWidth="2" strokeLinecap={SL} />
      <line x1="12" y1="6" x2="12" y2="18" stroke={S} strokeWidth="2" strokeLinecap={SL} />
      <text
        x="15"
        y="19"
        fontSize="8"
        fontWeight="bold"
        fill="currentColor"
        stroke="none"
        fontFamily="sans-serif"
      >
        3
      </text>
    </>
  ),
  'list-ul': (
    <>
      <line x1="9" y1="6" x2="20" y2="6" stroke={S} strokeWidth={SW} strokeLinecap={SL} />
      <line x1="9" y1="12" x2="20" y2="12" stroke={S} strokeWidth={SW} strokeLinecap={SL} />
      <line x1="9" y1="18" x2="20" y2="18" stroke={S} strokeWidth={SW} strokeLinecap={SL} />
      <circle cx="5" cy="6" r="1.5" fill="currentColor" />
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="5" cy="18" r="1.5" fill="currentColor" />
    </>
  ),
  'list-ol': (
    <>
      <line x1="10" y1="6" x2="21" y2="6" stroke={S} strokeWidth={SW} strokeLinecap={SL} />
      <line x1="10" y1="12" x2="21" y2="12" stroke={S} strokeWidth={SW} strokeLinecap={SL} />
      <line x1="10" y1="18" x2="21" y2="18" stroke={S} strokeWidth={SW} strokeLinecap={SL} />
      <text
        x="3"
        y="9"
        fontSize="6.5"
        fontWeight="bold"
        fill="currentColor"
        stroke="none"
        fontFamily="sans-serif"
      >
        1
      </text>
      <text
        x="3"
        y="15"
        fontSize="6.5"
        fontWeight="bold"
        fill="currentColor"
        stroke="none"
        fontFamily="sans-serif"
      >
        2
      </text>
      <text
        x="3"
        y="21"
        fontSize="6.5"
        fontWeight="bold"
        fill="currentColor"
        stroke="none"
        fontFamily="sans-serif"
      >
        3
      </text>
    </>
  ),
  checkbox: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" stroke={S} strokeWidth={SW} />
      <path
        d="M9 12l2.5 2.5L15 9"
        stroke={S}
        strokeWidth={SW}
        strokeLinecap={SL}
        strokeLinejoin={SJ}
      />
    </>
  ),
  quote: (
    <>
      <line x1="5" y1="4" x2="5" y2="20" stroke={S} strokeWidth="3" strokeLinecap={SL} />
      <line x1="10" y1="8" x2="19" y2="8" stroke={S} strokeWidth={SW} strokeLinecap={SL} />
      <line x1="10" y1="12" x2="19" y2="12" stroke={S} strokeWidth={SW} strokeLinecap={SL} />
      <line x1="10" y1="16" x2="15" y2="16" stroke={S} strokeWidth={SW} strokeLinecap={SL} />
    </>
  ),
  code: (
    <path
      d="M8 9l-3 3 3 3M16 9l3 3-3 3M12 3l-2 18"
      stroke={S}
      strokeWidth={SW}
      strokeLinecap={SL}
      strokeLinejoin={SJ}
    />
  ),
  'code-block': (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" stroke={S} strokeWidth={SW} />
      <path
        d="M8 10l-3 2 3 2M16 10l3 2-3 2"
        stroke={S}
        strokeWidth="1.4"
        strokeLinecap={SL}
        strokeLinejoin={SJ}
      />
    </>
  ),
  link: (
    <>
      <path
        d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"
        stroke={S}
        strokeWidth={SW}
        strokeLinecap={SL}
        strokeLinejoin={SJ}
      />
      <path
        d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"
        stroke={S}
        strokeWidth={SW}
        strokeLinecap={SL}
        strokeLinejoin={SJ}
      />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" stroke={S} strokeWidth={SW} />
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
      <polyline
        points="21 15 16 10 5 21"
        stroke={S}
        strokeWidth={SW}
        strokeLinecap={SL}
        strokeLinejoin={SJ}
      />
    </>
  ),
  table: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" stroke={S} strokeWidth={SW} />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" stroke={S} strokeWidth="1.2" strokeLinecap={SL} />
    </>
  ),
  hr: (
    <>
      <line x1="3" y1="12" x2="21" y2="12" stroke={S} strokeWidth="2" strokeLinecap={SL} />
      <line x1="3" y1="7" x2="8" y2="7" stroke={S} strokeWidth="1.2" strokeLinecap={SL} />
      <line x1="3" y1="17" x2="8" y2="17" stroke={S} strokeWidth="1.2" strokeLinecap={SL} />
    </>
  ),
  graph: (
    <>
      <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.6" />
      <line
        x1="8.59"
        y1="13.51"
        x2="15.42"
        y2="17.49"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="15.41"
        y1="6.51"
        x2="8.59"
        y2="10.49"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </>
  ),
}

const Icon = memo(function Icon({
  name,
  size = 16,
  className,
  'aria-hidden': ariaHidden = true,
  'aria-label': ariaLabel,
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
      className={className}
    >
      {PATHS[name]}
    </svg>
  )
})

export default Icon
