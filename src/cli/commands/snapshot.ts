/**
 * T-008 — `tester snapshot` CLI.
 *
 * Subactions (one of):
 *   --baseline      capture baseline for --png against --route in --project
 *   --compare       pixel-diff --png against the stored baseline
 *   --approve       move current image into baseline slot (fix drift)
 *   --list          list recorded routes for the project
 *
 * This CLI is a surgical MVP. Puppeteer-driven capture across sidebar/route
 * walks is intentionally deferred to a follow-up (journey-audit already
 * owns the navigation model; it will consume this store once T-008 cloud
 * adapter lands).
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { LocalFSStore, defaultBaselineDir } from '../../snapshot/store'
import { compareRoute } from '../../snapshot/compare'

export interface SnapshotOptions {
  project?: string
  route?: string
  png?: string
  baselineDir?: string
  baseline?: boolean
  compare?: boolean
  approve?: boolean
  list?: boolean
  maxDiff?: number
  captureIfMissing?: boolean
  json?: boolean
}

function requireStr(name: string, val: string | undefined): string {
  if (!val) {
    process.stderr.write(`[snapshot] ERROR: --${name} is required for this subaction\n`)
    process.exit(2)
  }
  return val!
}

export async function snapshotCommand(opts: SnapshotOptions): Promise<void> {
  const selected = [opts.baseline, opts.compare, opts.approve, opts.list].filter(Boolean).length
  if (selected !== 1) {
    process.stderr.write(
      `[snapshot] ERROR: pick exactly one of --baseline / --compare / --approve / --list\n`,
    )
    process.exit(2)
  }

  const baseDir = opts.baselineDir ? path.resolve(opts.baselineDir) : defaultBaselineDir()
  const store = new LocalFSStore(baseDir)
  const project = requireStr('project', opts.project)

  if (opts.list) {
    const routes = await store.list(project)
    if (opts.json) {
      process.stdout.write(JSON.stringify({ project, baseDir, routes }, null, 2) + '\n')
      return
    }
    process.stdout.write(`Baselines for "${project}" (${routes.length}):\n`)
    for (const r of routes) process.stdout.write(`  - ${r}\n`)
    return
  }

  const route = requireStr('route', opts.route)
  const pngPath = requireStr('png', opts.png)
  const full = path.resolve(pngPath)
  if (!fs.existsSync(full)) {
    process.stderr.write(`[snapshot] ERROR: PNG not found: ${full}\n`)
    process.exit(2)
  }
  const pngBuf = fs.readFileSync(full)

  if (opts.baseline || opts.approve) {
    const meta = await store.put(project, route, pngBuf)
    if (opts.json) {
      process.stdout.write(
        JSON.stringify(
          {
            project,
            route,
            action: opts.approve ? 'approve' : 'baseline',
            stored_at: store.pathFor(project, route),
            meta,
          },
          null,
          2,
        ) + '\n',
      )
      return
    }
    process.stdout.write(
      `${opts.approve ? 'Approved' : 'Captured'} baseline for "${route}" in project "${project}":\n  → ${store.pathFor(project, route)}\n`,
    )
    return
  }

  // --compare
  const result = await compareRoute(store, project, route, pngBuf, {
    maxDiffPercent: opts.maxDiff ?? 1,
    captureIfMissing: !!opts.captureIfMissing,
  })
  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  } else {
    process.stdout.write(`Project:  ${project}\nRoute:    ${route}\nBaseline: ${result.baselinePath}\n`)
    if (result.noBaseline) {
      process.stdout.write(
        `\n⚠ No baseline captured yet. Use \`tester snapshot --baseline --project ${project} --route "${route}" --png <path>\` to seed it.\n`,
      )
      process.exit(1)
    }
    if (result.error) {
      process.stdout.write(`\n✗ Compare failed: ${result.error}\n`)
      process.exit(2)
    }
    const badge = result.passed ? '✓ PASS' : '✗ FAIL'
    process.stdout.write(
      `\n${badge} diff=${result.diffPercent?.toFixed(2)}%  (threshold ${opts.maxDiff ?? 1}%)\n`,
    )
  }
  if (!result.passed) process.exit(1)
}
