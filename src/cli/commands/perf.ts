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
import { runLighthouseMulti } from '../../perf/lighthouse'
import {
  appendTrendRecord,
  readTrend,
  computeWeekOverWeek,
  renderTrendMarkdown,
} from '../../perf/trend'
import { postPrComment, parseGithubActionsContext } from '../../perf/github'

export interface PerfOptions {
  project?: string
  from?: string
  before?: string
  after?: string
  check?: boolean
  delta?: boolean
  json?: boolean
  markdown?: boolean
  // T-010 close — lighthouse / trend / github
  lighthouse?: boolean
  urls?: string
  lighthouseFlags?: string
  out?: string
  trend?: boolean
  trendReport?: boolean
  postPr?: boolean
  prMarker?: string
  owner?: string
  repo?: string
  prNumber?: number
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
  // --lighthouse (capture-mode): run lighthouse on --urls and write runs JSON.
  if (opts.lighthouse) {
    if (!opts.urls) {
      process.stderr.write(`[perf] ERROR: --lighthouse requires --urls <csv>\n`)
      process.exit(2)
    }
    const urls = opts.urls!.split(',').map((s) => s.trim()).filter(Boolean)
    const flags = opts.lighthouseFlags
      ? opts.lighthouseFlags.split(' ').filter(Boolean)
      : undefined
    const runs = await runLighthouseMulti(urls, { flags })
    const payload = { runs }
    const outPath = opts.out ? path.resolve(opts.out) : ''
    if (outPath) {
      fs.mkdirSync(path.dirname(outPath), { recursive: true })
      fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8')
      if (!opts.json) process.stdout.write(`Wrote ${runs.length} runs → ${outPath}\n`)
    } else if (opts.json) {
      process.stdout.write(JSON.stringify(payload, null, 2) + '\n')
    } else {
      for (const r of runs) {
        process.stdout.write(
          `  ${r.route.padEnd(40)} fcp=${r.metrics.fcp_ms ?? '-'}  lcp=${r.metrics.lcp_ms ?? '-'}  tti=${r.metrics.tti_ms ?? '-'}  cls=${r.metrics.cls ?? '-'}  bytes=${r.metrics.transfer_bytes ?? '-'}\n`,
        )
      }
    }
    // Optionally append to trend storage.
    if (opts.trend && opts.project) {
      const file = appendTrendRecord(path.resolve(opts.project), {
        ts: new Date().toISOString(),
        runs,
      })
      if (!opts.json) process.stdout.write(`Trend record appended → ${file}\n`)
    }
    return
  }

  // --trend-report (read + render week-over-week).
  if (opts.trendReport) {
    if (!opts.project) {
      process.stderr.write(`[perf] ERROR: --trend-report requires --project <path>\n`)
      process.exit(2)
    }
    const records = readTrend(path.resolve(opts.project))
    const wow = computeWeekOverWeek(records)
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ records: records.length, week_over_week: wow }, null, 2) + '\n',
      )
      return
    }
    if (opts.markdown) {
      process.stdout.write(renderTrendMarkdown(wow) + '\n')
      return
    }
    process.stdout.write(`Trend records: ${records.length}\nWeek-over-week changes: ${wow.length}\n`)
    for (const e of wow.slice(0, 20)) {
      const sign = e.delta > 0 ? '+' : ''
      process.stdout.write(
        `  ${e.route.padEnd(30)} ${e.metric.padEnd(14)} ${e.prev_week_median} → ${e.curr_week_median}  (${sign}${e.delta}, ${sign}${e.percent.toFixed(1)}%)\n`,
      )
    }
    return
  }

  const selected = [opts.check, opts.delta].filter(Boolean).length
  if (selected !== 1) {
    process.stderr.write(
      `[perf] ERROR: pick exactly one of --check / --delta / --lighthouse / --trend-report\n`,
    )
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
    await maybePostPrComment(opts, renderCiComment(report))
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
  await maybePostPrComment(opts, renderCiComment(report, delta))
  if (report.failed > 0) process.exit(1)
}

async function maybePostPrComment(opts: PerfOptions, markdown: string): Promise<void> {
  if (!opts.postPr) return
  const ctx = parseGithubActionsContext()
  const owner = opts.owner || ctx?.owner
  const repo = opts.repo || ctx?.repo
  const prNumber = opts.prNumber ?? ctx?.prNumber
  if (!owner || !repo || !prNumber) {
    process.stderr.write(
      `[perf] --post-pr requires --owner/--repo/--pr-number OR GitHub Actions env (GITHUB_REPOSITORY + GITHUB_EVENT_PATH with a pull_request event).\n`,
    )
    return
  }
  const res = await postPrComment({
    owner,
    repo,
    prNumber,
    body: markdown,
    marker: opts.prMarker || '<!-- tester-perf -->',
  })
  if (res.ok) {
    process.stderr.write(`[perf] PR comment ${res.action} (id=${res.commentId})\n`)
  } else {
    process.stderr.write(
      `[perf] PR comment failed: ${res.error || res.status}\n`,
    )
  }
}
