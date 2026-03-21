#!/usr/bin/env node
/**
 * scripts/migrate-attachments.js
 * Migrate attachments from the old flat basename layout to SHA-256 content-addressed storage.
 *
 * Old layout:  attachments/{noteFilename}/{basename}
 * New layout:  attachments/{noteFilename}/{sha256ext}  +  manifest.json per note
 *
 * Usage:
 *   node scripts/migrate-attachments.js --dry-run   # preview without writing
 *   node scripts/migrate-attachments.js --apply     # commit changes
 *
 * Output: JSON migration report to stdout.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const os = require('os')

// ── Resolve app data root (mirrors electron/main.ts logic) ─────────────────────
function getAppRoot() {
  const portable = process.env.NOTARA_PORTABLE === '1' || process.argv.includes('--portable')
  if (portable) return path.join(process.cwd(), 'data')
  const platform = process.platform
  if (platform === 'win32') return path.join(process.env.APPDATA || os.homedir(), 'notara')
  if (platform === 'darwin')
    return path.join(os.homedir(), 'Library', 'Application Support', 'notara')
  return path.join(
    process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
    'notara'
  )
}

const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--apply')
const APPLY = process.argv.includes('--apply')

if (!DRY_RUN && !APPLY) {
  console.error('Usage: node scripts/migrate-attachments.js [--dry-run | --apply]')
  process.exit(1)
}

const APP_ROOT = getAppRoot()
const ATTACHMENTS_DIR = path.join(APP_ROOT, 'notes', 'attachments')

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function ext(basename) {
  const i = basename.lastIndexOf('.')
  return i > 0 ? basename.slice(i) : ''
}

const report = {
  mode: DRY_RUN ? 'dry-run' : 'apply',
  appRoot: APP_ROOT,
  attachmentsDir: ATTACHMENTS_DIR,
  notes: [],
  totals: { notes: 0, files: 0, duplicates: 0, errors: 0 },
}

if (!fs.existsSync(ATTACHMENTS_DIR)) {
  report.status = 'nothing-to-migrate'
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

const noteDirs = fs.readdirSync(ATTACHMENTS_DIR)

for (const noteDir of noteDirs) {
  const noteAttachDir = path.join(ATTACHMENTS_DIR, noteDir)
  const stat = fs.statSync(noteAttachDir)
  if (!stat.isDirectory()) continue

  const manifestPath = path.join(noteAttachDir, 'manifest.json')
  // If manifest already exists, skip (already migrated)
  if (fs.existsSync(manifestPath)) {
    report.notes.push({ note: noteDir, status: 'already-migrated' })
    continue
  }

  const files = fs.readdirSync(noteAttachDir).filter((f) => f !== 'manifest.json')
  const manifest = {} // basename → sha256+ext key
  const noteReport = { note: noteDir, files: [], status: 'ok' }
  const seenHashes = {}

  for (const basename of files) {
    const srcPath = path.join(noteAttachDir, basename)
    try {
      const hash = sha256File(srcPath)
      const newName = hash + ext(basename)
      const destPath = path.join(noteAttachDir, newName)

      if (seenHashes[hash]) {
        noteReport.files.push({
          basename,
          action: 'duplicate-skipped',
          hash,
          duplicateOf: seenHashes[hash],
        })
        report.totals.duplicates++
      } else {
        seenHashes[hash] = basename
        manifest[basename] = newName
        noteReport.files.push({
          basename,
          action: srcPath === destPath ? 'same-path' : 'rename',
          hash,
          newName,
        })
        report.totals.files++

        if (!DRY_RUN && srcPath !== destPath) {
          fs.renameSync(srcPath, destPath)
        }
      }
    } catch (err) {
      noteReport.files.push({ basename, action: 'error', error: String(err) })
      noteReport.status = 'partial-error'
      report.totals.errors++
    }
  }

  if (!DRY_RUN) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
  }

  report.notes.push(noteReport)
  report.totals.notes++
}

report.status = report.totals.errors > 0 ? 'completed-with-errors' : 'completed'
console.log(JSON.stringify(report, null, 2))

if (DRY_RUN) {
  process.stderr.write('\n[dry-run] No files were modified. Re-run with --apply to commit.\n')
}
