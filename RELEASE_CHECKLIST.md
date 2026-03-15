# Release Checklist

Use this checklist every time you publish a new release.

## Pre-release

- [ ] All feature work merged to `main`.
- [ ] `package.json` `version` bumped (semver: `x.y.z`).
- [ ] `CHANGELOG.md` updated with changes for this version.
- [ ] `npm run typecheck` passes locally with zero errors.
- [ ] Local build succeeds: `npm run build`.
- [ ] Manual smoke-test: launch packaged app, create/read/delete a note.
- [ ] Theme toggling (dark/light) works correctly.

## Code signing (Windows)

Code signing prevents "Unknown publisher" SmartScreen warnings.

1. Obtain a code signing certificate (EV cert recommended for SmartScreen
   reputation; standard OV cert also works).
2. Export as `.pfx` and base64-encode:
   ```sh
   base64 -w 0 cert.pfx > cert.b64.txt
   ```
3. Add GitHub repo secrets:
   - `CSC_LINK` — the base64 string
   - `CSC_KEY_PASSWORD` — PFX password
4. The release workflow already reads these env vars for electron-builder.

## Code signing / notarization (macOS)

Without notarization, macOS Gatekeeper will quarantine the DMG.

1. Enrol in the Apple Developer Program.
2. Create a "Developer ID Application" certificate in Xcode / Keychain.
3. Export as `.p12` + base64-encode (same as above).
4. Add secrets: `CSC_LINK`, `CSC_KEY_PASSWORD`.
5. For notarization add: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
   `APPLE_TEAM_ID`.
6. Add the following to `package.json` `build.mac`:
   ```json
   "notarize": {
     "teamId": "YOUR_TEAM_ID"
   }
   ```
   and install `@electron/notarize` as a devDependency.

> Until signing is configured, macOS artifacts are **unsigned** and should be
> labelled *(unsigned — use at own risk)* in the Release notes.

## MSIX / Microsoft Store

The MSIX identity is configured in `package.json` `build.appx`.
Ensure the `identityName` and `publisher` match the Partner Center app
registration exactly.  Upload the `.msix` from the Release to Partner Center.

## Publish the release

```bash
# 1. Commit all changes
git add -A
git commit -m "chore: release vX.Y.Z"

# 2. Tag
git tag -a vX.Y.Z -m "Release X.Y.Z"
git push origin main --follow-tags

# 3. GitHub Actions builds installers and creates the Release automatically.
#    Monitor: https://github.com/<owner>/<repo>/actions
#    Verify:  https://github.com/<owner>/<repo>/releases
```

## Post-release

- [ ] Confirm all platform installers appear as Release assets.
- [ ] Test installer downloads and installs on a clean machine.
- [ ] macOS: confirm Gatekeeper allows the app (if notarized) or document
      the workaround in Release notes (if unsigned).
- [ ] Update Store listing (Microsoft Partner Center / future Mac App Store).
- [ ] Announce release (if applicable).
