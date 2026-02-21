/**
 * Reporter Tests
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { generateJsonReport, formatCiSummary } from '../../src/reporter/json'
import { generateHtmlReport } from '../../src/reporter/html'
import { generateReports } from '../../src/reporter/index'
import { readFileSync, existsSync, rmSync } from 'fs'
import { resolve } from 'path'
import type { TestRun, TestSummary, SiteMap } from '../../src/core/types'

const TEST_OUTPUT = resolve(__dirname, '../../.test-reports')

function makeTestRun(overrides: Partial<TestRun> = {}): TestRun {
  const summary: TestSummary = {
    totalScenarios: 3,
    passed: 2,
    failed: 1,
    skipped: 0,
    errors: 0,
    byCategory: {
      auth: { passed: 0, failed: 0 },
      navigation: { passed: 2, failed: 0 },
      forms: { passed: 0, failed: 1 },
      functionality: { passed: 0, failed: 0 },
      error_handling: { passed: 0, failed: 0 },
      visual: { passed: 0, failed: 0 },
      a11y: { passed: 0, failed: 0 },
      performance: { passed: 0, failed: 0 },
    },
    visualRegressions: 0,
    a11yViolations: { critical: 1, serious: 0, moderate: 2, minor: 1 },
    avgLoadTimeMs: 450,
    slowestPages: [{ url: 'https://example.com/slow', loadTimeMs: 1200 }],
    consoleErrors: [{ message: 'test error', level: 'error', url: 'https://example.com' }],
    networkErrors: [],
    brokenLinks: [{ url: 'https://example.com/404', linkedFrom: 'https://example.com', statusCode: 404 }],
    overallScore: 72,
  }

  const siteMap: SiteMap = {
    baseUrl: 'https://example.com',
    pages: [],
    totalPages: 5,
    crawlDurationMs: 3000,
  }

  return {
    id: 'test-run-1',
    url: 'https://example.com',
    startedAt: new Date('2026-02-21T10:00:00Z'),
    completedAt: new Date('2026-02-21T10:05:00Z'),
    durationMs: 300000,
    config: {},
    siteMap,
    scenarios: [
      {
        scenario: { id: 's1', name: 'Navigate Home', description: 'Open home page', category: 'navigation', priority: 'high', steps: [], assertions: [], tags: [] },
        status: 'passed',
        steps: [{ stepIndex: 0, action: 'navigate', description: 'Go to home', success: true, durationMs: 500 }],
        assertions: [],
        durationMs: 500,
        screenshots: [{ label: 'After navigation', data: 'base64data' }],
      },
      {
        scenario: { id: 's2', name: 'Navigate About', description: 'Open about page', category: 'navigation', priority: 'medium', steps: [], assertions: [], tags: [] },
        status: 'passed',
        steps: [],
        assertions: [],
        durationMs: 300,
        screenshots: [],
      },
      {
        scenario: { id: 's3', name: 'Submit Contact Form', description: 'Fill contact form', category: 'forms', priority: 'high', steps: [], assertions: [], tags: [] },
        status: 'failed',
        steps: [{ stepIndex: 0, action: 'fill', description: 'Fill email', success: false, error: 'Element not found', durationMs: 100 }],
        assertions: [],
        durationMs: 100,
        error: 'Step 0 failed',
        screenshots: [],
      },
    ],
    summary,
    ...overrides,
  }
}

describe('JSON Reporter', () => {
  afterEach(() => {
    if (existsSync(TEST_OUTPUT)) rmSync(TEST_OUTPUT, { recursive: true })
  })

  it('generates JSON report file', () => {
    const run = makeTestRun()
    const path = generateJsonReport(run, { outputPath: resolve(TEST_OUTPUT, 'results.json') })
    expect(existsSync(path)).toBe(true)

    const content = JSON.parse(readFileSync(path, 'utf-8'))
    expect(content.url).toBe('https://example.com')
    expect(content.summary.overallScore).toBe(72)
  })

  it('strips screenshots when includeScreenshots is false', () => {
    const run = makeTestRun()
    const path = generateJsonReport(run, { outputPath: resolve(TEST_OUTPUT, 'results.json'), includeScreenshots: false })

    const content = JSON.parse(readFileSync(path, 'utf-8'))
    expect(content.scenarios[0].screenshots[0].data).toContain('[screenshot:')
  })

  it('includes screenshots when includeScreenshots is true', () => {
    const run = makeTestRun()
    const path = generateJsonReport(run, { outputPath: resolve(TEST_OUTPUT, 'results.json'), includeScreenshots: true })

    const content = JSON.parse(readFileSync(path, 'utf-8'))
    expect(content.scenarios[0].screenshots[0].data).toBe('base64data')
  })

  it('formatCiSummary produces compact JSON', () => {
    const run = makeTestRun()
    const ci = formatCiSummary(run)
    const parsed = JSON.parse(ci)
    expect(parsed.score).toBe(72)
    expect(parsed.passed).toBe(2)
    expect(parsed.failed).toBe(1)
    expect(parsed.brokenLinks).toBe(1)
  })
})

describe('HTML Reporter', () => {
  afterEach(() => {
    if (existsSync(TEST_OUTPUT)) rmSync(TEST_OUTPUT, { recursive: true })
  })

  it('generates HTML report file', () => {
    const run = makeTestRun()
    const path = generateHtmlReport(run, { outputPath: resolve(TEST_OUTPUT, 'report.html') })
    expect(existsSync(path)).toBe(true)

    const content = readFileSync(path, 'utf-8')
    expect(content).toContain('<!DOCTYPE html>')
    expect(content).toContain('example.com')
    expect(content).toContain('72') // score
  })

  it('includes scenario details', () => {
    const run = makeTestRun()
    const path = generateHtmlReport(run, { outputPath: resolve(TEST_OUTPUT, 'report.html') })
    const content = readFileSync(path, 'utf-8')

    expect(content).toContain('Navigate Home')
    expect(content).toContain('Submit Contact Form')
    expect(content).toContain('Element not found')
  })

  it('includes broken links section', () => {
    const run = makeTestRun()
    const path = generateHtmlReport(run, { outputPath: resolve(TEST_OUTPUT, 'report.html') })
    const content = readFileSync(path, 'utf-8')

    expect(content).toContain('Broken Links')
    expect(content).toContain('/404')
  })

  it('respects custom title', () => {
    const run = makeTestRun()
    const path = generateHtmlReport(run, { outputPath: resolve(TEST_OUTPUT, 'report.html'), title: 'My Custom Report' })
    const content = readFileSync(path, 'utf-8')

    expect(content).toContain('My Custom Report')
  })
})

describe('generateReports', () => {
  afterEach(() => {
    if (existsSync(TEST_OUTPUT)) rmSync(TEST_OUTPUT, { recursive: true })
  })

  it('generates both JSON and HTML', () => {
    const run = makeTestRun()
    const paths = generateReports(run, { outputDir: TEST_OUTPUT, formats: ['json', 'html'] })
    expect(paths).toHaveLength(2)
    expect(paths.some(p => p.endsWith('.json'))).toBe(true)
    expect(paths.some(p => p.endsWith('.html'))).toBe(true)
  })

  it('generates only JSON when specified', () => {
    const run = makeTestRun()
    const paths = generateReports(run, { outputDir: TEST_OUTPUT, formats: ['json'] })
    expect(paths).toHaveLength(1)
    expect(paths[0]).toContain('.json')
  })
})
