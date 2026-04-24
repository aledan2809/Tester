/**
 * T-C2 — Commit-test coupling check.
 *
 * Walks `git diff --name-only <since>..HEAD`. Categorizes each file
 * as source vs test vs config/doc, and fails when source files
 * changed without accompanying test files — unless the commit
 * message body contains `Test-Coverage: existing` (explicit opt-out,
 * audited in commit history).
 */

import { spawnSync } from 'node:child_process'

export interface CouplingCheckInput {
  repoPath: string
  since: string
  /** When true, skip the check entirely (matches --no-check-coupling semantics). */
  disabled?: boolean
  /** Paths that are considered "source" (overrides default globs). */
  sourcePatterns?: RegExp[]
  /** Paths that are considered "test" (overrides default globs). */
  testPatterns?: RegExp[]
  /** When true, commits without matching tests pass instead of fail.
   * Used by CI runners that prefer warnings over hard stops. */
  warnOnly?: boolean
}

export interface CouplingCheckResult {
  ok: boolean
  passed: boolean
  reason?: string
  sourceChanges: string[]
  testChanges: string[]
  unmatchedSources: string[]
  refactorOnly: boolean
  override?: boolean
}

const DEFAULT_SOURCE: RegExp[] = [
  /^(src|app|apps|packages)\/.*\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/,
  /^lib\/.*\.(ts|tsx|js)$/,
]

const DEFAULT_TEST: RegExp[] = [
  /\.spec\.(ts|tsx|js)$/,
  /\.test\.(ts|tsx|js)$/,
  /^tests\//,
  /^coverage\/.*\.ya?ml$/,
  /__tests__\//,
]

function anyMatch(file: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(file))
}

export function checkCoupling(input: CouplingCheckInput): CouplingCheckResult {
  const empty: CouplingCheckResult = {
    ok: true,
    passed: true,
    sourceChanges: [],
    testChanges: [],
    unmatchedSources: [],
    refactorOnly: false,
  }
  if (input.disabled) return empty

  const res = spawnSync(
    'git',
    ['-C', input.repoPath, 'diff', '--name-only', `${input.since}..HEAD`],
    { encoding: 'utf8' },
  )
  if (res.status !== 0) {
    return {
      ...empty,
      ok: false,
      passed: false,
      reason: `git diff failed: ${(res.stderr || '').trim().split('\n')[0]}`,
    }
  }
  const files = (res.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean)
  const srcPatterns = input.sourcePatterns || DEFAULT_SOURCE
  const testPatterns = input.testPatterns || DEFAULT_TEST
  const sourceChanges: string[] = []
  const testChanges: string[] = []
  for (const f of files) {
    if (anyMatch(f, testPatterns)) testChanges.push(f)
    else if (anyMatch(f, srcPatterns)) sourceChanges.push(f)
  }
  // Check commit messages in the range for explicit override trailer.
  const msgRes = spawnSync(
    'git',
    ['-C', input.repoPath, 'log', '--pretty=%B', `${input.since}..HEAD`],
    { encoding: 'utf8' },
  )
  const combinedMsgs = (msgRes.stdout || '').toLowerCase()
  const override = /test-coverage:\s*existing/i.test(combinedMsgs)

  if (sourceChanges.length === 0) {
    return { ...empty, sourceChanges, testChanges }
  }
  if (testChanges.length > 0 || override) {
    return {
      ok: true,
      passed: true,
      sourceChanges,
      testChanges,
      unmatchedSources: [],
      refactorOnly: false,
      override,
    }
  }
  // Heuristic: if all diffs are deletions + renames with no new content,
  // treat as refactor (hard to detect without --stat; use a fast proxy:
  // all source diffs are deletions). We approximate by running git
  // log --stat to check insertions==0 when deletions>0.
  const statRes = spawnSync(
    'git',
    ['-C', input.repoPath, 'diff', '--stat', `${input.since}..HEAD`],
    { encoding: 'utf8' },
  )
  const sumLine = (statRes.stdout || '').trim().split('\n').pop() || ''
  const insMatch = sumLine.match(/(\d+)\s+insertions?/)
  const ins = insMatch ? Number(insMatch[1]) : 0
  const refactorOnly = ins === 0 && sourceChanges.length > 0
  return {
    ok: true,
    passed: input.warnOnly === true ? true : refactorOnly,
    reason: refactorOnly
      ? 'source-only changes look like a refactor (0 insertions)'
      : `source files changed with no test file changes: ${sourceChanges.slice(0, 5).join(', ')}`,
    sourceChanges,
    testChanges,
    unmatchedSources: sourceChanges,
    refactorOnly,
    override: false,
  }
}
