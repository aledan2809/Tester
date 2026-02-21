/**
 * CLI Command: tester discover <url>
 * Crawl a website and output the site map.
 */

import { BrowserCore } from '../../core/browser'
import { crawlSite } from '../../discovery/crawler'
import { buildSiteMap, formatSiteMapSummary } from '../../discovery/sitemap'
import { startSpinner, stopSpinner, log, logSuccess, logError, formatDuration } from '../utils'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

interface DiscoverOptions {
  maxPages: number
  maxDepth: number
  timeout: number
  headless: boolean
  output: string
  json: boolean
}

export async function discoverCommand(url: string, options: DiscoverOptions): Promise<void> {
  const normalizedUrl = url.startsWith('http') ? url : `https://${url}`

  log(`Discovering ${normalizedUrl}`)
  log(`Max pages: ${options.maxPages} | Max depth: ${options.maxDepth} | Timeout: ${options.timeout}ms`)

  const browser = new BrowserCore({
    headless: options.headless,
  })

  try {
    startSpinner('Launching browser...')
    await browser.launch()
    stopSpinner('Browser launched')

    startSpinner(`Crawling ${normalizedUrl}...`)
    const result = await crawlSite(browser, normalizedUrl, {
      maxPages: options.maxPages,
      maxDepth: options.maxDepth,
      timeout: options.timeout,
      allowedDomains: [],
      excludePatterns: [],
    })
    stopSpinner(`Crawled ${result.pages.length} pages in ${formatDuration(result.durationMs)}`)

    const siteMap = buildSiteMap(normalizedUrl, result.pages, result.durationMs)

    // Output
    if (options.json) {
      console.log(JSON.stringify(siteMap, null, 2))
    } else {
      console.log('')
      console.log(formatSiteMapSummary(siteMap))
    }

    // Save to file
    if (options.output) {
      const outputDir = resolve(options.output)
      mkdirSync(outputDir, { recursive: true })
      const filePath = resolve(outputDir, 'sitemap.json')
      writeFileSync(filePath, JSON.stringify(siteMap, null, 2))
      logSuccess(`Site map saved to ${filePath}`)
    }
  } catch (err) {
    stopSpinner()
    logError(err instanceof Error ? err.message : String(err))
    process.exit(1)
  } finally {
    await browser.close()
  }
}
