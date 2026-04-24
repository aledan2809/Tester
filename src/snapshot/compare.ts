/**
 * T-008 — Pixel compare wrapper over pixelmatch that reads / writes
 * baseline via `BaselineStore`. Returns a structured diff result so CLI
 * and report generators can surface it uniformly.
 */

import type { BaselineStore, BaselineMeta } from './store'

export interface CompareResult {
  route: string
  project: string
  /** True when baseline existed AND diff <= maxDiffPercent. */
  passed: boolean
  /** Present when baseline existed. */
  diffPercent?: number
  /** True when NO baseline was found (first run — neither pass nor fail). */
  noBaseline?: boolean
  /** Present when no baseline existed and `captureIfMissing` is true. */
  capturedBaseline?: BaselineMeta
  /** Non-empty on internal error (corrupt PNG, etc.). */
  error?: string
  baselinePath: string
}

export interface CompareOptions {
  maxDiffPercent?: number
  /** Pixelmatch pixel-level threshold (0..1, default 0.1 = forgiving). */
  pixelThreshold?: number
  /** When true, store as the new baseline if none existed. */
  captureIfMissing?: boolean
  viewport?: { width: number; height: number }
}

export async function pixelDiffPercent(
  baseline: Buffer,
  current: Buffer,
  pixelThreshold = 0.1,
): Promise<number> {
  const { PNG } = await import('pngjs')
  const pixelmatch = (await import('pixelmatch')).default
  const a = PNG.sync.read(baseline)
  const b = PNG.sync.read(current)
  const width = Math.min(a.width, b.width)
  const height = Math.min(a.height, b.height)
  if (width === 0 || height === 0) return 100
  const crop = (png: { data: Buffer; width: number; height: number }) => {
    if (png.width === width && png.height === height) {
      return new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength)
    }
    const out = new Uint8Array(width * height * 4)
    for (let y = 0; y < height; y++) {
      const srcStart = y * png.width * 4
      const dstStart = y * width * 4
      out.set(png.data.subarray(srcStart, srcStart + width * 4), dstStart)
    }
    return out
  }
  const diff = new PNG({ width, height })
  const diffPixels = pixelmatch(crop(a), crop(b), diff.data, width, height, {
    threshold: pixelThreshold,
    includeAA: false,
  })
  const total = width * height
  return total > 0 ? (diffPixels / total) * 100 : 0
}

export async function compareRoute(
  store: BaselineStore,
  project: string,
  route: string,
  currentPng: Buffer,
  opts: CompareOptions = {},
): Promise<CompareResult> {
  const maxDiff = opts.maxDiffPercent ?? 1
  const baseline = await store.get(project, route)
  const baselinePath = store.pathFor(project, route)
  if (!baseline) {
    if (opts.captureIfMissing) {
      const meta = await store.put(project, route, currentPng, opts.viewport)
      return {
        route,
        project,
        passed: true,
        noBaseline: false,
        capturedBaseline: meta,
        baselinePath,
      }
    }
    return { route, project, passed: false, noBaseline: true, baselinePath }
  }
  try {
    const diffPercent = await pixelDiffPercent(baseline, currentPng, opts.pixelThreshold)
    return {
      route,
      project,
      passed: diffPercent <= maxDiff,
      diffPercent,
      baselinePath,
    }
  } catch (err) {
    return {
      route,
      project,
      passed: false,
      baselinePath,
      error: (err as Error).message || String(err),
    }
  }
}
