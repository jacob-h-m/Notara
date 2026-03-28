# Notara

![Notara banner](assets/banner-1280x640.png)

Notara is a local-first notes app for people who want to write quickly and keep control of their files. It is built with Electron and React, and it stays focused on practical workflows: Markdown editing, attachments, version history, backlinks, and multi-window note management.

## Why People Use It

- Local-only storage for notes, attachments, themes, and app state.
- Markdown and plain-text editing.
- Tabbed editing with autosave and session restore.
- Cross-note search, backlinks, and graph view.
- Version history with restore support.
- Attachment import, open, verify, and delete workflows.
- Runtime-remappable shortcuts.
- Multi-window note movement and cross-window tab drag/drop.

## Development

### Prerequisites

- Node.js 20+
- npm
- Windows, macOS, or Linux

### Scripts

- `npm run dev`: Start the renderer dev server.
- `npm run electron:dev`: Start the Electron app in development mode.
- `npm run typecheck`: Run the renderer TypeScript typecheck.
- `npm run lint`: Run ESLint against `src`.
- `npm run test:unit`: Run Vitest unit tests.
- `npm run test:visual`: Run Playwright visual tests.
- `npm run build`: Build renderer and Electron bundles.

## Search and Replace

Notara includes two complementary search surfaces:

- `Find` opens a focused search panel for the current note or all notes.
- `Find & Replace` supports replacing in the current note or replacing all matches across all notes.
- `Search All Notes` opens the cross-note search palette for fast navigation by result list.

## Shortcuts

Default shortcuts are visible in-app under Settings -> Keybindings and in the application menu. The menu reflects remapped shortcuts at runtime.

Common defaults:

- `Ctrl+N`: New note
- `Ctrl+S`: Save
- `Ctrl+W`: Close tab
- `Ctrl+F`: Find
- `Ctrl+H`: Find & Replace
- `Ctrl+Shift+F`: Search all notes
- `Ctrl+P`: Toggle raw Markdown pane
- `Ctrl+\\`: Toggle sidebar

## Data Locations

- Development mode uses project-local data such as `state.json`, `notes/`, and `.user-data/`.
- Packaged builds store application data under Electron `userData`, unless portable mode is enabled.

## Security Notes

- Renderer access to Node.js is disabled.
- `contextIsolation` is enabled in the Electron renderer.
- File-system operations are routed through a typed preload bridge.
- External links are restricted to trusted URLs (HTTPS in production, localhost HTTP in development).

## IPC Reference

The Electron bridge exposed to the renderer is documented in `docs/ipc-api.md`.
