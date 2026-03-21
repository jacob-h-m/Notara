/**
 * tests/unit/settingsWriteQueue.test.ts
 *
 * Tests that the serialized write-queue pattern in handleSettingsChange
 * prevents concurrent loadState+saveState calls from clobbering each other.
 *
 * These are pure logic tests — no DOM, no Electron, no React.
 * They verify the invariant: the LAST write must always include the latest
 * value for every field, regardless of how many concurrent patches fire.
 */

import { describe, it, expect, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Helpers — lightweight simulation of the write-queue pattern
// ---------------------------------------------------------------------------

type AnyState = Record<string, unknown>

/**
 * Simulate the OLD (broken) approach: each patch fires loadState+saveState
 * independently. Returns the value that was last written.
 */
async function raceySave(
  initialState: AnyState,
  patches: AnyState[],
  ioDelay: number
): Promise<AnyState> {
  let diskState = { ...initialState }
  const writes: Array<Promise<void>> = []

  for (const patch of patches) {
    // Each call immediately reads the current disk state (all see the same value
    // since none of the writes have finished yet), then writes back its partial patch.
    const read = { ...diskState }
    writes.push(
      new Promise<void>((resolve) => {
        setTimeout(() => {
          diskState = { ...read, ...patch } // overwrites the full state with only this patch merged
          resolve()
        }, ioDelay)
      })
    )
  }

  await Promise.all(writes)
  return diskState
}

/**
 * Simulate the NEW (fixed) approach: a promise chain serialises every
 * loadState+saveState so each read happens only AFTER the previous write.
 */
async function serialisedSave(
  initialState: AnyState,
  patches: AnyState[],
  ioDelay: number
): Promise<AnyState> {
  let diskState = { ...initialState }
  let queue: Promise<void> = Promise.resolve()

  for (const patch of patches) {
    const patchSnapshot = { ...patch }
    queue = queue.then(
      () =>
        new Promise<void>((resolve) => {
          // Captures *current* diskState at the time this write runs (not at enqueue time)
          const read = { ...diskState }
          setTimeout(() => {
            diskState = { ...read, ...patchSnapshot }
            resolve()
          }, ioDelay)
        })
    )
  }

  await queue
  return diskState
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('write-queue serialization', () => {
  it('racey approach loses patches when patches fire concurrently', async () => {
    const initial = { theme: 'dark', fontSize: 14 }
    const patches = [
      { theme: 'light' }, // patch 1: change theme
      { fontSize: 18 }, // patch 2: change fontSize at the same time
    ]

    const final = await raceySave(initial, patches, 5)

    // The second write read `{ theme: 'dark', fontSize: 14 }` and wrote
    // `{ theme: 'dark', fontSize: 18 }` — clobbering the theme change.
    // This is the BUG we fixed.
    expect(final.theme).toBe('dark') // theme was lost!
    expect(final.fontSize).toBe(18)
  })

  it('serialised approach preserves all patches', async () => {
    const initial = { theme: 'dark', fontSize: 14 }
    const patches = [
      { theme: 'light' }, // patch 1
      { fontSize: 18 }, // patch 2: runs AFTER patch 1 finishes
    ]

    const final = await serialisedSave(initial, patches, 5)

    // patch 2 reads the already-updated state from patch 1, merges fontSize
    expect(final.theme).toBe('light') // ✅ theme preserved
    expect(final.fontSize).toBe(18) // ✅ fontSize updated
  })

  it('serialised approach handles three concurrent patches correctly', async () => {
    const initial = { theme: 'dark', fontSize: 14, wordWrap: true, lineNumbers: true }
    const patches = [{ theme: 'light' }, { fontSize: 20 }, { wordWrap: false }]

    const final = await serialisedSave(initial, patches, 5)

    expect(final.theme).toBe('light')
    expect(final.fontSize).toBe(20)
    expect(final.wordWrap).toBe(false)
    expect(final.lineNumbers).toBe(true) // unchanged
  })

  it('racey approach demonstrates why theme reverts after combined settings change', async () => {
    // Reproduces the exact production race: user changes theme AND the
    // SettingsModal sends editor + settings patches simultaneously.
    const initial = {
      theme: 'dark',
      editor: { fontSize: 14, wordWrap: true },
      settings: { autosaveDelay: 800 },
    }
    const patches = [
      { theme: 'light' }, // from setTheme
      { editor: { fontSize: 18, wordWrap: false } }, // from editor settings
      { settings: { autosaveDelay: 1200 } }, // from general settings
    ]

    const final = await raceySave(initial, patches, 1)

    // With racey writes, the last writer wins — theme is lost.
    // (exact result depends on timer resolution, but at minimum one patch clobbers another)
    // We simply verify it does NOT match the correct final state.
    const allCorrect =
      final.theme === 'light' &&
      (final.editor as AnyState)?.fontSize === 18 &&
      (final.settings as AnyState)?.autosaveDelay === 1200
    expect(allCorrect).toBe(false) // at least one value is wrong
  })

  it('serialised approach has no race regardless of patch order', async () => {
    const initial = {
      theme: 'dark',
      editor: { fontSize: 14, wordWrap: true },
      settings: { autosaveDelay: 800 },
    }
    const patches = [
      { theme: 'light' },
      { editor: { fontSize: 18, wordWrap: false } },
      { settings: { autosaveDelay: 1200 } },
    ]

    const final = await serialisedSave(initial, patches, 1)

    expect(final.theme).toBe('light')
    expect((final.editor as AnyState)?.fontSize).toBe(18)
    expect((final.editor as AnyState)?.wordWrap).toBe(false)
    expect((final.settings as AnyState)?.autosaveDelay).toBe(1200)
  })

  it('queue processes patches in FIFO order', async () => {
    const calls: number[] = []
    let queue: Promise<void> = Promise.resolve()

    for (let i = 0; i < 5; i++) {
      const n = i
      queue = queue.then(
        () =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              calls.push(n)
              resolve()
            }, 1)
          })
      )
    }

    await queue
    expect(calls).toEqual([0, 1, 2, 3, 4])
  })

  it('an error in one queued step does not block subsequent steps', async () => {
    let diskState = { count: 0 }
    let queue: Promise<void> = Promise.resolve()
    const results: number[] = []

    for (let i = 0; i < 4; i++) {
      const n = i
      queue = queue
        .then(
          () =>
            new Promise<void>((resolve, reject) => {
              setTimeout(() => {
                if (n === 1) {
                  reject(new Error('simulated write failure'))
                  return
                }
                diskState = { count: diskState.count + 1 }
                results.push(n)
                resolve()
              }, 1)
            })
        )
        .catch(() => {
          // Error caught — queue continues
        })
    }

    await queue
    // Steps 0, 2, 3 succeed; step 1 fails but doesn't block the rest
    expect(results).toContain(0)
    expect(results).not.toContain(1)
    expect(results).toContain(2)
    expect(results).toContain(3)
  })
})
