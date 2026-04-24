/**
 * T-009 — `tester a11y` CLI.
 *
 * Subactions (one of):
 *   --baseline     capture current scan JSON as baseline for the project
 *   --check        diff scan JSON against baseline + enforce budget
 *
 * Scan JSON shape (callers produce this — typically `tester run` wraps
 * `runA11yScan` and writes to disk):
 *   {
 *     "scans": [
 *       { "route": "/home", "violations": [{ "id": "...", "impact": "serious", "count": 3 }] },
 *       ...
 *     ]
 *   }
 *
 * Exit codes:
 *   0 — baseline stored OR check passed
 *   1 — regression detected (new critical/serious) OR budget breached
 *   2 — missing args / parse error / missing baseline on --check
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  storeBaseline,
  loadBaseline,
  diffAgainstBaseline,
  summarize,
  type RouteScan,
} from '../../a11y/baseline'
import { loadBudget, checkBudget, summarizeBudgetResults } from '../../a11y/budget'

export interface A11yOptions {
  project?: string
  from?: string
  baseline?: boolean
  check?: boolean
  json?: boolean
  budget?: boolean
}

function readScans(fromPath: string): RouteScan[] {
  const full = path.resolve(fromPath)
  if (!fs.existsSync(full)) {
    process.stderr.write(`[a11y] ERROR: --from file not found: ${full}\n`)
    process.exit(2)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(full, 'utf8'))
  } catch (e) {
    process.stderr.write(`[a11y] ERROR: cannot parse JSON: ${(e as Error).message}\n`)
    process.exit(2)
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { scans?: unknown }).scans)) {
    process.stderr.write(`[a11y] ERROR: scan file must have { "scans": [...] } root\n`)
    process.exit(2)
  }
  return (parsed as { scans: RouteScan[] }).scans
}

export async function a11yCommand(opts: A11yOptions): Promise<void> {
  const selected = [opts.baseline, opts.check].filter(Boolean).length
  if (selected !== 1) {
    process.stderr.write(`[a11y] ERROR: pick exactly one of --baseline / --check\n`)
    process.exit(2)
  }
  if (!opts.project) {
    process.stderr.write(`[a11y] ERROR: --project <path> is required\n`)
    process.exit(2)
  }
  if (!opts.from) {
    process.stderr.write(`[a11y] ERROR: --from <scan.json> is required\n`)
    process.exit(2)
  }
  const projectRoot = path.resolve(opts.project)
  if (!fs.existsSync(projectRoot)) {
    process.stderr.write(`[a11y] ERROR: project path does not exist: ${projectRoot}\n`)
    process.exit(2)
  }

  const scans = readScans(opts.from)

  if (opts.baseline) {
    const { file, baseline } = storeBaseline(projectRoot, path.basename(projectRoot), scans)
    if (opts.json) {
      process.stdout.write(JSON.stringify({ action: 'baseline', file, baseline }, null, 2) + '\n')
    } else {
      process.stdout.write(`Captured baseline for "${baseline.project}":\n  → ${file}\n  routes: ${scans.length}\n`)
    }
    return
  }

  // --check
  const baseline = loadBaseline(projectRoot)
  if (!baseline) {
    process.stderr.write(
      `[a11y] ERROR: no baseline at ${path.join(projectRoot, 'coverage/a11y-baseline.json')}. Run --baseline first.\n`,
    )
    process.exit(2)
  }
  const diff = diffAgainstBaseline(baseline!, scans)
  const summary = summarize(diff)
  const budget = opts.budget !== false ? loadBudget(projectRoot) : null
  const budgetResults = budget ? checkBudget(budget, scans) : []
  const budgetSummary = summarizeBudgetResults(budgetResults)

  const payload = {
    action: 'check',
    diff,
    summary,
    budget: budget ? { file: 'coverage/a11y-budget.yaml', results: budgetResults, summary: budgetSummary } : null,
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n')
  } else {
    process.stdout.write(`Project:  ${baseline.project}\n`)
    process.stdout.write(`Captured: ${baseline.captured_at}\n\n`)
    process.stdout.write(
      `Diff vs baseline: +${summary.new_or_worse_total} new/worse (crit=${summary.critical_new}, ser=${summary.serious_new}) · ${summary.fixed_total} fixed\n`,
    )
    if (budget) {
      process.stdout.write(
        `Budget: ${budgetSummary.passed}/${budgetSummary.total_routes} routes pass, ${budgetSummary.breach_count} breach(es)\n`,
      )
    }
    for (const r of diff.routes) {
      if (r.new_or_worse.length === 0 && r.fixed.length === 0) continue
      process.stdout.write(`\n  ${r.route}\n`)
      for (const e of r.new_or_worse) {
        process.stdout.write(`    ✗ [${e.impact}] ${e.id}  ${e.baseline} → ${e.current}\n`)
      }
      for (const e of r.fixed) {
        process.stdout.write(`    ✓ [${e.impact}] ${e.id}  ${e.baseline} → 0 (fixed)\n`)
      }
    }
  }

  if (diff.regression) process.exit(1)
  if (budget && budgetSummary.failed > 0) process.exit(1)
}
