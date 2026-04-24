/**
 * T-010 — `tester perf` CLI.
 *
 * Subactions (one of):
 *   --check   evaluate runs against coverage/perf-budget.yaml
 *   --delta   diff before/after runs, render CI comment markdown
 *
 * Input JSON shape (required for --check and --delta):
 *   { "runs": [{ "route": "/path", "metrics": { "lcp_ms": 2100, "cls": 0.08 } }] }
 *
 * Exit codes:
 *   0 — all routes pass the budget (or --delta completed)
 *   1 — any route breaches the budget
 *   2 — bad args / missing file / parse error
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  evaluatePerfBudget,
  loadPerfBudget,
  computePerfDelta,
  renderCiComment,
  type PerfRun,
} from '../../perf/budget'

export interface PerfOptions {
  project?: string
  from?: string
  before?: string
  after?: string
  check?: boolean
  delta?: boolean
  json?: boolean
  markdown?: boolean
}

function readRuns(p: string): PerfRun[] {
  const full = path.resolve(p)
  if (!fs.existsSync(full)) {
    process.stderr.write(`[perf] ERROR: file not found: ${full}\n`)
    process.exit(2)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(full, 'utf8'))
  } catch (e) {
    process.stderr.write(`[perf] ERROR: bad JSON in ${full}: ${(e as Error).message}\n`)
    process.exit(2)
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as { runs?: unknown }).runs)
  ) {
    process.stderr.write(`[perf] ERROR: JSON must have { "runs": [...] }\n`)
    process.exit(2)
  }
  return (parsed as { runs: PerfRun[] }).runs
}

export async function perfCommand(opts: PerfOptions): Promise<void> {
  const selected = [opts.check, opts.delta].filter(Boolean).length
  if (selected !== 1) {
    process.stderr.write(`[perf] ERROR: pick exactly one of --check / --delta\n`)
    process.exit(2)
  }

  if (opts.check) {
    if (!opts.project || !opts.from) {
      process.stderr.write(`[perf] ERROR: --check requires --project <path> and --from <runs.json>\n`)
      process.exit(2)
    }
    const root = path.resolve(opts.project!)
    const runs = readRuns(opts.from!)
    const budget = loadPerfBudget(root)
    const report = evaluatePerfBudget(budget, runs)

    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    } else if (opts.markdown) {
      process.stdout.write(renderCiComment(report) + '\n')
    } else {
      process.stdout.write(
        `Project: ${report.project}\nBudget:  ${budget ? 'loaded' : '(none — passes everything)'}\n` +
          `Routes:  ${report.total_routes}  pass=${report.passed}  fail=${report.failed}  breaches=${report.breach_count}\n\n`,
      )
      for (const r of report.results) {
        const badge = r.passed ? '✓' : '✗'
        process.stdout.write(`  ${badge} ${r.route}\n`)
        for (const b of r.breaches) {
          process.stdout.write(
            `      ✗ ${b.metric}=${b.actual} > ${b.budget} (+${b.delta})\n`,
          )
        }
      }
    }
    if (report.failed > 0) process.exit(1)
    return
  }

  // --delta
  if (!opts.before || !opts.after) {
    process.stderr.write(`[perf] ERROR: --delta requires --before <base.json> and --after <pr.json>\n`)
    process.exit(2)
  }
  const before = readRuns(opts.before!)
  const after = readRuns(opts.after!)
  const delta = computePerfDelta(before, after)

  // Optional budget check against `after` — gives a one-shot PR comment.
  const root = opts.project ? path.resolve(opts.project) : null
  const budget = root ? loadPerfBudget(root) : null
  const report = evaluatePerfBudget(budget, after)

  if (opts.json) {
    process.stdout.write(JSON.stringify({ delta, report }, null, 2) + '\n')
  } else if (opts.markdown) {
    process.stdout.write(renderCiComment(report, delta) + '\n')
  } else {
    process.stdout.write(`Delta entries: ${delta.length}\n`)
    for (const d of delta) {
      const sign = d.delta > 0 ? '+' : ''
      process.stdout.write(
        `  ${d.route}  ${d.metric}  ${d.before} → ${d.after}  (${sign}${d.delta}, ${sign}${d.percent.toFixed(1)}%)\n`,
      )
    }
  }
  if (report.failed > 0) process.exit(1)
}
