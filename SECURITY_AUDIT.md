# Security Audit

Last reviewed: 2026-03-15

## IPC Security Model

Notara uses Electron's `contextBridge` + `contextIsolation: true` /
`nodeIntegration: false` to expose a minimal, typed API at `window.api`.
The renderer has **no** access to Node.js or Electron internals.

### Exposed surface (`window.api`)

All renderer-to-main communication is via named IPC channels.  Each call is
validated in `electron/main.ts` before touching the filesystem.

| Channel | Validation applied |
|---|---|
| `fs:list-notes` | No input; returns only `.md`/`.txt` basenames |
| `fs:read-note` | Filename validated (see below); path asserted inside `NOTES_DIR` |
| `fs:write-note` | Filename + content validated; content size capped at 10 MB |
| `fs:create-note` | Filename validated |
| `fs:delete-note` | Filename validated; path asserted inside `NOTES_DIR` |
| `fs:rename-note` | Both filenames validated; both paths asserted inside `NOTES_DIR` |
| `state:save` | Serialised JSON size capped at 10 MB |
| `theme:read` | Name sanitised (alphanumeric / `._-` only); values strip injection chars |
| `theme:write` | Name sanitised; only `--`-prefixed CSS var keys written; values strip `}`, `<`, `/*`, `;` |
| `shell:open-external` | URL parsed; only whitelisted hostnames accepted |
| `dialog:save-note-as` | Native dialog; path chosen by user; content size implicit |

### Filename validation (`sanitizeFilename`)

A **throwing** validator (not a stripping sanitiser) applied to every filename
argument before path construction:

- Must be a non-empty string.
- Maximum 200 characters.
- Must end in `.md` or `.txt`.
- Must not contain `/`, `\`, or null bytes.
- Must not contain `..` sequences.
- Must not start with a dot.

A second assertion (`assertInsideNotesDir`) checks that the fully resolved
path starts with `NOTES_DIR + sep` as a defence-in-depth measure.

## Known Gaps / Risks

| Risk | Severity | Status |
|---|---|---|
| macOS DMG is unsigned / not notarized | Medium | Open — see RELEASE_CHECKLIST.md for resolution |
| Windows NSIS installer unsigned | Medium | Open — requires EV/OV cert secret; see RELEASE_CHECKLIST.md |
| `sandbox: false` in BrowserWindow webPreferences | Low-Medium | Needed for preload; isolation provided by contextIsolation + nodeIntegration:false |
| `asar` packaging | Low | Now enabled (`"asar": true`); previous `false` value meant source was readable |
| Electron version pinned to ~41.x | Low | Track CVEs; update Electron regularly |
| No CSP header on loaded `index.html` | Low | App is local-only; add `Content-Security-Policy` meta tag for defence in depth |

## Recommendations (future work)

1. Add a `Content-Security-Policy` meta tag to `index.html` restricting
   `default-src 'self'`.
2. Enable `sandbox: true` in `BrowserWindow` webPreferences once preload
   compatibility is confirmed (Electron 22+).
3. Set up Dependabot alerts for the repo to catch vulnerable dependency
   versions automatically.
4. Run `npm audit` as part of CI and gate on zero high/critical findings.
5. Add E2E tests exercising the IPC boundary validation (e.g. verify that
   passing a traversal filename returns an error, not data).
