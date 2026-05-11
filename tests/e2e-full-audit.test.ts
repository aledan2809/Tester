/**
 * Behavior tests for e2e-full-audit pure utilities.
 *
 * Tests cover the three exported pure functions:
 *   - resolveHistoryDir  — typeof guard (Commander optional-arg edge case)
 *   - computeScore       — score formula + verdict thresholds
 *   - writeMarkdownReport — report structure + file output
 *
 * No browser or Puppeteer required — these are all side-effect-free
 * (writeMarkdownReport writes to a temp dir which is cleaned up).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  resolveHistoryDir,
  computeScore,
  writeMarkdownReport,
  detectInfiniteLoading,
  type StepOutcome,
  type E2EFullAuditResult,
} from '../src/cli/commands/e2e-full-audit.js'
import { vi } from 'vitest'

// ── resolveHistoryDir ─────────────────────────────────────────────────────────

describe('resolveHistoryDir', () => {
  const outDir = '/tmp/test-out'

  it('returns outDir/history when opts.history is undefined', () => {
    expect(resolveHistoryDir({}, outDir)).toBe(path.join(outDir, 'history'))
  })

  it('returns outDir/history when opts.history is false (--no-history)', () => {
    expect(resolveHistoryDir({ history: false }, outDir)).toBe(path.join(outDir, 'history'))
  })

  it('returns outDir/history when opts.history is true (--history without value)', () => {
    // Commander sets opts.history = true (boolean) when flag given without value.
    // Must NOT call path.resolve(true) which would produce cwd/true.
    expect(resolveHistoryDir({ history: true }, outDir)).toBe(path.join(outDir, 'history'))
  })

  it('resolves custom path when opts.history is a string', () => {
    const custom = '/custom/history/dir'
    expect(resolveHistoryDir({ history: custom }, outDir)).toBe(path.resolve(custom))
  })

  it('resolves relative string path against cwd, not outDir', () => {
    const relative = 'my-history'
    const result = resolveHistoryDir({ history: relative }, outDir)
    // path.resolve(relative) = path.join(cwd, relative)
    expect(result).toBe(path.resolve(relative))
    expect(result).not.toContain(outDir)
  })
})

// ── computeScore ──────────────────────────────────────────────────────────────

function makeStep(status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP', step = 1): StepOutcome {
  return { step, name: `Step ${step}`, status, durationMs: 10, details: '' }
}

describe('computeScore', () => {
  it('returns 100/PASS for all-pass steps', () => {
    const steps = [makeStep('PASS', 1), makeStep('PASS', 2), makeStep('PASS', 3)]
    const { overallScore, verdict, failCount, passCount, skipCount } = computeScore(steps)
    expect(overallScore).toBe(100)
    expect(verdict).toBe('PASS')
    expect(failCount).toBe(0)
    expect(passCount).toBe(3)
    expect(skipCount).toBe(0)
  })

  it('returns FAIL verdict when any step fails', () => {
    const steps = [makeStep('PASS', 1), makeStep('FAIL', 2), makeStep('PASS', 3)]
    const { verdict, failCount } = computeScore(steps)
    expect(verdict).toBe('FAIL')
    expect(failCount).toBe(1)
  })

  it('returns WARN when score < 80 and no failures', () => {
    // 1 PASS + 4 WARN = 20% pass rate → score = 20 → WARN
    const steps = [makeStep('PASS', 1), makeStep('WARN', 2), makeStep('WARN', 3), makeStep('WARN', 4), makeStep('WARN', 5)]
    const { overallScore, verdict } = computeScore(steps)
    expect(overallScore).toBe(20)
    expect(verdict).toBe('WARN')
  })

  it('excludes SKIP steps from totalRun denominator', () => {
    // 4 PASS + 6 SKIP = 4/4 = 100%
    const steps = [
      makeStep('PASS', 1), makeStep('PASS', 2), makeStep('PASS', 3), makeStep('PASS', 4),
      makeStep('SKIP', 5), makeStep('SKIP', 6), makeStep('SKIP', 7), makeStep('SKIP', 8),
      makeStep('SKIP', 9), makeStep('SKIP', 10),
    ]
    const { overallScore, verdict, skipCount } = computeScore(steps)
    expect(overallScore).toBe(100)
    expect(verdict).toBe('PASS')
    expect(skipCount).toBe(6)
  })

  it('returns score 0 and WARN when all steps are SKIP', () => {
    const steps = [makeStep('SKIP', 1), makeStep('SKIP', 2)]
    const { overallScore, verdict } = computeScore(steps)
    expect(overallScore).toBe(0)
    expect(verdict).toBe('WARN')
  })

  it('rounds score to nearest integer', () => {
    // 2 PASS + 1 FAIL = 2/3 = 66.67% → rounds to 67
    const steps = [makeStep('PASS', 1), makeStep('PASS', 2), makeStep('FAIL', 3)]
    const { overallScore } = computeScore(steps)
    expect(overallScore).toBe(67)
  })

  it('boundary: score exactly 80 = PASS (not WARN)', () => {
    // 4 PASS + 1 FAIL + ... need 80% pass rate without any FAIL
    // 4 PASS + 1 WARN = 4/5 = 80
    const steps = [makeStep('PASS', 1), makeStep('PASS', 2), makeStep('PASS', 3), makeStep('PASS', 4), makeStep('WARN', 5)]
    const { overallScore, verdict } = computeScore(steps)
    expect(overallScore).toBe(80)
    expect(verdict).toBe('PASS')
  })

  it('boundary: score 79 = WARN', () => {
    // Need 79% pass without FAIL: not cleanly achievable with small integers,
    // so test using WARN in denominator: 79 PASS + 21 WARN = 79/100
    const steps: StepOutcome[] = []
    for (let i = 0; i < 79; i++) steps.push(makeStep('PASS', i + 1))
    for (let i = 0; i < 21; i++) steps.push(makeStep('WARN', 80 + i))
    const { overallScore, verdict } = computeScore(steps)
    expect(overallScore).toBe(79)
    expect(verdict).toBe('WARN')
  })

  it('FAIL takes precedence over low score WARN', () => {
    // 1 PASS + 9 FAIL = 10% score, verdict must be FAIL not WARN
    const steps = [makeStep('PASS', 1), ...Array.from({ length: 9 }, (_, i) => makeStep('FAIL', i + 2))]
    const { verdict } = computeScore(steps)
    expect(verdict).toBe('FAIL')
  })

  it('includes Step 19 in score when called after push', () => {
    // Simulate: compute on 18 steps, push Step 19, recompute
    const steps: StepOutcome[] = Array.from({ length: 18 }, (_, i) => makeStep('PASS', i + 1))
    const preliminary = computeScore(steps)
    expect(preliminary.passCount).toBe(18)

    steps.push({ step: 19, name: 'Final report', status: 'PASS', durationMs: 5, details: 'ok' })
    const final = computeScore(steps)
    expect(final.passCount).toBe(19)
    expect(final.overallScore).toBe(100)
  })
})

// ── writeMarkdownReport ───────────────────────────────────────────────────────

function makeResult(overrides: Partial<E2EFullAuditResult> = {}): E2EFullAuditResult {
  return {
    url: 'https://example.com',
    startedAt: '2026-05-07T10:00:00.000Z',
    completedAt: '2026-05-07T10:01:00.000Z',
    totalDurationMs: 60_000,
    overallScore: 100,
    verdict: 'PASS',
    steps: [
      { step: 1, name: 'BFS Discovery', status: 'PASS', durationMs: 1000, details: '3 pages discovered' },
      { step: 2, name: 'Public surface', status: 'PASS', durationMs: 500, details: 'ok' },
    ],
    ...overrides,
  }
}

describe('writeMarkdownReport', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tester-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes a file to outDir and returns its path', () => {
    const result = makeResult()
    const mdPath = writeMarkdownReport(result, tmpDir)
    expect(fs.existsSync(mdPath)).toBe(true)
    expect(mdPath).toContain(tmpDir)
    expect(mdPath.endsWith('.md')).toBe(true)
  })

  it('includes URL, verdict, and score in the report', () => {
    const result = makeResult({ url: 'https://myapp.io', overallScore: 87, verdict: 'PASS' })
    const mdPath = writeMarkdownReport(result, tmpDir)
    const content = fs.readFileSync(mdPath, 'utf8')
    expect(content).toContain('https://myapp.io')
    expect(content).toContain('PASS')
    expect(content).toContain('87')
  })

  it('lists all steps in the step summary table', () => {
    const result = makeResult()
    const mdPath = writeMarkdownReport(result, tmpDir)
    const content = fs.readFileSync(mdPath, 'utf8')
    expect(content).toContain('BFS Discovery')
    expect(content).toContain('Public surface')
  })

  it('groups CRITICAL and HIGH findings under severity sections', () => {
    const result = makeResult({
      verdict: 'FAIL',
      overallScore: 50,
      steps: [
        {
          step: 1, name: 'Security', status: 'FAIL', durationMs: 100, details: 'headers missing',
          findings: [
            { severity: 'CRITICAL', message: 'No HSTS header', reproSteps: 'curl -I url', expected: 'HSTS present', actual: 'absent' },
            { severity: 'HIGH', message: 'CSP missing', expected: 'CSP header', actual: 'absent' },
          ],
        },
      ],
    })
    const mdPath = writeMarkdownReport(result, tmpDir)
    const content = fs.readFileSync(mdPath, 'utf8')
    expect(content).toContain('## CRITICAL Findings')
    expect(content).toContain('No HSTS header')
    expect(content).toContain('## HIGH Findings')
    expect(content).toContain('CSP missing')
  })

  it('shows "No findings" section when all steps pass', () => {
    const result = makeResult()
    const mdPath = writeMarkdownReport(result, tmpDir)
    const content = fs.readFileSync(mdPath, 'utf8')
    expect(content).toContain('No findings')
  })

  it('escapes pipe characters in step details (markdown table safety)', () => {
    const result = makeResult({
      steps: [{
        step: 1, name: 'Test', status: 'PASS', durationMs: 10,
        details: 'JSON: /path/a.json | MD: /path/b.md',
      }],
    })
    const mdPath = writeMarkdownReport(result, tmpDir)
    const content = fs.readFileSync(mdPath, 'utf8')
    // pipe in details should be escaped so it doesn't break the markdown table
    expect(content).toContain('\\|')
  })
})

// ── detectInfiniteLoading ────────────────────────────────────────────────────────

describe('detectInfiniteLoading', () => {
  it('injects auth cookies before navigating to page', async () => {
    const cookies = [
      { name: 'session', value: 'abc123', url: 'https://example.com' },
      { name: 'token', value: 'def456', url: 'https://example.com' },
    ]

    const mockPage = {
      setCookie: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(null),
      evaluate: vi.fn().mockResolvedValue([]),
    } as any

    await detectInfiniteLoading(mockPage, 'https://example.com/dashboard', 100, cookies)

    // Verify setCookie was called with the cookies before goto
    expect(mockPage.setCookie).toHaveBeenCalledWith(...cookies)
    expect(mockPage.setCookie).toHaveBeenCalledBefore(mockPage.goto as any)
  })

  it('navigates without cookies when authCookies is empty', async () => {
    const mockPage = {
      setCookie: vi.fn(),
      goto: vi.fn().mockResolvedValue(null),
      evaluate: vi.fn().mockResolvedValue([]),
    } as any

    await detectInfiniteLoading(mockPage, 'https://example.com/public', 100, [])

    // setCookie should not be called when no cookies provided
    expect(mockPage.setCookie).not.toHaveBeenCalled()
    expect(mockPage.goto).toHaveBeenCalledWith('https://example.com/public', expect.objectContaining({ waitUntil: 'networkidle2' }))
  })

  it('returns hasInfiniteLoad=false when no spinners found', async () => {
    const mockPage = {
      setCookie: vi.fn(),
      goto: vi.fn(),
      evaluate: vi.fn().mockResolvedValue(false),
    } as any

    const result = await detectInfiniteLoading(mockPage, 'https://example.com/page', 50)

    expect(result.hasInfiniteLoad).toBe(false)
    expect(result.selectors).toEqual([])
  })

  it('returns hasInfiniteLoad=true when spinners found', async () => {
    const visibleSelectors = ['.loading', '[aria-busy="true"]']
    const mockPage = {
      setCookie: vi.fn(),
      goto: vi.fn(),
      evaluate: vi.fn().mockImplementation((fn, sel) =>
        Promise.resolve(visibleSelectors.includes(sel))
      ),
    } as any

    const result = await detectInfiniteLoading(mockPage, 'https://example.com/page', 50)

    expect(result.hasInfiniteLoad).toBe(true)
    expect(result.selectors).toContain('.loading')
    expect(result.selectors).toContain('[aria-busy="true"]')
  })
})
