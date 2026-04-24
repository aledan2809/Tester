// lessons:skip-all
/**
 * T-007 — Self-healing retry with exponential backoff + settle extension.
 *
 * Tests the extracted `retryStepWithBackoff` helper against a scripted
 * mock browser. A real BrowserCore launch is too heavyweight for unit
 * scope; we only care about retry decision logic + settle progression +
 * metadata stamping.
 */

import { describe, it, expect } from 'vitest'
import { retryStepWithBackoff } from '../../src/executor'
import type { StepResult, TestStep } from '../../src/core/types'

function makeStep(): TestStep {
  return { action: 'click', target: '[data-testid=btn]', description: 'click btn' }
}

function makeFail(i: number): StepResult {
  return {
    stepIndex: i,
    action: 'click',
    description: 'click btn',
    success: false,
    error: 'not found',
    durationMs: 5,
  }
}

function makePass(i: number): StepResult {
  return {
    stepIndex: i,
    action: 'click',
    description: 'click btn',
    success: true,
    durationMs: 3,
  }
}

/**
 * Browser stub: returns results from a scripted queue. Throws if exhausted.
 */
function scriptedBrowser(results: StepResult[]) {
  let idx = 0
  const sleepCalls: number[] = []
  return {
    executeStep: async (_step: TestStep, stepIndex: number) => {
      if (idx >= results.length) throw new Error('scripted browser exhausted')
      const r = results[idx++]
      return { ...r, stepIndex }
    },
    sleepFn: async (ms: number) => {
      sleepCalls.push(ms)
    },
    sleepCalls,
  }
}

describe('T-007 retryStepWithBackoff — decision logic', () => {
  it('returns metadata when budget=0 without retrying', async () => {
    const browser = scriptedBrowser([]) // no retries expected
    const initial = makeFail(0)
    const r = await retryStepWithBackoff(browser, makeStep(), 0, initial, {
      budget: 0,
      initialSettleMs: 1000,
      backoffMultiplier: 1.5,
      settleCapMs: 8000,
      startedAt: Date.now(),
      sleepFn: browser.sleepFn,
    })
    expect(r.success).toBe(false)
    expect(r.retryCount).toBe(0)
    expect(r.retryFinalVerdict).toBe('none')
    expect(browser.sleepCalls).toHaveLength(0)
  })

  it('returns on first successful retry with retryCount=1 + verdict=passed', async () => {
    const browser = scriptedBrowser([makePass(0)])
    const r = await retryStepWithBackoff(browser, makeStep(), 0, makeFail(0), {
      budget: 2,
      initialSettleMs: 500,
      backoffMultiplier: 1.5,
      settleCapMs: 8000,
      startedAt: Date.now(),
      sleepFn: browser.sleepFn,
    })
    expect(r.success).toBe(true)
    expect(r.retryCount).toBe(1)
    expect(r.retryFinalVerdict).toBe('passed')
    expect(r.description).toMatch(/\[retried×1\]/)
    expect(browser.sleepCalls).toEqual([500])
  })

  it('exhausts budget when all retries fail and stamps verdict=failed', async () => {
    const browser = scriptedBrowser([makeFail(0), makeFail(0), makeFail(0)])
    const r = await retryStepWithBackoff(browser, makeStep(), 0, makeFail(0), {
      budget: 3,
      initialSettleMs: 100,
      backoffMultiplier: 2,
      settleCapMs: 5000,
      startedAt: Date.now(),
      sleepFn: browser.sleepFn,
    })
    expect(r.success).toBe(false)
    expect(r.retryCount).toBe(3)
    expect(r.retryFinalVerdict).toBe('failed')
    // Exponential progression: 100 → 200 → 400
    expect(browser.sleepCalls).toEqual([100, 200, 400])
  })

  it('caps settle at settleCapMs under exponential growth', async () => {
    const browser = scriptedBrowser([makeFail(0), makeFail(0), makeFail(0), makeFail(0)])
    const r = await retryStepWithBackoff(browser, makeStep(), 0, makeFail(0), {
      budget: 4,
      initialSettleMs: 1000,
      backoffMultiplier: 3,
      settleCapMs: 5000,
      startedAt: Date.now(),
      sleepFn: browser.sleepFn,
    })
    expect(r.retryFinalVerdict).toBe('failed')
    // 1000 → 3000 → 5000 (capped) → 5000 (capped)
    expect(browser.sleepCalls).toEqual([1000, 3000, 5000, 5000])
  })

  it('stops retrying after first success (does not consume remaining budget)', async () => {
    const browser = scriptedBrowser([makeFail(0), makePass(0)])
    const r = await retryStepWithBackoff(browser, makeStep(), 0, makeFail(0), {
      budget: 5,
      initialSettleMs: 100,
      backoffMultiplier: 1.5,
      settleCapMs: 5000,
      startedAt: Date.now(),
      sleepFn: browser.sleepFn,
    })
    expect(r.success).toBe(true)
    expect(r.retryCount).toBe(2)
    expect(r.retryFinalVerdict).toBe('passed')
    expect(browser.sleepCalls).toEqual([100, 150])
  })

  it('description is marked with retry count on success (observability)', async () => {
    const browser = scriptedBrowser([makeFail(0), makeFail(0), makePass(0)])
    const r = await retryStepWithBackoff(browser, makeStep(), 0, makeFail(0), {
      budget: 3,
      initialSettleMs: 50,
      backoffMultiplier: 1.5,
      settleCapMs: 5000,
      startedAt: Date.now(),
      sleepFn: browser.sleepFn,
    })
    expect(r.description).toMatch(/\[retried×3\]/)
  })

  it('timeToVerdictMs is populated on all exit paths', async () => {
    const started = Date.now()
    // Success path
    const browser1 = scriptedBrowser([makePass(0)])
    const r1 = await retryStepWithBackoff(browser1, makeStep(), 0, makeFail(0), {
      budget: 2,
      initialSettleMs: 10,
      backoffMultiplier: 1.5,
      settleCapMs: 5000,
      startedAt: started,
      sleepFn: browser1.sleepFn,
    })
    expect(typeof r1.timeToVerdictMs).toBe('number')

    // Failure path
    const browser2 = scriptedBrowser([makeFail(0), makeFail(0)])
    const r2 = await retryStepWithBackoff(browser2, makeStep(), 0, makeFail(0), {
      budget: 2,
      initialSettleMs: 10,
      backoffMultiplier: 1.5,
      settleCapMs: 5000,
      startedAt: started,
      sleepFn: browser2.sleepFn,
    })
    expect(typeof r2.timeToVerdictMs).toBe('number')

    // Budget=0 path
    const browser3 = scriptedBrowser([])
    const r3 = await retryStepWithBackoff(browser3, makeStep(), 0, makeFail(0), {
      budget: 0,
      initialSettleMs: 10,
      backoffMultiplier: 1.5,
      settleCapMs: 5000,
      startedAt: started,
      sleepFn: browser3.sleepFn,
    })
    expect(typeof r3.timeToVerdictMs).toBe('number')
  })

  it('preserves stepIndex across retries (propagated to stubbed browser)', async () => {
    const browser = scriptedBrowser([makePass(7)])
    const r = await retryStepWithBackoff(browser, makeStep(), 7, makeFail(7), {
      budget: 2,
      initialSettleMs: 1,
      backoffMultiplier: 1.5,
      settleCapMs: 5000,
      startedAt: Date.now(),
      sleepFn: browser.sleepFn,
    })
    expect(r.stepIndex).toBe(7)
  })
})
