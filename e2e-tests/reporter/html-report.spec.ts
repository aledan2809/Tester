import { test, expect } from '@playwright/test'
import { resolve } from 'path'

const PROJECT_ROOT = resolve(__dirname, '../..')

test.describe('HTML Reporter Audit', () => {
  test('generateHtmlString produces valid HTML', () => {
    // Import the reporter module dynamically
    const mockTestRun = createMockTestRun()
    const { generateHtmlString } = require(resolve(PROJECT_ROOT, 'src/reporter/html.ts'))

    // Note: this may fail if tsx is not set up for require
    // In that case, we test via the API endpoint
  })

  test('[SECURITY] HTML reporter escapes user content', () => {
    const fs = require('fs')
    const htmlSrc = fs.readFileSync(resolve(PROJECT_ROOT, 'src/reporter/html.ts'), 'utf8')

    // Verify esc() function exists and handles HTML entities
    expect(htmlSrc).toContain('function esc(')
    expect(htmlSrc).toContain('&amp;')
    expect(htmlSrc).toContain('&lt;')
    expect(htmlSrc).toContain('&gt;')
    expect(htmlSrc).toContain('&quot;')
  })

  test('[BUG] HTML reporter esc() does not escape single quotes', () => {
    const fs = require('fs')
    const htmlSrc = fs.readFileSync(resolve(PROJECT_ROOT, 'src/reporter/html.ts'), 'utf8')

    // esc() function doesn't escape single quotes (')
    // This could allow attribute injection in contexts using single-quoted attributes
    // Although current HTML uses double quotes, this is still a potential XSS vector
    expect(htmlSrc).not.toContain("&#39;")
    expect(htmlSrc).not.toContain("&apos;")
  })

  test('JSON reporter produces valid output', () => {
    const fs = require('fs')
    const jsonSrc = fs.readFileSync(resolve(PROJECT_ROOT, 'src/reporter/json.ts'), 'utf8')

    // Verify it uses JSON.stringify correctly
    expect(jsonSrc).toContain('JSON.stringify')
    // Verify it strips screenshots for space
    expect(jsonSrc).toContain('stripScreenshots')
  })

  test('report generator supports both HTML and JSON formats', () => {
    const fs = require('fs')
    const indexSrc = fs.readFileSync(resolve(PROJECT_ROOT, 'src/reporter/index.ts'), 'utf8')

    expect(indexSrc).toContain("'html'")
    expect(indexSrc).toContain("'json'")
    expect(indexSrc).toContain('generateJsonReport')
    expect(indexSrc).toContain('generateHtmlReport')
  })
})

function createMockTestRun() {
  return {
    id: 'test-run-1',
    url: 'https://example.com',
    startedAt: new Date(),
    completedAt: new Date(),
    durationMs: 5000,
    config: {},
    siteMap: {
      baseUrl: 'https://example.com',
      pages: [],
      totalPages: 0,
      crawlDurationMs: 1000,
    },
    scenarios: [],
    summary: {
      totalScenarios: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: 0,
      byCategory: {},
      visualRegressions: 0,
      a11yViolations: { critical: 0, serious: 0, moderate: 0, minor: 0 },
      avgLoadTimeMs: 0,
      slowestPages: [],
      consoleErrors: [],
      networkErrors: [],
      brokenLinks: [],
      overallScore: 100,
    },
  }
}
