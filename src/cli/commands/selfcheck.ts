/**
 * T-001 CLI handler — `tester selfcheck`.
 * Runs the harness self-test battery and reports results. Exit code:
 *   0 = all pass (or pass + skipped)
 *   1 = warnings only
 *   2 = at least one fail
 */

import { runSelfCheck, exitCodeForSummary } from '../../self-test/harness'

export interface SelfCheckOptions {
  json?: boolean
}

export async function selfCheckCommand(opts: SelfCheckOptions): Promise<void> {
  const summary = runSelfCheck()
  const exitCode = exitCodeForSummary(summary)

  if (opts.json) {
    process.stdout.write(JSON.stringify({ exitCode, ...summary }, null, 2) + '\n')
    process.exit(exitCode)
    return
  }

  process.stdout.write(`Tester harness self-check — ${summary.total} probe(s)\n`)
  process.stdout.write(
    `  ✓ pass: ${summary.pass}    ⚠ warn: ${summary.warn}    ✗ fail: ${summary.fail}    · skipped: ${summary.skipped}\n\n`,
  )

  for (const r of summary.results) {
    const badge =
      r.severity === 'pass' ? '✓' : r.severity === 'fail' ? '✗' : r.severity === 'warn' ? '⚠' : '·'
    process.stdout.write(`  ${badge} ${r.id.padEnd(32)} ${r.title}\n`)
    process.stdout.write(`      ${r.message}\n`)
    if (r.evidence) {
      process.stdout.write(`      evidence: ${r.evidence}\n`)
    }
  }

  process.stdout.write(`\nExit code: ${exitCode}\n`)
  process.exit(exitCode)
}
