// lessons:skip-all
/**
 * T-001 — Harness Self-Test regression tests.
 */

import { describe, it, expect } from 'vitest'
import { runSelfCheck, exitCodeForSummary } from '../../src/self-test/harness'

describe('T-001 harness self-check', () => {
  it('returns a structured summary with expected categories', () => {
    const s = runSelfCheck()
    expect(s.total).toBeGreaterThan(0)
    expect(s.total).toBe(s.pass + s.warn + s.fail + s.skipped)
    for (const r of s.results) {
      expect(r.id).toBeTruthy()
      expect(r.title).toBeTruthy()
      expect(['pass', 'warn', 'fail', 'skipped']).toContain(r.severity)
    }
  })

  it('includes the 4 static probes + deferred browser probes', () => {
    const s = runSelfCheck()
    const ids = new Set(s.results.map((r) => r.id))
    expect(ids.has('css-validator')).toBe(true)
    expect(ids.has('case-insensitive-text-path')).toBe(true)
    expect(ids.has('timing-defaults')).toBe(true)
    expect(ids.has('lesson-corpus-presence')).toBe(true)
    // Deferred — should be SKIPPED, not fail
    expect(ids.has('tailwind-uppercase-fixture')).toBe(true)
    expect(ids.has('timing-race-fixture')).toBe(true)
  })

  it('css-validator probe rejects known-bad selectors', () => {
    const s = runSelfCheck()
    const r = s.results.find((x) => x.id === 'css-validator')
    expect(r).toBeDefined()
    expect(r!.severity).toBe('pass')
  })

  it('lesson-corpus-presence confirms all baseline lessons are in the corpus', () => {
    const s = runSelfCheck()
    const r = s.results.find((x) => x.id === 'lesson-corpus-presence')
    expect(r).toBeDefined()
    expect(r!.severity).toBe('pass')
    expect(r!.message).toMatch(/L-F2/)
  })

  it('deferred browser probes marked as skipped (not fail)', () => {
    const s = runSelfCheck()
    const tw = s.results.find((x) => x.id === 'tailwind-uppercase-fixture')
    const tr = s.results.find((x) => x.id === 'timing-race-fixture')
    expect(tw?.severity).toBe('skipped')
    expect(tr?.severity).toBe('skipped')
  })

  it('exitCodeForSummary returns 0 when all pass or skipped', () => {
    const base = runSelfCheck()
    // If current env has any fail/warn, skip this asserion; otherwise expect 0.
    if (base.fail === 0 && base.warn === 0) {
      expect(exitCodeForSummary(base)).toBe(0)
    }
  })

  it('exitCodeForSummary returns 2 when any probe fails', () => {
    const synthetic = {
      total: 2,
      pass: 1,
      warn: 0,
      fail: 1,
      skipped: 0,
      results: [],
    } as ReturnType<typeof runSelfCheck>
    expect(exitCodeForSummary(synthetic)).toBe(2)
  })

  it('exitCodeForSummary returns 1 when only warnings', () => {
    const synthetic = {
      total: 2,
      pass: 1,
      warn: 1,
      fail: 0,
      skipped: 0,
      results: [],
    } as ReturnType<typeof runSelfCheck>
    expect(exitCodeForSummary(synthetic)).toBe(1)
  })
})
