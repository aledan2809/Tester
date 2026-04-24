/**
 * T-B2 — `tester regression` CLI.
 *
 * Actions:
 *   add --slug <x> --title "<text>" [--lesson-id L-F2] [--fix-commit <sha>] [--expire-at <iso>]
 *   list
 *   expire <slug>
 */

import {
  addRegression,
  listRegressions,
  expireRegression,
  isExpired,
} from '../../regression/store'

export interface RegressionCliOptions {
  project?: string
  slug?: string
  title?: string
  lessonId?: string
  fixCommit?: string
  expireAt?: string
  originalAssertion?: string
  sourceScenario?: string
  json?: boolean
}

function project(opts: RegressionCliOptions): string {
  return opts.project || process.cwd()
}

export async function regressionAddCmd(opts: RegressionCliOptions): Promise<void> {
  if (!opts.slug || !opts.title) {
    process.stderr.write(`[regression] ERROR: --slug and --title are required for add\n`)
    process.exit(2)
  }
  try {
    const r = addRegression(project(opts), {
      slug: opts.slug!,
      title: opts.title!,
      lessonId: opts.lessonId,
      fixCommit: opts.fixCommit,
      expireAt: opts.expireAt,
      originalAssertion: opts.originalAssertion,
      sourceScenario: opts.sourceScenario,
    })
    if (opts.json) {
      process.stdout.write(JSON.stringify(r, null, 2) + '\n')
      return
    }
    process.stdout.write(
      `${r.alreadyExists ? 'Updated' : 'Added'} regression "${r.entry.slug}"\n  spec:  ${r.specFile}\n  index: ${r.indexFile}\n`,
    )
  } catch (e) {
    process.stderr.write(`[regression] ERROR: ${(e as Error).message}\n`)
    process.exit(2)
  }
}

export async function regressionListCmd(opts: RegressionCliOptions): Promise<void> {
  const entries = listRegressions(project(opts))
  if (opts.json) {
    process.stdout.write(JSON.stringify({ count: entries.length, entries }, null, 2) + '\n')
    return
  }
  process.stdout.write(`Regressions: ${entries.length}\n`)
  for (const e of entries) {
    const expired = isExpired(e)
    const tag = expired ? '(expired)' : ''
    process.stdout.write(
      `  ${e.slug.padEnd(40)} ${e.capturedAt.slice(0, 10)}  ${e.lessonId || '-'}  ${tag}\n    ${e.title}\n`,
    )
  }
}

export async function regressionExpireCmd(slug: string, opts: RegressionCliOptions): Promise<void> {
  if (!slug) {
    process.stderr.write(`[regression] ERROR: slug required for expire\n`)
    process.exit(2)
  }
  const r = expireRegression(project(opts), slug)
  if (opts.json) {
    process.stdout.write(JSON.stringify(r, null, 2) + '\n')
    return
  }
  if (!r.removedSpec) {
    process.stdout.write(`No spec file found for "${slug}"; index updated (${r.updatedIndex}).\n`)
    return
  }
  process.stdout.write(`Expired "${slug}":\n  removed: ${r.removedSpec}\n  index:   ${r.updatedIndex}\n`)
}
