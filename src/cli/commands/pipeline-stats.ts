/**
 * T-C5 — `tester pipeline-stats` CLI.
 *
 * Reads Master mesh state file + archive, runs analyzePipelines, prints
 * markdown report (or JSON). Discovery logic mirrors zombie-scan.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  analyzePipelines,
  renderStatsMarkdown,
  type PipelineRecord,
} from '../../pipeline-stats/analyzer'

export interface PipelineStatsOptions {
  masterPath?: string
  since?: string
  until?: string
  topN?: number
  markdown?: boolean
  json?: boolean
  includeArchive?: boolean
}

function findMasterStateDir(override?: string): string | null {
  if (override) {
    const resolved = path.resolve(override)
    const stateDir = path.join(resolved, 'mesh', 'state')
    if (fs.existsSync(stateDir)) return stateDir
    return fs.existsSync(resolved) && fs.statSync(resolved).isDirectory() ? resolved : null
  }
  if (process.env.MASTER_ROOT) {
    const candidate = path.join(process.env.MASTER_ROOT, 'mesh', 'state')
    if (fs.existsSync(candidate)) return candidate
  }
  let cur = process.cwd()
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(cur, 'mesh', 'state')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  const homeGuess = path.join(os.homedir(), 'Projects', 'Master', 'mesh', 'state')
  if (fs.existsSync(homeGuess)) return homeGuess
  return null
}

function loadPipelinesFrom(stateDir: string, includeArchive: boolean): PipelineRecord[] {
  const out: PipelineRecord[] = []
  const main = path.join(stateDir, 'pipelines.json')
  if (fs.existsSync(main)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(main, 'utf8')) as { pipelines?: PipelineRecord[] }
      if (parsed.pipelines) out.push(...parsed.pipelines)
    } catch {
      // ignore corrupt
    }
  }
  if (includeArchive) {
    const archive = path.join(stateDir, 'pipelines_archive.json')
    if (fs.existsSync(archive)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(archive, 'utf8')) as { pipelines?: PipelineRecord[] }
        if (parsed.pipelines) out.push(...parsed.pipelines)
      } catch {
        // ignore corrupt
      }
    }
  }
  return out
}

export async function pipelineStatsCommand(opts: PipelineStatsOptions): Promise<void> {
  const stateDir = findMasterStateDir(opts.masterPath)
  if (!stateDir) {
    process.stderr.write(
      `[pipeline-stats] ERROR: cannot locate mesh/state. Pass --master-path <Master repo root>.\n`,
    )
    process.exit(2)
  }
  const pipelines = loadPipelinesFrom(stateDir!, opts.includeArchive !== false)
  const report = analyzePipelines(pipelines, {
    since: opts.since,
    until: opts.until,
    topN: opts.topN,
  })

  if (opts.json) {
    process.stdout.write(JSON.stringify({ state_dir: stateDir, ...report }, null, 2) + '\n')
    return
  }
  if (opts.markdown) {
    process.stdout.write(renderStatsMarkdown(report) + '\n')
    return
  }
  process.stdout.write(
    `Pipeline stats (${stateDir}):\n  total=${report.total_pipelines}  failed=${report.failed}  done=${report.completed}  fail%=${(report.fail_rate * 100).toFixed(1)}\n`,
  )
  if (report.avg_context_tokens !== null) {
    process.stdout.write(`  avg context tokens=${report.avg_context_tokens}\n`)
  }
  process.stdout.write(`\nTop phases (failed desc):\n`)
  for (const p of report.phases.slice(0, 10)) {
    process.stdout.write(`  ${p.phase.padEnd(24)} total=${p.total} failed=${p.failed} done=${p.completed} fail%=${(p.fail_rate * 100).toFixed(1)}\n`)
  }
  process.stdout.write(`\nTop signatures:\n`)
  for (const s of report.top_signatures) {
    process.stdout.write(`  [${s.count.toString().padStart(3)}]  ${s.signature}  projects=${s.projects.join(',') || '-'}\n    ${s.exemplar.slice(0, 120)}\n`)
  }
}
