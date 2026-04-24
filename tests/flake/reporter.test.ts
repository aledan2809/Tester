// lessons:skip-all
/**
 * T-007 §4 — flake reporter tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { aggregateFlakes, renderFlakeMarkdown } from '../../src/flake/reporter'

function mkReports(files: Record<string, object>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flake-'))
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, JSON.stringify(content), 'utf8')
  }
  return dir
}

function makeRun(opts: {
  startedAt: string
  steps: Array<{ name: string; retryCount?: number; verdict?: 'passed' | 'failed' | 'none'; tToV?: number }>
}) {
  return {
    startedAt: opts.startedAt,
    scenarios: [
      {
        scenario: { id: 'S1', name: 'scenario-one' },
        steps: opts.steps.map((s, i) => ({
          stepIndex: i,
          action: 'click',
          description: s.name,
          success: s.verdict !== 'failed',
          retryCount: s.retryCount,
          retryFinalVerdict: s.verdict,
          timeToVerdictMs: s.tToV,
        })),
      },
    ],
  }
}

describe('T-007 §4 aggregateFlakes', () => {
  it('counts retries and computes flake_rate per step', () => {
    const dir = mkReports({
      'run-1.json': makeRun({
        startedAt: '2026-04-24T00:00:00Z',
        steps: [
          { name: 's1', retryCount: 1, verdict: 'passed', tToV: 1200 },
          { name: 's2', retryCount: 0, verdict: 'none' },
        ],
      }),
      'run-2.json': makeRun({
        startedAt: '2026-04-24T01:00:00Z',
        steps: [
          { name: 's1', retryCount: 2, verdict: 'failed', tToV: 5000 },
          { name: 's2', retryCount: 0, verdict: 'none' },
        ],
      }),
    })
    try {
      const r = aggregateFlakes(dir)
      expect(r.scanned_runs).toBe(2)
      expect(r.steps).toHaveLength(1) // only s1 had retries
      const s1 = r.steps[0]
      expect(s1.retries_consumed).toBe(3)
      expect(s1.retries_that_passed).toBe(1)
      expect(s1.retries_that_failed).toBe(1)
      expect(s1.runs).toBe(2)
      expect(s1.flake_rate).toBeCloseTo(1.5, 1)
      expect(s1.recovery_rate).toBeCloseTo(1 / 3, 2)
      expect(r.totals.total_retries).toBe(3)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('computes p90 from time_to_verdict samples', () => {
    const dir = mkReports({
      'r1.json': makeRun({
        startedAt: '2026-04-24T00:00:00Z',
        steps: [{ name: 's', retryCount: 1, verdict: 'passed', tToV: 100 }],
      }),
      'r2.json': makeRun({
        startedAt: '2026-04-24T00:01:00Z',
        steps: [{ name: 's', retryCount: 1, verdict: 'passed', tToV: 200 }],
      }),
      'r3.json': makeRun({
        startedAt: '2026-04-24T00:02:00Z',
        steps: [{ name: 's', retryCount: 1, verdict: 'passed', tToV: 900 }],
      }),
    })
    try {
      const r = aggregateFlakes(dir)
      expect(r.steps[0].time_to_verdict_ms_p90).toBe(900)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('filters reports by --since', () => {
    const dir = mkReports({
      'old.json': makeRun({
        startedAt: '2026-04-20T00:00:00Z',
        steps: [{ name: 's', retryCount: 1, verdict: 'passed' }],
      }),
      'new.json': makeRun({
        startedAt: '2026-04-24T00:00:00Z',
        steps: [{ name: 's', retryCount: 1, verdict: 'passed' }],
      }),
    })
    try {
      const r = aggregateFlakes(dir, { since: '2026-04-22' })
      expect(r.scanned_runs).toBe(1)
      expect(r.steps[0].retries_consumed).toBe(1)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('sorts steps by flake_rate desc', () => {
    const dir = mkReports({
      'run.json': {
        startedAt: '2026-04-24T00:00:00Z',
        scenarios: [
          {
            scenario: { id: 'S1', name: 'one' },
            steps: [
              { stepIndex: 0, action: 'click', description: 'low-flake', retryCount: 0, retryFinalVerdict: 'none' },
              { stepIndex: 1, action: 'click', description: 'med-flake', retryCount: 1, retryFinalVerdict: 'passed' },
              { stepIndex: 2, action: 'click', description: 'high-flake', retryCount: 2, retryFinalVerdict: 'failed' },
            ],
          },
        ],
      },
    })
    try {
      const r = aggregateFlakes(dir)
      expect(r.steps[0].key.description).toBe('high-flake')
      expect(r.steps[1].key.description).toBe('med-flake')
      expect(r.steps.length).toBe(2)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('tolerates corrupt report files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flake-'))
    try {
      fs.writeFileSync(path.join(dir, 'bad.json'), '{not-json', 'utf8')
      fs.writeFileSync(
        path.join(dir, 'good.json'),
        JSON.stringify(
          makeRun({
            startedAt: '2026-04-24T00:00:00Z',
            steps: [{ name: 's', retryCount: 1, verdict: 'passed' }],
          }),
        ),
        'utf8',
      )
      const r = aggregateFlakes(dir)
      expect(r.scanned_runs).toBe(1)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns empty when dir missing', () => {
    const r = aggregateFlakes('/tmp/__never_exists_flake__')
    expect(r.scanned_runs).toBe(0)
    expect(r.steps).toEqual([])
  })
})

describe('T-007 §4 renderFlakeMarkdown', () => {
  it('produces header + top steps table when there are flakes', () => {
    const dir = mkReports({
      'r.json': makeRun({
        startedAt: '2026-04-24T00:00:00Z',
        steps: [{ name: 'clickish', retryCount: 2, verdict: 'failed', tToV: 3000 }],
      }),
    })
    try {
      const md = renderFlakeMarkdown(aggregateFlakes(dir))
      expect(md).toMatch(/# Flake report/)
      expect(md).toMatch(/## Top flaky steps/)
      expect(md).toMatch(/clickish/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('shows "no flaky steps" message when empty', () => {
    const dir = mkReports({})
    try {
      const md = renderFlakeMarkdown(aggregateFlakes(dir))
      expect(md).toMatch(/No flaky steps/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
