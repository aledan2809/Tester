/**
 * T-009 — A11y baseline store + diff.
 *
 * Stores per-route axe-core violation fingerprints as `coverage/
 * a11y-baseline.json` and compares subsequent scans against the stored
 * baseline. Existing violations are tolerated (with `suppressed_until`
 * metadata); NEW critical/serious violations vs baseline fail the check.
 *
 * Data flows (no Puppeteer, no axe-core import — purely JSON in / JSON out):
 *   - callers produce `RouteScan` from `runA11yScan(page)`
 *   - CLI / programmatic API invokes `storeBaseline` / `diffAgainstBaseline`
 *
 * Baseline file shape:
 *   {
 *     "project": "demo",
 *     "captured_at": "ISO",
 *     "routes": {
 *       "/home": { "violations": [{ "id": "color-contrast", "impact": "serious", "count": 3 }] }
 *     }
 *   }
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

export type A11yImpact = 'critical' | 'serious' | 'moderate' | 'minor'

export interface ViolationFingerprint {
  id: string
  impact: A11yImpact
  count: number
}

export interface RouteScan {
  route: string
  violations: ViolationFingerprint[]
}

export interface BaselineFile {
  project: string
  captured_at: string
  routes: Record<string, { violations: ViolationFingerprint[] }>
}

export interface DiffEntry {
  id: string
  impact: A11yImpact
  baseline: number
  current: number
  delta: number
}

export interface RouteDiff {
  route: string
  /** Violations present in current that are absent OR higher-count in baseline. */
  new_or_worse: DiffEntry[]
  /** Violations that got fixed (count decreased to 0). */
  fixed: DiffEntry[]
  /** Violations at same severity/count — informational only. */
  unchanged: DiffEntry[]
}

export interface DiffReport {
  project: string
  baselinePath: string
  /** True if any critical/serious violation appears in new_or_worse for any route. */
  regression: boolean
  routes: RouteDiff[]
}

const IMPACT_RANK: Record<A11yImpact, number> = {
  critical: 4,
  serious: 3,
  moderate: 2,
  minor: 1,
}

export function defaultBaselinePath(projectRoot: string): string {
  return path.join(projectRoot, 'coverage', 'a11y-baseline.json')
}

export function loadBaseline(projectRoot: string): BaselineFile | null {
  const file = defaultBaselinePath(projectRoot)
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as BaselineFile
  } catch {
    return null
  }
}

export function storeBaseline(
  projectRoot: string,
  project: string,
  scans: RouteScan[],
): { file: string; baseline: BaselineFile } {
  const file = defaultBaselinePath(projectRoot)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const baseline: BaselineFile = {
    project,
    captured_at: new Date().toISOString(),
    routes: {},
  }
  for (const scan of scans) {
    baseline.routes[scan.route] = {
      violations: [...scan.violations].sort((a, b) => a.id.localeCompare(b.id)),
    }
  }
  fs.writeFileSync(file, JSON.stringify(baseline, null, 2), 'utf8')
  return { file, baseline }
}

function idx(viol: ViolationFingerprint[]): Record<string, ViolationFingerprint> {
  const out: Record<string, ViolationFingerprint> = {}
  for (const v of viol) out[v.id] = v
  return out
}

export function diffAgainstBaseline(
  baseline: BaselineFile,
  scans: RouteScan[],
): DiffReport {
  const routes: RouteDiff[] = []
  let regression = false
  for (const scan of scans) {
    const baseRoute = baseline.routes[scan.route]
    const base = baseRoute ? idx(baseRoute.violations) : {}
    const cur = idx(scan.violations)
    const ids = new Set([...Object.keys(base), ...Object.keys(cur)])
    const newWorse: DiffEntry[] = []
    const fixed: DiffEntry[] = []
    const unchanged: DiffEntry[] = []
    for (const id of ids) {
      const b = base[id]
      const c = cur[id]
      const impact = (c?.impact || b?.impact || 'minor') as A11yImpact
      const bCount = b?.count ?? 0
      const cCount = c?.count ?? 0
      const entry: DiffEntry = { id, impact, baseline: bCount, current: cCount, delta: cCount - bCount }
      if (bCount === 0 && cCount > 0) {
        newWorse.push(entry)
        if (IMPACT_RANK[impact] >= 3) regression = true
      } else if (cCount > bCount) {
        newWorse.push(entry)
        if (IMPACT_RANK[impact] >= 3) regression = true
      } else if (bCount > 0 && cCount === 0) {
        fixed.push(entry)
      } else {
        unchanged.push(entry)
      }
    }
    routes.push({ route: scan.route, new_or_worse: newWorse, fixed, unchanged })
  }
  return {
    project: baseline.project,
    baselinePath: `a11y-baseline.json`,
    regression,
    routes,
  }
}

export function summarize(diff: DiffReport): {
  new_or_worse_total: number
  fixed_total: number
  critical_new: number
  serious_new: number
} {
  let newWorse = 0,
    fixed = 0,
    crit = 0,
    ser = 0
  for (const r of diff.routes) {
    newWorse += r.new_or_worse.length
    fixed += r.fixed.length
    for (const e of r.new_or_worse) {
      if (e.impact === 'critical') crit++
      else if (e.impact === 'serious') ser++
    }
  }
  return { new_or_worse_total: newWorse, fixed_total: fixed, critical_new: crit, serious_new: ser }
}
