/**
 * CLI Command: tester run <url>
 * Full autonomous test run (Sprint 1: discovery only, execution in Sprint 3).
 */

import { AITester } from '../../tester'
import { formatSiteMapSummary } from '../../discovery/sitemap'
import { log, logSuccess, logError, formatDuration } from '../utils'
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
    } : undefined,
  })

  try {
    await tester.launch()

    // Phase 1: Discover
    log('Phase 1: Discovery...')
    const siteMap = await tester.discover(normalizedUrl)
    logSuccess(`Discovered ${siteMap.totalPages} pages in ${formatDuration(siteMap.crawlDurationMs)}`)
    console.log('')
    console.log(formatSiteMapSummary(siteMap))

    // Save discovery results
    if (options.output) {
      const outputDir = resolve(options.output)
      mkdirSync(outputDir, { recursive: true })
      writeFileSync(resolve(outputDir, 'sitemap.json'), JSON.stringify(siteMap, null, 2))
      logSuccess(`Results saved to ${options.output}`)
    }

    // Phase 2-4: Scenario generation + execution + reporting (Sprint 2-4)
    log('Phase 2-4: Scenario generation, execution, and reporting — coming in Sprint 2+')
  } catch (err) {
    logError(err instanceof Error ? err.message : String(err))
    process.exit(1)
  } finally {
    await tester.close()
  }
}
