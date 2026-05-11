/**
 * Audit-Suite Module D — `tester audit-suite` CLI command.
 *
 * Usage:
 *   tester audit-suite run --suite <dir> --base-url https://…
 *                          [--filter "E*,H1"] [--fixtures-dir ./tmp/fixtures]
 *                          [--project-dir .] [--report report.json]
 *                          [--rate-limit-pacing 3s] [--dry-run]
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Command } from 'commander'
import { runAuditSuite } from '../../../audit-suite/orchestrator'
import { runProvision } from '../../../provision/engine'
import { runScenarios } from '../../../scenarios/runner'

/** Parse pacing value: "3s" → 3000, "500" → 500, "1.5s" → 1500. */
function parsePacing(val: string): number {
  const s = val.trim()
  if (s.endsWith('s')) return Math.round(parseFloat(s) * 1000)
  return parseInt(s, 10) || 0
}

export function registerAuditSuite(program: Command): void {
  const suite = program.command('audit-suite').description('Orchestrate fixtures → provision → scenarios in one run')

  suite
    .command('run')
    .description('Run the full audit-suite pipeline')
    .requiredOption('--suite <dir>', 'Path to the scenario suite directory')
    .option('--base-url <url>', 'Base URL for HTTP requests inside scenarios')
    .option(
      '--filter <patterns>',
      'Comma-separated name patterns (e.g. "E*,F*,H1"). Default: all files',
      '',
    )
    .option('--fixtures-dir <dir>', 'Generate fixture files into this directory (skipped if omitted)')
    .option('--project-dir <dir>', 'Project root with .tester-provision.json (skipped if omitted)')
    .option('--report <file>', 'Write JSON report to this file')
    .option(
      '--rate-limit-pacing <value>',
      'Delay between scenarios, e.g. "3s" or "3000" (ms). Default: 0',
      '0',
    )
    .option('--dry-run', 'Run provision in dry-run mode (generate SQL, no DB writes)', false)
    .action(async (opts: Record<string, string | boolean>) => {
      const filters = opts.filter
        ? (opts.filter as string)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : []
      const pacingMs = parsePacing((opts.rateLimitPacing as string) ?? '0')

      const report = await runAuditSuite({
        suiteDir: path.resolve(opts.suite as string),
        baseUrl: opts.baseUrl as string | undefined,
        filters,
        pacingMs,
        fixturesDir: opts.fixturesDir as string | undefined,
        projectDir: opts.projectDir as string | undefined,
        reportFile: opts.report as string | undefined,
        dryRun: opts.dryRun as boolean,

        // wire the real phase runners
        fixturesRunner: opts.fixturesDir
          ? async (dir) => {
              // Fixtures phase: ensure the directory exists for scenario use.
              // Individual fixtures are generated separately via `tester fixtures <sub>`.
              fs.mkdirSync(dir, { recursive: true })
              return []
            }
          : undefined,

        provisionRunner: opts.projectDir
          ? async (projectDir, dryRun) => {
              return runProvision({ projectDir, dryRun })
            }
          : undefined,

        scenariosRunner: async (suiteDir, baseUrl, filters, pacingMs) => {
          return runScenarios({ suiteDir, baseUrl, filters, pacingMs })
        },
      })

      const summary = [
        `audit-suite complete — ${report.durationMs}ms`,
        ...report.phases.map((p) => `  [${p.phase}] ${p.status}${p.detail ? ': ' + p.detail : ''}`),
        `  [scenarios] ${report.scenarios.pass} PASS / ${report.scenarios.fail} FAIL / ${report.scenarios.skip} SKIP of ${report.scenarios.total}`,
      ].join('\n')
      console.log(summary)

      if (opts.report) {
        console.log(`Report written to ${path.resolve(opts.report as string)}`)
      }

      process.exit(report.scenarios.fail > 0 ? 1 : 0)
    })
}
