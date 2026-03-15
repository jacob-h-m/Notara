# Notara

A local-only desktop notes app built with Electron, React, and TypeScript.
All notes are stored on your own machine — no cloud sync, no telemetry.

## Features

- Markdown editor (CodeMirror 6) with live preview
- Tabs, sidebar, pinned notes
- Dark / light themes with full CSS-variable customisation
- Custom window chrome (frameless, macOS / Windows native feel)
- Export notes as Markdown or plain text
- Autosave with configurable debounce

## Install

Download the latest installer for your platform from the
[Releases](../../releases/latest) page:

| Platform | File |
|---|---|
| Windows (installer) | `Notara-*-Setup.exe` |
| Windows (Store / MSIX) | `Notara-*.msix` |
| macOS | `Notara-*.dmg` *(unsigned — see below)* |
| Linux (portable) | `Notara-*.AppImage` |
| Linux (Debian/Ubuntu) | `notara_*_amd64.deb` |

> **macOS note**: The DMG is currently unsigned / not notarized.
> On first launch, right-click the app → Open to bypass Gatekeeper,
> or run `xattr -d com.apple.quarantine /Applications/Notara.app`.
> See `RELEASE_CHECKLIST.md` for signing instructions.

## Build from source

```bash
# Prerequisites: Node 20+
npm ci
npm run build          # TypeScript check + Vite build
npx electron-builder   # package for the current platform
```

## Development

```bash
npm run dev            # Start Vite dev server
# In a second terminal:
npx electron .         # Start Electron against the dev server
```

Or use the combined script (requires `concurrently`):

```bash
npm run electron:dev
```

## Running tests

```bash
npx playwright install chromium   # first time only
npm run dev &                      # dev server must be running
npx playwright test --config=playwright.config.js
```

## Releasing

See `RELEASE_CHECKLIST.md` for the full step-by-step process.

Push a semver tag to trigger the GitHub Actions release workflow:

```bash
git tag -a v1.2.3 -m "Release 1.2.3"
git push origin v1.2.3
```

The workflow builds installers for Windows, macOS, and Linux and attaches
them to a GitHub Release automatically.

## Security

See `SECURITY_AUDIT.md` for IPC security model and known gaps.

## License

MIT
