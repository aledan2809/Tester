/**
 * Audit-Suite Module C — `tester scenarios` CLI sub-commands.
 *
 * Usage:
 *   tester scenarios run --suite <dir> --filter "E*,F*" --base-url https://…
 *                        --report report.json --rate-limit-pacing 3s
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Command } from 'commander'
import { runScenarios } from '../../../scenarios/runner'

/** Parse pacing value: "3s" → 3000, "500" → 500, "1.5s" → 1500. */
function parsePacing(val: string): number {
  const s = val.trim()
  if (s.endsWith('s')) return Math.round(parseFloat(s) * 1000)
  return parseInt(s, 10) || 0
}

export function registerScenarios(program: Command): void {
  const scenarios = program.command('scenarios').description('Run E2E scenario suites')

  scenarios
    .command('run')
    .description('Discover and run scenario files in a suite directory')
    .requiredOption('--suite <dir>', 'Path to the scenario suite directory')
    .option(
      '--filter <patterns>',
      'Comma-separated name patterns (e.g. "E*,F*,H1"). Default: all files',
      '',
    )
    .option('--base-url <url>', 'Base URL for HTTP requests inside scenarios')
    .option('--report <file>', 'Write JSON run report to this file')
    .option(
      '--rate-limit-pacing <value>',
      'Delay between scenarios, e.g. "3s" or "3000" (ms). Default: 0',
      '0',
    )
    .action(async (opts: Record<string, string>) => {
      const filters = opts.filter
        ? opts.filter
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : []
      const pacingMs = parsePacing(opts.rateLimitPacing ?? '0')

      const report = await runScenarios({
        suiteDir: path.resolve(opts.suite),
        filters,
        pacingMs,
        baseUrl: opts.baseUrl,
      })

      const summary = `${report.pass} PASS / ${report.fail} FAIL / ${report.skip} SKIP of ${report.total} scenarios`
      console.log(summary)

      if (opts.report) {
        const reportPath = path.resolve(opts.report)
        fs.mkdirSync(path.dirname(reportPath), { recursive: true })
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
        console.log(`Report written to ${reportPath}`)
      }

      process.exit(report.fail > 0 ? 1 : 0)
    })
}
