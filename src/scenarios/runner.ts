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
}

export interface RunReport {
  results: ScenarioRunResult[]
  pass: number
  fail: number
  skip: number
  total: number
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

export async function runScenarios(opts: RunnerOptions): Promise<RunReport> {
  const { suiteDir, filters = [], pacingMs = 0, baseUrl, loader = defaultLoader } = opts

  const files = discoverScenarios(suiteDir, filters)
  const results: ScenarioRunResult[] = []

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]
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
    let outcome: ScenarioOutcome

    try {
      const mod = await loader(filePath)
      const fn = mod.runScenario ?? mod.default
      if (typeof fn !== 'function') {
        outcome = { status: 'FAIL', error: `${name}: no runScenario export found`, durationMs: Date.now() - startMs }
      } else {
        outcome = await fn(ctx)
      }
    } catch (err) {
      outcome = { status: 'FAIL', error: String(err), durationMs: Date.now() - startMs }
    }

    results.push({ name, filePath, outcome, logs })

    if (pacingMs > 0 && i < files.length - 1) {
      await sleep(pacingMs)
    }
  }

  const pass = results.filter((r) => r.outcome.status === 'PASS').length
  const fail = results.filter((r) => r.outcome.status === 'FAIL').length
  const skip = results.filter((r) => r.outcome.status === 'SKIP').length

  return { results, pass, fail, skip, total: results.length }
}
