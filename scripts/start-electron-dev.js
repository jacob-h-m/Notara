#!/usr/bin/env node
'use strict'
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const projectRoot = path.resolve(__dirname, '..')
const distDir = path.join(projectRoot, 'dist-electron')
const mainJs = path.join(distDir, 'main.js')

// Build electron code first
console.log('Building electron code...')
const builder = spawn('node', [path.join(__dirname, 'build-electron-safe.js')], {
  stdio: 'inherit',
  shell: true,
})

builder.on('close', (code) => {
  if (code !== 0) {
    console.error('Failed to build electron code')
    process.exit(1)
  }

  if (!fs.existsSync(mainJs)) {
    console.error('Error: dist-electron/main.js not found after build')
    process.exit(1)
  }

  console.log('Starting vite dev server and electron...')

  let viteUrl = null
  let electronStarted = false

  // Start vite dev server, capturing output to detect URL
  const vite = spawn('npm', ['run', 'dev'], {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
  })

  function tryStartElectron() {
    if (electronStarted || !viteUrl) return
    electronStarted = true
    console.log('Launching electron with VITE_DEV_SERVER_URL =', viteUrl)

    const electronEnv = { ...process.env }
    delete electronEnv.ELECTRON_RUN_AS_NODE
    electronEnv.VITE_DEV_SERVER_URL = viteUrl

    const electronProc = spawn('npx', ['electron', projectRoot], {
      stdio: 'inherit',
      shell: true,
      cwd: projectRoot,
      env: electronEnv,
    })

    electronProc.on('close', (exitCode) => {
      console.log('Electron closed with code', exitCode)
      vite.kill()
      process.exit(exitCode || 0)
    })
  }

  // HTTP poll: wait until Vite server responds before launching Electron
  function waitForVite(url, retries, cb) {
    const http = require('http')
    const parsed = new URL(url)
    const req = http.get(
      { hostname: parsed.hostname, port: parsed.port, path: '/', timeout: 1000 },
      (res) => {
        res.resume()
        cb()
      }
    )
    req.on('error', () => {
      if (retries <= 0) {
        cb()
        return
      }
      setTimeout(() => waitForVite(url, retries - 1, cb), 500)
    })
    req.on('timeout', () => {
      req.destroy()
      if (retries <= 0) {
        cb()
        return
      }
      setTimeout(() => waitForVite(url, retries - 1, cb), 500)
    })
  }

  // Parse Vite output to find the local URL.
  // Vite 8 started with --host 127.0.0.1 outputs "http://127.0.0.1:5173/" not "localhost".
  function onViteOutput(data) {
    const text = data.toString()
    process.stdout.write(text)
    if (!viteUrl) {
      // Strip ANSI escape codes before matching
      const plain = text.replace(/\x1b\[[0-9;]*m/g, '')
      const match = plain.match(/Local:\s+(https?:\/\/[\w.]+:\d+\/)/)
      if (match) {
        viteUrl = match[1]
        waitForVite(viteUrl, 20, tryStartElectron)
      }
    }
  }

  vite.stdout.on('data', onViteOutput)
  vite.stderr.on('data', (data) => process.stderr.write(data))

  // Fallback: start electron after 15 seconds even if URL wasn't detected
  setTimeout(() => {
    if (!viteUrl) viteUrl = 'http://127.0.0.1:5173/'
    waitForVite(viteUrl, 5, tryStartElectron)
  }, 15000)

  process.on('SIGINT', () => {
    console.log('Shutting down...')
    vite.kill()
    process.exit(0)
  })
})
