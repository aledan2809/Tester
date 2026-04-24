/**
 * T-D4 — `tester inventory` CLI.
 *
 * Inputs (pick one):
 *   --roots <csv>                explicit list of project root paths
 *   --parent-dir <path>          scan children of this dir as project roots
 *   --config <path>              JSON { "project_roots": [...] }
 *   TESTER_PROJECT_ROOTS env     colon-separated fallback
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  buildInventory,
  discoverProjectRoots,
  renderInventoryMarkdown,
} from '../../inventory/aggregator'

export interface InventoryCliOptions {
  roots?: string
  parentDir?: string
  config?: string
  json?: boolean
  markdown?: boolean
}

function resolveRoots(opts: InventoryCliOptions): string[] {
  if (opts.roots) {
    return opts.roots.split(',').map((s) => path.resolve(s.trim())).filter(Boolean)
  }
  if (opts.config) {
    const file = path.resolve(opts.config)
    if (!fs.existsSync(file)) {
      process.stderr.write(`[inventory] ERROR: --config file missing: ${file}\n`)
      process.exit(2)
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { project_roots?: string[] }
      return (parsed.project_roots || []).map((p) => path.resolve(p))
    } catch (e) {
      process.stderr.write(`[inventory] ERROR: bad config JSON: ${(e as Error).message}\n`)
      process.exit(2)
    }
  }
  if (opts.parentDir) {
    return discoverProjectRoots(path.resolve(opts.parentDir))
  }
  if (process.env.TESTER_PROJECT_ROOTS) {
    return process.env.TESTER_PROJECT_ROOTS.split(':').map((s) => path.resolve(s.trim())).filter(Boolean)
  }
  return []
}

export async function inventoryCommand(opts: InventoryCliOptions): Promise<void> {
  const roots = resolveRoots(opts)
  if (roots.length === 0) {
    process.stderr.write(
      `[inventory] ERROR: no project roots. Pass --roots a,b,c or --parent-dir <path> or --config <json> or set TESTER_PROJECT_ROOTS env.\n`,
    )
    process.exit(2)
  }
  const report = buildInventory(roots)

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }
  if (opts.markdown) {
    process.stdout.write(renderInventoryMarkdown(report) + '\n')
    return
  }

  process.stdout.write(
    `Projects: ${report.aggregate.project_count}  features=${report.aggregate.features_done}/${report.aggregate.features_total}  scenarios=${report.aggregate.scenarios_covered}/${report.aggregate.scenarios_total} (${(report.aggregate.coverage_ratio * 100).toFixed(1)}%)  crit=${report.aggregate.critical_missing}  high=${report.aggregate.high_missing}  gaps=${report.aggregate.audit_gaps_open}\n\n`,
  )
  for (const p of report.projects) {
    const denom = p.scenarios.total - p.scenarios.skipped
    process.stdout.write(
      `  ${p.project.padEnd(28)} features=${p.features.done}/${p.features.total}  scen=${p.scenarios.covered}/${denom}  cov=${(p.scenarios.coverage_ratio * 100).toFixed(1)}%  crit=${p.scenarios.critical_missing}  gaps=${p.audit_gaps_open}  a11y=${p.has_a11y_baseline ? 'Y' : '·'}  vis=${p.has_visual_baselines ? 'Y' : '·'}\n`,
    )
  }
}
