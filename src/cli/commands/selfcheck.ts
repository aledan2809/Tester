/**
 * `tester selfcheck` — T-001 Harness Self-Test Battery CLI Command
 *
 * Pre-flight validation of the tester's own primitives before running
 * against a target. Catches harness-level defects (invalid CSS selectors,
 * missing regex flags, unsafe timing defaults, missing lessons).
 *
 * Exit codes:
 *   0 → all pass (or pass + skipped)
 *   1 → warnings only
 *   2 → at least one fail
 *
 * Usage:
 *   tester selfcheck                 # run all checks, output summary
 *   tester selfcheck --verbose       # include evidence details
 *   tester selfcheck --json          # JSON output for scripting
 */

import { runSelfCheck, exitCodeForSummary } from '../../self-test/harness'

export interface SelfCheckOptions {
  verbose?: boolean
  json?: boolean
  quiet?: boolean
}

function formatAsText(
  summary: ReturnType<typeof runSelfCheck>,
  options: SelfCheckOptions,
): string {
  const lines: string[] = []

  lines.push('') // blank line
  lines.push('T-001 Harness Self-Test Battery')
  lines.push('═'.repeat(50))
  lines.push('')

  const severityIcons: Record<string, string> = {
    pass: '✓',
    warn: '⚠',
    fail: '✗',
    skipped: '◯',
  }
  const severityColors: Record<string, string> = {
    pass: '\x1b[32m', // green
    warn: '\x1b[33m', // yellow
    fail: '\x1b[31m', // red
    skipped: '\x1b[90m', // gray
  }
  const resetColor = '\x1b[0m'

  for (const result of summary.results) {
    const icon = severityIcons[result.severity] || '?'
    const color = severityColors[result.severity] || ''
    const msg = `${color}${icon}${resetColor} ${result.title}`
    lines.push(msg)

    if (options.verbose || result.severity === 'fail' || result.severity === 'warn') {
      lines.push(`  ${result.message}`)
      if (result.evidence && options.verbose) {
        lines.push(`  Evidence: ${result.evidence}`)
      }
    }
  }

  lines.push('')
  lines.push('─'.repeat(50))
  lines.push(
    `pass: ${summary.pass} | warn: ${summary.warn} | fail: ${summary.fail} | skipped: ${summary.skipped} — ${summary.total} probe(s)`,
  )

  const exitCode = exitCodeForSummary(summary)
  let statusMsg = ''
  if (exitCode === 0) {
    statusMsg = '\x1b[32m✓ Harness ready\x1b[0m'
  } else if (exitCode === 1) {
    statusMsg = '\x1b[33m⚠ Harness OK with warnings\x1b[0m'
  } else {
    statusMsg = '\x1b[31m✗ Harness has failures\x1b[0m'
  }
  lines.push(statusMsg)
  lines.push('')

  return lines.join('\n')
}

function formatAsJson(summary: ReturnType<typeof runSelfCheck>): string {
  return JSON.stringify(
    {
      total: summary.total,
      pass: summary.pass,
      warn: summary.warn,
      fail: summary.fail,
      skipped: summary.skipped,
      exitCode: exitCodeForSummary(summary),
      results: summary.results,
    },
    null,
    2,
  )
}

/**
 * Run self-check and return exit code. Can be invoked:
 *   - as CLI command entry point (via register in cli/index.ts)
 *   - programmatically from tester run flow
 */
export async function selfCheckCommand(options: SelfCheckOptions = {}): Promise<number> {
  const summary = runSelfCheck()
  const exitCode = exitCodeForSummary(summary)

  if (options.json) {
    console.log(formatAsJson(summary))
  } else if (!options.quiet) {
    const output = formatAsText(summary, options)
    console.log(output)
  }

  return exitCode
}
