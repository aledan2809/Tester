/**
 * T-C1 — `tester scope-check` + T-C2 `tester check-test-coupling` CLI.
 */

import * as path from 'node:path'
import { checkScope } from '../../scope-check/guard'
import { checkCoupling } from '../../scope-check/coupling'

export interface ScopeCheckCliOptions {
  project?: string
  since?: string
  task?: string
  fileThreshold?: number
  lineThreshold?: number
  json?: boolean
}

export async function scopeCheckCommand(opts: ScopeCheckCliOptions): Promise<void> {
  if (!opts.since) {
    process.stderr.write(`[scope-check] ERROR: --since <sha> required\n`)
    process.exit(2)
  }
  const repoPath = opts.project ? path.resolve(opts.project) : process.cwd()
  const r = checkScope({
    repoPath,
    since: opts.since!,
    taskDescription: opts.task,
    fileThreshold: opts.fileThreshold,
    lineThreshold: opts.lineThreshold,
  })
  if (opts.json) {
    process.stdout.write(JSON.stringify(r, null, 2) + '\n')
  } else {
    process.stdout.write(`Repo:        ${repoPath}\n`)
    process.stdout.write(`Since:       ${opts.since}\n`)
    process.stdout.write(`Summary:     ${r.diffSummary || '(no changes)'}\n`)
    process.stdout.write(`Files:       ${r.filesChanged} (threshold ${r.fileThreshold})\n`)
    process.stdout.write(`Lines +/-:   ${r.linesAdded} / ${r.linesDeleted} (threshold ${r.lineThreshold})\n`)
    process.stdout.write(`Allow-wide:  ${r.allowWide}\n`)
    process.stdout.write(
      `Verdict:     ${r.ok ? (r.breached ? `✗ BREACH — ${r.reason}` : '✓ within budget') : `✗ ERROR — ${r.reason}`}\n`,
    )
  }
  if (!r.ok || r.breached) process.exit(1)
}

export interface CouplingCliOptions {
  project?: string
  since?: string
  warnOnly?: boolean
  json?: boolean
}

export async function couplingCommand(opts: CouplingCliOptions): Promise<void> {
  if (!opts.since) {
    process.stderr.write(`[check-test-coupling] ERROR: --since <sha> required\n`)
    process.exit(2)
  }
  const repoPath = opts.project ? path.resolve(opts.project) : process.cwd()
  const r = checkCoupling({
    repoPath,
    since: opts.since!,
    warnOnly: opts.warnOnly,
  })
  if (opts.json) {
    process.stdout.write(JSON.stringify(r, null, 2) + '\n')
  } else {
    process.stdout.write(`Source changes:   ${r.sourceChanges.length}\n`)
    process.stdout.write(`Test changes:     ${r.testChanges.length}\n`)
    process.stdout.write(`Override?:        ${r.override ? 'yes (Test-Coverage: existing trailer)' : 'no'}\n`)
    process.stdout.write(
      `Verdict:          ${r.ok ? (r.passed ? '✓ coupled' : `✗ ${r.reason}`) : `✗ ERROR — ${r.reason}`}\n`,
    )
    if (!r.passed && r.unmatchedSources.length > 0) {
      process.stdout.write(`Unmatched sources:\n`)
      for (const s of r.unmatchedSources.slice(0, 10)) process.stdout.write(`  - ${s}\n`)
    }
  }
  if (!r.ok || !r.passed) process.exit(1)
}
