/**
 * T-C4 close — `tester run-affected` executor integration.
 *
 * Wires the T-C4 affected-file mapper into an actual test runner
 * invocation. Given a comma-separated tag list + an optional test
 * dir, finds the tagged spec files and spawns the configured runner
 * (vitest by default; --runner jest / playwright also supported)
 * with ONLY those files.
 *
 * Exit code propagates the runner's exit code. When the filter
 * returns zero files, exit 0 with a clear stderr note (no-op is not
 * a failure — caller asked for a subset that doesn't exist).
 */

import { spawn } from 'node:child_process'
import * as path from 'node:path'
import { findAffectedFiles, type AffectedResult } from '../../affected/mapper'

export interface RunAffectedCliOptions {
  project?: string
  dir?: string
  tags?: string
  includeUntagged?: boolean
  runner?: 'vitest' | 'jest' | 'playwright'
  runnerArgs?: string
  dryRun?: boolean
  json?: boolean
}

function runnerCli(runner: 'vitest' | 'jest' | 'playwright'): { cmd: string; baseArgs: string[] } {
  if (runner === 'jest') return { cmd: 'npx', baseArgs: ['jest'] }
  if (runner === 'playwright') return { cmd: 'npx', baseArgs: ['playwright', 'test'] }
  return { cmd: 'npx', baseArgs: ['vitest', 'run'] }
}

export function resolveAffected(opts: RunAffectedCliOptions): AffectedResult {
  if (!opts.tags) {
    process.stderr.write(`[run-affected] ERROR: --tags <csv> is required\n`)
    process.exit(2)
  }
  const project = opts.project ? path.resolve(opts.project) : process.cwd()
  const tags = opts.tags!.split(',').map((s) => s.trim()).filter(Boolean)
  return findAffectedFiles(project, {
    tags,
    dir: opts.dir,
    includeUntagged: !!opts.includeUntagged,
  })
}

export async function runAffectedCommand(opts: RunAffectedCliOptions): Promise<void> {
  const result = resolveAffected(opts)
  const runner = opts.runner || 'vitest'
  const { cmd, baseArgs } = runnerCli(runner)
  const files = result.matched.map((m) => m.file)
  const extra = opts.runnerArgs ? opts.runnerArgs.split(' ').filter(Boolean) : []
  const args = [...baseArgs, ...files, ...extra]

  if (opts.json || opts.dryRun) {
    const payload = {
      tags: result.tags,
      total_files: result.total_files,
      matched_files: files,
      skipped_untagged: result.skipped_untagged.length,
      runner,
      command: `${cmd} ${args.join(' ')}`,
    }
    if (opts.json) {
      process.stdout.write(JSON.stringify(payload, null, 2) + '\n')
    } else {
      process.stdout.write(
        `${runner} with ${files.length} file(s) [tags: ${result.tags.join(',')}]\n\n`,
      )
      for (const f of files) process.stdout.write(`  ${f}\n`)
      process.stdout.write(`\nDRY RUN — would spawn: ${cmd} ${args.join(' ')}\n`)
    }
    if (opts.dryRun) return
    if (opts.json) return
  }

  if (files.length === 0) {
    process.stderr.write(
      `[run-affected] No test files matched tags "${result.tags.join(',')}" — exit 0 (no-op).\n`,
    )
    return
  }

  process.stdout.write(`Spawning ${runner} for ${files.length} affected file(s)...\n`)
  const child = spawn(cmd, args, { stdio: 'inherit' })
  await new Promise<void>((resolve) => {
    child.on('close', (code) => {
      if (code && code !== 0) process.exit(code)
      resolve()
    })
    child.on('error', (e) => {
      process.stderr.write(`[run-affected] spawn failed: ${e.message}\n`)
      process.exit(1)
    })
  })
}
