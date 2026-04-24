// lessons:skip-all
/**
 * T-B3 — Triage decision tests.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock SDK to avoid network hits — same pattern as classifier.test.ts.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn(() => Promise.reject(new Error('mocked'))) }
    constructor(_opts: unknown) {}
  },
}))

import { triageFailure, accumulateSplit, emptySplit } from '../../src/triage/decision'
import { _resetClassifCountForTests } from '../../src/lessons/classifier'

beforeEach(() => {
  _resetClassifCountForTests()
  delete process.env.ANTHROPIC_API_KEY
})

describe('T-B3 triageFailure — verdict → route mapping', () => {
  it('HARNESS_BUG (invalid selector) → tester-self', async () => {
    const d = await triageFailure({
      errorMessage: "'a[href!=\"/x\"]' is not a valid selector.",
    })
    expect(d.verdict).toBe('HARNESS_BUG')
    expect(d.route).toBe('tester-self')
  })

  it('ENV_MISCONFIG (ECONNREFUSED) → env-fix', async () => {
    const d = await triageFailure({ errorMessage: 'ECONNREFUSED 127.0.0.1:1' })
    expect(d.verdict).toBe('ENV_MISCONFIG')
    expect(d.route).toBe('env-fix')
  })

  it('FLAKE (Navigation timeout) → flake-retry', async () => {
    const d = await triageFailure({ errorMessage: 'Navigation timeout of 30000 ms exceeded' })
    expect(d.verdict).toBe('FLAKE')
    expect(d.route).toBe('flake-retry')
  })

  it('generic assertion → PRODUCT_BUG → guru', async () => {
    const d = await triageFailure({ assertion: 'expect(total).toBe(99)' })
    expect(d.verdict).toBe('PRODUCT_BUG')
    expect(d.route).toBe('guru')
  })

  it('low-confidence HARNESS_BUG routes to guru under minConfidence gate', async () => {
    // Default heuristic HARNESS_BUG confidence=0.7; set minConfidence above it
    const d = await triageFailure(
      { errorMessage: "'a[x!=y]' is not a valid selector." },
      { minConfidence: 0.95 },
    )
    expect(d.verdict).toBe('HARNESS_BUG')
    expect(d.route).toBe('guru')
  })
})

describe('T-B3 accumulateSplit', () => {
  it('tallies routes per iteration for loop metadata', async () => {
    let split = emptySplit()
    const harness = await triageFailure({ errorMessage: "'x' is not a valid selector." })
    split = accumulateSplit(split, harness)
    const env = await triageFailure({ errorMessage: 'ECONNREFUSED' })
    split = accumulateSplit(split, env)
    const product = await triageFailure({ assertion: 'expect(x).toBe(1)' })
    split = accumulateSplit(split, product)
    const flake = await triageFailure({ errorMessage: 'Navigation timeout of 30000 ms exceeded' })
    split = accumulateSplit(split, flake)

    expect(split.tester_self).toBe(1)
    expect(split.env_fix).toBe(1)
    expect(split.guru).toBe(1)
    expect(split.flake_retry).toBe(1)
  })
})
