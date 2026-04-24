/**
 * T-009 — Per-route a11y budget enforcement.
 *
 * Reads `<project>/coverage/a11y-budget.yaml`. Shape:
 *
 *   project: demo
 *   defaults:
 *     critical: 0
 *     serious: 5
 *     moderate: 10
 *     minor: 20
 *   routes:
 *     /home:
 *       serious: 2
 *     /admin:
 *       critical: 0
 *       serious: 0
 *
 * For each route in a scan, compute (critical, serious, moderate, minor)
 * counts and compare against the route-specific budget (falling back to
 * defaults). Returns per-route pass/fail + offending severities.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import type { A11yImpact, RouteScan } from './baseline'

export interface BudgetLevels {
  critical?: number
  serious?: number
  moderate?: number
  minor?: number
}

export interface BudgetFile {
  project?: string
  defaults?: BudgetLevels
  routes?: Record<string, BudgetLevels>
}

export interface BudgetRouteResult {
  route: string
  passed: boolean
  counts: Required<BudgetLevels>
  budget: Required<BudgetLevels>
  breaches: A11yImpact[]
}

const INFINITE: Required<BudgetLevels> = {
  critical: Infinity,
  serious: Infinity,
  moderate: Infinity,
  minor: Infinity,
}

export function defaultBudgetPath(projectRoot: string): string {
  return path.join(projectRoot, 'coverage', 'a11y-budget.yaml')
}

export function loadBudget(projectRoot: string): BudgetFile | null {
  const file = defaultBudgetPath(projectRoot)
  if (!fs.existsSync(file)) return null
  try {
    const parsed = yaml.load(fs.readFileSync(file, 'utf8'))
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as BudgetFile
  } catch {
    return null
  }
}

function mergeLevels(
  defaults: BudgetLevels | undefined,
  route: BudgetLevels | undefined,
): Required<BudgetLevels> {
  return {
    critical: route?.critical ?? defaults?.critical ?? INFINITE.critical,
    serious: route?.serious ?? defaults?.serious ?? INFINITE.serious,
    moderate: route?.moderate ?? defaults?.moderate ?? INFINITE.moderate,
    minor: route?.minor ?? defaults?.minor ?? INFINITE.minor,
  }
}

function countByImpact(scan: RouteScan): Required<BudgetLevels> {
  const out: Required<BudgetLevels> = { critical: 0, serious: 0, moderate: 0, minor: 0 }
  for (const v of scan.violations) {
    out[v.impact] += v.count
  }
  return out
}

export function checkBudget(
  budget: BudgetFile | null,
  scans: RouteScan[],
): BudgetRouteResult[] {
  const defaults = budget?.defaults
  const routes = budget?.routes ?? {}
  const results: BudgetRouteResult[] = []
  for (const scan of scans) {
    const routeBudget = mergeLevels(defaults, routes[scan.route])
    const counts = countByImpact(scan)
    const breaches: A11yImpact[] = []
    if (counts.critical > routeBudget.critical) breaches.push('critical')
    if (counts.serious > routeBudget.serious) breaches.push('serious')
    if (counts.moderate > routeBudget.moderate) breaches.push('moderate')
    if (counts.minor > routeBudget.minor) breaches.push('minor')
    results.push({
      route: scan.route,
      passed: breaches.length === 0,
      counts,
      budget: routeBudget,
      breaches,
    })
  }
  return results
}

export function summarizeBudgetResults(results: BudgetRouteResult[]): {
  total_routes: number
  passed: number
  failed: number
  breach_count: number
} {
  let passed = 0,
    failed = 0,
    breachCount = 0
  for (const r of results) {
    if (r.passed) passed++
    else {
      failed++
      breachCount += r.breaches.length
    }
  }
  return { total_routes: results.length, passed, failed, breach_count: breachCount }
}
