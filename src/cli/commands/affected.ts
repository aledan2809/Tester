/**
 * T-C4 — `tester affected` CLI.
 *
 * Given a tag list, print the test files that opt in. TWG orchestrator /
 * ABIP phase wiring passes the subset to vitest / jest so one phase runs
 * only its relevant tests.
 */

import * as path from 'node:path'
import { findAffectedFiles } from '../../affected/mapper'

export interface AffectedCliOptions {
  project?: string
  dir?: string
  tags?: string
  includeUntagged?: boolean
  json?: boolean
}

export async function affectedCommand(opts: AffectedCliOptions): Promise<void> {
  if (!opts.tags) {
    process.stderr.write(`[affected] ERROR: --tags <csv> is required\n`)
    process.exit(2)
  }
  const project = opts.project ? path.resolve(opts.project) : process.cwd()
  const tags = opts.tags!.split(',').map((s) => s.trim()).filter(Boolean)
  const r = findAffectedFiles(project, {
    tags,
    dir: opts.dir,
    includeUntagged: !!opts.includeUntagged,
  })

  if (opts.json) {
    process.stdout.write(JSON.stringify(r, null, 2) + '\n')
    return
  }

  process.stdout.write(`Tags:          ${r.tags.join(', ') || '(none)'}\n`)
  process.stdout.write(`Scanned:       ${r.total_files} test files\n`)
  process.stdout.write(`Matched:       ${r.matched.length} file(s)\n`)
  process.stdout.write(`Untagged:      ${r.skipped_untagged.length} (${opts.includeUntagged ? 'included' : 'skipped'})\n\n`)
  for (const m of r.matched) {
    process.stdout.write(`  ${m.file}  [${m.tags.join(',') || 'untagged'}]\n`)
  }
}
