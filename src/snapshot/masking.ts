/**
 * T-008 — Masking rules for visual-regression comparisons.
 *
 * Dynamic regions (timestamps, random IDs, session avatars) cause
 * false diffs. Masks are rectangles that get overwritten with a flat
 * color in both baseline and current PNGs BEFORE pixel comparison.
 *
 * Config shape (coverage/snapshot-masks.yaml):
 *   project: demo
 *   defaults:
 *     - { x: 0, y: 0, width: 200, height: 40, reason: "top-bar clock" }
 *   routes:
 *     "/dashboard":
 *       - { x: 1100, y: 80, width: 180, height: 60, reason: "session avatar" }
 *
 * Masks are applied as colored rectangles (default #000 opaque) on both
 * images; diff count drops to 0 for those pixels.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as yaml from 'js-yaml'

export interface Mask {
  x: number
  y: number
  width: number
  height: number
  reason?: string
  /** RGBA fill; defaults to [0,0,0,255] (opaque black). */
  fill?: [number, number, number, number]
}

export interface MaskConfigFile {
  project?: string
  defaults?: Mask[]
  routes?: Record<string, Mask[]>
}

export function defaultMaskConfigPath(projectRoot: string): string {
  return path.join(projectRoot, 'coverage', 'snapshot-masks.yaml')
}

export function loadMaskConfig(projectRoot: string): MaskConfigFile | null {
  const file = defaultMaskConfigPath(projectRoot)
  if (!fs.existsSync(file)) return null
  try {
    const parsed = yaml.load(fs.readFileSync(file, 'utf8'))
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as MaskConfigFile
  } catch {
    return null
  }
}

export function masksForRoute(config: MaskConfigFile | null, route: string): Mask[] {
  if (!config) return []
  const defaults = Array.isArray(config.defaults) ? config.defaults : []
  const routeMasks = config.routes?.[route]
  if (!Array.isArray(routeMasks)) return defaults
  return [...defaults, ...routeMasks]
}

/**
 * Apply masks to a PNG buffer, returning a new PNG buffer with the mask
 * rectangles filled. Bounds are clamped to the image size so an oversized
 * mask doesn't crash.
 */
export async function applyMasks(pngBuffer: Buffer, masks: Mask[]): Promise<Buffer> {
  if (!masks || masks.length === 0) return pngBuffer
  const { PNG } = await import('pngjs')
  const img = PNG.sync.read(pngBuffer)
  for (const m of masks) {
    const fill = m.fill || [0, 0, 0, 255]
    const x0 = Math.max(0, Math.floor(m.x))
    const y0 = Math.max(0, Math.floor(m.y))
    const x1 = Math.min(img.width, Math.floor(m.x + m.width))
    const y1 = Math.min(img.height, Math.floor(m.y + m.height))
    if (x1 <= x0 || y1 <= y0) continue
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * img.width + x) * 4
        img.data[idx] = fill[0]
        img.data[idx + 1] = fill[1]
        img.data[idx + 2] = fill[2]
        img.data[idx + 3] = fill[3]
      }
    }
  }
  return PNG.sync.write(img)
}
