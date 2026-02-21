/**
 * Executor Tests (unit — mocked browser)
 */
import { describe, it, expect, vi } from 'vitest'
import { executeScenarios } from '../../src/executor'
import type { TestScenario, SiteMap, TesterConfig, DiscoveredPage } from '../../src/core/types'

function makePage(overrides: Partial<DiscoveredPage> = {}): DiscoveredPage {
  return {
    url: 'https://example.com',
    title: 'Example',
    depth: 0,
    statusCode: 200,
    forms: [],
    buttons: [],
    links: [],
    inputs: [],
    modals: [],
    isLoginPage: false,
    isMfaPage: false,
    requiresAuth: false,
    hasConsoleErrors: false,
    consoleErrors: [],
    networkErrors: [],
    loadTimeMs: 500,
    resourceCount: 10,
    ...overrides,
  }
}

function makeSiteMap(pages: DiscoveredPage[] = [makePage()]): SiteMap {
  return { baseUrl: 'https://example.com', pages, totalPages: pages.length, crawlDurationMs: 1000 }
}

function makeScenario(overrides: Partial<TestScenario> = {}): TestScenario {
  return {
    id: 'test-1',
    name: 'Test Scenario',
    description: 'A test',
    category: 'navigation',
    priority: 'medium',
    steps: [],
    assertions: [],
    tags: [],
    ...overrides,
  }
}

function mockBrowser(): any {
  return {
    getPage: vi.fn().mockReturnValue(null),
    executeStep: vi.fn().mockResolvedValue({
      stepIndex: 0,
      action: 'navigate',
      description: 'test',
      success: true,
      durationMs: 100,
    }),
    screenshot: vi.fn().mockResolvedValue('base64data'),
    clearErrors: vi.fn(),
    consoleErrors: [],
    networkErrors: [],
  }
}

describe('executeScenarios', () => {
  it('returns a TestRun with summary', async () => {
    const browser = mockBrowser()
    const scenarios = [makeScenario()]
    const config: TesterConfig = { accessibility: false }

    const result = await executeScenarios(browser, scenarios, makeSiteMap(), config)

    expect(result.id).toBeTruthy()
    expect(result.url).toBe('https://example.com')
    expect(result.summary.totalScenarios).toBe(1)
    expect(result.summary.passed).toBe(1)
    expect(result.summary.failed).toBe(0)
    expect(result.summary.overallScore).toBeGreaterThanOrEqual(0)
    expect(result.summary.overallScore).toBeLessThanOrEqual(100)
  })

  it('handles empty scenarios list', async () => {
    const browser = mockBrowser()
    const config: TesterConfig = { accessibility: false }

    const result = await executeScenarios(browser, [], makeSiteMap(), config)

    expect(result.summary.totalScenarios).toBe(0)
    expect(result.summary.overallScore).toBe(100)
  })

  it('captures broken links from siteMap', async () => {
    const browser = mockBrowser()
    const siteMap = makeSiteMap([
      makePage({ url: 'https://example.com', statusCode: 200 }),
      makePage({ url: 'https://example.com/broken', statusCode: 404 }),
    ])
    const config: TesterConfig = { accessibility: false }

    const result = await executeScenarios(browser, [makeScenario()], siteMap, config)

    expect(result.summary.brokenLinks).toHaveLength(1)
    expect(result.summary.brokenLinks[0].statusCode).toBe(404)
  })

  it('calculates score with penalties', async () => {
    const browser = mockBrowser()
    const siteMap = makeSiteMap([
      makePage({ statusCode: 404 }),
      makePage({
        consoleErrors: [
          { message: 'err1', level: 'error', url: 'https://example.com' },
          { message: 'err2', level: 'error', url: 'https://example.com' },
        ],
      }),
    ])
    const config: TesterConfig = { accessibility: false }

    const result = await executeScenarios(browser, [makeScenario()], siteMap, config)

    // 100 - 3 (1 broken link) - 4 (2 console errors) = 93
    expect(result.summary.overallScore).toBeLessThan(100)
  })
})
