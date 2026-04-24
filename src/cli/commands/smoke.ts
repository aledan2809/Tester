/**
 * T-C3 — `tester smoke <url>` CLI.
 */

import { runSmoke, formatSmokeMarkdown } from '../../smoke/runner'

export interface SmokeCliOptions {
  healthPaths?: string
  regressionsDir?: string
  timeoutMs?: number
  markdown?: boolean
  json?: boolean
}

export async function smokeCommand(url: string, opts: SmokeCliOptions): Promise<void> {
  if (!url) {
    process.stderr.write(`[smoke] ERROR: URL argument required\n`)
    process.exit(2)
  }
  const healthPaths = opts.healthPaths
    ? opts.healthPaths.split(',').map((s) => s.trim()).filter(Boolean)
    : []
  const r = await runSmoke({
    url,
    healthPaths,
    regressionsDir: opts.regressionsDir,
    timeoutMs: opts.timeoutMs,
  })
  if (opts.json) {
    process.stdout.write(JSON.stringify(r, null, 2) + '\n')
  } else if (opts.markdown) {
    process.stdout.write(formatSmokeMarkdown(r) + '\n')
  } else {
    process.stdout.write(`Smoke:  ${r.ok ? '✓ PASS' : '✗ FAIL'}\n`)
    for (const c of r.checks) {
      process.stdout.write(`  ${c.ok ? '✓' : '✗'}  ${c.url}  status=${c.status}  ${c.ms}ms\n`)
    }
    if (r.regressions) {
      process.stdout.write(`\nRegression suite: ${r.regressions.ok ? 'pass' : 'fail'}\n`)
      process.stdout.write(r.regressions.output + '\n')
    }
    for (const f of r.failures) process.stderr.write(`  ✗ ${f}\n`)
  }
  if (!r.ok) process.exit(1)
}
