/**
 * T-007 §4 — `tester flake-report` CLI.
 *
 * Walks a reports directory (default `./reports`) for historical
 * `*.json` test runs, aggregates retry metadata stamped by T-007
 * retry helper, and prints the top flaky steps. Designed to run in
 * CI weekly for hard-fix prioritization.
 */

import * as path from 'node:path'
import { aggregateFlakes, renderFlakeMarkdown } from '../../flake/reporter'

export interface FlakeReportOptions {
  dir?: string
  since?: string
  json?: boolean
  markdown?: boolean
  topN?: number
}

export async function flakeReportCommand(opts: FlakeReportOptions): Promise<void> {
  const dir = path.resolve(opts.dir || './reports')
  const report = aggregateFlakes(dir, { since: opts.since })
  const topN = opts.topN && opts.topN > 0 ? opts.topN : 20

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          dir,
          ...report,
          steps: report.steps.slice(0, topN),
        },
        null,
        2,
      ) + '\n',
    )
    return
  }
  if (opts.markdown) {
    process.stdout.write(renderFlakeMarkdown(report) + '\n')
    return
  }
  process.stdout.write(
    `Flake report — ${dir}\n  runs=${report.scanned_runs}  steps=${report.totals.steps}  with-retries=${report.totals.steps_with_retries}  total-retries=${report.totals.total_retries}\n\n`,
  )
  if (report.steps.length === 0) {
    process.stdout.write(`✓ No flaky steps — zero retries consumed.\n`)
    return
  }
  process.stdout.write(`Top ${Math.min(topN, report.steps.length)} flaky steps (flake_rate desc):\n`)
  for (const s of report.steps.slice(0, topN)) {
    process.stdout.write(
      `  ${(s.flake_rate * 100).toFixed(1).padStart(5)}%  runs=${String(s.runs).padStart(3)}  ret=${s.retries_consumed}  pass=${s.retries_that_passed}/fail=${s.retries_that_failed}  ${s.key.scenarioName.slice(0, 40)} › ${s.key.action}#${s.key.stepIndex}\n`,
    )
  }
}
