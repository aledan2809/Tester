/**
 * Tests — bounded-concurrency scenario execution (S8).
 * Injectable loader + temp suite → no browser/network.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { runScenarios, mapWithConcurrency, type ScenarioFn } from '../../src/scenarios/runner'

let suiteDir: string
const N = 8

beforeAll(() => {
  suiteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conc-suite-'))
  for (let i = 0; i < N; i++) fs.writeFileSync(path.join(suiteDir, `s${i}.scenario.ts`), 'export const runScenario = async () => ({})')
})
afterAll(() => fs.rmSync(suiteDir, { recursive: true, force: true }))

describe('mapWithConcurrency', () => {
  it('preserves order regardless of completion timing', async () => {
    const items = [40, 10, 30, 5, 20]
    const out = await mapWithConcurrency(items, 3, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms))
      return `${i}:${ms}`
    })
    expect(out).toEqual(['0:40', '1:10', '2:30', '3:5', '4:20'])
  })

  it('never exceeds the concurrency cap', async () => {
    let active = 0
    let peak = 0
    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 10))
      active--
      return null
    })
    expect(peak).toBeLessThanOrEqual(4)
    expect(peak).toBeGreaterThan(1) // actually parallel
  })

  it('limit clamps to ≥1 and ≤items', async () => {
    const out = await mapWithConcurrency([1, 2], 99, async (x) => x * 2)
    expect(out).toEqual([2, 4])
  })
})

describe('runScenarios concurrency', () => {
  // loader: each scenario records concurrent-active count so we can prove parallelism.
  function trackingLoader() {
    let active = 0
    let peak = 0
    const loader = async (): Promise<{ runScenario: ScenarioFn }> => ({
      runScenario: async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 15))
        active--
        return { status: 'PASS' as const, durationMs: 15 }
      },
    })
    return { loader, getPeak: () => peak }
  }

  it('default (concurrency 1) → strictly sequential (peak 1)', async () => {
    const { loader, getPeak } = trackingLoader()
    const r = await runScenarios({ suiteDir, loader })
    expect(r.total).toBe(N)
    expect(r.pass).toBe(N)
    expect(getPeak()).toBe(1)
  })

  it('concurrency 4 → runs in parallel (peak > 1, ≤ 4) and all results present', async () => {
    const { loader, getPeak } = trackingLoader()
    const r = await runScenarios({ suiteDir, loader, concurrency: 4 })
    expect(r.total).toBe(N)
    expect(r.pass).toBe(N)
    expect(getPeak()).toBeGreaterThan(1)
    expect(getPeak()).toBeLessThanOrEqual(4)
    // results stay in discovery order
    expect(r.results.map((x) => x.name)).toEqual(r.results.map((x) => x.name).slice().sort())
  })

  it('TESTER_CONCURRENCY env enables parallelism', async () => {
    const prev = process.env.TESTER_CONCURRENCY
    process.env.TESTER_CONCURRENCY = '3'
    try {
      const { loader, getPeak } = trackingLoader()
      await runScenarios({ suiteDir, loader })
      expect(getPeak()).toBeGreaterThan(1)
    } finally {
      if (prev === undefined) delete process.env.TESTER_CONCURRENCY
      else process.env.TESTER_CONCURRENCY = prev
    }
  })
})
