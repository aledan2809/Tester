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
import { autoLogin } from './auth/login'
import { detectMfa, handleMfa } from './auth/mfa'
import { loadSession, saveSession } from './auth/session'
import { generateScenarios as aiGenerateScenarios } from './scenarios/generator'

export class AITester {
  private browser: BrowserCore
  private config: TesterConfig

  constructor(config: TesterConfig = {}) {
    this.config = config
    this.browser = new BrowserCore(config)
  }

  async launch(): Promise<void> {
    await this.browser.launch()

    // Load saved session if path provided
    if (this.config.sessionPath) {
      await loadSession(this.browser, this.config.sessionPath)
    }
  }

  async close(): Promise<void> {
    // Save session on close if path provided
    if (this.config.sessionPath) {
      try { await saveSession(this.browser, this.config.sessionPath) } catch {}
    }
    await this.browser.close()
  }

  /**
   * Discover all pages and interactive elements on a website.
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
   * Handles MFA if a handler or TOTP secret is configured.
   */
  async login(credentials?: LoginCredentials): Promise<{ success: boolean; error?: string }> {
    const creds = credentials || this.config.credentials
    if (!creds) return { success: false, error: 'No credentials provided' }

    const result = await autoLogin(this.browser, creds)
    if (!result.success) return result

    // Check for MFA after login
    const page = this.browser.getPage()
    if (page) {
      const mfaDetection = await detectMfa(page)
      if (mfaDetection.detected) {
        const mfaResult = await handleMfa(
          page,
          mfaDetection,
          creds.mfaSecret,
          this.config.mfaHandler,
        )
        if (!mfaResult.success) {
          return { success: false, error: `MFA failed: ${mfaResult.error}` }
        }
      }
    }

    return { success: true }
  }

  /**
   * Generate test scenarios from a site map.
   * Uses AI when API key is available, with template fallback.
   */
  async generateScenarios(siteMap: SiteMap): Promise<TestScenario[]> {
    return aiGenerateScenarios(
      siteMap,
      this.config.anthropicApiKey,
      this.config.aiModel,
    )
  }

  /**
   * Execute test scenarios and return results.
   * (Sprint 3 — placeholder)
   */
  async execute(_scenarios: TestScenario[]): Promise<TestRun> {
    throw new Error('Not implemented — Sprint 3')
  }

  /**
   * Full autonomous test run: discover → login → generate → execute → report.
   */
  async run(url: string): Promise<TestRun> {
    await this.launch()
    try {
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

  getBrowser(): BrowserCore {
    return this.browser
  }
}
