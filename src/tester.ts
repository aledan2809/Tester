/**
 * AITester — Main Public API
 * Autonomous web testing engine that discovers, generates, executes, and reports.
 *
 * Usage:
 *   import { AITester } from '@aledan/tester'
 *   const tester = new AITester({ headless: true })
 *   await tester.launch()
 *   const siteMap = await tester.discover('https://example.com')
 *   await tester.close()
 */

import type { TesterConfig, SiteMap, TestScenario, TestRun, LoginCredentials } from './core/types'
import { BrowserCore } from './core/browser'
import { crawlSite } from './discovery/crawler'
import { buildSiteMap } from './discovery/sitemap'

export class AITester {
  private browser: BrowserCore
  private config: TesterConfig

  constructor(config: TesterConfig = {}) {
    this.config = config
    this.browser = new BrowserCore(config)
  }

  /** Launch the browser */
  async launch(): Promise<void> {
    await this.browser.launch()
  }

  /** Close the browser and clean up */
  async close(): Promise<void> {
    await this.browser.close()
  }

  /**
   * Discover all pages and interactive elements on a website.
   * Returns a SiteMap with pages, forms, buttons, links, etc.
   */
  async discover(url: string): Promise<SiteMap> {
    const result = await crawlSite(this.browser, url, {
      maxPages: this.config.maxPages || 50,
      maxDepth: this.config.maxDepth || 3,
      timeout: this.config.crawlTimeout || 120_000,
      allowedDomains: this.config.allowedDomains || [],
      excludePatterns: this.config.excludePatterns,
    })

    return buildSiteMap(url, result.pages, result.durationMs)
  }

  /**
   * Login to a website using provided credentials.
   */
  async login(credentials?: LoginCredentials): Promise<{ success: boolean; error?: string }> {
    const creds = credentials || this.config.credentials
    if (!creds) return { success: false, error: 'No credentials provided' }
    return this.browser.login(creds)
  }

  /**
   * Generate test scenarios from a site map.
   * (Sprint 2 — placeholder)
   */
  async generateScenarios(_siteMap: SiteMap): Promise<TestScenario[]> {
    // TODO: Sprint 2 — AI scenario generation
    return []
  }

  /**
   * Execute test scenarios and return results.
   * (Sprint 3 — placeholder)
   */
  async execute(_scenarios: TestScenario[]): Promise<TestRun> {
    // TODO: Sprint 3 — test execution engine
    throw new Error('Not implemented — Sprint 3')
  }

  /**
   * Full autonomous test run: discover → generate → execute → report.
   * (Sprint 4 — placeholder for full pipeline)
   */
  async run(url: string): Promise<TestRun> {
    await this.launch()
    try {
      // Login if credentials provided
      if (this.config.credentials) {
        await this.login()
      }

      const siteMap = await this.discover(url)
      const scenarios = await this.generateScenarios(siteMap)
      const results = await this.execute(scenarios)
      return results
    } finally {
      await this.close()
    }
  }

  /** Get the underlying browser core (for advanced usage) */
  getBrowser(): BrowserCore {
    return this.browser
  }
}
