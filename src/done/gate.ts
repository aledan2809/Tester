/**
 * T-D1 — `tester done` composite gate.
 *
 * Enforces that a feature is actually "done" by composing existing checks:
 *   - Coverage ratio >= --fail-under (default 0.9) + zero critical-missing
 *   - Test pass_rate = 100% (caller provides --tests-passing / --tests-total;
 *     Tester doesn't spawn vitest — pipe results in from the caller's runner)
 *   - A11y baseline present (coverage/a11y-baseline.json) unless --skip-a11y
 *   - Snapshot baseline present for at least one route under the project
 *     (defense-in-depth) unless --skip-visual
 *
 * On success: upserts `coverage/features.yaml` entry with status=done +
 * done_at + done_commit so `tester inventory` / untested / score can
 * reflect the sealed state.
 *
 * `undone` reverts status=done → open.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import * as yaml from 'js-yaml'
import { loadCoverageMatrix, computeStats } from '../coverage/loader'
import type { CoverageMatrix } from '../coverage/schema'
import { computeTwgScore } from '../scoring/twg'
import { defaultBaselinePath as a11yBaselinePath } from '../a11y/baseline'
import { LocalFSStore, defaultBaselineDir as snapshotDefaultBaselineDir } from '../snapshot/store'
import { loadFeaturesIndex } from '../init/scaffolder'

export interface DoneCheckResult {
  passed: boolean
  coverage_ratio: number
  coverage_pass: boolean
  critical_missing: number
  pass_rate: number
  tests_pass: boolean
  a11y_baseline_present: boolean
  visual_baseline_present: boolean
  reasons: string[]
}

export interface DoneOptions {
  feature: string
  projectRoot: string
  testsPassing?: number
  testsTotal?: number
  commit?: string
  failUnder?: number
  skipA11y?: boolean
  skipVisual?: boolean
  /** T-D1 close — when true, spawn vitest on tests/<feature>/ and read
   *  tests_passing / tests_total from its JSON reporter. Supersedes
   *  explicit --tests-passing / --tests-total when set. */
  runTests?: boolean
  /** Override runner; vitest today, jest/playwright planned. */
  runner?: 'vitest' | 'jest' | 'playwright'
  /** Extra args forwarded to the runner (pass-through). */
  runnerArgs?: string[]
}

interface RunnerResult {
  tests_passing: number
  tests_total: number
  ok: boolean
  error?: string
  exitCode?: number
}

/**
 * T-D1 close — spawn vitest (or configured runner) on the feature's
 * spec dir, parse the JSON reporter output, return pass/total counts.
 * Exported so other gate-like commands can reuse. On failure to spawn
 * or parse, returns ok:false with a descriptive error; caller treats
 * this as the gate failing on the tests_pass predicate.
 */
export function spawnRunner(
  projectRoot: string,
  feature: string,
  runner: 'vitest' | 'jest' | 'playwright' = 'vitest',
  extraArgs: string[] = [],
): RunnerResult {
  const testsDir = path.join(projectRoot, 'tests', feature)
  if (!fs.existsSync(testsDir)) {
    return {
      tests_passing: 0,
      tests_total: 0,
      ok: false,
      error: `tests/${feature}/ does not exist — run \`tester init ${feature}\` first`,
    }
  }
  if (runner === 'vitest') {
    const args = ['vitest', 'run', testsDir, '--reporter=json', ...extraArgs]
    const res = spawnSync('npx', args, { encoding: 'utf8', cwd: projectRoot })
    // vitest writes JSON to stdout when --reporter=json; also writes progress
    // lines when a TTY is attached. We take the first valid JSON object from
    // stdout.
    const text = res.stdout || ''
    const match = text.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/)
    if (!match) {
      return {
        tests_passing: 0,
        tests_total: 0,
        ok: false,
        error: `vitest did not emit parseable JSON (exit ${res.status}). stderr head: ${(res.stderr || '').slice(0, 300)}`,
        exitCode: res.status ?? undefined,
      }
    }
    try {
      const parsed = JSON.parse(match[0]) as {
        numTotalTests?: number
        numPassedTests?: number
      }
      const total = parsed.numTotalTests ?? 0
      const passed = parsed.numPassedTests ?? 0
      return {
        tests_passing: passed,
        tests_total: total,
        ok: res.status === 0,
        exitCode: res.status ?? undefined,
      }
    } catch (e) {
      return {
        tests_passing: 0,
        tests_total: 0,
        ok: false,
        error: `vitest JSON parse error: ${(e as Error).message}`,
        exitCode: res.status ?? undefined,
      }
    }
  }
  if (runner === 'jest') {
    const args = ['jest', testsDir, '--json', ...extraArgs]
    const res = spawnSync('npx', args, { encoding: 'utf8', cwd: projectRoot })
    const text = res.stdout || ''
    const match = text.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/)
    if (!match) {
      return {
        tests_passing: 0,
        tests_total: 0,
        ok: false,
        error: `jest did not emit parseable JSON (exit ${res.status})`,
        exitCode: res.status ?? undefined,
      }
    }
    try {
      const parsed = JSON.parse(match[0]) as {
        numTotalTests?: number
        numPassedTests?: number
      }
      return {
        tests_passing: parsed.numPassedTests ?? 0,
        tests_total: parsed.numTotalTests ?? 0,
        ok: res.status === 0,
        exitCode: res.status ?? undefined,
      }
    } catch (e) {
      return {
        tests_passing: 0,
        tests_total: 0,
        ok: false,
        error: `jest JSON parse error: ${(e as Error).message}`,
      }
    }
  }
  // playwright — stdout has `--reporter=json` support but the schema differs;
  // we do the best-effort parse and fall back to exit-code-only counts.
  const args = ['playwright', 'test', testsDir, '--reporter=json', ...extraArgs]
  const res = spawnSync('npx', args, { encoding: 'utf8', cwd: projectRoot })
  const text = res.stdout || ''
  const match = text.match(/\{[\s\S]*"stats"[\s\S]*\}/)
  if (!match) {
    return {
      tests_passing: 0,
      tests_total: 0,
      ok: res.status === 0,
      error: res.status === 0 ? undefined : `playwright exit ${res.status}`,
      exitCode: res.status ?? undefined,
    }
  }
  try {
    const parsed = JSON.parse(match[0]) as {
      stats?: { expected?: number; unexpected?: number; skipped?: number; passes?: number }
    }
    const passed = parsed.stats?.expected ?? parsed.stats?.passes ?? 0
    const failed = parsed.stats?.unexpected ?? 0
    return {
      tests_passing: passed,
      tests_total: passed + failed,
      ok: res.status === 0,
      exitCode: res.status ?? undefined,
    }
  } catch (e) {
    return {
      tests_passing: 0,
      tests_total: 0,
      ok: false,
      error: `playwright JSON parse error: ${(e as Error).message}`,
    }
  }
}

export function evaluateDone(opts: DoneOptions): DoneCheckResult {
  const failUnder = opts.failUnder ?? 0.9
  const reasons: string[] = []

  // T-D1 close — if runTests flag is set, invoke the runner + override
  // explicit --tests-passing / --tests-total that may have come from CLI.
  let testsPassing = opts.testsPassing
  let testsTotal = opts.testsTotal
  if (opts.runTests) {
    const runnerRes = spawnRunner(
      opts.projectRoot,
      opts.feature,
      opts.runner || 'vitest',
      opts.runnerArgs,
    )
    if (runnerRes.error) reasons.push(`runner: ${runnerRes.error}`)
    testsPassing = runnerRes.tests_passing
    testsTotal = runnerRes.tests_total
    if (!runnerRes.ok && (!reasons.some((r) => r.startsWith('runner:')))) {
      reasons.push(`runner exit code ${runnerRes.exitCode ?? '?'}`)
    }
  }

  // Coverage
  const coverageFile = path.join(opts.projectRoot, 'coverage', `${opts.feature}.yaml`)
  let coverageRatio = 0
  let criticalMissing = 0
  if (!fs.existsSync(coverageFile)) {
    reasons.push(`coverage/${opts.feature}.yaml missing — run \`tester init ${opts.feature}\` first`)
  } else {
    const parsed = loadCoverageMatrix(coverageFile)
    if ('message' in parsed && !('feature' in parsed)) {
      reasons.push(`coverage load error: ${parsed.message}`)
    } else {
      const stats = computeStats(parsed as CoverageMatrix)
      coverageRatio = stats.coverage_ratio
      criticalMissing = stats.critical_missing
      if (coverageRatio < failUnder) {
        reasons.push(`coverage_ratio=${(coverageRatio * 100).toFixed(1)}% < --fail-under ${(failUnder * 100).toFixed(0)}%`)
      }
      if (criticalMissing > 0) {
        reasons.push(`${criticalMissing} critical-severity scenarios still missing`)
      }
    }
  }

  // Tests pass rate
  let passRate = 0
  let testsPass = false
  if (typeof testsPassing === 'number' && typeof testsTotal === 'number') {
    const { pass_rate } = computeTwgScore({
      tests_passing: testsPassing,
      tests_total: testsTotal,
      scenarios_covered: 0,
      scenarios_declared: 0,
    })
    passRate = pass_rate
    testsPass = passRate === 1
    if (!testsPass) {
      reasons.push(`tests pass_rate=${(passRate * 100).toFixed(1)}% < 100%`)
    }
  } else {
    reasons.push(
      `tests_passing / tests_total not provided — pass --run-tests to spawn vitest OR pipe explicit counts`,
    )
  }

  // A11y baseline presence
  let a11yBaselinePresent = false
  if (!opts.skipA11y) {
    a11yBaselinePresent = fs.existsSync(a11yBaselinePath(opts.projectRoot))
    if (!a11yBaselinePresent) {
      reasons.push(`a11y baseline missing (coverage/a11y-baseline.json) — run \`tester a11y --baseline\``)
    }
  } else {
    a11yBaselinePresent = true
  }

  // Visual baseline presence (at least one baseline captured for this project)
  let visualBaselinePresent = false
  if (!opts.skipVisual) {
    const dir = path.join(opts.projectRoot, '.tester', 'baselines', path.basename(opts.projectRoot))
    visualBaselinePresent = fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('.png'))
    if (!visualBaselinePresent) {
      reasons.push(
        `no visual baseline for project — run \`tester snapshot --baseline --project ${path.basename(opts.projectRoot)} --route "/" --png <path>\``,
      )
    }
  } else {
    visualBaselinePresent = true
  }

  const coveragePass = fs.existsSync(coverageFile) && coverageRatio >= failUnder && criticalMissing === 0
  const passed =
    coveragePass &&
    testsPass &&
    a11yBaselinePresent &&
    visualBaselinePresent

  return {
    passed,
    coverage_ratio: coverageRatio,
    coverage_pass: coveragePass,
    critical_missing: criticalMissing,
    pass_rate: passRate,
    tests_pass: testsPass,
    a11y_baseline_present: a11yBaselinePresent,
    visual_baseline_present: visualBaselinePresent,
    reasons,
  }
}

export interface DoneEntry {
  feature: string
  status: 'done' | 'open'
  done_at?: string
  done_commit?: string
  reopened_at?: string
}

export function markDone(
  projectRoot: string,
  feature: string,
  commit?: string,
): { file: string; entry: DoneEntry } {
  const idxFile = path.join(projectRoot, 'coverage', 'features.yaml')
  const raw = loadFeaturesIndex(projectRoot) as unknown as {
    features: Array<Record<string, unknown>>
  }
  const at = new Date().toISOString()
  const existingIdx = raw.features.findIndex((e) => e.feature === feature)
  const entry: DoneEntry = { feature, status: 'done', done_at: at, done_commit: commit }
  if (existingIdx >= 0) {
    raw.features[existingIdx] = { ...raw.features[existingIdx], ...entry }
  } else {
    raw.features.push({ ...entry })
  }
  raw.features.sort((a, b) => String(a.feature).localeCompare(String(b.feature)))
  fs.mkdirSync(path.dirname(idxFile), { recursive: true })
  fs.writeFileSync(idxFile, yaml.dump(raw, { lineWidth: 120, noRefs: true }), 'utf8')
  return { file: idxFile, entry }
}

export function markUndone(projectRoot: string, feature: string): { file: string; updated: boolean } {
  const idxFile = path.join(projectRoot, 'coverage', 'features.yaml')
  const raw = loadFeaturesIndex(projectRoot) as unknown as {
    features: Array<Record<string, unknown>>
  }
  const idx = raw.features.findIndex((e) => e.feature === feature)
  if (idx < 0) return { file: idxFile, updated: false }
  raw.features[idx] = {
    ...raw.features[idx],
    status: 'open',
    reopened_at: new Date().toISOString(),
  }
  fs.writeFileSync(idxFile, yaml.dump(raw, { lineWidth: 120, noRefs: true }), 'utf8')
  return { file: idxFile, updated: true }
}

export function readDoneStatus(projectRoot: string): Array<Record<string, unknown>> {
  const raw = loadFeaturesIndex(projectRoot) as unknown as {
    features: Array<Record<string, unknown>>
  }
  return raw.features
}

// Re-export snapshot helper for CLI so it resolves the same default dir.
export { LocalFSStore, snapshotDefaultBaselineDir }
