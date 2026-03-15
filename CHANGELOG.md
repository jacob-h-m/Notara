# Changelog

All notable changes to Notara are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.0.0] - 2026-03-15

### Added
- Initial public release of Notara v2.
- Markdown editor powered by CodeMirror 6 with live preview.
- Tabbed editing with dirty-state indicators and autosave.
- Sidebar with note list, pinned notes, and MRU recents.
- Dark and light themes with full CSS-variable customisation.
- Custom frameless window chrome with minimize / maximize / close controls.
- Export note as Markdown or plain text via native save dialog.
- Settings modal: font size, word wrap, line numbers, tab width, autosave delay.
- Notes stored in `userData` (production) or project root (dev); migration from
  legacy executable-adjacent location on first run.
- GitHub Actions CI workflow: typecheck, build, Playwright smoke test on every
  push / PR.
- GitHub Actions release workflow: builds Windows (NSIS + MSIX), macOS (DMG),
  Linux (AppImage + deb) and attaches installers to GitHub Release on semver tag.

### Security
- IPC filename validator throws on path separators, traversal sequences, leading
  dots, and disallowed extensions.
- Content and state blobs capped at 10 MB before disk write.
- `asar` packaging enabled; `compression: maximum` applied.
- `contextIsolation: true`, `nodeIntegration: false` enforced.

### Notes
- macOS DMG is **unsigned** in this release. See `RELEASE_CHECKLIST.md` for
  notarization setup. Right-click → Open, or run
  `xattr -d com.apple.quarantine /Applications/Notara.app` to bypass Gatekeeper.
