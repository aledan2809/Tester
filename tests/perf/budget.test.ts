// lessons:skip-all
/**
 * T-010 — Perf budget evaluator regression tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  loadPerfBudget,
  defaultPerfBudgetPath,
  evaluatePerfBudget,
  computePerfDelta,
  renderCiComment,
  type PerfRun,
} from '../../src/perf/budget'

function mkProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'perf-'))
}

function writeBudget(root: string, content: string) {
  const dir = path.join(root, 'coverage')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'perf-budget.yaml'), content, 'utf8')
}

describe('T-010 loadPerfBudget', () => {
  it('reads YAML with defaults + per-route', () => {
    const root = mkProject()
    try {
      writeBudget(
        root,
        `project: demo
defaults:
  lcp_ms: 2500
  cls: 0.1
routes:
  /dashboard:
    lcp_ms: 2000
`,
      )
      const b = loadPerfBudget(root)
      expect(b?.project).toBe('demo')
      expect(b?.defaults?.lcp_ms).toBe(2500)
      expect(b?.routes?.['/dashboard']?.lcp_ms).toBe(2000)
      expect(defaultPerfBudgetPath(root)).toMatch(/coverage\/perf-budget\.yaml$/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns null on missing / bad YAML', () => {
    const root = mkProject()
    try {
      expect(loadPerfBudget(root)).toBeNull()
      writeBudget(root, '::: not : yaml :::')
      expect(loadPerfBudget(root)).toBeNull()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('T-010 evaluatePerfBudget', () => {
  const BUDGET = {
    project: 'demo',
    defaults: { lcp_ms: 2500, cls: 0.1, transfer_bytes: 300000 },
    routes: {
      '/dashboard': { lcp_ms: 2000, transfer_bytes: 200000 },
    },
  }

  it('passes when all metrics under budget', () => {
    const runs: PerfRun[] = [
      { route: '/home', metrics: { lcp_ms: 2300, cls: 0.05, transfer_bytes: 250000 } },
    ]
    const rep = evaluatePerfBudget(BUDGET, runs)
    expect(rep.passed).toBe(1)
    expect(rep.failed).toBe(0)
    expect(rep.breach_count).toBe(0)
  })

  it('fails on lcp_ms breach — route override takes precedence', () => {
    const runs: PerfRun[] = [
      { route: '/dashboard', metrics: { lcp_ms: 2200, cls: 0.05 } },
    ]
    const rep = evaluatePerfBudget(BUDGET, runs)
    expect(rep.failed).toBe(1)
    expect(rep.results[0].breaches).toHaveLength(1)
    expect(rep.results[0].breaches[0].metric).toBe('lcp_ms')
    expect(rep.results[0].breaches[0].delta).toBe(200)
  })

  it('skips unspecified metric keys (no breach if budget missing for key)', () => {
    const runs: PerfRun[] = [
      { route: '/home', metrics: { fcp_ms: 9999, cls: 0.05 } }, // fcp_ms not budgeted
    ]
    const rep = evaluatePerfBudget(BUDGET, runs)
    expect(rep.passed).toBe(1)
  })

  it('multiple breaches aggregate in breach_count', () => {
    const runs: PerfRun[] = [
      {
        route: '/dashboard',
        metrics: { lcp_ms: 3000, cls: 0.5, transfer_bytes: 400000 },
      },
    ]
    const rep = evaluatePerfBudget(BUDGET, runs)
    expect(rep.failed).toBe(1)
    expect(rep.breach_count).toBe(3)
  })

  it('null budget treats everything as passing', () => {
    const runs: PerfRun[] = [
      { route: '/x', metrics: { lcp_ms: 99999, cls: 10 } },
    ]
    const rep = evaluatePerfBudget(null, runs)
    expect(rep.passed).toBe(1)
    expect(rep.failed).toBe(0)
  })
})

describe('T-010 computePerfDelta', () => {
  it('returns only changed metrics across before/after', () => {
    const before: PerfRun[] = [
      { route: '/home', metrics: { lcp_ms: 2000, cls: 0.05 } },
    ]
    const after: PerfRun[] = [
      { route: '/home', metrics: { lcp_ms: 2300, cls: 0.05 } },
    ]
    const delta = computePerfDelta(before, after)
    expect(delta).toHaveLength(1)
    expect(delta[0].metric).toBe('lcp_ms')
    expect(delta[0].delta).toBe(300)
    expect(delta[0].percent).toBeCloseTo(15)
  })

  it('skips routes that exist in only one side', () => {
    const before: PerfRun[] = [
      { route: '/home', metrics: { lcp_ms: 2000 } },
    ]
    const after: PerfRun[] = [
      { route: '/home', metrics: { lcp_ms: 2100 } },
      { route: '/new', metrics: { lcp_ms: 1500 } },
    ]
    const delta = computePerfDelta(before, after)
    expect(delta.every((d) => d.route === '/home')).toBe(true)
  })
})

describe('T-010 renderCiComment', () => {
  it('includes breach table when there are failures', () => {
    const report = {
      project: 'demo',
      total_routes: 1,
      passed: 0,
      failed: 1,
      breach_count: 1,
      results: [
        {
          route: '/home',
          passed: false,
          metrics: { lcp_ms: 3000 },
          budget: { lcp_ms: 2500 },
          breaches: [
            { metric: 'lcp_ms' as const, actual: 3000, budget: 2500, delta: 500 },
          ],
        },
      ],
    }
    const md = renderCiComment(report)
    expect(md).toMatch(/## T-010 Perf Budget Report/)
    expect(md).toMatch(/lcp_ms.*3000.*2500/)
  })

  it('renders delta table when provided', () => {
    const report = {
      project: 'demo',
      total_routes: 1,
      passed: 1,
      failed: 0,
      breach_count: 0,
      results: [],
    }
    const delta = [
      {
        route: '/home',
        metric: 'lcp_ms' as const,
        before: 2000,
        after: 2100,
        delta: 100,
        percent: 5,
      },
    ]
    const md = renderCiComment(report, delta)
    expect(md).toMatch(/Before → After changes/)
    expect(md).toMatch(/\/home.*lcp_ms.*2000.*2100.*\+100.*\+5\.0%/)
  })

  it('omits breach table when all passing', () => {
    const report = {
      project: 'demo',
      total_routes: 2,
      passed: 2,
      failed: 0,
      breach_count: 0,
      results: [],
    }
    const md = renderCiComment(report)
    expect(md).not.toMatch(/Budget breaches/)
  })
})
