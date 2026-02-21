/**
 * BFS Page Crawler
 * Uses Puppeteer to crawl a website, visiting each page and extracting
 * interactive elements. Supports SPAs by rendering JS before extraction.
 */

import type { BrowserCore } from '../core/browser'
import type { DiscoveredPage, ConsoleError, NetworkError, TesterConfig } from '../core/types'
import { isDomainAllowed, shouldSkipUrl } from '../core/safety'
import { analyzePage } from './analyzer'

export interface CrawlOptions {
  maxPages: number
  maxDepth: number
  timeout: number
  allowedDomains: string[]
  excludePatterns?: string[]
}

export interface CrawlResult {
  pages: DiscoveredPage[]
  durationMs: number
}

/**
 * BFS-crawl a website starting from a seed URL.
 * Returns discovered pages with all interactive elements analyzed.
 */
export async function crawlSite(
  browser: BrowserCore,
  seedUrl: string,
  options: CrawlOptions,
): Promise<CrawlResult> {
  const startTime = Date.now()
  const visited = new Set<string>()
  const pages: DiscoveredPage[] = []

  // Normalize seed URL
  const seed = normalizeUrl(seedUrl)
  const seedDomain = extractDomain(seed)

  // Default allowed domains to seed domain
  const allowedDomains = options.allowedDomains.length > 0
    ? options.allowedDomains
    : [seedDomain]

  // BFS queue: [url, depth]
  const queue: Array<[string, number]> = [[seed, 0]]
  visited.add(seed)

  while (queue.length > 0 && pages.length < options.maxPages) {
    // Check timeout
    if (Date.now() - startTime > options.timeout) {
      console.warn(`[crawler] Timeout reached (${options.timeout}ms), stopping`)
      break
    }

    const [url, depth] = queue.shift()!

    try {
      const page = await crawlPage(browser, url, depth)
      pages.push(page)

      // Extract links for further crawling (if within depth limit)
      if (depth < options.maxDepth) {
        for (const link of page.links) {
          const normalized = normalizeUrl(link.href)
          if (
            !visited.has(normalized) &&
            !link.isExternal &&
            isDomainAllowed(normalized, allowedDomains) &&
            !shouldSkipUrl(normalized, options.excludePatterns) &&
            isHtmlLikely(normalized)
          ) {
            visited.add(normalized)
            queue.push([normalized, depth + 1])
          }
        }
      }
    } catch (err) {
      console.warn(`[crawler] Failed to crawl ${url}:`, err instanceof Error ? err.message : err)
      // Record the failed page with error info
      pages.push({
        url,
        title: '',
        depth,
        statusCode: 0,
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
        loadTimeMs: 0,
        resourceCount: 0,
      })
    }
  }

  return {
    pages,
    durationMs: Date.now() - startTime,
  }
}

/**
 * Crawl a single page: navigate, wait for load, analyze.
 */
async function crawlPage(
  browser: BrowserCore,
  url: string,
  depth: number,
): Promise<DiscoveredPage> {
  // Clear errors from previous page
  browser.clearErrors()

  const loadStart = Date.now()
  const statusCode = await browser.goto(url, 30_000)
  const loadTimeMs = Date.now() - loadStart

  const page = browser.getPage()!
  const title = await browser.getTitle()

  // Wait a bit for dynamic content
  await new Promise(r => setTimeout(r, 1000))

  // Analyze the page
  const analysis = await analyzePage(page, url)

  // Count resources loaded
  const resourceCount = await page.evaluate(() => performance.getEntriesByType('resource').length)

  // Snapshot console/network errors
  const consoleErrors = [...browser.consoleErrors]
  const networkErrors = [...browser.networkErrors]

  return {
    url: browser.getUrl(),
    title,
    depth,
    statusCode,
    ...analysis,
    hasConsoleErrors: consoleErrors.some(e => e.level === 'error'),
    consoleErrors,
    networkErrors,
    loadTimeMs,
    resourceCount,
  }
}

// ─── Helpers ────────────────────────────────────────────────

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    // Remove hash, trailing slash, common tracking params
    u.hash = ''
    u.searchParams.delete('utm_source')
    u.searchParams.delete('utm_medium')
    u.searchParams.delete('utm_campaign')
    u.searchParams.delete('utm_term')
    u.searchParams.delete('utm_content')
    u.searchParams.delete('fbclid')
    u.searchParams.delete('gclid')
    let path = u.pathname.replace(/\/+$/, '') || '/'
    u.pathname = path
    return u.href
  } catch {
    return url
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Check if URL likely points to an HTML page (not a file download) */
function isHtmlLikely(url: string): boolean {
  const path = new URL(url).pathname.toLowerCase()
  const nonHtmlExtensions = [
    '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
    '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico',
    '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.wav',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.exe', '.dmg', '.msi', '.apk',
    '.css', '.js', '.json', '.xml', '.rss',
    '.woff', '.woff2', '.ttf', '.eot',
  ]
  return !nonHtmlExtensions.some(ext => path.endsWith(ext))
}
