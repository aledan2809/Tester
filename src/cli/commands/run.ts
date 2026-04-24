/**
 * CLI Command: tester run <url>
 * Full autonomous test run: discover → login → generate → execute → report.
 */

import fs from 'fs'
import { AITester } from '../../tester'
import { formatSiteMapSummary } from '../../discovery/sitemap'
import { generateReports } from '../../reporter/index'
import { log, logSuccess, logWarn, logError, formatDuration, startSpinner, stopSpinner, writeLine } from '../utils'
import type { TestScenario } from '../../core/types'

interface RunOptions {
  maxPages: number
  maxDepth: number
  timeout: number
  headless: boolean
  output: string
  username?: string
  password?: string
  passwordEnv?: string
  loginUrl?: string
  apiKey?: string
  mfa: boolean
  mfaSecret?: string
  session?: string
  skip?: string
  only?: string
  accessibility: boolean
  visualRegression: boolean
  performance: boolean
  plan?: string
  a11yScan?: string
  a11yScanMaxPages?: number
}

export async function runCommand(url: string, options: RunOptions): Promise<void> {
  const normalizedUrl = url.startsWith('http') ? url : `https://${url}`

  log(`Starting test run for ${normalizedUrl}`)

  // Resolve password: --password-env takes precedence (safe for special chars like > < !)
  const resolvedPassword = options.passwordEnv
    ? (process.env[options.passwordEnv] || '')
    : (options.password || '')

  const tester = new AITester({
    headless: options.headless,
    maxPages: options.maxPages,
    maxDepth: options.maxDepth,
    crawlTimeout: options.timeout,
    outputDir: options.output,
    anthropicApiKey: options.apiKey || process.env.ANTHROPIC_API_KEY,
    credentials: options.username ? {
      username: options.username,
      password: resolvedPassword,
      loginUrl: options.loginUrl,
      mfaSecret: options.mfaSecret,
    } : undefined,
    sessionPath: options.session,
    visualRegression: options.visualRegression || (!options.skip?.includes('visual') && !options.only),
    accessibility: options.accessibility || (!options.skip?.includes('a11y') && !options.only),
    performance: options.performance || (!options.skip?.includes('performance') && !options.only),
    a11yScanOutputPath: options.a11yScan,
    a11yScanMaxPages: options.a11yScanMaxPages,
  })

  try {
    startSpinner('Launching browser...')
    await tester.launch()
    stopSpinner('Browser launched')

    // Phase 1: Login (if credentials provided)
    if (options.username) {
      startSpinner('Logging in...')
      const loginResult = await tester.login()
      if (loginResult.success) {
        stopSpinner('Login successful')
      } else {
        stopSpinner()
        logWarn(`Login failed: ${loginResult.error} — continuing unauthenticated`)
      }
    }

    // Phase 2 + 3: Discover + Generate (or load from --plan file)
    let scenarios: TestScenario[]

    if (options.plan) {
      // F3: Load pre-defined test plan from JSON file, skip discovery + AI generation
      log(`Loading test plan from ${options.plan}`)
      try {
        const raw = JSON.parse(fs.readFileSync(options.plan, 'utf8'))
        scenarios = Array.isArray(raw) ? raw : (raw.scenarios || raw.flows || [])
        logSuccess(`Loaded ${scenarios.length} scenarios from plan file`)
      } catch (err) {
        logError(`Failed to load plan file: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
        return
      }
    } else {
      // Standard flow: discover then generate
      startSpinner('Discovering pages...')
      const siteMap = await tester.discover(normalizedUrl)
      stopSpinner(`Discovered ${siteMap.totalPages} pages in ${formatDuration(siteMap.crawlDurationMs)}`)
      writeLine('')
      writeLine(formatSiteMapSummary(siteMap))
      writeLine('')

      startSpinner('Generating test scenarios...')
      scenarios = await tester.generateScenarios(siteMap)
      stopSpinner(`Generated ${scenarios.length} test scenarios`)
    }

    const byCat: Record<string, number> = {}
    for (const s of scenarios) {
      byCat[s.category] = (byCat[s.category] || 0) + 1
    }
    log(`Scenarios by category: ${Object.entries(byCat).map(([k, v]) => `${k}=${v}`).join(', ')}`)

    // Phase 4: Execute
    if (scenarios.length > 0) {
      startSpinner(`Executing ${scenarios.length} test scenarios...`)
      const results = await tester.execute(scenarios)
      stopSpinner(`Execution complete: ${results.summary.passed}/${results.summary.totalScenarios} passed (score: ${results.summary.overallScore}/100)`)

      // Display summary
      log(`  Passed: ${results.summary.passed} | Failed: ${results.summary.failed} | Errors: ${results.summary.errors} | Skipped: ${results.summary.skipped}`)
      if (results.summary.brokenLinks.length > 0) {
        logWarn(`  Broken links: ${results.summary.brokenLinks.length}`)
      }
      if (results.summary.a11yViolations.critical > 0 || results.summary.a11yViolations.serious > 0) {
        logWarn(`  A11Y: ${results.summary.a11yViolations.critical} critical, ${results.summary.a11yViolations.serious} serious`)
      }

      // Generate reports
      if (options.output) {
        startSpinner('Generating reports...')
        const paths = generateReports(results, {
          outputDir: options.output,
          formats: ['html', 'json'],
        })
        stopSpinner(`Reports generated`)
        for (const p of paths) {
          logSuccess(`  ${p}`)
        }
      }

      process.exit(results.summary.failed > 0 || results.summary.errors > 0 ? 1 : 0)
    } else {
      logWarn('No test scenarios generated — nothing to execute')
    }
  } catch (err) {
    stopSpinner()
    logError(err instanceof Error ? err.message : String(err))
    process.exit(1)
  } finally {
    await tester.close()
  }
}
