/**
 * T-B1 — `tester score` CLI wrapping computeTwgScore.
 *
 * Two input modes:
 *   --project <path>  reads coverage/*.yaml counts + accepts --tests-passing / --tests-total
 *   --from <json>     reads { tests_passing, tests_total, scenarios_covered, scenarios_declared }
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadCoverageForProject, computeStats } from '../../coverage/loader'
import type { CoverageMatrix } from '../../coverage/schema'
import { computeTwgScore, renderTwgScoreAscii } from '../../scoring/twg'

export interface ScoreCliOptions {
  project?: string
  from?: string
  testsPassing?: number
  testsTotal?: number
  target?: number
  json?: boolean
}

function readFromJson(file: string): {
  tests_passing: number
  tests_total: number
  scenarios_covered: number
  scenarios_declared: number
} {
  if (!fs.existsSync(file)) {
    process.stderr.write(`[score] ERROR: --from file missing: ${file}\n`)
    process.exit(2)
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, number>
    for (const k of ['tests_passing', 'tests_total', 'scenarios_covered', 'scenarios_declared']) {
      if (typeof parsed[k] !== 'number') {
        process.stderr.write(`[score] ERROR: --from JSON missing numeric field: ${k}\n`)
        process.exit(2)
      }
    }
    return parsed as {
      tests_passing: number
      tests_total: number
      scenarios_covered: number
      scenarios_declared: number
    }
  } catch (e) {
    process.stderr.write(`[score] ERROR: bad JSON: ${(e as Error).message}\n`)
    process.exit(2)
    throw e // unreachable
  }
}

function readFromProject(projectRoot: string): {
  scenarios_covered: number
  scenarios_declared: number
} {
  const loaded = loadCoverageForProject(projectRoot)
  let covered = 0
  let declared = 0
  for (const { result } of loaded) {
    if ('message' in result && !('feature' in result)) continue
    const stats = computeStats(result as CoverageMatrix)
    covered += stats.covered
    declared += stats.total - stats.skipped
  }
  return { scenarios_covered: covered, scenarios_declared: declared }
}

export async function scoreCommand(opts: ScoreCliOptions): Promise<void> {
  let tp: number
  let tt: number
  let sc: number
  let sd: number

  if (opts.from) {
    const parsed = readFromJson(path.resolve(opts.from))
    tp = parsed.tests_passing
    tt = parsed.tests_total
    sc = parsed.scenarios_covered
    sd = parsed.scenarios_declared
  } else if (opts.project) {
    if (typeof opts.testsPassing !== 'number' || typeof opts.testsTotal !== 'number') {
      process.stderr.write(`[score] ERROR: --project mode requires --tests-passing N --tests-total N\n`)
      process.exit(2)
    }
    const root = path.resolve(opts.project)
    if (!fs.existsSync(root)) {
      process.stderr.write(`[score] ERROR: project path does not exist: ${root}\n`)
      process.exit(2)
    }
    const { scenarios_covered, scenarios_declared } = readFromProject(root)
    tp = opts.testsPassing!
    tt = opts.testsTotal!
    sc = scenarios_covered
    sd = scenarios_declared
  } else {
    process.stderr.write(`[score] ERROR: pass --project <path> + --tests-passing N --tests-total N, or --from <json>\n`)
    process.exit(2)
    return
  }

  const result = computeTwgScore(
    { tests_passing: tp, tests_total: tt, scenarios_covered: sc, scenarios_declared: sd },
    { coverageTarget: opts.target },
  )

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          inputs: { tests_passing: tp, tests_total: tt, scenarios_covered: sc, scenarios_declared: sd },
          ...result,
        },
        null,
        2,
      ) + '\n',
    )
  } else {
    process.stdout.write(renderTwgScoreAscii(result) + '\n')
  }
  if (!result.meets_goal) process.exit(1)
}
