/**
 * Crawler Tests — unit tests for URL helpers used by the crawler
 */
import { describe, it, expect } from 'vitest'
import { buildSiteMap, formatSiteMapSummary } from '../../src/discovery/sitemap'
import type { DiscoveredPage, SiteMap } from '../../src/core/types'

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

describe('buildSiteMap', () => {
  it('creates a SiteMap from pages', () => {
    const pages = [
      makePage({ url: 'https://example.com' }),
      makePage({ url: 'https://example.com/about', depth: 1 }),
    ]

    const siteMap = buildSiteMap('https://example.com', pages, 5000)

    expect(siteMap.baseUrl).toBe('https://example.com')
    expect(siteMap.totalPages).toBe(2)
    expect(siteMap.crawlDurationMs).toBe(5000)
    expect(siteMap.pages).toHaveLength(2)
  })

  it('handles empty pages', () => {
    const siteMap = buildSiteMap('https://example.com', [], 100)
    expect(siteMap.totalPages).toBe(0)
  })
})

describe('formatSiteMapSummary', () => {
  it('produces readable summary', () => {
    const pages = [
      makePage({
        url: 'https://example.com',
        forms: [{ selector: 'form', action: '/', method: 'POST', fields: [], submitSelector: 'button' }],
      }),
      makePage({ url: 'https://example.com/login', depth: 1, isLoginPage: true }),
      makePage({ url: 'https://example.com/error', depth: 1, hasConsoleErrors: true, statusCode: 500 }),
    ]

    const siteMap = buildSiteMap('https://example.com', pages, 3000)
    const summary = formatSiteMapSummary(siteMap)

    expect(summary).toContain('Site Map: https://example.com')
    expect(summary).toContain('Pages: 3')
    expect(summary).toContain('Forms: 1')
    expect(summary).toContain('Login pages: 1')
    expect(summary).toContain('LOGIN')
    expect(summary).toContain('HTTP 500')
  })
})
