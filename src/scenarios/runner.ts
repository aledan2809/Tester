/**
 * Audit-Suite Module C — Scenario runner.
 *
 * Discovers .ts/.js scenario files in a suite directory, filters by glob
 * patterns, imports each, calls runScenario(ctx), enforces rate-limit
 * pacing between runs, and produces a structured report.
 *
 * Scenario files must export:
 *   export async function runScenario(ctx: ScenarioContext): Promise<ScenarioOutcome>
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { ScenarioSession } from './session'
import { ScenarioAssertions } from './assertions'

// ── Public types (re-exported for scenario authors) ───────────────────────────

export interface ScenarioContext {
  /** Resolved base URL for HTTP requests (e.g. https://procuchain.com) */
  baseUrl: string
  /** Auth session — set token / cookies, fetch with injection */
  session: ScenarioSession
  /** HTTP assertion helpers */
  assert: ScenarioAssertions
  /** Structured log (written to report per scenario) */
  log: (msg: string) => void
}

export type ScenarioOutcome =
  | { status: 'PASS'; durationMs: number; steps?: StepLog[] }
  | { status: 'FAIL'; error: string; durationMs: number; steps?: StepLog[] }
  | { status: 'SKIP'; reason: string }

export interface StepLog {
  step: string
  status: 'ok' | 'fail'
  detail?: string
}

export type ScenarioFn = (ctx: ScenarioContext) => Promise<ScenarioOutcome>

export interface ScenarioRunResult {
  name: string
  filePath: string
  outcome: ScenarioOutcome
  logs: string[]
  /** Set when retryFlaky is on and a FAIL passed on re-run — failed once,
   *  passed on retry. Outcome stays FAIL (conservative); the flag lets the
   *  consumer distinguish flakiness from a hard, reproducible failure. */
  flaky?: boolean
}

export interface RunReport {
  results: ScenarioRunResult[]
  pass: number
  fail: number
  skip: number
  total: number
  durationMs: number
  /** Count of FAILs that passed on the flaky re-run (0 unless retryFlaky on). */
  flaky?: number
}

/** Pure: a scenario is flaky when its first run FAILed but the re-run PASSed. */
export function classifyFlaky(first: ScenarioOutcome, retry: ScenarioOutcome): boolean {
  return first.status === 'FAIL' && retry.status === 'PASS'
}

/**
 * Bounded-concurrency map preserving input order (S8). Runs at most `limit`
 * tasks at once; results land at their original index regardless of completion
 * order. Safe for scenarios because each ScenarioSession is an independent
 * HTTP jar (no shared browser/page state).
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const cap = Math.max(1, Math.min(limit, items.length || 1))
  async function worker() {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await task(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: cap }, () => worker()))
  return results
}

/** Injectable loader — default uses dynamic import, tests inject a mock. */
export type ScenarioLoader = (filePath: string) => Promise<{ runScenario?: ScenarioFn; default?: ScenarioFn }>

export interface RunnerOptions {
  suiteDir: string
  filters?: string[]
  pacingMs?: number
  baseUrl?: string
  /** Override the dynamic import loader for testing. */
  loader?: ScenarioLoader
  /** Re-run a FAILed scenario once; passing on re-run flags it flaky.
   *  Default false (also enabled by TESTER_RETRY_FLAKY=1). */
  retryFlaky?: boolean
  /** Run up to N scenarios concurrently (each has an independent HTTP session).
   *  Default 1 = sequential (unchanged). Also set by TESTER_CONCURRENCY.
   *  When > 1, pacingMs is ignored (concurrent runs don't pace). */
  concurrency?: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert a filter list like ["E*", "F*", "H1"] into a name predicate.
 * Empty list matches everything.
 */
export function makeFilterPredicate(filters: string[]): (name: string) => boolean {
  if (!filters.length) return () => true
  return (name: string) =>
    filters.some((f) => {
      if (f.includes('*')) {
        const re = new RegExp('^' + f.replace(/\*/g, '.*') + '$', 'i')
        return re.test(name)
      }
      return name.toLowerCase() === f.toLowerCase()
    })
}

/**
 * Discover scenario files in `suiteDir`, optionally filtered by name pattern.
 * Returns absolute paths sorted alphabetically.
 */
export function discoverScenarios(suiteDir: string, filters: string[]): string[] {
  if (!fs.existsSync(suiteDir)) return []
  const predicate = makeFilterPredicate(filters)
  return fs
    .readdirSync(suiteDir)
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.d.ts'))
    .filter((f) => predicate(path.basename(f, path.extname(f))))
    .sort()
    .map((f) => path.resolve(suiteDir, f))
}

/** Default loader — uses dynamic import (requires ts-node / tsx at runtime). */
const defaultLoader: ScenarioLoader = (filePath: string) =>
  import(filePath) as Promise<{ runScenario?: ScenarioFn; default?: ScenarioFn }>

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Runner ────────────────────────────────────────────────────────────────────

/** Execute one scenario file once. Extracted so the flaky re-run reuses it. */
async function executeScenario(
  filePath: string,
  baseUrl: string,
  loader: ScenarioLoader,
): Promise<{ outcome: ScenarioOutcome; logs: string[] }> {
  const name = path.basename(filePath, path.extname(filePath))
  const session = new ScenarioSession()
  const assert = new ScenarioAssertions()
  const logs: string[] = []
  const ctx: ScenarioContext = {
    baseUrl: baseUrl ?? '',
    session,
    assert,
    log: (msg: string) => logs.push(`[${name}] ${msg}`),
  }
  const startMs = Date.now()
  try {
    const mod = await loader(filePath)
    const fn = mod.runScenario ?? mod.default
    if (typeof fn !== 'function') {
      return { outcome: { status: 'FAIL', error: `${name}: no runScenario export found`, durationMs: Date.now() - startMs }, logs }
    }
    return { outcome: await fn(ctx), logs }
  } catch (err) {
    return { outcome: { status: 'FAIL', error: String(err), durationMs: Date.now() - startMs }, logs }
  }
}

export async function runScenarios(opts: RunnerOptions): Promise<RunReport> {
  const { suiteDir, filters = [], pacingMs = 0, baseUrl = '', loader = defaultLoader } = opts
  // Flaky re-run: opt-in via option or TESTER_RETRY_FLAKY=1 (default OFF →
  // zero behavior change). A FAIL is re-run once; passing on re-run flags it
  // flaky (outcome stays FAIL — conservative).
  const retryFlaky = opts.retryFlaky ?? process.env.TESTER_RETRY_FLAKY === '1'
  const concurrency = Math.max(1, opts.concurrency ?? (Number(process.env.TESTER_CONCURRENCY) || 1))

  const t0 = Date.now()
  const files = discoverScenarios(suiteDir, filters)

  // Run one file → ScenarioRunResult (with optional flaky re-run). Shared by
  // both the sequential and the concurrent path so behavior is identical.
  const runOne = async (filePath: string): Promise<ScenarioRunResult> => {
    const name = path.basename(filePath, path.extname(filePath))
    const { outcome, logs } = await executeScenario(filePath, baseUrl, loader)
    const result: ScenarioRunResult = { name, filePath, outcome, logs }
    if (retryFlaky && outcome.status === 'FAIL') {
      const retry = await executeScenario(filePath, baseUrl, loader)
      if (classifyFlaky(outcome, retry.outcome)) {
        result.flaky = true
        result.logs.push(`[${name}] ⚠ flaky: failed once, PASSED on re-run`)
      }
    }
    return result
  }

  let results: ScenarioRunResult[]
  if (concurrency > 1) {
    // Independent HTTP sessions → safe to run in parallel; order preserved.
    results = await mapWithConcurrency(files, concurrency, (f) => runOne(f))
  } else {
    results = []
    for (let i = 0; i < files.length; i++) {
      results.push(await runOne(files[i]))
      if (pacingMs > 0 && i < files.length - 1) await sleep(pacingMs)
    }
  }

  const pass = results.filter((r) => r.outcome.status === 'PASS').length
  const fail = results.filter((r) => r.outcome.status === 'FAIL').length
  const skip = results.filter((r) => r.outcome.status === 'SKIP').length
  const flaky = results.filter((r) => r.flaky).length

  return { results, pass, fail, skip, total: results.length, durationMs: Date.now() - t0, flaky }
}
