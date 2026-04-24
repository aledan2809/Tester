/**
 * T-010 — Performance budget evaluator.
 *
 * Consumes per-route metric objects (FCP/LCP/TTI/CLS/transferSize) and
 * enforces a YAML-defined budget. This is intentionally scope-tight:
 *   - Metric *capture* is the caller's job (existing capturePerformanceMetrics
 *     in assertions/performance.ts covers browser-CDP metrics; Lighthouse
 *     integration is a separate follow-up).
 *   - Tester owns: budget parse, per-route evaluation, before/after delta
 *     reporting, and CI-comment markdown generation.
 *
 * Budget file shape (coverage/perf-budget.yaml):
 *   project: demo
 *   defaults:
 *     fcp_ms: 2000
 *     lcp_ms: 2500
 *     tti_ms: 3500
 *     cls: 0.1
 *     transfer_bytes: 300000
 *   routes:
 *     /dashboard:
 *       lcp_ms: 2000
 *       transfer_bytes: 250000
 *
 * Metric input shape (from caller): { "runs": [{ route, metrics }] } where
 * metrics is a subset of the keys above (unspecified keys are not checked).
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as yaml from 'js-yaml'

export type PerfMetricKey = 'fcp_ms' | 'lcp_ms' | 'tti_ms' | 'cls' | 'transfer_bytes'

export interface PerfMetrics {
  fcp_ms?: number
  lcp_ms?: number
  tti_ms?: number
  cls?: number
  transfer_bytes?: number
}

export interface PerfRun {
  route: string
  metrics: PerfMetrics
}

export interface PerfBudgetFile {
  project?: string
  defaults?: PerfMetrics
  routes?: Record<string, PerfMetrics>
}

export interface PerfRouteResult {
  route: string
  passed: boolean
  metrics: PerfMetrics
  budget: PerfMetrics
  breaches: Array<{ metric: PerfMetricKey; actual: number; budget: number; delta: number }>
}

export interface PerfReport {
  project: string
  total_routes: number
  passed: number
  failed: number
  breach_count: number
  results: PerfRouteResult[]
}

const METRIC_KEYS: PerfMetricKey[] = ['fcp_ms', 'lcp_ms', 'tti_ms', 'cls', 'transfer_bytes']

export function defaultPerfBudgetPath(projectRoot: string): string {
  return path.join(projectRoot, 'coverage', 'perf-budget.yaml')
}

export function loadPerfBudget(projectRoot: string): PerfBudgetFile | null {
  const file = defaultPerfBudgetPath(projectRoot)
  if (!fs.existsSync(file)) return null
  try {
    const parsed = yaml.load(fs.readFileSync(file, 'utf8'))
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as PerfBudgetFile
  } catch {
    return null
  }
}

function mergeBudget(
  defaults: PerfMetrics | undefined,
  route: PerfMetrics | undefined,
): PerfMetrics {
  const out: PerfMetrics = {}
  for (const k of METRIC_KEYS) {
    const val = route?.[k] ?? defaults?.[k]
    if (val !== undefined) out[k] = val
  }
  return out
}

export function evaluatePerfBudget(
  budget: PerfBudgetFile | null,
  runs: PerfRun[],
): PerfReport {
  const defaults = budget?.defaults
  const routes = budget?.routes ?? {}
  const results: PerfRouteResult[] = []
  for (const run of runs) {
    const routeBudget = mergeBudget(defaults, routes[run.route])
    const breaches: PerfRouteResult['breaches'] = []
    for (const k of METRIC_KEYS) {
      const actual = run.metrics[k]
      const cap = routeBudget[k]
      if (actual === undefined || cap === undefined) continue
      if (actual > cap) {
        breaches.push({ metric: k, actual, budget: cap, delta: actual - cap })
      }
    }
    results.push({
      route: run.route,
      passed: breaches.length === 0,
      metrics: run.metrics,
      budget: routeBudget,
      breaches,
    })
  }
  const passed = results.filter((r) => r.passed).length
  const breachCount = results.reduce((sum, r) => sum + r.breaches.length, 0)
  return {
    project: budget?.project ?? '(unknown)',
    total_routes: results.length,
    passed,
    failed: results.length - passed,
    breach_count: breachCount,
    results,
  }
}

export interface PerfDeltaEntry {
  route: string
  metric: PerfMetricKey
  before: number
  after: number
  delta: number
  percent: number
}

export function computePerfDelta(before: PerfRun[], after: PerfRun[]): PerfDeltaEntry[] {
  const byRoute: Record<string, { before?: PerfMetrics; after?: PerfMetrics }> = {}
  for (const r of before) byRoute[r.route] = { ...(byRoute[r.route] || {}), before: r.metrics }
  for (const r of after) byRoute[r.route] = { ...(byRoute[r.route] || {}), after: r.metrics }
  const out: PerfDeltaEntry[] = []
  for (const [route, pair] of Object.entries(byRoute)) {
    if (!pair.before || !pair.after) continue
    for (const k of METRIC_KEYS) {
      const b = pair.before[k]
      const a = pair.after[k]
      if (b === undefined || a === undefined) continue
      if (b === a) continue
      const delta = a - b
      const percent = b !== 0 ? (delta / b) * 100 : 0
      out.push({ route, metric: k, before: b, after: a, delta, percent })
    }
  }
  return out
}

export function renderCiComment(
  evalReport: PerfReport,
  delta: PerfDeltaEntry[] | null = null,
): string {
  const lines: string[] = []
  lines.push(`## T-010 Perf Budget Report — ${evalReport.project}`)
  lines.push('')
  lines.push(`- **Routes checked:** ${evalReport.total_routes}`)
  lines.push(`- **Pass:** ${evalReport.passed} · **Fail:** ${evalReport.failed} · **Breaches:** ${evalReport.breach_count}`)
  lines.push('')
  if (evalReport.failed > 0) {
    lines.push(`### Budget breaches`)
    lines.push('')
    lines.push(`| Route | Metric | Actual | Budget | Δ |`)
    lines.push(`|-------|--------|--------|--------|---|`)
    for (const r of evalReport.results) {
      for (const b of r.breaches) {
        lines.push(`| \`${r.route}\` | ${b.metric} | ${b.actual} | ${b.budget} | +${b.delta} |`)
      }
    }
    lines.push('')
  }
  if (delta && delta.length > 0) {
    lines.push(`### Before → After changes`)
    lines.push('')
    lines.push(`| Route | Metric | Before | After | Δ | Δ% |`)
    lines.push(`|-------|--------|--------|-------|---|----|`)
    for (const d of delta) {
      const sign = d.delta > 0 ? '+' : ''
      lines.push(
        `| \`${d.route}\` | ${d.metric} | ${d.before} | ${d.after} | ${sign}${d.delta} | ${sign}${d.percent.toFixed(1)}% |`,
      )
    }
    lines.push('')
  }
  return lines.join('\n')
}
