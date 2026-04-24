// lessons:skip-all
/**
 * T-008 — masking YAML tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  loadMaskConfig,
  masksForRoute,
  applyMasks,
  defaultMaskConfigPath,
} from '../../src/snapshot/masking'
import { compareRoute } from '../../src/snapshot/compare'
import { LocalFSStore } from '../../src/snapshot/store'

function mkProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mask-'))
}

async function solidPng(w: number, h: number, fill: [number, number, number, number]): Promise<Buffer> {
  const { PNG } = await import('pngjs')
  const png = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      png.data[idx] = fill[0]
      png.data[idx + 1] = fill[1]
      png.data[idx + 2] = fill[2]
      png.data[idx + 3] = fill[3]
    }
  }
  return PNG.sync.write(png)
}

describe('T-008 loadMaskConfig + masksForRoute', () => {
  it('reads YAML with defaults + per-route masks', () => {
    const root = mkProject()
    try {
      fs.mkdirSync(path.join(root, 'coverage'))
      fs.writeFileSync(
        path.join(root, 'coverage', 'snapshot-masks.yaml'),
        `project: demo
defaults:
  - x: 0
    y: 0
    width: 100
    height: 40
    reason: top clock
routes:
  /dashboard:
    - x: 10
      y: 10
      width: 50
      height: 50
      reason: session avatar
`,
        'utf8',
      )
      const cfg = loadMaskConfig(root)
      expect(cfg?.project).toBe('demo')
      expect(cfg?.defaults?.length).toBe(1)

      const homeMasks = masksForRoute(cfg, '/home')
      expect(homeMasks.length).toBe(1) // only defaults

      const dashboardMasks = masksForRoute(cfg, '/dashboard')
      expect(dashboardMasks.length).toBe(2) // defaults + per-route
      expect(defaultMaskConfigPath(root)).toMatch(/coverage\/snapshot-masks\.yaml$/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns null / empty arrays when config is missing or corrupt', () => {
    const root = mkProject()
    try {
      expect(loadMaskConfig(root)).toBeNull()
      fs.mkdirSync(path.join(root, 'coverage'))
      fs.writeFileSync(
        path.join(root, 'coverage', 'snapshot-masks.yaml'),
        '{ unbalanced: [',
        'utf8',
      )
      expect(loadMaskConfig(root)).toBeNull()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('T-008 applyMasks', () => {
  it('paints rectangles in the specified fill color', async () => {
    const red = await solidPng(20, 20, [255, 0, 0, 255])
    const masked = await applyMasks(red, [
      { x: 5, y: 5, width: 10, height: 10, fill: [0, 255, 0, 255] },
    ])
    const { PNG } = await import('pngjs')
    const img = PNG.sync.read(masked)
    // Center pixel (10,10) should be green after mask
    const centerIdx = (10 * img.width + 10) * 4
    expect(img.data[centerIdx]).toBe(0)
    expect(img.data[centerIdx + 1]).toBe(255)
    expect(img.data[centerIdx + 2]).toBe(0)
    // Corner pixel (1,1) should stay red
    const cornerIdx = (1 * img.width + 1) * 4
    expect(img.data[cornerIdx]).toBe(255)
  })

  it('clamps out-of-bounds masks without throwing', async () => {
    const small = await solidPng(10, 10, [100, 100, 100, 255])
    const masked = await applyMasks(small, [
      { x: 5, y: 5, width: 100, height: 100 }, // spills outside
    ])
    const { PNG } = await import('pngjs')
    const img = PNG.sync.read(masked)
    // Pixel (6,6) should be masked to default black [0,0,0,255]
    const idx = (6 * img.width + 6) * 4
    expect(img.data[idx]).toBe(0)
    expect(img.data[idx + 1]).toBe(0)
    expect(img.data[idx + 2]).toBe(0)
  })

  it('returns input untouched when mask list is empty', async () => {
    const png = await solidPng(5, 5, [7, 8, 9, 255])
    const out = await applyMasks(png, [])
    expect(out).toBe(png)
  })
})

describe('T-008 compareRoute with masks', () => {
  it('zero diff when only the masked region differs', async () => {
    // Two PNGs identical except for a 10x10 top-left rectangle. Mask
    // that rectangle → diff drops to zero.
    const { PNG } = await import('pngjs')
    const base = PNG.sync.read(await solidPng(40, 40, [0, 0, 0, 255]))
    const cur = PNG.sync.read(await solidPng(40, 40, [0, 0, 0, 255]))
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const idx = (y * 40 + x) * 4
        cur.data[idx] = 255
        cur.data[idx + 1] = 255
        cur.data[idx + 2] = 255
      }
    }
    const root = mkProject()
    try {
      const store = new LocalFSStore(root)
      await store.put('demo', '/home', PNG.sync.write(base))
      const masked = await compareRoute(store, 'demo', '/home', PNG.sync.write(cur), {
        masks: [{ x: 0, y: 0, width: 10, height: 10 }],
      })
      expect(masked.diffPercent).toBe(0)
      expect(masked.passed).toBe(true)
      expect(masked.masksApplied).toBe(1)

      // Without mask: non-zero diff.
      const unmasked = await compareRoute(store, 'demo', '/home', PNG.sync.write(cur))
      expect(unmasked.diffPercent).toBeGreaterThan(0)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('populates diffPngBase64 when returnDiffPng is set', async () => {
    const { PNG } = await import('pngjs')
    const base = await solidPng(10, 10, [0, 0, 0, 255])
    const cur = await solidPng(10, 10, [255, 255, 255, 255])
    const root = mkProject()
    try {
      const store = new LocalFSStore(root)
      await store.put('demo', '/home', base)
      const r = await compareRoute(store, 'demo', '/home', cur, { returnDiffPng: true })
      expect(r.diffPngBase64).toBeTruthy()
      // Decode it to verify we got a real PNG back.
      const diffBuf = Buffer.from(r.diffPngBase64!, 'base64')
      const decoded = PNG.sync.read(diffBuf)
      expect(decoded.width).toBe(10)
      expect(decoded.height).toBe(10)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
