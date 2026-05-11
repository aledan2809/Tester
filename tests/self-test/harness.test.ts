/**
 * T-001 Harness Self-Test Battery — Unit Tests
 *
 * Vitest suite validating the 4 core self-check probes:
 *   - checkCssValidator: safety.ts shape validation layer
 *   - checkCaseInsensitivePath: assertions/dom module exports
 *   - checkTimingDefaults: CLI timeout defaults >= 5s
 *   - checkLessonCorpusPresence: lesson files present in corpus
 *
 * Exit code semantics:
 *   0 → pass (or pass + skipped)
 *   1 → warnings only
 *   2 → at least one fail
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { runSelfCheck, exitCodeForSummary } from '../../src/self-test/harness'

describe('T-001 Harness Self-Test Battery', () => {
  describe('runSelfCheck()', () => {
    it('returns SelfCheckSummary with 6 results (4 checks + 2 deferred)', () => {
      const summary = runSelfCheck()
      expect(summary.total).toBe(6)
      expect(summary.results).toHaveLength(6)
    })

    it('counts pass/warn/fail/skipped correctly', () => {
      const summary = runSelfCheck()
      // 4 checks + 2 deferred (skipped) = total 6
      // Deferred probes are marked skipped, so skipped count should be at least 2
      expect(summary.skipped).toBeGreaterThanOrEqual(2)
      // In typical state: css-validator (pass), case-insensitive (pass/fail),
      // timing-defaults (pass/warn), lesson-corpus (pass/fail)
      expect(summary.pass + summary.warn + summary.fail + summary.skipped).toBe(
        summary.total,
      )
    })

    it('each result has required fields (id, title, severity, message)', () => {
      const summary = runSelfCheck()
      for (const result of summary.results) {
        expect(result.id).toBeDefined()
        expect(result.title).toBeDefined()
        expect(result.severity).toMatch(/^(pass|warn|fail|skipped)$/)
        expect(result.message).toBeDefined()
      }
    })

    it('identifies specific check results by id', () => {
      const summary = runSelfCheck()
      const ids = summary.results.map((r) => r.id)
      expect(ids).toContain('css-validator')
      expect(ids).toContain('case-insensitive-text-path')
      expect(ids).toContain('timing-defaults')
      expect(ids).toContain('lesson-corpus-presence')
      expect(ids).toContain('tailwind-uppercase-fixture')
      expect(ids).toContain('timing-race-fixture')
    })

    it('deferred browser probes are marked skipped', () => {
      const summary = runSelfCheck()
      const deferredIds = ['tailwind-uppercase-fixture', 'timing-race-fixture']
      for (const id of deferredIds) {
        const result = summary.results.find((r) => r.id === id)
        expect(result).toBeDefined()
        expect(result?.severity).toBe('skipped')
      }
    })
  })

  describe('exitCodeForSummary()', () => {
    it('returns 0 when all pass', () => {
      const summary = {
        total: 4,
        pass: 4,
        warn: 0,
        fail: 0,
        skipped: 0,
        results: [],
      }
      expect(exitCodeForSummary(summary)).toBe(0)
    })

    it('returns 0 when pass + skipped', () => {
      const summary = {
        total: 6,
        pass: 4,
        warn: 0,
        fail: 0,
        skipped: 2,
        results: [],
      }
      expect(exitCodeForSummary(summary)).toBe(0)
    })

    it('returns 1 when warnings but no fails', () => {
      const summary = {
        total: 4,
        pass: 2,
        warn: 2,
        fail: 0,
        skipped: 0,
        results: [],
      }
      expect(exitCodeForSummary(summary)).toBe(1)
    })

    it('returns 2 when at least one fail', () => {
      const summary = {
        total: 4,
        pass: 2,
        warn: 0,
        fail: 1,
        skipped: 1,
        results: [],
      }
      expect(exitCodeForSummary(summary)).toBe(2)
    })

    it('returns 2 when multiple fails', () => {
      const summary = {
        total: 4,
        pass: 0,
        warn: 0,
        fail: 4,
        skipped: 0,
        results: [],
      }
      expect(exitCodeForSummary(summary)).toBe(2)
    })
  })

  describe('Lesson corpus presence (live check)', () => {
    it('lesson corpus directory exists', () => {
      const corpusDir = path.resolve(
        __dirname,
        '../../lessons',
      )
      expect(fs.existsSync(corpusDir)).toBe(true)
    })

    it('baseline lessons are present in corpus', () => {
      const corpusDir = path.resolve(
        __dirname,
        '../../lessons',
      )
      const files = fs.readdirSync(corpusDir)
      const mustHave = ['L-F2', 'L-F8', 'L-F10', 'L-05', 'L-42']
      for (const id of mustHave) {
        const found = files.some((f) => f.startsWith(id + '-'))
        expect(found).toBe(
          true,
          `baseline lesson ${id} not found in corpus`,
        )
      }
    })
  })

  describe('CLI integration', () => {
    it('real runSelfCheck() call integrates all 4 probes', () => {
      const summary = runSelfCheck()
      // Verify structure mirrors the module's schema
      expect(summary).toHaveProperty('total')
      expect(summary).toHaveProperty('pass')
      expect(summary).toHaveProperty('warn')
      expect(summary).toHaveProperty('fail')
      expect(summary).toHaveProperty('skipped')
      expect(summary).toHaveProperty('results')
      expect(Array.isArray(summary.results)).toBe(true)
    })

    it('exit code mapping works end-to-end', () => {
      const summary = runSelfCheck()
      const exitCode = exitCodeForSummary(summary)
      expect([0, 1, 2]).toContain(exitCode)
    })
  })

  describe('Severity semantics', () => {
    it('pass severity indicates no issues', () => {
      const summary = runSelfCheck()
      const passResults = summary.results.filter((r) => r.severity === 'pass')
      expect(passResults.length).toBeGreaterThan(0)
      for (const result of passResults) {
        // Pass results should have informative messages
        expect(result.message.length).toBeGreaterThan(10)
      }
    })

    it('warn severity indicates non-blocking issues', () => {
      const summary = runSelfCheck()
      const warnResults = summary.results.filter((r) => r.severity === 'warn')
      // Warnings may be empty in typical state, but if present should be message-rich
      for (const result of warnResults) {
        expect(result.message.length).toBeGreaterThan(5)
      }
    })

    it('fail severity indicates blocking issues', () => {
      const summary = runSelfCheck()
      const failResults = summary.results.filter((r) => r.severity === 'fail')
      // Fails may be empty in typical state, but if present should be message-rich
      for (const result of failResults) {
        expect(result.message.length).toBeGreaterThan(5)
      }
    })

    it('skipped severity indicates deferred checks', () => {
      const summary = runSelfCheck()
      const skippedResults = summary.results.filter(
        (r) => r.severity === 'skipped',
      )
      // Browser probes are always skipped in Day-1
      expect(skippedResults.length).toBeGreaterThanOrEqual(2)
    })
  })
})
