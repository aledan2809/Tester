// lessons:skip-all
/**
 * T-C5 — Pipeline stats analyzer tests.
 */

import { describe, it, expect } from 'vitest'
import {
  analyzePipelines,
  renderStatsMarkdown,
  normalizeSignature,
  type PipelineRecord,
} from '../../src/pipeline-stats/analyzer'

function rec(partial: Partial<PipelineRecord>): PipelineRecord {
  return {
    id: partial.id || `pipe_${Math.random().toString(36).slice(2, 8)}`,
    state: partial.state || 'done',
    ...partial,
  } as PipelineRecord
}

describe('T-C5 normalizeSignature', () => {
  it('produces a stable sig for semantically identical errors', () => {
    const a = normalizeSignature('Zombie cleanup: process 88655 dead')
    const b = normalizeSignature('Zombie cleanup: process 12345 dead')
    expect(a).toBe(b)
  })

  it('produces different sigs for different error texts', () => {
    expect(normalizeSignature('foo')).not.toBe(normalizeSignature('bar'))
  })

  it('collapses hex hashes to a stable token', () => {
    const a = normalizeSignature('retry task f43aef7badc0de exhausted')
    const b = normalizeSignature('retry task 5697a18deadbeef exhausted')
    expect(a).toBe(b)
  })
})

describe('T-C5 analyzePipelines — basic aggregation', () => {
  it('counts failed / completed / running with per-phase buckets', () => {
    const pipelines: PipelineRecord[] = [
      rec({ state: 'failed', phase: 'dev', errors: [{ message: 'Zombie cleanup: process 1 dead' }] }),
      rec({ state: 'failed', phase: 'dev', errors: [{ message: 'Zombie cleanup: process 2 dead' }] }),
      rec({ state: 'failed', phase: 'ci', errors: ['agent retry exhausted create_api_route'] }),
      rec({ state: 'done', phase: 'dev' }),
      rec({ state: 'running', phase: 'dev' }),
    ]
    const r = analyzePipelines(pipelines)
    expect(r.total_pipelines).toBe(5)
    expect(r.failed).toBe(3)
    expect(r.completed).toBe(1)
    expect(r.fail_rate).toBeCloseTo(3 / 5)

    const devBucket = r.phases.find((p) => p.phase === 'dev')!
    expect(devBucket.total).toBe(4)
    expect(devBucket.failed).toBe(2)
    expect(devBucket.completed).toBe(1)
    expect(devBucket.running).toBe(1)
  })

  it('clusters zombie-variant signatures into one entry', () => {
    const pipelines: PipelineRecord[] = [
      rec({ state: 'failed', errors: [{ message: 'Zombie cleanup: process 100 dead' }], project: 'PRO' }),
      rec({ state: 'failed', errors: [{ message: 'Zombie cleanup: process 200 dead' }], project: 'eCabinet' }),
      rec({ state: 'failed', errors: [{ message: 'Zombie cleanup: process 300 dead' }], project: 'PRO' }),
    ]
    const r = analyzePipelines(pipelines)
    expect(r.top_signatures).toHaveLength(1)
    expect(r.top_signatures[0].count).toBe(3)
    expect(r.top_signatures[0].projects.sort()).toEqual(['PRO', 'eCabinet'])
  })

  it('top-N cap respected', () => {
    const distinctErrors = [
      'zombie cleanup failure',
      'planner rejected constraint block',
      'dev agent scope exceeded',
      'CI lint error E001',
      'deploy ssh timeout',
      'red team scan stalled',
      'ABIP phase 3 manifest missing',
      'session-bridge disconnect',
      'prisma migration drift',
      'classifier cache corrupt',
    ]
    const pipelines: PipelineRecord[] = distinctErrors.map((msg) =>
      rec({ state: 'failed', errors: [{ message: msg }] }),
    )
    const r = analyzePipelines(pipelines, { topN: 3 })
    expect(r.top_signatures).toHaveLength(3)
  })

  it('window filter excludes pipelines outside since/until', () => {
    const pipelines: PipelineRecord[] = [
      rec({ state: 'failed', updatedAt: '2026-01-01T00:00:00Z' }),
      rec({ state: 'failed', updatedAt: '2026-04-01T00:00:00Z' }),
      rec({ state: 'failed', updatedAt: '2026-06-01T00:00:00Z' }),
    ]
    const r = analyzePipelines(pipelines, { since: '2026-03-01', until: '2026-05-01' })
    expect(r.total_pipelines).toBe(1)
  })

  it('computes avg_context_tokens when present', () => {
    const pipelines: PipelineRecord[] = [
      rec({ state: 'done', contextTokens: 1000 }),
      rec({ state: 'failed', contextTokens: 3000 }),
      rec({ state: 'running' }), // no tokens
    ]
    const r = analyzePipelines(pipelines)
    expect(r.avg_context_tokens).toBe(2000)
  })

  it('empty corpus returns zero stats without NaN', () => {
    const r = analyzePipelines([])
    expect(r.total_pipelines).toBe(0)
    expect(r.fail_rate).toBe(0)
    expect(r.avg_context_tokens).toBeNull()
  })
})

describe('T-C5 renderStatsMarkdown', () => {
  it('renders header + phases table + top-signatures table', () => {
    const pipelines: PipelineRecord[] = [
      rec({ state: 'failed', phase: 'dev', errors: [{ message: 'zombie cleanup: process 1 dead' }] }),
      rec({ state: 'done', phase: 'dev' }),
    ]
    const md = renderStatsMarkdown(analyzePipelines(pipelines))
    expect(md).toMatch(/# Pipeline Stats/)
    expect(md).toMatch(/\| Phase \| Total \|/)
    expect(md).toMatch(/## Top failure signatures/)
  })
})
