/**
 * T-D4 — Cross-project coverage inventory.
 *
 * Walks a set of PROJECT_ROOTS, reads each project's `coverage/*.yaml`
 * + `coverage/features.yaml` (T-A1 index) + AUDIT_GAPS.md Open count,
 * and produces an aggregate report. Master dashboard can import this
 * module (`dist/` after build) or call the `tester inventory` CLI.
 *
 * Pure function; no network. Tests feed synthetic project trees.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadCoverageForProject, computeStats } from '../coverage/loader'
import type { CoverageMatrix, CoverageStats } from '../coverage/schema'
import { loadAuditGapsUntested } from '../untested/loader'
import { loadFeaturesIndex } from '../init/scaffolder'

export interface ProjectInventoryEntry {
  project: string
  projectRoot: string
  features: {
    total: number
    done: number
    open: number
  }
  scenarios: {
    total: number
    covered: number
    missing: number
    skipped: number
    coverage_ratio: number
    critical_missing: number
    high_missing: number
  }
  audit_gaps_open: number
  has_a11y_baseline: boolean
  has_visual_baselines: boolean
}

export interface InventoryReport {
  generated_at: string
  projects: ProjectInventoryEntry[]
  aggregate: {
    project_count: number
    features_total: number
    features_done: number
    scenarios_total: number
    scenarios_covered: number
    coverage_ratio: number
    critical_missing: number
    high_missing: number
    audit_gaps_open: number
  }
}

function summarizeProject(projectRoot: string): ProjectInventoryEntry {
  const name = path.basename(projectRoot)
  const coverages = loadCoverageForProject(projectRoot)
  let total = 0
  let covered = 0
  let missing = 0
  let skipped = 0
  let critMissing = 0
  let highMissing = 0
  for (const entry of coverages) {
    if ('message' in entry.result && !('feature' in entry.result)) continue
    const stats = computeStats(entry.result as CoverageMatrix) as CoverageStats
    total += stats.total
    covered += stats.covered
    missing += stats.missing
    skipped += stats.skipped
    critMissing += stats.critical_missing
    highMissing += stats.high_missing
  }
  const denom = total - skipped
  const coverageRatio = denom > 0 ? covered / denom : 1

  // Features (T-A1 index): count entries with explicit status=done
  let featuresDone = 0
  const idx = loadFeaturesIndex(projectRoot) as unknown as {
    features: Array<Record<string, unknown>>
  }
  for (const f of idx.features) {
    if (f.status === 'done') featuresDone++
  }
  const featuresTotal = idx.features.length
  const featuresOpen = featuresTotal - featuresDone

  const auditOpen = loadAuditGapsUntested(projectRoot).length

  const a11yBaselinePath = path.join(projectRoot, 'coverage', 'a11y-baseline.json')
  const visualDir = path.join(projectRoot, '.tester', 'baselines', name)
  const hasVisual =
    fs.existsSync(visualDir) && fs.readdirSync(visualDir).some((f) => f.endsWith('.png'))

  return {
    project: name,
    projectRoot,
    features: { total: featuresTotal, done: featuresDone, open: featuresOpen },
    scenarios: {
      total,
      covered,
      missing,
      skipped,
      coverage_ratio: coverageRatio,
      critical_missing: critMissing,
      high_missing: highMissing,
    },
    audit_gaps_open: auditOpen,
    has_a11y_baseline: fs.existsSync(a11yBaselinePath),
    has_visual_baselines: hasVisual,
  }
}

export function buildInventory(projectRoots: string[]): InventoryReport {
  const projects: ProjectInventoryEntry[] = []
  for (const root of projectRoots) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) continue
    projects.push(summarizeProject(root))
  }
  let scenariosTotal = 0
  let scenariosCovered = 0
  let critMissing = 0
  let highMissing = 0
  let featuresTotal = 0
  let featuresDone = 0
  let auditOpen = 0
  for (const p of projects) {
    scenariosTotal += p.scenarios.total - p.scenarios.skipped
    scenariosCovered += p.scenarios.covered
    critMissing += p.scenarios.critical_missing
    highMissing += p.scenarios.high_missing
    featuresTotal += p.features.total
    featuresDone += p.features.done
    auditOpen += p.audit_gaps_open
  }
  const ratio = scenariosTotal > 0 ? scenariosCovered / scenariosTotal : 1
  return {
    generated_at: new Date().toISOString(),
    projects: projects.sort((a, b) => a.project.localeCompare(b.project)),
    aggregate: {
      project_count: projects.length,
      features_total: featuresTotal,
      features_done: featuresDone,
      scenarios_total: scenariosTotal,
      scenarios_covered: scenariosCovered,
      coverage_ratio: ratio,
      critical_missing: critMissing,
      high_missing: highMissing,
      audit_gaps_open: auditOpen,
    },
  }
}

/**
 * Discover project roots via a glob-like env var. Accepts:
 *   - Comma-separated list of explicit roots (TESTER_PROJECT_ROOTS env)
 *   - Multiple --root <path> flags
 *   - Parent directory scan: enumerate direct children matching a regex
 */
export function discoverProjectRoots(parentDir: string, re?: RegExp): string[] {
  if (!fs.existsSync(parentDir) || !fs.statSync(parentDir).isDirectory()) return []
  const out: string[] = []
  for (const name of fs.readdirSync(parentDir)) {
    if (name.startsWith('.') || name === 'node_modules') continue
    if (re && !re.test(name)) continue
    const full = path.join(parentDir, name)
    try {
      if (fs.statSync(full).isDirectory()) out.push(full)
    } catch {
      // skip
    }
  }
  return out.sort()
}

export function renderInventoryMarkdown(r: InventoryReport): string {
  const lines: string[] = []
  lines.push(`# Cross-project test inventory`)
  lines.push('')
  lines.push(`_Generated ${r.generated_at}_`)
  lines.push('')
  lines.push(`- **Projects scanned:** ${r.aggregate.project_count}`)
  lines.push(`- **Features:** ${r.aggregate.features_done}/${r.aggregate.features_total} done`)
  lines.push(`- **Scenarios:** ${r.aggregate.scenarios_covered}/${r.aggregate.scenarios_total} (${(r.aggregate.coverage_ratio * 100).toFixed(1)}%)`)
  lines.push(`- **Critical missing:** ${r.aggregate.critical_missing} · **High missing:** ${r.aggregate.high_missing}`)
  lines.push(`- **Open audit gaps:** ${r.aggregate.audit_gaps_open}`)
  lines.push('')
  lines.push(`| Project | Features d/t | Scenarios c/t | Cov% | Crit | High | Gaps | A11y | Visual |`)
  lines.push(`|---------|---------------|---------------|------|------|------|------|------|--------|`)
  for (const p of r.projects) {
    const denom = p.scenarios.total - p.scenarios.skipped
    lines.push(
      `| \`${p.project}\` | ${p.features.done}/${p.features.total} | ${p.scenarios.covered}/${denom} | ${(p.scenarios.coverage_ratio * 100).toFixed(1)}% | ${p.scenarios.critical_missing} | ${p.scenarios.high_missing} | ${p.audit_gaps_open} | ${p.has_a11y_baseline ? '✓' : '·'} | ${p.has_visual_baselines ? '✓' : '·'} |`,
    )
  }
  lines.push('')
  return lines.join('\n')
}
