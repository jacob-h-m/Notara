#!/usr/bin/env node
'use strict'
const esbuild = require('esbuild')
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const outDir = path.join(projectRoot, 'dist-electron')
const tmpOut = path.join(projectRoot, `dist-electron-tmp-${Date.now()}`)

async function main() {
  // Clean stale artifacts from outDir before building (prevents leftover files
  // from prior dev-mode vite-plugin-electron passes from being packaged).
  if (fs.existsSync(outDir)) {
    for (const entry of fs.readdirSync(outDir)) {
      if (!entry.endsWith('.js')) {
        fs.rmSync(path.join(outDir, entry), { recursive: true, force: true })
      }
    }
  }

  if (!fs.existsSync(tmpOut)) fs.mkdirSync(tmpOut, { recursive: true })

  await esbuild.build({
    entryPoints: [
      path.join(projectRoot, 'electron/main.ts'),
      path.join(projectRoot, 'electron/preload.ts'),
    ],
    bundle: true,
    platform: 'node',
    outdir: tmpOut,
    external: ['electron'],
    format: 'cjs',
    logLevel: 'info',
  })

  const files = fs.readdirSync(tmpOut).filter((f) => f.endsWith('.js'))
  if (files.length === 0) throw new Error('no build outputs')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  for (const f of files) {
    const src = path.join(tmpOut, f)
    const dest = path.join(outDir, f)
    try {
      fs.renameSync(src, dest)
    } catch (_) {
      fs.copyFileSync(src, dest)
      fs.unlinkSync(src)
    }
  }

  fs.rmSync(tmpOut, { recursive: true, force: true })

  console.log('electron build succeeded')
}

main().catch((err) => {
  console.error('electron build failed:', err)
  try {
    fs.rmSync(tmpOut, { recursive: true, force: true })
  } catch (_) {}
  process.exit(1)
})
