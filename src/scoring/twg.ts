/**
 * T-B1 — Coverage-aware TWG scoring.
 *
 * TWG loop previously scored "tests_passing / tests_total" which goes to
 * 100% even when only 10 of 28 declared scenarios exist. Post-T-002 we
 * have `coverage/*.yaml` declaring all intended scenarios; scoring
 * multiplies pass-rate with declaration-coverage so loop goal becomes
 * "scenarios_coverage ≥ target AND pass_rate = 100%".
 *
 *   score = (tests_passing / tests_total) * (scenarios_covered / scenarios_declared)
 *
 * Pure function; no I/O. Callers (TWG orchestrator, `tester done`,
 * inventory dashboard) import `computeTwgScore` with a small view model.
 */

export interface TwgScoreInput {
  /** Number of tests that passed in the run. */
  tests_passing: number
  /** Total tests attempted (passing + failing; excludes skipped for ratio). */
  tests_total: number
  /** Scenarios declared across the project's coverage/*.yaml (excluding skipped). */
  scenarios_declared: number
  /** Scenarios with status=covered. */
  scenarios_covered: number
}

export interface TwgScoreResult {
  pass_rate: number
  coverage_rate: number
  /** pass_rate * coverage_rate, in [0..1]. */
  score: number
  /** 0..100 convenience for TWG loop UIs. */
  score_percent: number
  /** True when pass_rate === 1 AND coverage_rate >= coverageTarget. */
  meets_goal: boolean
  /** Echo of the target used (default 0.9). */
  coverage_target: number
  /** Human-readable reason string for failing the goal check. */
  gate_reason?: string
}

export interface TwgScoreOptions {
  /** Minimum coverage ratio required to call the loop "done" (default 0.9). */
  coverageTarget?: number
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

export function computeTwgScore(
  input: TwgScoreInput,
  opts: TwgScoreOptions = {},
): TwgScoreResult {
  const target = opts.coverageTarget ?? 0.9
  const passRate = input.tests_total > 0 ? input.tests_passing / input.tests_total : 0
  const coverageRate = input.scenarios_declared > 0 ? input.scenarios_covered / input.scenarios_declared : 0
  const score = clamp01(passRate) * clamp01(coverageRate)
  let reason: string | undefined
  let meets = true
  if (passRate < 1) {
    meets = false
    reason = `pass_rate=${(passRate * 100).toFixed(1)}% < 100%`
  } else if (coverageRate < target) {
    meets = false
    reason = `coverage_rate=${(coverageRate * 100).toFixed(1)}% < target ${(target * 100).toFixed(0)}%`
  }
  return {
    pass_rate: clamp01(passRate),
    coverage_rate: clamp01(coverageRate),
    score,
    score_percent: Math.round(score * 10000) / 100,
    meets_goal: meets,
    coverage_target: target,
    gate_reason: reason,
  }
}

export function renderTwgScoreAscii(r: TwgScoreResult): string {
  const gate = r.meets_goal ? '✓ MEETS GOAL' : `✗ MISS (${r.gate_reason})`
  return [
    `TWG Score`,
    `  pass_rate     ${(r.pass_rate * 100).toFixed(1)}%`,
    `  coverage_rate ${(r.coverage_rate * 100).toFixed(1)}%  (target ${(r.coverage_target * 100).toFixed(0)}%)`,
    `  score         ${r.score_percent.toFixed(2)}%`,
    `  ${gate}`,
  ].join('\n')
}
