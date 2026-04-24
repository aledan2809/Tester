/**
 * T-002 — `tester coverage` CLI handler.
 *
 * Modes:
 *   --feature <path-to-yaml>  Inspect a single coverage file
 *   --project <path>          Roll-up all coverage/*.yaml under the project
 *   --fail-under <ratio>      Exit 1 if coverage_ratio < ratio (0..1)
 *   --json                    Emit JSON
 *
 * Exit codes:
 *   0 — all OK, ratio >= --fail-under (if set), zero P0 missing
 *   1 — coverage ratio below threshold OR any critical-severity missing
 *   2 — loader error (bad YAML, no coverage/ dir, etc.)
 */

import * as path from 'node:path'
import * as fs from 'node:fs'
import { loadCoverageMatrix, loadCoverageForProject, buildReport } from '../../coverage/loader'
import type { FeatureCoverageReport } from '../../coverage/schema'

export interface CoverageOptions {
  feature?: string
  project?: string
  failUnder?: number
  json?: boolean
}

function fmtPercent(r: number): string {
  return `${(r * 100).toFixed(1)}%`
}

function printFeatureReport(rep: FeatureCoverageReport, verbose = true): void {
  process.stdout.write(`\nFeature: ${rep.feature}  (owner: ${rep.owner})\n`)
  process.stdout.write(`File: ${rep.file}\n`)
  process.stdout.write(
    `  ${rep.stats.covered}/${rep.stats.total} covered (${fmtPercent(rep.stats.coverage_ratio)}); ` +
      `missing: ${rep.stats.missing} (crit=${rep.stats.critical_missing}, high=${rep.stats.high_missing}, med=${rep.stats.medium_missing}, low=${rep.stats.low_or_info_missing}); ` +
      `skipped=${rep.stats.skipped}, unknown=${rep.stats.unknown}\n`,
  )
  if (!verbose) return
  for (const s of rep.ordered_scenarios) {
    const badge =
      s.status === 'covered' ? '✓' : s.status === 'missing' ? '✗' : s.status === 'skipped' ? '·' : '?'
    const sev = `[${s.severity.toUpperCase()}]`
    process.stdout.write(`  ${badge} ${s.id.padEnd(6)} ${sev.padEnd(11)} ${s.name}\n`)
    if (s.status === 'missing') {
      process.stdout.write(`        MISSING — add coverage under ${s.category || '(no-category)'}\n`)
    } else if (s.covered_by) {
      process.stdout.write(`        → ${s.covered_by}\n`)
    }
  }
}

export async function coverageCommand(opts: CoverageOptions): Promise<void> {
  const failUnder = opts.failUnder !== undefined ? opts.failUnder : 0
  if (failUnder < 0 || failUnder > 1) {
    process.stderr.write(`[coverage] ERROR: --fail-under must be between 0 and 1, got: ${failUnder}\n`)
    process.exit(2)
  }
  if (!opts.feature && !opts.project) {
    process.stderr.write(`[coverage] ERROR: must specify either --feature <path-to-yaml> or --project <path>\n`)
    process.exit(2)
  }

  const reports: FeatureCoverageReport[] = []
  const errors: string[] = []

  if (opts.feature) {
    const file = path.resolve(opts.feature)
    const result = loadCoverageMatrix(file)
    if ('message' in result && !('feature' in result)) {
      errors.push(`${result.file}: ${result.message}`)
    } else {
      reports.push(buildReport(result as import('../../coverage/schema').CoverageMatrix, file))
    }
  }

  if (opts.project) {
    const projectRoot = path.resolve(opts.project)
    if (!fs.existsSync(projectRoot)) {
      process.stderr.write(`[coverage] ERROR: project path does not exist: ${projectRoot}\n`)
      process.exit(2)
    }
    const loaded = loadCoverageForProject(projectRoot)
    if (loaded.length === 0) {
      process.stderr.write(`[coverage] no coverage/*.yaml files found under ${projectRoot}/coverage/\n`)
      process.exit(2)
    }
    for (const item of loaded) {
      if ('message' in item.result && !('feature' in item.result)) {
        errors.push(`${item.file}: ${(item.result as { message: string }).message}`)
      } else {
        reports.push(
          buildReport(item.result as import('../../coverage/schema').CoverageMatrix, item.file),
        )
      }
    }
  }

  // Aggregate posture for project-level mode.
  let aggTotal = 0,
    aggCovered = 0,
    aggCriticalMissing = 0,
    aggHighMissing = 0
  for (const r of reports) {
    aggTotal += r.stats.total - r.stats.skipped
    aggCovered += r.stats.covered
    aggCriticalMissing += r.stats.critical_missing
    aggHighMissing += r.stats.high_missing
  }
  const aggRatio = aggTotal > 0 ? aggCovered / aggTotal : 1

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          reports,
          aggregate: {
            features: reports.length,
            total: aggTotal,
            covered: aggCovered,
            coverage_ratio: aggRatio,
            critical_missing: aggCriticalMissing,
            high_missing: aggHighMissing,
          },
          errors,
          fail_under: failUnder,
        },
        null,
        2,
      ) + '\n',
    )
  } else {
    if (errors.length > 0) {
      process.stderr.write(`[coverage] ${errors.length} loader error(s):\n`)
      for (const e of errors) process.stderr.write(`  - ${e}\n`)
    }
    for (const r of reports) printFeatureReport(r, reports.length <= 3)
    process.stdout.write(
      `\nAggregate: ${reports.length} feature(s); coverage ${fmtPercent(aggRatio)} (${aggCovered}/${aggTotal}); critical-missing=${aggCriticalMissing}, high-missing=${aggHighMissing}\n`,
    )
    if (failUnder > 0) {
      process.stdout.write(`Threshold: --fail-under ${fmtPercent(failUnder)} → ${aggRatio >= failUnder ? 'PASS' : 'FAIL'}\n`)
    }
  }

  let exitCode = 0
  if (errors.length > 0) exitCode = Math.max(exitCode, 2)
  if (aggCriticalMissing > 0) exitCode = Math.max(exitCode, 1)
  if (failUnder > 0 && aggRatio < failUnder) exitCode = Math.max(exitCode, 1)
  process.exit(exitCode)
}
