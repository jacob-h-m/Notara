/**
 * src/utils/markdownConvert.ts
 * Bidirectional markdown ↔ HTML conversion for the TipTap WYSIWYG editor.
 *
 * Loading (.md → HTML):  markdownToHtml()  — marked (GFM) + task-list fixup
 * Saving  (HTML → .md):  htmlToMarkdown()  — turndown + GFM plugin + task-list rule
 *
 * Frontmatter:
 *   parseFrontmatter()    — extract tags (and raw block) from YAML frontmatter
 *   stripFrontmatter()    — remove frontmatter block, returning body only
 *   serializeFrontmatter() — rebuild frontmatter + body as a markdown string
 */

import { marked } from 'marked'
import TurndownService from 'turndown'
// @ts-expect-error — no official types for turndown-plugin-gfm
import { gfm } from 'turndown-plugin-gfm'

// ─── Frontmatter ──────────────────────────────────────────────────────────────

export type FrontmatterData = {
  /** Parsed tags array. Empty when no tags key is present. */
  tags: string[]
  /** All other raw key:value lines from the frontmatter block, preserved verbatim. */
  otherLines: string[]
}

/** Regex to match a leading YAML frontmatter block (--- ... ---). */
const FM_BLOCK_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/**
 * Parse frontmatter from a raw markdown string.
 * Returns tags and any other frontmatter lines present in the block.
 * If no frontmatter block exists, returns empty tags and otherLines.
 */
export function parseFrontmatter(raw: string): FrontmatterData {
  const match = FM_BLOCK_RE.exec(raw)
  if (!match) return { tags: [], otherLines: [] }
  const block = match[1]
  const tags: string[] = []
  const otherLines: string[] = []
  for (const line of block.split(/\r?\n/)) {
    const tagsMatch = /^tags:\s*(.*)$/.exec(line)
    if (tagsMatch) {
      // Support both inline array  tags: [a, b]  and bare list  tags: a, b
      const raw = tagsMatch[1].trim().replace(/^\[|\]$/g, '')
      if (raw) {
        for (const t of raw.split(',')) {
          const tag = t.trim().toLowerCase().replace(/^#/, '')
          if (tag) tags.push(tag)
        }
      }
    } else {
      otherLines.push(line)
    }
  }
  return { tags, otherLines }
}

/**
 * Strip the frontmatter block from a raw markdown string and return the body.
 * If no frontmatter block exists, the string is returned unchanged.
 */
export function stripFrontmatter(raw: string): string {
  return raw.replace(FM_BLOCK_RE, '')
}

/**
 * Build a markdown string with a frontmatter block containing the given tags
 * plus any other preserved frontmatter lines, followed by the body content.
 *
 * If tags is empty AND otherLines is empty, no frontmatter block is written.
 */
export function serializeFrontmatter(
  body: string,
  tags: string[],
  otherLines: string[] = []
): string {
  const cleanTags = tags.map((t) => t.toLowerCase().replace(/^#/, '')).filter(Boolean)
  const hasContent = cleanTags.length > 0 || otherLines.length > 0
  if (!hasContent) return body

  const fmLines: string[] = []
  if (otherLines.length > 0) fmLines.push(...otherLines)
  fmLines.push(`tags: [${cleanTags.join(', ')}]`)

  return `---\n${fmLines.join('\n')}\n---\n${body}`
}

// ─── Markdown → HTML ──────────────────────────────────────────────────────────

// marked v5+ uses a synchronous parse() by default with GFM on
const renderer = new marked.Renderer()
// Prevent auto-linking bare URLs (they appear as raw text, which is cleaner)
renderer.link = ({ href, title, text }) => {
  const t = title ? ` title="${title}"` : ''
  return `<a href="${href}"${t}>${text}</a>`
}
marked.use({ renderer, gfm: true, breaks: false })

/**
 * Convert a markdown string to HTML suitable for TipTap's setContent().
 * Also transforms marked's checkbox list output to TipTap's taskList format.
 * Frontmatter is stripped before parsing so it never appears in the editor.
 */
export function markdownToHtml(md: string): string {
  if (!md) return ''
  let html = marked.parse(stripFrontmatter(md)) as string

  // Transform marked's task-list output into TipTap's expected format.
  // marked produces: <ul>\n<li><input checked disabled type="checkbox"> text</li>\n</ul>
  // TipTap expects:  <ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>text</p></li></ul>
  html = html.replace(/<ul>\n?([\s\S]*?)<\/ul>/g, (match, inner) => {
    // Only convert if the list items contain checkboxes
    if (!/<input[^>]*type="checkbox"/.test(inner)) return match
    const fixedItems = inner.replace(
      /<li><input([^>]*)>([\s\S]*?)<\/li>/g,
      (_: string, attrs: string, content: string) => {
        const checked = /checked/.test(attrs)
        const text = content.trim()
        return `<li data-type="taskItem" data-checked="${checked}"><p>${text}</p></li>`
      }
    )
    return `<ul data-type="taskList">${fixedItems}</ul>`
  })

  return html
}

// ─── HTML → Markdown ──────────────────────────────────────────────────────────

const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
  strongDelimiter: '**',
})
td.use(gfm)

// Handle TipTap's task list structure:
// <ul data-type="taskList"> … </ul>
td.addRule('tiptapTaskList', {
  filter: (node: HTMLElement) =>
    node.nodeName === 'UL' && node.getAttribute('data-type') === 'taskList',
  replacement: (_content: string, node: HTMLElement) => {
    const items: string[] = []
    node.querySelectorAll('li[data-type="taskItem"]').forEach((li) => {
      const checked = (li as HTMLElement).getAttribute('data-checked') === 'true'
      // Get text from the inner <div> or <p> (TipTap wraps content in a div)
      const div = li.querySelector('div') ?? li
      const text = (div.textContent ?? '').trim().replace(/\n+/g, ' ')
      items.push(`${checked ? '- [x]' : '- [ ]'} ${text}`)
    })
    return `\n${items.join('\n')}\n\n`
  },
})

// Ignore the label/span wrapper inside task items (already handled above)
td.addRule('tiptapTaskItem', {
  filter: (node: HTMLElement) =>
    node.nodeName === 'LI' && node.getAttribute('data-type') === 'taskItem',
  replacement: () => '', // handled by tiptapTaskList
})

/**
 * Convert TipTap's HTML output back to a markdown string.
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return ''
  return td.turndown(html)
}
