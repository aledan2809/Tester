/**
 * Audit-Suite Module D — orchestrator tests (offline, zero network, zero DB).
 *
 * Covers:
 *  - Phase sequencing (fixtures → provision → scenarios)
 *  - Phase skipping when runner/dir omitted
 *  - Failure isolation per phase (one failure does not abort subsequent phases)
 *  - Report structure (phases array, scenarios, timestamps, durationMs)
 *  - JSON report file written to disk when reportFile is set
 *  - scenarios.fail > 0 maps to 'fail' phase status
 *  - CLI registration (audit-suite run exists + --suite required)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  runAuditSuite,
  type FixturesPhaseRunner,
  type ProvisionPhaseRunner,
  type ScenariosPhaseRunner,
} from '../../src/audit-suite/orchestrator'
import type { RunReport } from '../../src/scenarios/runner'
import type { ProvisionResult } from '../../src/provision/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

let tmpDir: string

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tester-audit-suite-'))
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function makeSuiteDir(): string {
  const d = fs.mkdtempSync(path.join(tmpDir, 'suite-'))
  fs.writeFileSync(path.join(d, 'E1.ts'), '', 'utf8')
  return d
}

function makePassReport(total = 1): RunReport {
  return {
    total,
    pass: total,
    fail: 0,
    skip: 0,
    durationMs: 1,
    results: Array.from({ length: total }, (_, i) => ({
      name: `E${i + 1}`,
      outcome: { status: 'PASS' as const, durationMs: 1 },
      logs: [],
    })),
  }
}

function makeFailReport(): RunReport {
  return {
    total: 1,
    pass: 0,
    fail: 1,
    skip: 0,
    durationMs: 1,
    results: [{ name: 'E1', outcome: { status: 'FAIL' as const, error: 'boom', durationMs: 1 }, logs: [] }],
  }
}

const stubProvisionResult: ProvisionResult = {
  tenants: [{ id: 't1', name: 'Tenant 1' }],
  users: [{ email: 'a@test', role: 'ADMIN', tenantId: 't1', password: 'P@ss', dualRoleA: false }],
  sql: [],
}

// ── Phase sequencing ─────────────────────────────────────────────────────────

describe('phase sequencing', () => {
  it('runs all three phases when all runners are provided', async () => {
    const log: string[] = []

    const fixturesRunner: FixturesPhaseRunner = async () => {
      log.push('fixtures')
      return ['f1.pdf']
    }
    const provisionRunner: ProvisionPhaseRunner = async () => {
      log.push('provision')
      return stubProvisionResult
    }
    const scenariosRunner: ScenariosPhaseRunner = async () => {
      log.push('scenarios')
      return makePassReport()
    }

    await runAuditSuite({
      suiteDir: makeSuiteDir(),
      fixturesDir: tmpDir,
      projectDir: tmpDir,
      fixturesRunner,
      provisionRunner,
      scenariosRunner,
    })

    expect(log).toEqual(['fixtures', 'provision', 'scenarios'])
  })

  it('runs phases in fixtures → provision → scenarios order', async () => {
    const order: string[] = []
    await runAuditSuite({
      suiteDir: makeSuiteDir(),
      fixturesDir: tmpDir,
      projectDir: tmpDir,
      fixturesRunner: async () => { order.push('A'); return [] },
      provisionRunner: async () => { order.push('B'); return stubProvisionResult },
      scenariosRunner: async () => { order.push('C'); return makePassReport() },
    })
    expect(order).toEqual(['A', 'B', 'C'])
  })
})

// ── Phase skipping ────────────────────────────────────────────────────────────

describe('phase skipping', () => {
  it('skips fixtures phase when fixturesDir is omitted', async () => {
    const report = await runAuditSuite({
      suiteDir: makeSuiteDir(),
      projectDir: tmpDir,
      provisionRunner: async () => stubProvisionResult,
      scenariosRunner: async () => makePassReport(),
    })
    const f = report.phases.find((p) => p.phase === 'fixtures')!
    expect(f.status).toBe('skipped')
  })

  it('skips fixtures phase when fixturesRunner is omitted', async () => {
    const report = await runAuditSuite({
      suiteDir: makeSuiteDir(),
      fixturesDir: tmpDir, // dir given but no runner
      provisionRunner: async () => stubProvisionResult,
      scenariosRunner: async () => makePassReport(),
    })
    const f = report.phases.find((p) => p.phase === 'fixtures')!
    expect(f.status).toBe('skipped')
  })

  it('skips provision phase when projectDir is omitted', async () => {
    const report = await runAuditSuite({
      suiteDir: makeSuiteDir(),
      fixturesDir: tmpDir,
      fixturesRunner: async () => [],
      scenariosRunner: async () => makePassReport(),
    })
    const p = report.phases.find((p) => p.phase === 'provision')!
    expect(p.status).toBe('skipped')
  })

  it('skips provision phase when provisionRunner is omitted', async () => {
    const report = await runAuditSuite({
      suiteDir: makeSuiteDir(),
      projectDir: tmpDir, // dir given but no runner
      fixturesRunner: async () => [],
      scenariosRunner: async () => makePassReport(),
    })
    const p = report.phases.find((p) => p.phase === 'provision')!
    expect(p.status).toBe('skipped')
  })

  it('returns a scenarios.total of 0 when suite is empty', async () => {
    const emptyDir = fs.mkdtempSync(path.join(tmpDir, 'empty-'))
    const report = await runAuditSuite({
      suiteDir: emptyDir,
      scenariosRunner: async () => ({ total: 0, pass: 0, fail: 0, skip: 0, durationMs: 0, results: [] }),
    })
    expect(report.scenarios.total).toBe(0)
  })
})

// ── Failure isolation ─────────────────────────────────────────────────────────

describe('failure isolation', () => {
  it('marks fixtures phase fail and still runs subsequent phases', async () => {
    const log: string[] = []
    const report = await runAuditSuite({
      suiteDir: makeSuiteDir(),
      fixturesDir: tmpDir,
      projectDir: tmpDir,
      fixturesRunner: async () => { throw new Error('disk full') },
      provisionRunner: async () => { log.push('provision'); return stubProvisionResult },
      scenariosRunner: async () => { log.push('scenarios'); return makePassReport() },
    })
    const fixtures = report.phases.find((p) => p.phase === 'fixtures')!
    expect(fixtures.status).toBe('fail')
    expect(fixtures.detail).toContain('disk full')
    expect(log).toEqual(['provision', 'scenarios'])
  })

  it('marks provision phase fail and still runs scenarios', async () => {
    const log: string[] = []
    const report = await runAuditSuite({
      suiteDir: makeSuiteDir(),
      projectDir: tmpDir,
      provisionRunner: async () => { throw new Error('db unreachable') },
      scenariosRunner: async () => { log.push('scenarios'); return makePassReport() },
    })
    const prov = report.phases.find((p) => p.phase === 'provision')!
    expect(prov.status).toBe('fail')
    expect(prov.detail).toContain('db unreachable')
    expect(log).toContain('scenarios')
  })

  it('marks scenarios phase fail when runner throws', async () => {
    const report = await runAuditSuite({
      suiteDir: makeSuiteDir(),
      scenariosRunner: async () => { throw new Error('runner crash') },
    })
    const sc = report.phases.find((p) => p.phase === 'scenarios')!
    expect(sc.status).toBe('fail')
    expect(sc.detail).toContain('runner crash')
  })
})

// ── Report structure ──────────────────────────────────────────────────────────

describe('report structure', () => {
  it('report contains startedAt, finishedAt, durationMs', async () => {
    const before = Date.now()
    const report = await runAuditSuite({
      suiteDir: makeSuiteDir(),
      scenariosRunner: async () => makePassReport(),
    })
    const after = Date.now()
    expect(new Date(report.startedAt).getTime()).toBeGreaterThanOrEqual(before)
    expect(new Date(report.finishedAt).getTime()).toBeLessThanOrEqual(after)
    expect(report.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('report.phases always has exactly 3 entries', async () => {
    const report = await runAuditSuite({
      suiteDir: makeSuiteDir(),
      scenariosRunner: async () => makePassReport(),
    })
    expect(report.phases).toHaveLength(3)
    expect(report.phases.map((p) => p.phase)).toEqual(['fixtures', 'provision', 'scenarios'])
  })

  it('report.scenarios mirrors the runner return value', async () => {
    const payload = makePassReport(7)
    const report = await runAuditSuite({
      suiteDir: makeSuiteDir(),
      scenariosRunner: async () => payload,
    })
    expect(report.scenarios.total).toBe(7)
    expect(report.scenarios.pass).toBe(7)
    expect(report.scenarios.fail).toBe(0)
  })

  it('scenarios phase status is "fail" when scenarios.fail > 0', async () => {
    const report = await runAuditSuite({
      suiteDir: makeSuiteDir(),
      scenariosRunner: async () => makeFailReport(),
    })
    const sc = report.phases.find((p) => p.phase === 'scenarios')!
    expect(sc.status).toBe('fail')
  })

  it('scenarios phase status is "ok" when scenarios.fail === 0', async () => {
    const report = await runAuditSuite({
      suiteDir: makeSuiteDir(),
      scenariosRunner: async () => makePassReport(),
    })
    const sc = report.phases.find((p) => p.phase === 'scenarios')!
    expect(sc.status).toBe('ok')
  })

  it('phase detail includes file count for fixtures phase', async () => {
    const report = await runAuditSuite({
      suiteDir: makeSuiteDir(),
      fixturesDir: tmpDir,
      fixturesRunner: async () => ['a.pdf', 'b.pdf', 'c.pdf'],
      scenariosRunner: async () => makePassReport(),
    })
    const f = report.phases.find((p) => p.phase === 'fixtures')!
    expect(f.detail).toContain('3')
  })

  it('phase detail includes tenant/user counts for provision phase', async () => {
    const report = await runAuditSuite({
      suiteDir: makeSuiteDir(),
      projectDir: tmpDir,
      provisionRunner: async () => ({
        tenants: [{ id: 't1', name: 'T1' }, { id: 't2', name: 'T2' }],
        users: [
          { email: 'a@t', role: 'ADMIN', tenantId: 't1', password: 'p', dualRoleA: false },
          { email: 'b@t', role: 'MEMBER', tenantId: 't1', password: 'p', dualRoleA: false },
          { email: 'c@t', role: 'MEMBER', tenantId: 't2', password: 'p', dualRoleA: false },
        ],
        sql: [],
      }),
      scenariosRunner: async () => makePassReport(),
    })
    const p = report.phases.find((p) => p.phase === 'provision')!
    expect(p.detail).toContain('2')
    expect(p.detail).toContain('3')
  })

  it('report.suiteDir and report.baseUrl are set correctly', async () => {
    const suiteDir = makeSuiteDir()
    const report = await runAuditSuite({
      suiteDir,
      baseUrl: 'https://example.com',
      scenariosRunner: async () => makePassReport(),
    })
    expect(report.suiteDir).toBe(suiteDir)
    expect(report.baseUrl).toBe('https://example.com')
  })

  it('baseUrl defaults to empty string when omitted', async () => {
    const report = await runAuditSuite({
      suiteDir: makeSuiteDir(),
      scenariosRunner: async () => makePassReport(),
    })
    expect(report.baseUrl).toBe('')
  })
})

// ── Report file ───────────────────────────────────────────────────────────────

describe('report file', () => {
  it('writes JSON report to disk when reportFile is set', async () => {
    const reportFile = path.join(tmpDir, 'suite-report', 'out.json')
    await runAuditSuite({
      suiteDir: makeSuiteDir(),
      reportFile,
      scenariosRunner: async () => makePassReport(),
    })
    expect(fs.existsSync(reportFile)).toBe(true)
    const data = JSON.parse(fs.readFileSync(reportFile, 'utf8'))
    expect(data).toHaveProperty('phases')
    expect(data).toHaveProperty('scenarios')
    expect(data).toHaveProperty('startedAt')
  })

  it('creates intermediate directories for the report file', async () => {
    const reportFile = path.join(tmpDir, 'deep', 'nested', 'dir', 'report.json')
    await runAuditSuite({
      suiteDir: makeSuiteDir(),
      reportFile,
      scenariosRunner: async () => makePassReport(),
    })
    expect(fs.existsSync(reportFile)).toBe(true)
  })

  it('does not write a file when reportFile is omitted', async () => {
    const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.json'))
    const before = files.length
    await runAuditSuite({
      suiteDir: makeSuiteDir(),
      scenariosRunner: async () => makePassReport(),
    })
    const after = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.json')).length
    expect(after).toBe(before)
  })
})

// ── CLI registration ──────────────────────────────────────────────────────────

describe('CLI — tester audit-suite', () => {
  it('audit-suite command is registered', async () => {
    const { Command } = await import('commander')
    const { registerAuditSuite } = await import('../../src/cli/commands/audit-suite')
    const program = new Command()
    registerAuditSuite(program)
    const cmd = program.commands.find((c) => c.name() === 'audit-suite')
    expect(cmd).toBeDefined()
  })

  it('audit-suite run sub-command is registered', async () => {
    const { Command } = await import('commander')
    const { registerAuditSuite } = await import('../../src/cli/commands/audit-suite')
    const program = new Command()
    registerAuditSuite(program)
    const suite = program.commands.find((c) => c.name() === 'audit-suite')!
    const run = suite.commands.find((c) => c.name() === 'run')
    expect(run).toBeDefined()
  })

  it('audit-suite run requires --suite option', async () => {
    const { Command } = await import('commander')
    const { registerAuditSuite } = await import('../../src/cli/commands/audit-suite')
    const program = new Command().exitOverride()
    registerAuditSuite(program)
    expect(() => program.parse(['node', 'tester', 'audit-suite', 'run'])).toThrow()
  })
})
