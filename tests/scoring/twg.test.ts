// lessons:skip-all
/**
 * T-B1 — TWG scoring regression tests.
 */

import { describe, it, expect } from 'vitest'
import { computeTwgScore, renderTwgScoreAscii } from '../../src/scoring/twg'

describe('T-B1 computeTwgScore', () => {
  it('all-passing + full-coverage → score=100%, meets_goal=true', () => {
    const r = computeTwgScore({
      tests_passing: 10,
      tests_total: 10,
      scenarios_covered: 10,
      scenarios_declared: 10,
    })
    expect(r.pass_rate).toBe(1)
    expect(r.coverage_rate).toBe(1)
    expect(r.score_percent).toBe(100)
    expect(r.meets_goal).toBe(true)
  })

  it('all-passing but half-declared → score=50%, meets_goal=false (coverage < target)', () => {
    const r = computeTwgScore({
      tests_passing: 10,
      tests_total: 10,
      scenarios_covered: 10,
      scenarios_declared: 20,
    })
    expect(r.pass_rate).toBe(1)
    expect(r.coverage_rate).toBe(0.5)
    expect(r.score_percent).toBe(50)
    expect(r.meets_goal).toBe(false)
    expect(r.gate_reason).toMatch(/coverage_rate/)
  })

  it('90% pass + full coverage → meets_goal=false (pass_rate<100%)', () => {
    const r = computeTwgScore({
      tests_passing: 9,
      tests_total: 10,
      scenarios_covered: 10,
      scenarios_declared: 10,
    })
    expect(r.meets_goal).toBe(false)
    expect(r.gate_reason).toMatch(/pass_rate/)
  })

  it('custom coverage target via opts', () => {
    const r = computeTwgScore(
      {
        tests_passing: 10,
        tests_total: 10,
        scenarios_covered: 7,
        scenarios_declared: 10,
      },
      { coverageTarget: 0.7 },
    )
    expect(r.meets_goal).toBe(true)
    expect(r.coverage_target).toBe(0.7)
  })

  it('zero denominators do not NaN — return zero rates', () => {
    const r = computeTwgScore({
      tests_passing: 0,
      tests_total: 0,
      scenarios_covered: 0,
      scenarios_declared: 0,
    })
    expect(r.pass_rate).toBe(0)
    expect(r.coverage_rate).toBe(0)
    expect(r.score).toBe(0)
  })

  it('clamps rates to [0,1]', () => {
    const r = computeTwgScore({
      tests_passing: 15,
      tests_total: 10, // would produce 1.5
      scenarios_covered: 10,
      scenarios_declared: 10,
    })
    expect(r.pass_rate).toBe(1)
  })

  it('today 4-way-match example: 10 covered / 20 declared at 100% pass → score 50%', () => {
    // Explicit spec from TODO_PERSISTENT T-B1 "Done when" criterion.
    const r = computeTwgScore({
      tests_passing: 10,
      tests_total: 10,
      scenarios_covered: 10,
      scenarios_declared: 20,
    })
    expect(r.score_percent).toBe(50)
    expect(r.meets_goal).toBe(false)
  })
})

describe('T-B1 renderTwgScoreAscii', () => {
  it('contains MEETS GOAL on success', () => {
    const r = computeTwgScore({
      tests_passing: 10,
      tests_total: 10,
      scenarios_covered: 10,
      scenarios_declared: 10,
    })
    expect(renderTwgScoreAscii(r)).toMatch(/MEETS GOAL/)
  })

  it('contains MISS + reason on failure', () => {
    const r = computeTwgScore({
      tests_passing: 5,
      tests_total: 10,
      scenarios_covered: 10,
      scenarios_declared: 10,
    })
    expect(renderTwgScoreAscii(r)).toMatch(/MISS/)
  })
})
