/**
 * AITester — Main Public API
 * Autonomous web testing engine that discovers, generates, executes, and reports.
 *
 * Usage:
 *   import { AITester } from '@aledan007/tester'
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
import { executeScenarios } from './executor'
import { generateReports } from './reporter/index'
import { runSelfCheck, exitCodeForSummary } from './self-test/harness'

export class AITester {
  private browser: BrowserCore
  private config: TesterConfig
  private lastSiteMap: SiteMap | null = null

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

    const siteMap = buildSiteMap(url, result.pages, result.durationMs)
    this.lastSiteMap = siteMap
    return siteMap
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
   * API-direct login: POST credentials to creds.apiPath via the browser
   * context request so the session cookie lands in the shared jar and carries
   * into the subsequent crawl. Used for React App-Router apps where the login
   * FORM hydration race makes form submit unreliable. Mirrors journey-audit's
   * `login.apiPath` path.
   */
  async apiLogin(credentials?: LoginCredentials): Promise<{ success: boolean; error?: string }> {
    const creds = credentials || this.config.credentials
    if (!creds || !creds.apiPath) return { success: false, error: 'No apiPath credentials provided' }

    const page = this.browser.getPage()
    if (!page) return { success: false, error: 'Browser not launched' }

    const base = creds.loginUrl ? new URL(creds.loginUrl).origin : undefined
    const url = creds.apiPath.startsWith('http')
      ? creds.apiPath
      : `${base ?? ''}${creds.apiPath}`
    if (!url.startsWith('http')) {
      return { success: false, error: 'apiPath is relative but no loginUrl/origin available to resolve it' }
    }

    try {
      // Be on the target origin first so the Set-Cookie response binds to the
      // browsing context the crawler will reuse. Then POST from inside the page
      // (Puppeteer has no page.request) with credentials:'include' so cookies
      // are stored, mirroring journey-audit's API-direct login.
      const origin = new URL(url).origin
      await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {})

      const result = await page.evaluate(
        async (args: { url: string; body: Record<string, string> }) => {
          try {
            const r = await fetch(args.url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(args.body),
              credentials: 'include',
            })
            return { ok: r.ok, status: r.status }
          } catch (e) {
            return { ok: false, status: 0, error: (e as Error).message }
          }
        },
        {
          url,
          body: {
            [creds.apiEmailField ?? 'email']: creds.username,
            [creds.apiPasswordField ?? 'password']: creds.password,
          },
        },
      )

      if (!result.ok) {
        return { success: false, error: `API login failed (HTTP ${result.status}) at ${url}${result.error ? `: ${result.error}` : ''}` }
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: `API login error: ${(err as Error).message}` }
    }
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
   */
  async execute(scenarios: TestScenario[], siteMap?: SiteMap): Promise<TestRun> {
    const map = siteMap || this.lastSiteMap
    if (!map) {
      throw new Error('No site map available — call discover() first or pass siteMap')
    }
    return executeScenarios(this.browser, scenarios, map, this.config)
  }

  /**
   * Generate reports from a test run.
   * Returns list of output file paths.
   */
  report(testRun: TestRun): string[] {
    const outputDir = this.config.outputDir || './reports'
    const formats = this.config.reportFormats || ['html', 'json']
    return generateReports(testRun, { outputDir, formats })
  }

  /**
   * Full autonomous test run: discover → login → generate → execute → report.
   */
  async run(url: string): Promise<TestRun> {
    // Pre-flight before browser launch — runSelfCheck is pure-static, no Puppeteer needed.
    // Failing here avoids a wasteful Chromium spawn when a harness primitive is broken.
    const selfCheck = runSelfCheck()
    if (exitCodeForSummary(selfCheck) === 2) {
      const failed = selfCheck.results.filter((r) => r.severity === 'fail')
      const detail = failed.map((r) => `  [${r.id}] ${r.message}`).join('\n')
      throw new Error(
        `Tester harness self-check failed (${failed.length} broken primitive${failed.length === 1 ? '' : 's'}):\n${detail}`,
      )
    }

    await this.launch()
    try {
      if (this.config.credentials) {
        await this.login()
      }
      const siteMap = await this.discover(url)
      const scenarios = await this.generateScenarios(siteMap)
      const results = await this.execute(scenarios)

      // Auto-generate reports if output dir is configured
      if (this.config.outputDir) {
        this.report(results)
      }

      return results
    } finally {
      await this.close()
    }
  }

  getBrowser(): BrowserCore {
    return this.browser
  }
}
