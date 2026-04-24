// lessons:skip-all
/**
 * T-008 — Baseline store + pixel compare regression tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { LocalFSStore, S3Store, sanitizeRoute } from '../../src/snapshot/store'
import { compareRoute, pixelDiffPercent } from '../../src/snapshot/compare'

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'snap-'))
}

// Synthesize a minimal PNG via pngjs so tests don't depend on external images.
async function makePng(width: number, height: number, fill: [number, number, number, number]): Promise<Buffer> {
  const { PNG } = await import('pngjs')
  const png = new PNG({ width, height })
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      png.data[idx] = fill[0]
      png.data[idx + 1] = fill[1]
      png.data[idx + 2] = fill[2]
      png.data[idx + 3] = fill[3]
    }
  }
  return PNG.sync.write(png)
}

describe('T-008 sanitizeRoute', () => {
  it('converts / to __ and strips query strings', () => {
    expect(sanitizeRoute('/dashboard/users')).toBe('dashboard__users')
    expect(sanitizeRoute('/search?q=foo')).toBe('search')
  })

  it('maps absolute URLs to safe filenames', () => {
    expect(sanitizeRoute('https://app.example.com/admin')).toMatch(/app_example_com__admin/)
  })

  it('appends hash when slug would exceed 120 chars', () => {
    const long = '/' + 'a'.repeat(200)
    const out = sanitizeRoute(long)
    expect(out.length).toBeLessThanOrEqual(120)
    expect(out).toMatch(/__[0-9a-f]{8}$/)
  })

  it('falls back to "root" on empty input', () => {
    expect(sanitizeRoute('/')).toBe('root')
    expect(sanitizeRoute('')).toBe('root')
  })
})

describe('T-008 LocalFSStore — put/get/list/remove roundtrip', () => {
  it('stores a baseline + meta and round-trips bytes', async () => {
    const dir = mkTmp()
    try {
      const store = new LocalFSStore(dir)
      const png = await makePng(10, 10, [255, 0, 0, 255])
      const meta = await store.put('demo', '/home', png, { width: 1280, height: 720 })
      expect(meta.hash).toMatch(/^[0-9a-f]{64}$/)
      expect(meta.viewport?.width).toBe(1280)

      const loaded = await store.get('demo', '/home')
      expect(loaded).not.toBeNull()
      expect(Buffer.compare(loaded!, png)).toBe(0)

      expect(await store.list('demo')).toEqual(['/home'])

      const removed = await store.remove('demo', '/home')
      expect(removed).toBe(true)
      expect(await store.get('demo', '/home')).toBeNull()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns null for missing baseline; empty list for unknown project', async () => {
    const dir = mkTmp()
    try {
      const store = new LocalFSStore(dir)
      expect(await store.get('demo', '/nope')).toBeNull()
      expect(await store.list('unknown-project')).toEqual([])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('pathFor resolves a deterministic path under baseDir/<project>/', async () => {
    const store = new LocalFSStore('/tmp/base')
    const p = store.pathFor('demo', '/admin')
    expect(p).toMatch(/^\/tmp\/base\/demo\/admin\.png$/)
  })
})

describe('T-008 S3Store stub — clear fail-fast on premature use', () => {
  it('throws on put/get/list/remove (not yet implemented)', async () => {
    const s3 = new S3Store('my-bucket', 'baselines')
    await expect(s3.put()).rejects.toThrow(/not yet implemented/i)
    await expect(s3.get()).rejects.toThrow(/not yet implemented/i)
    await expect(s3.list()).rejects.toThrow(/not yet implemented/i)
    await expect(s3.remove()).rejects.toThrow(/not yet implemented/i)
    expect(s3.pathFor('demo', '/home')).toMatch(/^s3:\/\/my-bucket\/baselines\/demo\//)
  })
})

describe('T-008 pixelDiffPercent — identical vs differing PNGs', () => {
  it('returns 0 for identical images', async () => {
    const a = await makePng(20, 20, [0, 128, 255, 255])
    const b = await makePng(20, 20, [0, 128, 255, 255])
    const diff = await pixelDiffPercent(a, b)
    expect(diff).toBe(0)
  })

  it('returns 100 for fully inverted colors', async () => {
    const a = await makePng(20, 20, [0, 0, 0, 255])
    const b = await makePng(20, 20, [255, 255, 255, 255])
    const diff = await pixelDiffPercent(a, b)
    expect(diff).toBeGreaterThan(99)
  })
})

describe('T-008 compareRoute', () => {
  it('returns noBaseline when baseline missing and captureIfMissing=false', async () => {
    const dir = mkTmp()
    try {
      const store = new LocalFSStore(dir)
      const png = await makePng(10, 10, [10, 10, 10, 255])
      const r = await compareRoute(store, 'demo', '/home', png)
      expect(r.passed).toBe(false)
      expect(r.noBaseline).toBe(true)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('seeds baseline on first run when captureIfMissing=true', async () => {
    const dir = mkTmp()
    try {
      const store = new LocalFSStore(dir)
      const png = await makePng(10, 10, [10, 10, 10, 255])
      const r = await compareRoute(store, 'demo', '/home', png, { captureIfMissing: true })
      expect(r.passed).toBe(true)
      expect(r.capturedBaseline).toBeDefined()
      expect(r.capturedBaseline?.hash).toMatch(/^[0-9a-f]{64}$/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('passes when diff <= maxDiffPercent', async () => {
    const dir = mkTmp()
    try {
      const store = new LocalFSStore(dir)
      const baseline = await makePng(20, 20, [100, 100, 100, 255])
      await store.put('demo', '/home', baseline)
      // Flip 1 pixel (0.25% of 400)
      const current = Buffer.from(baseline)
      const { PNG } = await import('pngjs')
      const png = PNG.sync.read(current)
      png.data[0] = 255
      png.data[1] = 255
      png.data[2] = 255
      const r = await compareRoute(store, 'demo', '/home', PNG.sync.write(png), {
        maxDiffPercent: 1,
      })
      expect(r.passed).toBe(true)
      expect(r.diffPercent).toBeGreaterThan(0)
      expect(r.diffPercent).toBeLessThan(1)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails when diff > maxDiffPercent', async () => {
    const dir = mkTmp()
    try {
      const store = new LocalFSStore(dir)
      const baseline = await makePng(20, 20, [0, 0, 0, 255])
      const current = await makePng(20, 20, [255, 255, 255, 255])
      await store.put('demo', '/home', baseline)
      const r = await compareRoute(store, 'demo', '/home', current, { maxDiffPercent: 1 })
      expect(r.passed).toBe(false)
      expect(r.diffPercent).toBeGreaterThan(90)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
