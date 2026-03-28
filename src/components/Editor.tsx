/**
 * src/components/Editor.tsx
 * Multi-tab WYSIWYG editor panel.
 *
 * Architecture — "all tabs stay mounted":
 *   One editor instance is rendered per open tab. Non-active tabs are hidden
 *   with `display: none` (not unmounted). This preserves each tab's full
 *   undo/redo history without any custom serialization.
 *
 * .md files → TipTap rich-text editor (WYSIWYG, no raw markdown syntax visible)
 * .txt files → Plain <textarea> (monospace, no formatting)
 *
 * Formatting commands arrive via 'notara:md-format' CustomEvents dispatched by
 * MarkdownToolstrip and the right-click context menu.
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { Extension } from '@tiptap/core'
import type { Editor as TipTapEditor } from '@tiptap/core'
import { useContextMenu } from './ContextMenu'
import { type MdFormatType } from './MarkdownToolstrip'
import type { Tab } from '../types'
import {
  markdownToHtml,
  htmlToMarkdown,
  parseFrontmatter,
  serializeFrontmatter,
  stripFrontmatter,
} from '../utils/markdownConvert'
import SlashCommandMenu, { type SlashCommandId, filterSlashCommands } from './SlashCommandMenu'
import { stemFilename } from '../utils/filenames'

// ─── BlockId extension ────────────────────────────────────────────────────────
// Assigns a stable data-block-id attribute to every top-level block node.
// IDs are assigned on creation and preserved through updates, enabling future
// features like deep-linking to specific blocks.

let _blockIdCounter = 0
function newBlockId(): string {
  return `blk-${Date.now().toString(36)}-${(++_blockIdCounter).toString(36)}`
}

/**
 * TipTap extension that ensures every block-level node has a unique
 * `data-block-id` attribute.  IDs are added on transaction commit if absent.
 */
const BlockId = Extension.create({
  name: 'blockId',
  addGlobalAttributes() {
    return [
      {
        types: [
          'paragraph',
          'heading',
          'bulletList',
          'orderedList',
          'taskList',
          'blockquote',
          'codeBlock',
          'horizontalRule',
          'table',
        ],
        attributes: {
          'data-block-id': {
            default: null,
            parseHTML: (el) => el.getAttribute('data-block-id'),
            renderHTML: (attrs) => {
              const id = attrs['data-block-id'] ?? newBlockId()
              return { 'data-block-id': id }
            },
          },
        },
      },
    ]
  },
})

// ─── Types ────────────────────────────────────────────────────────────────────

type EditorProps = {
  tabs: Tab[]
  activeTab: string | null
  getContent: (filename: string) => string
  getExternalVersion: (filename: string) => number
  onContentChange: (filename: string, value: string) => void
  onCloseTab: (filename: string) => void
  onSelectTab: (filename: string) => void
  onReorderTabs?: (newOrder: Tab[]) => void
  /** Called with a 0–1 scroll fraction when the active editor scrolls. */
  onScrollPct?: (pct: number) => void
  appTheme: 'dark' | 'light'
  wordWrap: boolean
  spellcheck: boolean
  lineNumbers: boolean
  fontSize: number
  tabWidth: 2 | 4
  showPrompt?: (
    title: string,
    label: string,
    options?: {
      placeholder?: string
      defaultValue?: string
      submitLabel?: string
      cancelLabel?: string
    }
  ) => Promise<string | null>
  showConfirm?: (
    title: string,
    message: string,
    options?: { confirmLabel?: string; cancelLabel?: string; isDangerous?: boolean }
  ) => Promise<boolean>
  className?: string
  /** Called when user requests to open a note in the split pane. */
  onOpenInSplit?: (filename: string) => void
  /** Recent files list for empty state. */
  recentFiles?: string[]
  /** All note filenames (for filtering recent files). */
  noteList?: string[]
  /** Callback when a recent file is clicked. */
  onOpenRecentFile?: (filename: string) => void
  /** Set of filenames currently loading. */
  loadingTabs?: Set<string>
  /** Set of filenames open in other windows. */
  openInOtherWindows?: Set<string>
  /**
   * Called when the user adds or removes a tag on the active note.
   * The callback receives the filename and the NEW complete tag list.
   * The caller is responsible for updating the note's frontmatter.
   */
  onTagsChange?: (filename: string, tags: string[]) => void
  /** Current tags for the active note (derived from frontmatter). */
  activeNoteTags?: string[]
}

// ─── TagBar ───────────────────────────────────────────────────────────────────

/**
 * Thin tag strip rendered below the tab bar for the active note.
 * Shows existing frontmatter tags as removable pills and an inline input
 * for adding new tags. Changes are committed immediately via onTagsChange.
 */
function TagBar({
  tags,
  onTagsChange,
}: {
  tags: string[]
  onTagsChange: (tags: string[]) => void
}) {
  const [inputVisible, setInputVisible] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function commitTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/^#/, '')
    if (!tag || tags.includes(tag)) {
      setInputValue('')
      setInputVisible(false)
      return
    }
    onTagsChange([...tags, tag])
    setInputValue('')
    setInputVisible(false)
  }

  function removeTag(tag: string) {
    onTagsChange(tags.filter((t) => t !== tag))
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commitTag(inputValue)
    } else if (e.key === 'Escape') {
      setInputValue('')
      setInputVisible(false)
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }

  function showInput() {
    setInputVisible(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 4,
        padding: '4px 12px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--surface-900)',
        minHeight: 30,
      }}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            padding: '1px 7px',
            borderRadius: 10,
            fontSize: 11,
            background: 'color-mix(in srgb, var(--accent) 15%, var(--surface-700))',
            color: 'var(--accent)',
            fontWeight: 500,
            lineHeight: '18px',
          }}
        >
          #{tag}
          <button
            onClick={() => removeTag(tag)}
            aria-label={`Remove tag ${tag}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 12,
              height: 12,
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'inherit',
              opacity: 0.6,
              lineHeight: 1,
            }}
          >
            <svg
              width="8"
              height="8"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="2" y1="2" x2="8" y2="8" />
              <line x1="8" y1="2" x2="2" y2="8" />
            </svg>
          </button>
        </span>
      ))}
      {inputVisible ? (
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
          onBlur={() => {
            if (inputValue.trim()) commitTag(inputValue)
            else {
              setInputValue('')
              setInputVisible(false)
            }
          }}
          placeholder="tag name"
          style={{
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontSize: 11,
            width: 90,
            padding: '1px 4px',
          }}
        />
      ) : (
        <button
          onClick={showInput}
          aria-label="Add tag"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            padding: '1px 6px',
            borderRadius: 10,
            fontSize: 11,
            border: '1px dashed var(--border-subtle)',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            lineHeight: '18px',
          }}
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="5" y1="1" x2="5" y2="9" />
            <line x1="1" y1="5" x2="9" y2="5" />
          </svg>
          tag
        </button>
      )}
    </div>
  )
}

// ─── TipTap formatting command dispatcher ────────────────────────────────────

async function applyTipTapFormat(
  editor: TipTapEditor,
  type: MdFormatType,
  showPrompt?: (
    title: string,
    label: string,
    options?: {
      placeholder?: string
      defaultValue?: string
      submitLabel?: string
      cancelLabel?: string
    }
  ) => Promise<string | null>
) {
  switch (type) {
    case 'bold':
      editor.chain().focus().toggleBold().run()
      break
    case 'italic':
      editor.chain().focus().toggleItalic().run()
      break
    case 'strikethrough':
      editor.chain().focus().toggleStrike().run()
      break
    case 'h1':
      editor.chain().focus().toggleHeading({ level: 1 }).run()
      break
    case 'h2':
      editor.chain().focus().toggleHeading({ level: 2 }).run()
      break
    case 'h3':
      editor.chain().focus().toggleHeading({ level: 3 }).run()
      break
    case 'list-ul':
      editor.chain().focus().toggleBulletList().run()
      break
    case 'list-ol':
      editor.chain().focus().toggleOrderedList().run()
      break
    case 'checkbox':
      editor.chain().focus().toggleTaskList().run()
      break
    case 'quote':
      editor.chain().focus().toggleBlockquote().run()
      break
    case 'code':
      editor.chain().focus().toggleCode().run()
      break
    case 'code-block':
      editor.chain().focus().toggleCodeBlock().run()
      break
    case 'link': {
      const url = showPrompt
        ? await showPrompt('Insert Link', 'Enter URL:', { placeholder: 'https://...' })
        : window.prompt('Enter URL:')
      if (url) editor.chain().focus().setLink({ href: url }).run()
      break
    }
    case 'image': {
      const src = showPrompt
        ? await showPrompt('Insert Image', 'Enter image URL:', { placeholder: 'https://...' })
        : window.prompt('Enter image URL:')
      if (src) editor.chain().focus().setImage({ src }).run()
      break
    }
    case 'table':
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      break
    case 'hr':
      editor.chain().focus().setHorizontalRule().run()
      break
  }
}

// ─── Slash command executor ───────────────────────────────────────────────────

/**
 * Delete the slash trigger text ("/query") from blockStart..cursorPos, then
 * apply the selected block transformation.
 */
function executeSlashCommand(
  editor: TipTapEditor,
  commandId: SlashCommandId,
  blockStart: number,
  cursorPos: number
) {
  // Delete the "/" + any query characters, then apply the block type
  const chain = editor.chain().focus().deleteRange({ from: blockStart, to: cursorPos })

  switch (commandId) {
    case 'h1':
      chain.toggleHeading({ level: 1 }).run()
      break
    case 'h2':
      chain.toggleHeading({ level: 2 }).run()
      break
    case 'h3':
      chain.toggleHeading({ level: 3 }).run()
      break
    case 'bullet':
      chain.toggleBulletList().run()
      break
    case 'ordered':
      chain.toggleOrderedList().run()
      break
    case 'task':
      chain.toggleTaskList().run()
      break
    case 'quote':
      chain.toggleBlockquote().run()
      break
    case 'code':
      chain.toggleCodeBlock().run()
      break
    case 'divider':
      chain.setHorizontalRule().run()
      break
    case 'table':
      chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      break
    default:
      chain.run()
  }
}

// ─── TipTap tab panel (.md files) ────────────────────────────────────────────

type TipTapPanelProps = {
  filename: string
  isActive: boolean
  initialContent: string
  /** Incremented by the parent when an external change (cross-window sync,
   *  version restore) has been applied to the cache and TipTap must re-sync.
   *  Normal keystrokes must NOT increment this — doing so causes content resets. */
  externalContentVersion: number
  onContentChange: (filename: string, value: string) => void
  fontSize: number
  wordWrap: boolean
  spellcheck: boolean
  showPrompt?: (
    title: string,
    label: string,
    options?: {
      placeholder?: string
      defaultValue?: string
      submitLabel?: string
      cancelLabel?: string
    }
  ) => Promise<string | null>
  scrollPositions: React.MutableRefObject<Map<string, number>>
}

// ─── Slash command state type ─────────────────────────────────────────────────

type SlashState = {
  visible: boolean
  query: string
  anchor: { x: number; y: number }
  selectedIdx: number
  /** Editor position of the block start (so we can delete the "/" + query). */
  blockStart: number
  /** Editor position of the cursor when the menu opened. */
  cursorPos: number
}

const SLASH_HIDDEN: SlashState = {
  visible: false,
  query: '',
  anchor: { x: 0, y: 0 },
  selectedIdx: 0,
  blockStart: 0,
  cursorPos: 0,
}

function TipTapTabPanel({
  filename,
  isActive,
  initialContent,
  externalContentVersion,
  onContentChange,
  fontSize,
  wordWrap,
  spellcheck,
  showPrompt,
  scrollPositions,
}: TipTapPanelProps) {
  // Track the last markdown we wrote so we don't loop on external updates
  const lastMdRef = useRef(initialContent)
  // Flag set during external setContent() so onUpdate doesn't call back
  const suppressUpdateRef = useRef(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const wasActiveRef = useRef(isActive)

  // ── Slash command state ───────────────────────────────────────────────────
  const [slashState, setSlashState] = useState<SlashState>(SLASH_HIDDEN)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Use our own heading styles; StarterKit's defaults are fine
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false }),
      Image,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      BlockId,
    ],
    content: markdownToHtml(initialContent),
    // Disable input rules so typing ** doesn't bold, # doesn't create headings, etc.
    enableInputRules: false,
    // Disable paste rules so pasting **text** keeps it literal
    enablePasteRules: false,
    editorProps: {
      attributes: {
        class: 'tiptap-prose',
        spellcheck: spellcheck ? 'true' : 'false',
      },
    },
    onUpdate: ({ editor }) => {
      if (suppressUpdateRef.current) return
      const html = editor.getHTML()
      const md = htmlToMarkdown(html)
      lastMdRef.current = md
      onContentChange(filename, md)

      // ── Slash command detection ─────────────────────────────────────────
      // Show the menu when the user types "/" at the start of an empty block
      // (i.e., the only content in the current block is "/" optionally followed
      // by word characters).
      try {
        const { from } = editor.state.selection
        const $from = editor.state.doc.resolve(from)
        const blockStart = $from.start()
        const textBeforeCursor = editor.state.doc.textBetween(blockStart, from)
        const slashMatch = /^\/(\w*)$/.exec(textBeforeCursor)

        if (slashMatch) {
          const query = slashMatch[1]
          // Only show if there are matching commands
          if (filterSlashCommands(query).length > 0) {
            try {
              const coords = editor.view.coordsAtPos(from)
              setSlashState({
                visible: true,
                query,
                anchor: { x: coords.left, y: coords.bottom },
                selectedIdx: 0,
                blockStart,
                cursorPos: from,
              })
            } catch {
              setSlashState(SLASH_HIDDEN)
            }
          } else {
            setSlashState(SLASH_HIDDEN)
          }
        } else {
          // Hide menu once the "/" trigger text is no longer at block start
          setSlashState((prev) => (prev.visible ? SLASH_HIDDEN : prev))
        }
      } catch {
        // Ignore any document/view errors during detection
      }
    },
  })

  // Save/restore scroll position on tab switch
  useEffect(() => {
    const wasActive = wasActiveRef.current
    wasActiveRef.current = isActive

    if (wasActive && !isActive) {
      // Deactivating: save scroll position
      const container = scrollContainerRef.current
      if (container) {
        scrollPositions.current.set(filename, container.scrollTop)
      }
    } else if (!wasActive && isActive) {
      // Activating: restore scroll position after a frame
      requestAnimationFrame(() => {
        const container = scrollContainerRef.current
        if (container) {
          const saved = scrollPositions.current.get(filename)
          if (saved !== undefined) container.scrollTop = saved
        }
      })
    }
  }, [isActive, filename, scrollPositions])

  // Sync TipTap content when an external change arrives (cross-window sync,
  // version restore). externalContentVersion is only incremented for genuine
  // external changes — never for normal keystrokes — so this never resets
  // in-progress edits.
  useEffect(() => {
    if (externalContentVersion === 0) return
    if (!editor || editor.isDestroyed) return
    suppressUpdateRef.current = true
    editor.commands.setContent(markdownToHtml(initialContent))
    lastMdRef.current = initialContent
    setTimeout(() => {
      suppressUpdateRef.current = false
    }, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalContentVersion])

  // ── Slash command: keyboard handling (↑ ↓ Enter Escape) ───────────────────
  useEffect(() => {
    if (!isActive || !editor || !slashState.visible) return

    function handleSlashKey(e: KeyboardEvent) {
      if (!slashState.visible) return
      const results = filterSlashCommands(slashState.query)
      if (results.length === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setSlashState((prev) => ({
          ...prev,
          selectedIdx: (prev.selectedIdx + 1) % results.length,
        }))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setSlashState((prev) => ({
          ...prev,
          selectedIdx: (prev.selectedIdx - 1 + results.length) % results.length,
        }))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        const cmd = results[slashState.selectedIdx]
        if (cmd) executeSlashCommand(editor, cmd.id, slashState.blockStart, slashState.cursorPos)
        setSlashState(SLASH_HIDDEN)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setSlashState(SLASH_HIDDEN)
      }
    }

    // Use capture phase so we intercept before TipTap's default key handling
    document.addEventListener('keydown', handleSlashKey, true)
    return () => document.removeEventListener('keydown', handleSlashKey, true)
  }, [isActive, editor, slashState])

  // Format events — only handle when this tab is active
  useEffect(() => {
    if (!isActive || !editor) return
    const handle = (e: Event) => {
      const { type } = (e as CustomEvent<{ type: MdFormatType }>).detail
      void applyTipTapFormat(editor, type, showPrompt)
    }
    window.addEventListener('notara:md-format', handle)
    return () => window.removeEventListener('notara:md-format', handle)
  }, [isActive, editor, showPrompt])

  // Undo / Redo events routed from AppMenuBar
  useEffect(() => {
    if (!isActive || !editor) return
    const onUndo = () => editor.chain().focus().undo().run()
    const onRedo = () => editor.chain().focus().redo().run()
    window.addEventListener('notara:editor-undo', onUndo)
    window.addEventListener('notara:editor-redo', onRedo)
    return () => {
      window.removeEventListener('notara:editor-undo', onUndo)
      window.removeEventListener('notara:editor-redo', onRedo)
    }
  }, [isActive, editor])

  // Focus editor when this tab becomes active
  useEffect(() => {
    if (isActive && editor && !editor.isDestroyed) {
      requestAnimationFrame(() => editor.commands.focus())
    }
  }, [isActive, editor])

  // Focus request events from other UI components (e.g. sidebar)
  useEffect(() => {
    if (!isActive || !editor) return
    const onFocusReq = () => editor.commands.focus()
    window.addEventListener('notara:focus-active-editor', onFocusReq)
    return () => window.removeEventListener('notara:focus-active-editor', onFocusReq)
  }, [isActive, editor])

  // Keep spellcheck attribute in sync when the setting changes
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.setOptions({
      editorProps: {
        attributes: {
          class: 'tiptap-prose',
          spellcheck: spellcheck ? 'true' : 'false',
        },
      },
    })
  }, [editor, spellcheck])

  return (
    <div
      style={
        {
          position: 'absolute',
          inset: 0,
          display: isActive ? 'flex' : 'none',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--editor-bg)',
        } as React.CSSProperties
      }
    >
      <EditorContent
        ref={scrollContainerRef as any}
        editor={editor}
        className={wordWrap ? '' : 'tiptap-nowrap'}
        style={
          {
            flex: 1,
            overflow: 'auto',
            fontSize: `${fontSize}px`,
            padding: '2rem 3rem',
            boxSizing: 'border-box',
          } as React.CSSProperties
        }
      />

      {/* Slash command floating menu — rendered via fixed positioning so it
          escapes the editor's overflow:hidden/scroll container cleanly. */}
      <SlashCommandMenu
        visible={slashState.visible}
        query={slashState.query}
        anchor={slashState.anchor}
        selectedIdx={slashState.selectedIdx}
        onSelect={(id) => {
          if (editor) {
            executeSlashCommand(editor, id, slashState.blockStart, slashState.cursorPos)
          }
          setSlashState(SLASH_HIDDEN)
        }}
        onClose={() => setSlashState(SLASH_HIDDEN)}
        onNavigate={(delta) =>
          setSlashState((prev) => {
            const results = filterSlashCommands(prev.query)
            if (results.length === 0) return prev
            return {
              ...prev,
              selectedIdx: (prev.selectedIdx + delta + results.length) % results.length,
            }
          })
        }
      />
    </div>
  )
}

// ─── Plain text tab panel (.txt files) ───────────────────────────────────────

type PlainTextPanelProps = {
  filename: string
  isActive: boolean
  content: string
  onContentChange: (filename: string, value: string) => void
  fontSize: number
  wordWrap: boolean
  spellcheck: boolean
  tabWidth: 2 | 4
  scrollPositions: React.MutableRefObject<Map<string, number>>
}

const PlainTextTabPanel = memo(function PlainTextTabPanel({
  filename,
  isActive,
  content,
  onContentChange,
  fontSize,
  wordWrap,
  spellcheck,
  tabWidth,
  scrollPositions,
}: PlainTextPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const wasActiveRef = useRef(isActive)

  // Save/restore scroll position on tab switch
  useEffect(() => {
    const wasActive = wasActiveRef.current
    wasActiveRef.current = isActive

    if (wasActive && !isActive) {
      // Deactivating: save scroll position
      if (textareaRef.current) {
        scrollPositions.current.set(filename, textareaRef.current.scrollTop)
      }
    } else if (!wasActive && isActive) {
      // Activating: restore scroll position after a frame
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const saved = scrollPositions.current.get(filename)
          if (saved !== undefined) textareaRef.current.scrollTop = saved
        }
      })
    }
  }, [isActive, filename, scrollPositions])

  // Focus when active
  useEffect(() => {
    if (isActive) requestAnimationFrame(() => textareaRef.current?.focus())
  }, [isActive])

  // Focus request from other UI
  useEffect(() => {
    if (!isActive) return
    const onFocusReq = () => textareaRef.current?.focus()
    window.addEventListener('notara:focus-active-editor', onFocusReq)
    return () => window.removeEventListener('notara:focus-active-editor', onFocusReq)
  }, [isActive])

  return (
    <div
      style={
        {
          position: 'absolute',
          inset: 0,
          display: isActive ? 'flex' : 'none',
          background: 'var(--editor-bg)',
        } as React.CSSProperties
      }
    >
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => onContentChange(filename, e.target.value)}
        spellCheck={spellcheck}
        style={
          {
            flex: 1,
            resize: 'none',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontFamily: 'var(--code-font)',
            fontSize: `${fontSize}px`,
            lineHeight: 1.7,
            padding: '2rem 3rem',
            whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
            overflowWrap: wordWrap ? 'break-word' : 'normal',
            tabSize: tabWidth,
            overflowY: 'auto',
            overflowX: wordWrap ? 'hidden' : 'auto',
          } as React.CSSProperties
        }
      />
    </div>
  )
})

// ─── EmptyDropZone ────────────────────────────────────────────────────────────

// Full-area drop zone for when there are no open tabs.
// Always accepts cross-window tab drops. Shows a prominent drop UI when a drag
// is detected (either via IPC pre-announcement or live dragenter).

function EmptyDropZone({
  isFocused,
  recentFiles,
  noteList,
  onOpenRecentFile,
}: {
  isFocused: boolean
  recentFiles?: string[]
  noteList?: string[]
  onOpenRecentFile?: (filename: string) => void
}) {
  const [dragAvailable, setDragAvailable] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    if (!window.api?.onTabDragAvailable) return
    const cleanupAvailable = window.api.onTabDragAvailable(() => setDragAvailable(true))
    const cleanupCancelled = window.api.onTabDragCancelled(() => {
      setDragAvailable(false)
      setDragOver(false)
    })
    return () => {
      cleanupAvailable()
      cleanupCancelled()
    }
  }, [])

  // Active when either main pre-announced a drag OR the cursor entered with something draggable
  const isActive = dragAvailable || dragOver

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragAvailable(false)
    setDragOver(false)
    // Only handle cross-window tab drags
    if (!e.dataTransfer.types.includes('application/x-notara-tab')) return
    try {
      const filename = await window.api.tabDragAccept()
      if (filename) {
        window.dispatchEvent(new CustomEvent('notara:open-tab', { detail: filename }))
      }
    } catch (err) {
      console.warn('[EmptyDropZone] cross-window drop failed:', err)
    }
  }

  // Show recent files in the empty-state drop zone
  const visibleRecent =
    !isFocused && !isActive && recentFiles && noteList
      ? recentFiles.filter((f) => noteList.includes(f)).slice(0, 5)
      : []

  return (
    <div
      className="flex flex-1 items-center justify-center transition-colors"
      style={{
        background: isActive ? 'var(--surface-800)' : 'var(--surface-900)',
        cursor: isActive ? 'copy' : 'default',
      }}
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('application/x-notara-tab')) setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-notara-tab')) e.preventDefault()
      }}
      onDrop={handleDrop}
    >
      {isActive ? (
        <div
          className="flex flex-col items-center gap-3 rounded-xl px-10 py-8 transition-colors"
          style={{
            border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-subtle)'}`,
            background: dragOver
              ? 'color-mix(in srgb, var(--accent) 8%, var(--surface-800))'
              : 'var(--surface-800)',
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke={dragOver ? 'var(--accent)' : 'var(--text-muted)'}
            strokeWidth={1.5}
            className="transition-colors"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
            />
          </svg>
          <p
            className="text-sm font-medium transition-colors"
            style={{ color: dragOver ? 'var(--accent)' : 'var(--text-muted)' }}
          >
            Drop tab here
          </p>
        </div>
      ) : (
        <EmptyState
          isFocused={isFocused}
          recentFiles={visibleRecent}
          onOpenRecentFile={onOpenRecentFile}
        />
      )}
    </div>
  )
}

// ─── TabBar ───────────────────────────────────────────────────────────────────

// Key used in dataTransfer to identify a tab drag from Notara's tab bar
const NOTARA_TAB_DRAG_KEY = 'application/x-notara-tab'

function TabBar({
  tabs,
  activeTab,
  onSelectTab,
  onCloseTab,
  onReorderTabs,
  showConfirm,
  onOpenInSplit,
  pinnedTabs,
  togglePinTab,
  loadingTabs,
  openInOtherWindows,
}: {
  tabs: Tab[]
  activeTab: string | null
  onSelectTab: (f: string) => void
  onCloseTab: (f: string) => void
  onReorderTabs?: (newOrder: Tab[]) => void
  showConfirm?: (
    title: string,
    message: string,
    options?: { confirmLabel?: string; cancelLabel?: string; isDangerous?: boolean }
  ) => Promise<boolean>
  onOpenInSplit?: (filename: string) => void
  pinnedTabs: Set<string>
  togglePinTab: (filename: string) => void
  loadingTabs?: Set<string>
  openInOtherWindows?: Set<string>
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  // When another window is dragging a tab, show a drop zone at the end of our tab bar
  const [crossWindowDragAvailable, setCrossWindowDragAvailable] = useState(false)
  const [crossWindowDragOver, setCrossWindowDragOver] = useState(false)
  // Track whether the current outbound drag was accepted by another window
  const dragAcceptedRef = useRef(false)
  // Track which filename is being dragged out for cross-window tab moves
  const dragFilenameRef = useRef<string | null>(null)
  const tabBarRef = useRef<HTMLDivElement>(null)
  const { menu: ctxMenu, openMenu } = useContextMenu()

  // Listen for cross-window drag events from main process
  useEffect(() => {
    if (!window.api?.onTabDragAvailable) return
    const cleanupAvailable = window.api.onTabDragAvailable(() => setCrossWindowDragAvailable(true))
    const cleanupCancelled = window.api.onTabDragCancelled(() => {
      setCrossWindowDragAvailable(false)
      setCrossWindowDragOver(false)
    })
    // When the tab was moved out (accepted by another window), note it so onDragEnd skips cancel
    const cleanupMovedOut = window.api.onTabMovedOut(() => {
      dragAcceptedRef.current = true
    })
    return () => {
      cleanupAvailable()
      cleanupCancelled()
      cleanupMovedOut()
    }
  }, [])

  const confirmAndCloseTab = async (tab: Tab) => {
    if (pinnedTabs.has(tab.filename)) return // pinned tabs cannot be closed
    if (tab.isDirty) {
      const confirmed = await showConfirm?.(
        'Close Tab',
        `Close "${tab.filename}"?\n\nYou have unsaved changes.`,
        { confirmLabel: 'Close' }
      )
      if (!confirmed) return
    }
    onCloseTab(tab.filename)
  }

  const moveToNewWindow = async (tab: Tab) => {
    try {
      await window.api.moveToNewWindow(tab.filename)
      onCloseTab(tab.filename)
    } catch (err) {
      console.warn('[TabBar] move-to-new-window failed:', err)
    }
  }

  function reorder(arr: Tab[], from: number, to: number): Tab[] {
    const next = [...arr]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
  }

  function displayName(filename: string, allFilenames: string[]): string {
    const stem = stemFilename(filename)
    const hasDuplicate = allFilenames.some((f) => f !== filename && stemFilename(f) === stem)
    return hasDuplicate ? filename : stem
  }

  // Sort pinned tabs first in the tab bar
  const sortedTabs = [
    ...tabs.filter((t) => pinnedTabs.has(t.filename)),
    ...tabs.filter((t) => !pinnedTabs.has(t.filename)),
  ]

  return (
    <>
      {ctxMenu}
      <div
        className="tab-bar"
        ref={tabBarRef}
        // Horizontal scroll on mouse wheel
        onWheel={(e) => {
          e.preventDefault()
          e.currentTarget.scrollLeft += e.deltaY
        }}
      >
        {sortedTabs.map((tab, i) => {
          const active = tab.filename === activeTab
          const isDragOver = overIdx === i && dragIdx !== null && dragIdx !== i
          const isPinned = pinnedTabs.has(tab.filename)
          const isLoading = loadingTabs?.has(tab.filename) ?? false
          const isOpenElsewhere = openInOtherWindows?.has(tab.filename) ?? false
          return (
            <div
              key={tab.filename}
              tabIndex={0}
              role="tab"
              aria-selected={active}
              draggable={!!onReorderTabs}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelectTab(tab.filename)
                }
              }}
              // Middle-click to close tab
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  void confirmAndCloseTab(tab)
                }
              }}
              onDragStart={(e) => {
                setDragIdx(i)
                dragAcceptedRef.current = false
                dragFilenameRef.current = tab.filename
                e.dataTransfer.setData('text/plain', tab.filename)
                e.dataTransfer.setData(NOTARA_TAB_DRAG_KEY, tab.filename)
                e.dataTransfer.effectAllowed = 'move'
                // Announce drag to other windows via main process
                window.api?.tabDragStart(tab.filename).catch(() => {})
              }}
              onDragOver={(e) => {
                e.preventDefault()
                setOverIdx(i)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
                  dragAcceptedRef.current = true // Fix: mark drag as accepted for intra-window reorder
                  onReorderTabs?.(reorder(sortedTabs, dragIdx, overIdx))
                }
                setDragIdx(null)
                setOverIdx(null)
              }}
              onDragEnd={() => {
                setDragIdx(null)
                setOverIdx(null)
                const draggedFilename = dragFilenameRef.current
                // Delay cancel so tabDragAccept from a target window can win the race first.
                setTimeout(() => {
                  if (!dragAcceptedRef.current) {
                    window.api?.tabDragCancel().catch(() => {})
                    // Drag not accepted by another window — open in new window
                    if (draggedFilename) {
                      void window.api
                        ?.moveToNewWindow(draggedFilename)
                        .then(() => onCloseTab(draggedFilename))
                        .catch(() => {})
                    }
                  }
                  dragAcceptedRef.current = false
                  dragFilenameRef.current = null
                }, 150)
              }}
              onContextMenu={(e) => {
                const isFocusedWindow =
                  new URLSearchParams(window.location.search).get('focused') === '1'
                openMenu(e, [
                  // Pin tab toggle
                  {
                    label: isPinned ? 'Unpin Tab' : 'Pin Tab',
                    onClick: () => togglePinTab(tab.filename),
                  },
                  { separator: true as const },
                  ...(!isFocusedWindow
                    ? [
                        {
                          label: 'Move to New Window',
                          onClick: async () => {
                            await moveToNewWindow(tab)
                          },
                        },
                        // Open in split pane
                        ...(onOpenInSplit
                          ? [
                              {
                                label: 'Open in Split',
                                onClick: () => onOpenInSplit(tab.filename),
                              },
                            ]
                          : []),
                        { separator: true as const },
                      ]
                    : []),
                  // Copy file path to clipboard
                  {
                    label: 'Copy File Path',
                    onClick: () => {
                      void navigator.clipboard.writeText(tab.filename)
                    },
                  },
                  { separator: true as const },
                  {
                    label: 'Close',
                    onClick: async () => {
                      await confirmAndCloseTab(tab)
                    },
                  },
                  {
                    label: 'Close Others',
                    disabled: tabs.length <= 1,
                    onClick: async () => {
                      for (const t of tabs.filter((t) => t.filename !== tab.filename)) {
                        await confirmAndCloseTab(t)
                      }
                    },
                  },
                  {
                    label: 'Close All',
                    onClick: async () => {
                      for (const t of tabs) {
                        await confirmAndCloseTab(t)
                      }
                    },
                  },
                ])
              }}
              className={`tab-item group ${active ? 'active' : ''} ${isDragOver ? 'drag-over' : ''} ${isLoading ? 'loading' : ''}`}
              onClick={() => onSelectTab(tab.filename)}
              title={tab.filename}
              style={isPinned ? { borderLeft: '2px solid var(--accent)' } : undefined}
            >
              {/* Feature 8: Pin icon for pinned tabs */}
              {isPinned && (
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 24 24"
                  fill="var(--accent)"
                  stroke="none"
                  aria-hidden
                  style={{ flexShrink: 0 }}
                >
                  <path d="M16 2v6l2 2-3 3-3-3V2H8v8l-3 3 2 2 3-3v5l2 2 2-2v-5l3 3 2-2-3-3V2z" />
                </svg>
              )}
              {tab.isDirty && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-dirty"
                  title="Unsaved changes"
                />
              )}
              <span className="min-w-0 select-none truncate font-mono">
                {displayName(
                  tab.filename,
                  tabs.map((t) => t.filename)
                )}
              </span>
              {/* Feature 18: Open in other window indicator */}
              {isOpenElsewhere && (
                <div
                  title="Also open in another window"
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    opacity: 0.7,
                    flexShrink: 0,
                  }}
                />
              )}
              {/* Feature 8: No close button for pinned tabs */}
              {!isPinned && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    await confirmAndCloseTab(tab)
                  }}
                  className={`ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-surface-700 hover:text-destructive ${
                    active
                      ? 'text-muted opacity-100'
                      : 'text-on-surface opacity-0 group-hover:opacity-100'
                  }`}
                  title={`Close ${tab.filename}`}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    aria-hidden
                  >
                    <line x1="2" y1="2" x2="10" y2="10" />
                    <line x1="10" y1="2" x2="2" y2="10" />
                  </svg>
                </button>
              )}
            </div>
          )
        })}

        {/* Cross-window drop zone — fills remaining tab bar space when a drag is available */}
        {crossWindowDragAvailable && (
          <div
            className="flex flex-1 items-center justify-center transition-colors"
            style={{
              margin: '3px 4px 3px 2px',
              borderRadius: 4,
              border: `1.5px dashed ${crossWindowDragOver ? 'var(--accent)' : 'var(--border-subtle)'}`,
              background: crossWindowDragOver
                ? 'color-mix(in srgb, var(--accent) 10%, var(--surface-800))'
                : 'var(--surface-800)',
              color: crossWindowDragOver ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'copy',
              minWidth: 60,
              fontSize: 11,
              gap: 6,
            }}
            onDragEnter={() => setCrossWindowDragOver(true)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setCrossWindowDragOver(false)
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault()
              e.stopPropagation()
              setCrossWindowDragAvailable(false)
              setCrossWindowDragOver(false)
              try {
                const filename = await window.api.tabDragAccept()
                if (filename) {
                  // Open the tab in this window — App.tsx listens for this event
                  window.dispatchEvent(new CustomEvent('notara:open-tab', { detail: filename }))
                }
              } catch (err) {
                console.warn('[TabBar] cross-window drop failed:', err)
              }
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              <path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            Drop tab here
          </div>
        )}
      </div>
    </>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
  className,
  isFocused = false,
  recentFiles,
  onOpenRecentFile,
}: {
  className?: string
  isFocused?: boolean
  recentFiles?: string[]
  onOpenRecentFile?: (filename: string) => void
}) {
  return (
    <div className={`flex flex-1 items-center justify-center bg-surface-900 ${className ?? ''}`}>
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-800 ring-1 ring-muted">
          <svg
            className="h-5 w-5 text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-muted">No note open</p>
        <p className="mt-1.5 text-[11px] text-muted">
          {isFocused
            ? 'Drag a tab here from another window to start editing.'
            : 'Select a note from the sidebar or create a new one.'}
        </p>
        {/* Feature 15: Recent files */}
        {!isFocused && recentFiles && recentFiles.length > 0 && (
          <div className="mt-4 flex flex-col gap-1 items-center">
            <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Recent</p>
            {recentFiles.map((f) => (
              <button
                key={f}
                onClick={() => onOpenRecentFile?.(f)}
                className="text-[12px] px-3 py-1 rounded-md transition-colors"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background = 'var(--btn-ghost-hover)'
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background = ''
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
                }}
              >
                {stemFilename(f)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Editor (main export) ─────────────────────────────────────────────────────

export default function Editor({
  tabs,
  activeTab,
  getContent,
  getExternalVersion,
  onContentChange,
  onCloseTab,
  onSelectTab,
  onReorderTabs,
  wordWrap,
  spellcheck,
  fontSize,
  tabWidth,
  showPrompt,
  showConfirm = async () => true,
  className = '',
  onOpenInSplit,
  recentFiles,
  noteList,
  onOpenRecentFile,
  loadingTabs,
  openInOtherWindows,
  onTagsChange,
  activeNoteTags = [],
}: EditorProps) {
  const activeTabRef = useRef(activeTab)
  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  // Scroll position memory — shared map across all tab panels
  const scrollPositions = useRef<Map<string, number>>(new Map())

  // Pinned tabs — tabs pinned within this window persist until explicitly unpinned
  const [pinnedTabs, setPinnedTabs] = useState<Set<string>>(new Set())
  const togglePinTab = useCallback((filename: string) => {
    setPinnedTabs((prev) => {
      const next = new Set(prev)
      if (next.has(filename)) next.delete(filename)
      else next.add(filename)
      return next
    })
  }, [])

  // Context menu for right-clicking the editor area
  const { menu: editorCtxMenu, openMenu: openEditorMenu } = useContextMenu()

  // Pending right-click: we delay the standard menu by ~100ms so the async
  // spellcheck IPC from Electron can arrive first and take priority.
  const pendingCtxRef = useRef<{ x: number; y: number } | null>(null)
  const pendingCtxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function buildStandardMenuItems(): Parameters<typeof openEditorMenu>[1] {
    return [
      {
        label: 'Cut',
        shortcut: 'Ctrl+X',
        onClick: () => {
          void document.execCommand('cut')
        },
      },
      {
        label: 'Copy',
        shortcut: 'Ctrl+C',
        onClick: () => {
          void document.execCommand('copy')
        },
      },
      {
        label: 'Paste',
        shortcut: 'Ctrl+V',
        onClick: () => {
          void document.execCommand('paste')
        },
      },
      { separator: true },
      {
        label: 'Select All',
        shortcut: 'Ctrl+A',
        onClick: () => {
          void document.execCommand('selectAll')
        },
      },
      { separator: true },
      {
        label: 'Undo',
        shortcut: 'Ctrl+Z',
        onClick: () => {
          void window.dispatchEvent(new Event('notara:editor-undo'))
        },
      },
      {
        label: 'Redo',
        shortcut: 'Ctrl+Y',
        onClick: () => {
          void window.dispatchEvent(new Event('notara:editor-redo'))
        },
      },
    ]
  }

  const buildEditorContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const { clientX, clientY } = e
      pendingCtxRef.current = { x: clientX, y: clientY }
      if (pendingCtxTimerRef.current) clearTimeout(pendingCtxTimerRef.current)
      // Wait 100ms for spellcheck IPC; if it doesn't arrive, open the standard menu
      pendingCtxTimerRef.current = setTimeout(() => {
        pendingCtxTimerRef.current = null
        if (!pendingCtxRef.current) return
        pendingCtxRef.current = null
        openEditorMenu(
          {
            clientX,
            clientY,
            preventDefault: () => {},
            stopPropagation: () => {},
          } as unknown as React.MouseEvent,
          buildStandardMenuItems()
        )
      }, 100)
    },
    [openEditorMenu] // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Listen for spellcheck suggestions from Electron and inject them into context menu
  useEffect(() => {
    if (!window.api?.onSpellcheckSuggestions) return
    const cleanupSpellcheck = window.api.onSpellcheckSuggestions(
      ({ misspelled, suggestions, x, y }) => {
        // Cancel the pending standard menu so spellcheck menu takes priority
        if (pendingCtxTimerRef.current) {
          clearTimeout(pendingCtxTimerRef.current)
          pendingCtxTimerRef.current = null
        }
        pendingCtxRef.current = null

        const items: Parameters<typeof openEditorMenu>[1] = []
        if (suggestions.length > 0) {
          for (const word of suggestions.slice(0, 6)) {
            items.push({
              label: word,
              onClick: () => {
                void window.api.replaceMisspelling(word)
              },
            })
          }
          items.push({ separator: true })
        } else if (misspelled) {
          items.push({ label: 'No suggestions', disabled: true, onClick: () => {} })
          items.push({ separator: true })
        }
        if (misspelled) {
          items.push({
            label: `Add "${misspelled}" to dictionary`,
            onClick: () => {
              void window.api.addWordToDictionary(misspelled!)
            },
          })
          items.push({ separator: true })
        }
        items.push(...buildStandardMenuItems())
        // Open at the coordinates provided by Electron
        openEditorMenu(
          {
            clientX: x,
            clientY: y,
            preventDefault: () => {},
            stopPropagation: () => {},
          } as unknown as React.MouseEvent,
          items
        )
      }
    )
    return () => cleanupSpellcheck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openEditorMenu])

  if (tabs.length === 0) {
    return (
      <div className={`flex flex-col overflow-hidden ${className}`}>
        <EmptyDropZone
          isFocused={new URLSearchParams(window.location.search).get('focused') === '1'}
          recentFiles={recentFiles}
          noteList={noteList}
          onOpenRecentFile={onOpenRecentFile}
        />
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col overflow-hidden ${className}`}
      onContextMenu={buildEditorContextMenu}
    >
      {editorCtxMenu}
      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onReorderTabs={onReorderTabs}
        showConfirm={showConfirm}
        onOpenInSplit={onOpenInSplit}
        pinnedTabs={pinnedTabs}
        togglePinTab={togglePinTab}
        loadingTabs={loadingTabs}
        openInOtherWindows={openInOtherWindows}
      />

      {/* Tag bar — only shown for .md notes when onTagsChange is wired up */}
      {activeTab?.endsWith('.md') && onTagsChange && (
        <TagBar
          tags={activeNoteTags}
          onTagsChange={(newTags) => onTagsChange(activeTab, newTags)}
        />
      )}

      {/* Editor panels — all mounted, only active one visible */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' } as React.CSSProperties}>
        {tabs.map((tab) =>
          tab.filename.endsWith('.md') ? (
            <TipTapTabPanel
              key={tab.filename}
              filename={tab.filename}
              isActive={tab.filename === activeTab}
              initialContent={getContent(tab.filename)}
              externalContentVersion={getExternalVersion(tab.filename)}
              onContentChange={onContentChange}
              fontSize={fontSize}
              wordWrap={wordWrap}
              spellcheck={spellcheck}
              showPrompt={showPrompt}
              scrollPositions={scrollPositions}
            />
          ) : (
            <PlainTextTabPanel
              key={tab.filename}
              filename={tab.filename}
              isActive={tab.filename === activeTab}
              content={getContent(tab.filename)}
              onContentChange={onContentChange}
              fontSize={fontSize}
              wordWrap={wordWrap}
              spellcheck={spellcheck}
              tabWidth={tabWidth}
              scrollPositions={scrollPositions}
            />
          )
        )}
      </div>
    </div>
  )
}
