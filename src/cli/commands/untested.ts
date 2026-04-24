/**
 * T-006 — `tester untested` CLI handler.
 *
 * Usage:
 *   tester untested --project <path>
 *   tester untested --project <path> --json
 *   tester untested --project <path> --markdown
 *   tester untested --project <path> --sources coverage,audit_gaps
 *
 * Exit codes:
 *   0 — ran successfully (even if the project has zero untested items)
 *   2 — project missing or bad arguments
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { buildUntestedReport } from '../../untested/loader'
import type { UntestedItem, UntestedReport, UntestedSource } from '../../untested/schema'

export interface UntestedOptions {
  project?: string
  sources?: string
  since?: string
  attribute?: boolean
  json?: boolean
  markdown?: boolean
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: '✗ CRIT',
  high: '✗ HIGH',
  medium: '⚠ MED ',
  low: 'ℹ LOW ',
  info: '· INFO',
}

const SOURCE_SHORT: Record<UntestedSource, string> = {
  coverage: 'cov',
  audit_gaps: 'gap',
  dev_status: 'todo',
  reports: 'rep',
}

function parseSources(csv: string | undefined): UntestedSource[] | undefined {
  if (!csv) return undefined
  const valid: UntestedSource[] = ['coverage', 'audit_gaps', 'dev_status', 'reports']
  const seen = new Set<UntestedSource>()
  for (const raw of csv.split(',')) {
    const v = raw.trim().toLowerCase() as UntestedSource
    if (!valid.includes(v)) {
      process.stderr.write(`[untested] ERROR: unknown source "${raw}". Valid: ${valid.join(',')}\n`)
      process.exit(2)
    }
    seen.add(v)
  }
  return [...seen]
}

function printAscii(rep: UntestedReport): void {
  process.stdout.write(`\nProject: ${rep.project}\nRoot:    ${rep.projectRoot}\n\n`)
  const c = rep.counts
  process.stdout.write(
    `Totals: ${c.total} items  |  ` +
      `crit=${c.by_severity.critical} high=${c.by_severity.high} med=${c.by_severity.medium} low=${c.by_severity.low} info=${c.by_severity.info}  |  ` +
      `cov=${c.by_source.coverage} gap=${c.by_source.audit_gaps} todo=${c.by_source.dev_status} rep=${c.by_source.reports}\n\n`,
  )
  if (rep.items.length === 0) {
    process.stdout.write(`✓ No untested items surfaced across the four sources.\n`)
    return
  }
  for (const it of rep.items) {
    const badge = SEVERITY_BADGE[it.severity] || '      '
    const src = SOURCE_SHORT[it.source]
    const area = it.area ? ` [${it.area}]` : ''
    process.stdout.write(`  ${badge} ${src.padEnd(4)} ${it.id.padEnd(24)}${area} ${it.title}\n`)
  }
  process.stdout.write(`\nEvidence files referenced:\n`)
  const files = new Set(rep.items.map((i) => i.evidenceFile))
  for (const f of files) process.stdout.write(`  - ${f}\n`)
}

function printMarkdown(rep: UntestedReport): void {
  process.stdout.write(`# Untested — ${rep.project}\n\n`)
  const c = rep.counts
  process.stdout.write(`- **Project root**: \`${rep.projectRoot}\`\n`)
  process.stdout.write(`- **Total**: ${c.total}\n`)
  process.stdout.write(
    `- **Severity**: critical=${c.by_severity.critical} · high=${c.by_severity.high} · medium=${c.by_severity.medium} · low=${c.by_severity.low} · info=${c.by_severity.info}\n`,
  )
  process.stdout.write(
    `- **Source**: coverage=${c.by_source.coverage} · audit_gaps=${c.by_source.audit_gaps} · dev_status=${c.by_source.dev_status} · reports=${c.by_source.reports}\n\n`,
  )
  if (rep.items.length === 0) {
    process.stdout.write(`_No untested items surfaced._\n`)
    return
  }
  process.stdout.write(`| # | Severity | Source | ID | Area | Title |\n`)
  process.stdout.write(`|---|----------|--------|----|------|-------|\n`)
  rep.items.forEach((it: UntestedItem, i: number) => {
    process.stdout.write(
      `| ${i + 1} | ${it.severity} | ${it.source} | \`${it.id}\` | ${it.area || ''} | ${it.title.replace(/\|/g, '\\|')} |\n`,
    )
  })
}

export async function untestedCommand(opts: UntestedOptions): Promise<void> {
  if (!opts.project) {
    process.stderr.write(`[untested] ERROR: --project <path> is required.\n`)
    process.exit(2)
  }
  const projectRoot = path.resolve(opts.project!)
  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    process.stderr.write(`[untested] ERROR: project path does not exist or is not a directory: ${projectRoot}\n`)
    process.exit(2)
  }
  if (opts.json && opts.markdown) {
    process.stderr.write(`[untested] ERROR: --json and --markdown are mutually exclusive.\n`)
    process.exit(2)
  }

  const sources = parseSources(opts.sources)
  const report = buildUntestedReport(projectRoot, {
    sources,
    since: opts.since,
    attribute: !!opts.attribute,
  })
  if (report.since && report.since_error) {
    process.stderr.write(`[untested] WARNING: --since ignored — ${report.since_error}\n`)
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }
  if (opts.markdown) {
    printMarkdown(report)
    return
  }
  printAscii(report)
}
