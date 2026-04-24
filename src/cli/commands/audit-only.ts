/**
 * `tester audit-only` CLI command — NO-TOUCH CRITIC read-only audit mode.
 *
 * Minimal stub reconstructed 2026-04-24 (see validator/audit-only.ts note).
 * Activates the auditValidator singleton before any subsequent tester work in
 * the same process; designed to be composed with existing tester flows.
 *
 * Full implementation (ML2 Wave 2 static analyzer, AUDIT_GAPS generation) is
 * kept intentionally minimal here — the original command delegated to plugins
 * that live in `Master/mesh/qa/plugins/*`. Re-invoke via Master's e2e-audit
 * runner for the full feature set. This stub only enables read-only mode and
 * surfaces violations.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { auditValidator } from '../../validator/audit-only'

export interface AuditOnlyOptions {
  output?: string
  date?: string
  json?: boolean
}

export async function auditOnlyCommand(opts: AuditOnlyOptions): Promise<void> {
  auditValidator.enable()
  const date = opts.date || new Date().toISOString().split('T')[0]
  const outputDir = opts.output ? path.resolve(opts.output) : path.resolve('./Reports')

  process.stdout.write(`[audit-only] Read-only mode enabled. Date: ${date}. Output: ${outputDir}\n`)
  process.stdout.write(`[audit-only] Stub implementation — full static analysis lives in Master/mesh/qa/plugins.\n`)
  process.stdout.write(`[audit-only] For complete E2E audit, run: node mesh/tools/e2e-audit-runner.mjs --project <NAME> --path <PATH>\n`)

  // Ensure output dir exists; no files written by the stub itself — consumers
  // call into the validator during their operations and collect violations.
  try {
    fs.mkdirSync(outputDir, { recursive: true })
  } catch {
    /* best-effort */
  }

  const violations = auditValidator.violations()

  if (opts.json) {
    process.stdout.write(
      JSON.stringify({ enabled: true, date, outputDir, violations_count: violations.length, violations }, null, 2) +
        '\n',
    )
  } else {
    process.stdout.write(`[audit-only] violations recorded: ${violations.length}\n`)
  }

  if (violations.length > 0) {
    process.exit(1)
  }
}
