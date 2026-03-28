const { test, expect } = require('@playwright/test')

// Focused critical-flow E2E tests using an in-page localStorage-backed API stub
// so tests run reliably without touching the host filesystem. The stub
// persists notes and state in localStorage so we can test relaunch behavior
// by reloading the page.

function addApiStubScript() {
  // This function string will be injected into the page before any script
  // runs so the renderer sees `window.api` immediately.
  return `(() => {
    // Use a localStorage namespace so tests are isolated
    const prefix = 'pw_'
    function notesKey() { return prefix + 'notes' }
    function contentKey(name) { return prefix + 'content:' + name }
    function stateKey() { return prefix + 'state' }

    function readJSON(k, fallback) {
      try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback } catch { return fallback }
    }
    function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {}
    }

    window.api = {
      listNotes: async () => readJSON(notesKey(), []),
      createNote: async (filename) => { const arr = readJSON(notesKey(), []); arr.push(filename); writeJSON(notesKey(), arr); writeJSON(contentKey(filename), ''); return true },
      readNote: async (filename) => localStorage.getItem(contentKey(filename)) || '',
      writeNote: async (filename, content) => { try { localStorage.setItem(contentKey(filename), content); return true } catch { return false } },
      writeNoteAtomic: async (filename, content) => { try { localStorage.setItem(contentKey(filename), content); return true } catch { return false } },
      notifyReady: () => {},
      listVersions: async () => [],
      saveVersion: async () => null,
      readVersion: async () => '',
      deleteVersion: async () => true,
      listAttachments: async () => [],
      openAttachment: async () => {},
      deleteAttachment: async () => true,
      importAttachment: async () => null,
      verifyAttachments: async () => ({ ok: true, errors: [] }),
      listPlugins: async () => [],
      savePluginManifest: async () => {},
      openAppDataFolder: async () => {},
      openExternal: async () => {},
      saveNoteAs: async () => {},
      minimize: () => {},
      maximize: () => {},
      unmaximize: () => {},
      getGpuStatus: async () => ({ enabled: false }),
      deleteNote: async (filename) => { const arr = readJSON(notesKey(), []); const i = arr.indexOf(filename); if (i>=0) arr.splice(i,1); writeJSON(notesKey(), arr); localStorage.removeItem(contentKey(filename)); return true },
      renameNote: async (oldF, newF) => { const arr = readJSON(notesKey(), []); const i = arr.indexOf(oldF); if (i<0) return false; arr[i] = newF; writeJSON(notesKey(), arr); const c = localStorage.getItem(contentKey(oldF)) || ''; writeJSON(contentKey(newF), c); localStorage.removeItem(contentKey(oldF)); return true },
      getNoteStats: async (filename) => ({ filename, size: (localStorage.getItem(contentKey(filename))||'').length, modifiedAt: Date.now() }),
      loadState: async () => readJSON(stateKey(), { theme: 'dark', editor: { previewEnabled: false }, settings: { autosaveDelay: 200 } }),
      saveState: async (s) => { writeJSON(stateKey(), s); return true },
      listThemes: async () => ['dark.json','light.json'],
      readTheme: async (name) => ({}),
      writeTheme: async () => true,
      onBeforeQuit: (cb) => { /* noop for tests */ },
      readyToQuit: async () => true,
      getZoomLevel: async () => 0,
      setZoomLevel: async () => {},
      openNotesFolder: async () => {},
      isMaximized: async () => false,
      getAppVersion: async () => '2.0.0',
    }
  })()`
}

const base = process.env.BASE_URL || 'http://127.0.0.1:5173'

test.beforeEach(async ({ page }) => {
  // Inject the API stub before page loads
  await page.addInitScript(addApiStubScript())
})

test('critical flows: create/open/switch/rename/delete/autosave/theme/persistence', async ({
  page,
}) => {
  await page.goto(base)
  await page.waitForSelector('#root', { state: 'visible', timeout: 30000 })

  // 1) Create a new note via sidebar +New Note
  const newBtn = page.getByRole('button', { name: '+ New Note' })
  await expect(newBtn).toHaveCount(1)
  await newBtn.click()
  await page.waitForTimeout(200)

  // Capture active note name from titlebar centre (displayed without extension)
  const titleSpan = page.locator('.titlebar .truncate').first()
  const nameStem = (await titleSpan.innerText()).trim()
  expect(nameStem.length).toBeGreaterThan(0)
  const filename = nameStem.toLowerCase().endsWith('.md') ? nameStem : `${nameStem}.md`

  // 2) Type into editor and wait for autosave (autosaveDelay set to 200ms by stub)
  const editor = page.locator('.ProseMirror').first()
  await editor.click({ force: true })
  await page.keyboard.type('Hello Notara\nThis is autosave test')
  // wait for autosave + buffer
  await page.waitForTimeout(600)

  // Verify content persisted in stub localStorage
  const saved = await page.evaluate((k) => localStorage.getItem(k), `pw_content:${filename}`)
  expect(saved).toContain('Hello Notara')

  // 3) Create a second note to test tabs and switching
  await newBtn.click()
  await page.waitForTimeout(200)
  const tabs = page.getByRole('tab')
  await expect(tabs.first()).toBeVisible()

  // 4) Switch back to first note from sidebar and verify content is still present
  const firstNoteTitle = filename.toLowerCase().endsWith('.md') ? filename : `${filename}.md`
  const firstNoteRow = page.locator(`aside [title="${firstNoteTitle}"]`).first()
  if ((await firstNoteRow.count()) > 0) {
    await firstNoteRow.click()
  } else {
    const tabToClick = page.getByRole('tab', { name: nameStem }).first()
    if ((await tabToClick.count()) > 0) await tabToClick.click()
  }
  await page.waitForTimeout(100)
  // Active editor should show our content
  const activeContent = await page.locator('.ProseMirror').first().innerText()
  expect(activeContent).toContain('Hello Notara')

  // 5) Rename the active note via Sidebar rename button
  // Find the sidebar note row by its title attribute
  const noteRow = page.locator(`aside [title="${filename}"]`).first()
  await noteRow.hover()
  // Click the rename button inside the row (title starts with 'Rename')
  const renameBtn = noteRow.locator('button[title^="Rename"]').first()
  await renameBtn.click()
  // Input appears — focus and type new name
  const renameInput = noteRow.locator('input').first()
  await renameInput.fill('renamed-note')
  await renameInput.press('Enter')
  await page.waitForTimeout(200)
  // Verify the sidebar now contains the new filename
  const renamedRow = page.locator('aside').locator('[title^="renamed-note"]').first()
  await expect(renamedRow).toHaveCount(1)

  // 6) Delete the renamed note via sidebar delete + confirm
  await renamedRow.hover()
  const delBtn = renamedRow.locator('button[title^="Delete"]').first()
  await delBtn.click()
  // Confirm appears — click the confirm button (identified by its title attribute)
  const confirmBtn = renamedRow.locator('button[title="Confirm delete"]').first()
  await confirmBtn.click()
  await page.waitForTimeout(200)
  // Ensure it's gone
  await expect(page.locator(`[title^="renamed-note"]`)).toHaveCount(0)

  // 7) Theme switching via Settings modal — open settings, go to Appearance, choose Light
  const settingsBtn = page.getByTitle('Settings').first()
  await settingsBtn.click()
  await page.waitForTimeout(300)
  // Navigate to Appearance tab
  const appearanceTab = page.locator('button', { hasText: 'Appearance' }).first()
  await appearanceTab.click()
  await page.waitForTimeout(200)
  // Click the Light theme option
  const lightBtn = page.locator('button', { hasText: 'Light' }).first()
  await lightBtn.click()
  // Settings commit debounce is 180ms — wait for it to propagate
  await page.waitForTimeout(400)
  // Check data-theme applied
  const applied = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
  expect(applied).toBe('light')

  // Close the Settings modal before interacting with elements behind it
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)

  // 8) Settings persistence: toggle preview on, then reload and ensure preview restored
  const previewToggle = page.getByTitle('Show raw markdown').first()
  // If the button title differs, fall back to a broader raw-markdown match.
  if ((await previewToggle.count()) === 0) {
    const maybe = page.locator('button[title*="raw markdown"]').first()
    if ((await maybe.count()) > 0) await maybe.click()
  } else {
    await previewToggle.click()
  }
  await page.waitForTimeout(200)
  // Reload page to simulate relaunch (stub uses localStorage for state)
  await page.reload()
  await page.waitForSelector('#root', { state: 'visible', timeout: 20000 })
  // Raw markdown pane should be present if the toggle persisted
  const rawPane = page.locator('textarea').first()
  await expect(rawPane).toBeVisible()
})
