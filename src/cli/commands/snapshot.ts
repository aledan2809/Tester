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
import { loadMaskConfig, masksForRoute } from '../../snapshot/masking'
import { writeHtmlReport } from '../../snapshot/html-report'
import { captureUrlStandalone } from '../../snapshot/capture'

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
  /** URL to capture via Puppeteer when --png is not supplied. */
  url?: string
  /** Optional HTML report output path (for --compare). */
  html?: string
  /** Path to snapshot-masks.yaml; defaults to <project>/coverage/snapshot-masks.yaml when --project points at a dir. */
  maskConfig?: string
  /** Project root for mask-config resolution when the project arg is a bare name. */
  projectRoot?: string
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

  // Capture-from-URL mode: if --url is set and --png is not, launch Puppeteer.
  let pngBuf: Buffer
  if (!opts.png && opts.url) {
    pngBuf = await captureUrlStandalone(opts.url)
  } else {
    const pngPath = requireStr('png', opts.png)
    const full = path.resolve(pngPath)
    if (!fs.existsSync(full)) {
      process.stderr.write(`[snapshot] ERROR: PNG not found: ${full}\n`)
      process.exit(2)
    }
    pngBuf = fs.readFileSync(full)
  }

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
  // Resolve mask config: explicit --mask-config > <project-root>/coverage/snapshot-masks.yaml
  let masks: ReturnType<typeof masksForRoute> = []
  const maskConfigPath = opts.maskConfig
    ? path.resolve(opts.maskConfig)
    : opts.projectRoot
      ? path.join(path.resolve(opts.projectRoot), 'coverage', 'snapshot-masks.yaml')
      : null
  if (maskConfigPath && fs.existsSync(maskConfigPath)) {
    const cfg = opts.projectRoot
      ? loadMaskConfig(path.resolve(opts.projectRoot))
      : null
    // If --mask-config provided explicitly, load that file directly.
    if (opts.maskConfig) {
      try {
        const yamlMod = (await import('js-yaml')) as typeof import('js-yaml')
        const parsed = yamlMod.load(fs.readFileSync(maskConfigPath, 'utf8')) as {
          defaults?: unknown
          routes?: Record<string, unknown>
        }
        if (parsed && typeof parsed === 'object') {
          masks = masksForRoute(parsed as Parameters<typeof masksForRoute>[0], route)
        }
      } catch {
        process.stderr.write(`[snapshot] WARNING: failed to parse ${maskConfigPath}\n`)
      }
    } else if (cfg) {
      masks = masksForRoute(cfg, route)
    }
  }

  const wantHtml = !!opts.html
  const result = await compareRoute(store, project, route, pngBuf, {
    maxDiffPercent: opts.maxDiff ?? 1,
    captureIfMissing: !!opts.captureIfMissing,
    masks,
    returnDiffPng: wantHtml,
  })

  if (wantHtml) {
    const outPath = path.resolve(opts.html!)
    await writeHtmlReport({
      project,
      baselineStore: store,
      results: [result],
      outputPath: outPath,
    })
    if (!opts.json) {
      process.stdout.write(`HTML report: ${outPath}\n`)
    }
  }
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
