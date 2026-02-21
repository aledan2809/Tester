/**
 * CLI Command: tester run <url>
 * Full autonomous test run: discover → login → generate → execute → report.
 */

import { AITester } from '../../tester'
import { formatSiteMapSummary } from '../../discovery/sitemap'
import { log, logSuccess, logWarn, logError, formatDuration, startSpinner, stopSpinner } from '../utils'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

interface RunOptions {
  maxPages: number
  maxDepth: number
  timeout: number
  headless: boolean
  output: string
  username?: string
  password?: string
  loginUrl?: string
  apiKey?: string
  mfa: boolean
  mfaSecret?: string
  session?: string
  skip?: string
  only?: string
}

export async function runCommand(url: string, options: RunOptions): Promise<void> {
  const normalizedUrl = url.startsWith('http') ? url : `https://${url}`

  log(`Starting test run for ${normalizedUrl}`)

  const tester = new AITester({
    headless: options.headless,
    maxPages: options.maxPages,
    maxDepth: options.maxDepth,
    crawlTimeout: options.timeout,
    outputDir: options.output,
    anthropicApiKey: options.apiKey || process.env.ANTHROPIC_API_KEY,
    credentials: options.username ? {
      username: options.username,
      password: options.password || '',
      loginUrl: options.loginUrl,
      mfaSecret: options.mfaSecret,
    } : undefined,
    sessionPath: options.session,
    visualRegression: !options.skip?.includes('visual'),
    accessibility: !options.skip?.includes('a11y'),
    performance: !options.skip?.includes('performance'),
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

    // Phase 2: Discover
    startSpinner('Discovering pages...')
    const siteMap = await tester.discover(normalizedUrl)
    stopSpinner(`Discovered ${siteMap.totalPages} pages in ${formatDuration(siteMap.crawlDurationMs)}`)
    console.log('')
    console.log(formatSiteMapSummary(siteMap))
    console.log('')

    // Phase 3: Generate scenarios
    startSpinner('Generating test scenarios...')
    const scenarios = await tester.generateScenarios(siteMap)
    stopSpinner(`Generated ${scenarios.length} test scenarios`)

    const byCat: Record<string, number> = {}
    for (const s of scenarios) {
      byCat[s.category] = (byCat[s.category] || 0) + 1
    }
    log(`Scenarios by category: ${Object.entries(byCat).map(([k, v]) => `${k}=${v}`).join(', ')}`)

    // Phase 4: Execute
    if (scenarios.length > 0) {
      startSpinner('Executing test scenarios...')
      try {
        const results = await tester.execute(scenarios)
        stopSpinner(`Execution complete: ${results.summary.passed}/${results.summary.totalScenarios} passed`)

        if (options.output) {
          const outputDir = resolve(options.output)
          mkdirSync(outputDir, { recursive: true })
          writeFileSync(resolve(outputDir, 'results.json'), JSON.stringify(results, null, 2))
          logSuccess(`Results saved to ${options.output}/results.json`)
        }

        process.exit(results.summary.failed > 0 ? 1 : 0)
      } catch (err) {
        stopSpinner()
        if (err instanceof Error && err.message.includes('Not implemented')) {
          logWarn('Test execution engine not yet implemented — saving scenarios only')
        } else {
          throw err
        }
      }
    }

    // Save discovery + scenarios
    if (options.output) {
      const outputDir = resolve(options.output)
      mkdirSync(outputDir, { recursive: true })
      writeFileSync(resolve(outputDir, 'sitemap.json'), JSON.stringify(siteMap, null, 2))
      writeFileSync(resolve(outputDir, 'scenarios.json'), JSON.stringify(scenarios, null, 2))
      logSuccess(`Results saved to ${options.output}/`)
    }
  } catch (err) {
    stopSpinner()
    logError(err instanceof Error ? err.message : String(err))
    process.exit(1)
  } finally {
    await tester.close()
  }
}
