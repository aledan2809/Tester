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
  /** Optional time-boxed allowance — while this ISO date is in the future,
   * the diff treats this violation as acceptable noise (not a regression). */
  suppressed_until?: string
  /** Human note attached to suppression — required when suppressed_until is set. */
  suppressed_reason?: string
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
  /** When true, entry is within the suppressed_until window and does not fire regression. */
  suppressed?: boolean
  /** Populated when suppressed is true. */
  suppressed_until?: string
}

export interface RouteDiff {
  route: string
  /** Violations present in current that are absent OR higher-count in baseline. */
  new_or_worse: DiffEntry[]
  /** Violations that got fixed (count decreased to 0). */
  fixed: DiffEntry[]
  /** Violations at same severity/count — informational only. */
  unchanged: DiffEntry[]
  /** Violations suppressed-until a future date — carried separately so reports can show them. */
  suppressed: DiffEntry[]
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

function isSuppressionActive(until: string | undefined, now: Date): boolean {
  if (!until) return false
  const t = Date.parse(until)
  if (Number.isNaN(t)) return false
  return t > now.getTime()
}

export function diffAgainstBaseline(
  baseline: BaselineFile,
  scans: RouteScan[],
  opts: { now?: Date } = {},
): DiffReport {
  const now = opts.now || new Date()
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
    const suppressed: DiffEntry[] = []
    for (const id of ids) {
      const b = base[id]
      const c = cur[id]
      const impact = (c?.impact || b?.impact || 'minor') as A11yImpact
      const bCount = b?.count ?? 0
      const cCount = c?.count ?? 0
      const until = b?.suppressed_until || c?.suppressed_until
      const isSuppressed = isSuppressionActive(until, now)
      const entry: DiffEntry = {
        id,
        impact,
        baseline: bCount,
        current: cCount,
        delta: cCount - bCount,
        ...(isSuppressed ? { suppressed: true, suppressed_until: until } : {}),
      }
      if (isSuppressed) {
        suppressed.push(entry)
        continue
      }
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
    routes.push({ route: scan.route, new_or_worse: newWorse, fixed, unchanged, suppressed })
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
