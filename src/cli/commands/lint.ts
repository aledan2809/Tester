/**
 * T-003 — `tester lint` CLI handler (Half A: test-side linter).
 *
 * Usage:
 *   tester lint <dir>             Walk test files, report violations
 *   tester lint <dir> --json      JSON output
 *   tester lint <dir> --severity error   Treat all violations as errors
 *   tester lint <dir> --no-fail   Exit 0 even on violations
 *
 * Exit codes:
 *   0 — no violations (or --no-fail)
 *   1 — violations found
 *   2 — scan error (dir not found, parse error)
 */

import * as path from 'node:path'
import * as fs from 'node:fs'
import { lintDir } from '../../linter/test-linter'
import type { LintViolation, LintSeverity } from '../../linter/rules'

export interface LintCommandOptions {
  dir: string
  json?: boolean
  severity?: LintSeverity
  noFail?: boolean
  minTimeoutMs?: number
}

function printViolation(v: LintViolation): void {
  const sev = v.severity === 'error' ? '\x1b[31merror\x1b[0m' : '\x1b[33mwarn\x1b[0m'
  const loc = `${path.relative(process.cwd(), v.file)}:${v.line}:${v.col}`
  process.stdout.write(`  ${sev}  ${loc}  [${v.ruleId}]  ${v.message}\n`)
  if (v.snippet) {
    process.stdout.write(`    ${v.snippet}\n`)
  }
}

export async function lintCommand(opts: LintCommandOptions): Promise<void> {
  const dir = path.resolve(opts.dir)
  if (!fs.existsSync(dir)) {
    process.stderr.write(`[lint] ERROR: directory not found: ${dir}\n`)
    process.exit(2)
  }

  const result = lintDir(dir, {
    severity: opts.severity,
    minTimeoutMs: opts.minTimeoutMs,
  })

  const { violations, filesScanned, filesWithViolations } = result

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          violations,
          filesScanned,
          filesWithViolations,
          errorCount: violations.filter((v) => v.severity === 'error').length,
          warnCount: violations.filter((v) => v.severity === 'warn').length,
        },
        null,
        2,
      ) + '\n',
    )
  } else {
    if (violations.length === 0) {
      process.stdout.write(
        `\x1b[32m✓\x1b[0m no violations — ${filesScanned} file(s) scanned\n`,
      )
    } else {
      const errors = violations.filter((v) => v.severity === 'error').length
      const warns = violations.filter((v) => v.severity === 'warn').length
      process.stdout.write(
        `\n${violations.length} violation(s) in ${filesWithViolations}/${filesScanned} file(s)` +
          ` (${errors} error, ${warns} warn)\n\n`,
      )
      for (const v of violations) printViolation(v)
      process.stdout.write('\n')
    }
  }

  if (opts.noFail) {
    process.exit(0)
  }
  process.exit(violations.length > 0 ? 1 : 0)
}
