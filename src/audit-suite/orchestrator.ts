/**
 * Audit-Suite Module D — orchestrator.
 *
 * Sequences fixtures → provision → scenarios into a single run with a
 * structured report. All three phase runners are injectable so the
 * orchestrator can be unit-tested without any real DB or network.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { RunReport } from '../scenarios/runner'
import type { ProvisionResult } from '../provision/types'

// ── Phase runner types ─────────────────────────────────────────────────────

/** Called once to write fixtures into `fixturesDir`. */
export type FixturesPhaseRunner = (fixturesDir: string) => Promise<string[]>

/** Called once to provision users/tenants. Returns ProvisionResult or a skip marker. */
export type ProvisionPhaseRunner = (projectDir: string, dryRun: boolean) => Promise<ProvisionResult | null>

/** Called once to run the scenario suite. */
export type ScenariosPhaseRunner = (
  suiteDir: string,
  baseUrl: string,
  filters: string[],
  pacingMs: number,
) => Promise<RunReport>

// ── Report types ───────────────────────────────────────────────────────────

export type PhaseStatus = 'ok' | 'skipped' | 'fail'

export interface PhaseResult {
  phase: 'fixtures' | 'provision' | 'scenarios'
  status: PhaseStatus
  durationMs: number
  detail?: string
}

export interface AuditSuiteReport {
  suiteDir: string
  baseUrl: string
  startedAt: string
  finishedAt: string
  durationMs: number
  phases: PhaseResult[]
  scenarios: RunReport
}

// ── Options ────────────────────────────────────────────────────────────────

export interface AuditSuiteOptions {
  /** Directory containing scenario .ts/.js files. */
  suiteDir: string
  /** Base URL injected into ScenarioContext. */
  baseUrl?: string
  /** Glob filters passed to makeFilterPredicate. */
  filters?: string[]
  /** Directory for generated fixture files. When omitted, fixtures phase is skipped. */
  fixturesDir?: string
  /** Project root containing .tester-provision.json. When omitted, provision phase is skipped. */
  projectDir?: string
  /** Path for the JSON report file. When omitted, no file is written. */
  reportFile?: string
  /** Delay between scenarios in ms. */
  pacingMs?: number
  /** When true, provision phase runs in dry-run mode (generates SQL, no DB writes). */
  dryRun?: boolean
  // injectable runners for testing
  fixturesRunner?: FixturesPhaseRunner
  provisionRunner?: ProvisionPhaseRunner
  scenariosRunner?: ScenariosPhaseRunner
}

// ── Defaults ───────────────────────────────────────────────────────────────

function emptyRunReport(): RunReport {
  return { total: 0, pass: 0, fail: 0, skip: 0, durationMs: 0, results: [] }
}

// ── Orchestrator ───────────────────────────────────────────────────────────

export async function runAuditSuite(opts: AuditSuiteOptions): Promise<AuditSuiteReport> {
  const startedAt = new Date().toISOString()
  const t0 = Date.now()

  const baseUrl = opts.baseUrl ?? ''
  const filters = opts.filters ?? []
  const pacingMs = opts.pacingMs ?? 0
  const dryRun = opts.dryRun ?? false
  const phases: PhaseResult[] = []

  // ── Phase 1: Fixtures ───────────────────────────────────────────────────
  if (opts.fixturesDir && opts.fixturesRunner) {
    const pt = Date.now()
    try {
      const written = await opts.fixturesRunner(opts.fixturesDir)
      phases.push({
        phase: 'fixtures',
        status: 'ok',
        durationMs: Date.now() - pt,
        detail: `${written.length} file(s) written`,
      })
    } catch (err) {
      phases.push({
        phase: 'fixtures',
        status: 'fail',
        durationMs: Date.now() - pt,
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  } else {
    phases.push({ phase: 'fixtures', status: 'skipped', durationMs: 0 })
  }

  // ── Phase 2: Provision ─────────────────────────────────────────────────
  if (opts.projectDir && opts.provisionRunner) {
    const pt = Date.now()
    try {
      const result = await opts.provisionRunner(opts.projectDir, dryRun)
      if (result === null) {
        phases.push({ phase: 'provision', status: 'skipped', durationMs: Date.now() - pt })
      } else {
        phases.push({
          phase: 'provision',
          status: 'ok',
          durationMs: Date.now() - pt,
          detail: `${result.tenants.length} tenant(s), ${result.users.length} user(s)`,
        })
      }
    } catch (err) {
      phases.push({
        phase: 'provision',
        status: 'fail',
        durationMs: Date.now() - pt,
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  } else {
    phases.push({ phase: 'provision', status: 'skipped', durationMs: 0 })
  }

  // ── Phase 3: Scenarios ─────────────────────────────────────────────────
  let scenariosReport: RunReport = emptyRunReport()
  {
    const pt = Date.now()
    try {
      // Use the injectable runner when provided; otherwise fall back to the
      // real runScenarios (lazy import keeps the orchestrator test-friendly).
      const runner: ScenariosPhaseRunner =
        opts.scenariosRunner ??
        (async (suiteDir, baseUrl, filters, pacingMs) => {
          const { runScenarios } = await import('../scenarios/runner')
          return runScenarios({ suiteDir, baseUrl, filters, pacingMs })
        })
      scenariosReport = await runner(opts.suiteDir, baseUrl, filters, pacingMs)
      phases.push({
        phase: 'scenarios',
        status: scenariosReport.fail > 0 ? 'fail' : 'ok',
        durationMs: Date.now() - pt,
        detail: `${scenariosReport.pass} pass / ${scenariosReport.fail} fail / ${scenariosReport.skip} skip`,
      })
    } catch (err) {
      phases.push({
        phase: 'scenarios',
        status: 'fail',
        durationMs: Date.now() - pt,
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // ── Assemble report ────────────────────────────────────────────────────
  const finishedAt = new Date().toISOString()
  const report: AuditSuiteReport = {
    suiteDir: opts.suiteDir,
    baseUrl,
    startedAt,
    finishedAt,
    durationMs: Date.now() - t0,
    phases,
    scenarios: scenariosReport,
  }

  if (opts.reportFile) {
    const abs = path.resolve(opts.reportFile)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, JSON.stringify(report, null, 2), 'utf8')
  }

  return report
}
