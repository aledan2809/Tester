/**
 * T-D1 — `tester done|undone|status` CLI.
 */

import * as path from 'node:path'
import { evaluateDone, markDone, markUndone, readDoneStatus } from '../../done/gate'

export interface DoneCliOptions {
  project?: string
  feature?: string
  testsPassing?: number
  testsTotal?: number
  commit?: string
  failUnder?: number
  skipA11y?: boolean
  skipVisual?: boolean
  json?: boolean
}

function resolveProject(p?: string): string {
  return p ? path.resolve(p) : process.cwd()
}

export async function doneCommand(feature: string, opts: DoneCliOptions): Promise<void> {
  if (!feature) {
    process.stderr.write(`[done] ERROR: feature slug required\n`)
    process.exit(2)
  }
  const projectRoot = resolveProject(opts.project)
  const report = evaluateDone({
    feature,
    projectRoot,
    testsPassing: opts.testsPassing,
    testsTotal: opts.testsTotal,
    commit: opts.commit,
    failUnder: opts.failUnder,
    skipA11y: opts.skipA11y,
    skipVisual: opts.skipVisual,
  })

  if (!report.passed) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ action: 'done', feature, ...report }, null, 2) + '\n')
    } else {
      process.stdout.write(`✗ ${feature} NOT done\n`)
      for (const r of report.reasons) process.stdout.write(`  - ${r}\n`)
    }
    process.exit(1)
  }

  const update = markDone(projectRoot, feature, opts.commit)
  if (opts.json) {
    process.stdout.write(
      JSON.stringify({ action: 'done', feature, report, update }, null, 2) + '\n',
    )
  } else {
    process.stdout.write(`✓ ${feature} DONE\n  file: ${update.file}\n  at:   ${update.entry.done_at}\n`)
    if (update.entry.done_commit) process.stdout.write(`  commit: ${update.entry.done_commit}\n`)
  }
}

export async function undoneCommand(feature: string, opts: DoneCliOptions): Promise<void> {
  if (!feature) {
    process.stderr.write(`[done] ERROR: feature slug required\n`)
    process.exit(2)
  }
  const projectRoot = resolveProject(opts.project)
  const r = markUndone(projectRoot, feature)
  if (opts.json) {
    process.stdout.write(JSON.stringify({ action: 'undone', feature, ...r }, null, 2) + '\n')
    return
  }
  if (!r.updated) {
    process.stdout.write(`No features.yaml entry for "${feature}" — nothing to reopen.\n`)
    process.exit(1)
  }
  process.stdout.write(`Reopened "${feature}"\n  file: ${r.file}\n`)
}

export async function statusCommand(opts: DoneCliOptions): Promise<void> {
  const projectRoot = resolveProject(opts.project)
  const entries = readDoneStatus(projectRoot)
  if (opts.json) {
    process.stdout.write(JSON.stringify({ features: entries }, null, 2) + '\n')
    return
  }
  process.stdout.write(`Features: ${entries.length}\n`)
  for (const e of entries) {
    const status = (e.status as string) || 'open'
    const doneAt = (e.done_at as string) || ''
    const badge = status === 'done' ? '✓ done' : '· open'
    process.stdout.write(`  ${badge}  ${String(e.feature).padEnd(30)}  ${doneAt}\n`)
  }
}
