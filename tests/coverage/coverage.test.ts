/**
 * T-002 — Feature Coverage Matrix — Unit Tests
 *
 * Validates:
 *   - parseCoverageYaml: valid + all error paths
 *   - computeStats: ratio formula, severity breakdown
 *   - buildReport: ordering (missing first, severity desc)
 *   - generateHtmlReport: structure sanity
 *   - coverageCommand: exit-code semantics (via mock process.exit)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { parseCoverageYaml, computeStats, buildReport, loadCoverageForProject } from '../../src/coverage/loader'
import { generateHtmlReport } from '../../src/coverage/html-report'
import { coverageCommand } from '../../src/cli/commands/coverage'

// ─── fixtures ──────────────────────────────────────────────────────────────

const VALID_YAML = `
feature: four-way-match
owner: procuchaingo2
scenarios:
  - id: Q1
    name: invoice qty > received
    category: quantity
    severity: high
    covered_by: tests/matching/over-invoice.spec.ts
    status: covered
  - id: Q2
    name: invoice qty < received
    category: quantity
    severity: medium
    covered_by: null
    status: missing
  - id: Q3
    name: exact match
    severity: critical
    covered_by: null
    status: missing
  - id: Q4
    name: legacy-only route
    severity: low
    covered_by: null
    status: skipped
`

const MINIMAL_VALID_YAML = `
feature: smoke
owner: tester
scenarios:
  - id: S1
    name: basic check
    severity: info
    covered_by: null
    status: covered
`

// ─── parseCoverageYaml ──────────────────────────────────────────────────────

describe('T-002 Coverage Matrix', () => {
  describe('parseCoverageYaml() — valid', () => {
    it('parses a complete YAML into CoverageMatrix', () => {
      const result = parseCoverageYaml(VALID_YAML)
      expect('message' in result).toBe(false)
      if ('message' in result) return
      expect(result.feature).toBe('four-way-match')
      expect(result.owner).toBe('procuchaingo2')
      expect(result.scenarios).toHaveLength(4)
    })

    it('coerces covered_by: null to null', () => {
      const result = parseCoverageYaml(VALID_YAML)
      if ('message' in result) throw new Error(result.message)
      const q2 = result.scenarios.find((s) => s.id === 'Q2')
      expect(q2?.covered_by).toBeNull()
    })

    it('optional category and notes are undefined when absent', () => {
      const result = parseCoverageYaml(MINIMAL_VALID_YAML)
      if ('message' in result) throw new Error(result.message)
      expect(result.scenarios[0].category).toBeUndefined()
    })
  })

  describe('parseCoverageYaml() — errors', () => {
    it('returns error on invalid YAML syntax', () => {
      const result = parseCoverageYaml('feature: [unclosed')
      expect('message' in result).toBe(true)
    })

    it('returns error when feature field is missing', () => {
      const result = parseCoverageYaml('owner: x\nscenarios: []')
      expect('message' in result).toBe(true)
      if ('message' in result) expect(result.message).toContain('feature')
    })

    it('returns error when owner field is missing', () => {
      const result = parseCoverageYaml('feature: x\nscenarios: []')
      expect('message' in result).toBe(true)
    })

    it('returns error when scenarios is not an array', () => {
      const result = parseCoverageYaml('feature: x\nowner: y\nscenarios: "bad"')
      expect('message' in result).toBe(true)
    })

    it('returns error on invalid severity', () => {
      const result = parseCoverageYaml(`
feature: x
owner: y
scenarios:
  - id: A1
    name: test
    severity: ultra-high
    covered_by: null
    status: covered
`)
      expect('message' in result).toBe(true)
      if ('message' in result) expect(result.message).toContain('severity')
    })

    it('returns error on invalid status', () => {
      const result = parseCoverageYaml(`
feature: x
owner: y
scenarios:
  - id: A1
    name: test
    severity: high
    covered_by: null
    status: pending
`)
      expect('message' in result).toBe(true)
      if ('message' in result) expect(result.message).toContain('status')
    })
  })

  // ─── computeStats ─────────────────────────────────────────────────────────

  describe('computeStats()', () => {
    it('computes ratio = covered / (total - skipped)', () => {
      const matrix = parseCoverageYaml(VALID_YAML)
      if ('message' in matrix) throw new Error(matrix.message)
      const stats = computeStats(matrix)
      // 1 covered, 1 skipped, 2 missing → ratio = 1/3
      expect(stats.total).toBe(4)
      expect(stats.covered).toBe(1)
      expect(stats.skipped).toBe(1)
      expect(stats.missing).toBe(2)
      expect(stats.coverage_ratio).toBeCloseTo(1 / 3)
    })

    it('breaks down missing by severity', () => {
      const matrix = parseCoverageYaml(VALID_YAML)
      if ('message' in matrix) throw new Error(matrix.message)
      const stats = computeStats(matrix)
      expect(stats.critical_missing).toBe(1)
      expect(stats.high_missing).toBe(0) // Q1 is covered, not missing
      expect(stats.medium_missing).toBe(1)
    })

    it('returns ratio = 1 when all scenarios are skipped', () => {
      const matrix = parseCoverageYaml(`
feature: x
owner: y
scenarios:
  - id: A1
    name: n
    severity: info
    covered_by: null
    status: skipped
`)
      if ('message' in matrix) throw new Error(matrix.message)
      expect(computeStats(matrix).coverage_ratio).toBe(1)
    })
  })

  // ─── buildReport ordering ─────────────────────────────────────────────────

  describe('buildReport()', () => {
    it('orders missing scenarios before covered', () => {
      const matrix = parseCoverageYaml(VALID_YAML)
      if ('message' in matrix) throw new Error(matrix.message)
      const report = buildReport(matrix, 'test.yaml')
      const statuses = report.ordered_scenarios.map((s) => s.status)
      const firstNonMissing = statuses.findIndex((s) => s !== 'missing')
      const lastMissing = statuses.lastIndexOf('missing')
      expect(lastMissing).toBeLessThan(firstNonMissing === -1 ? Infinity : firstNonMissing)
    })

    it('orders missing by severity descending (critical before medium)', () => {
      const matrix = parseCoverageYaml(VALID_YAML)
      if ('message' in matrix) throw new Error(matrix.message)
      const report = buildReport(matrix, 'test.yaml')
      const missing = report.ordered_scenarios.filter((s) => s.status === 'missing')
      expect(missing[0].severity).toBe('critical')
      expect(missing[1].severity).toBe('medium')
    })
  })

  // ─── generateHtmlReport ───────────────────────────────────────────────────

  describe('generateHtmlReport()', () => {
    it('produces a valid HTML string', () => {
      const matrix = parseCoverageYaml(VALID_YAML)
      if ('message' in matrix) throw new Error(matrix.message)
      const report = buildReport(matrix, 'test.yaml')
      const html = generateHtmlReport([report])
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('four-way-match')
    })

    it('includes threshold row when failUnder is provided', () => {
      const matrix = parseCoverageYaml(VALID_YAML)
      if ('message' in matrix) throw new Error(matrix.message)
      const report = buildReport(matrix, 'test.yaml')
      const html = generateHtmlReport([report], { failUnder: 0.9 })
      expect(html).toContain('--fail-under')
      expect(html).toContain('FAIL') // ratio ~33% < 90%
    })

    it('escapes HTML special characters in feature name', () => {
      const xss = parseCoverageYaml(`
feature: "<script>alert(1)</script>"
owner: test
scenarios:
  - id: X1
    name: xss check
    severity: info
    covered_by: null
    status: covered
`)
      if ('message' in xss) throw new Error(xss.message)
      const html = generateHtmlReport([buildReport(xss, 'x.yaml')])
      expect(html).not.toContain('<script>')
      expect(html).toContain('&lt;script&gt;')
    })

    it('handles empty reports array', () => {
      const html = generateHtmlReport([])
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('0')
    })
  })

  // ─── coverageCommand exit codes ───────────────────────────────────────────

  describe('coverageCommand() — exit codes', () => {
    let exitSpy: ReturnType<typeof vi.spyOn>
    let tmpDir: string

    beforeEach(() => {
      exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tester-cov-'))
      fs.mkdirSync(path.join(tmpDir, 'coverage'))
    })

    afterEach(() => {
      exitSpy.mockRestore()
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    function writeCoverage(name: string, yaml: string): string {
      const file = path.join(tmpDir, 'coverage', name)
      fs.writeFileSync(file, yaml, 'utf8')
      return file
    }

    it('exits 0 when all scenarios covered', async () => {
      writeCoverage('ok.yaml', `
feature: ok
owner: test
scenarios:
  - id: A1
    name: all good
    severity: high
    covered_by: tests/x.spec.ts
    status: covered
`)
      await coverageCommand({ project: tmpDir })
      expect(exitSpy).toHaveBeenCalledWith(0)
    })

    it('exits 1 when critical scenario is missing', async () => {
      writeCoverage('crit.yaml', `
feature: critical-feature
owner: test
scenarios:
  - id: C1
    name: critical scenario
    severity: critical
    covered_by: null
    status: missing
`)
      await coverageCommand({ project: tmpDir })
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('exits 1 when coverage_ratio < fail-under threshold', async () => {
      writeCoverage('low.yaml', `
feature: low-cov
owner: test
scenarios:
  - id: L1
    name: covered
    severity: info
    covered_by: tests/x.spec.ts
    status: covered
  - id: L2
    name: missing1
    severity: info
    covered_by: null
    status: missing
  - id: L3
    name: missing2
    severity: info
    covered_by: null
    status: missing
`)
      await coverageCommand({ project: tmpDir, failUnder: 0.9 })
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('exits 2 when project has no coverage/*.yaml files', async () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tester-empty-'))
      try {
        await coverageCommand({ project: emptyDir })
        expect(exitSpy).toHaveBeenCalledWith(2)
      } finally {
        fs.rmSync(emptyDir, { recursive: true, force: true })
      }
    })

    it('writes HTML report file when --report html is set', async () => {
      writeCoverage('rpt.yaml', `
feature: rpt-feature
owner: test
scenarios:
  - id: R1
    name: basic
    severity: info
    covered_by: tests/x.spec.ts
    status: covered
`)
      const outPath = path.join(tmpDir, 'out.html')
      await coverageCommand({ project: tmpDir, report: 'html', out: outPath })
      expect(fs.existsSync(outPath)).toBe(true)
      const content = fs.readFileSync(outPath, 'utf8')
      expect(content).toContain('rpt-feature')
    })
  })
})
