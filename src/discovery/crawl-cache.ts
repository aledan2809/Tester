/**
 * Crawl cache — persist the BFS sitemap per site between runs
 * (roadmap test-tooling 2026-06-11, secondary batch; NO-TOUCH: flag-gated).
 *
 * The BFS crawl rebuilds the full sitemap on every run (verified: zero
 * persistence in crawler.ts). On large sites that's 30-50% of an [7]/[8]
 * run. This cache stores the CrawlResult keyed on (seed URL + crawl options)
 * with a short TTL, so back-to-back runs (TWG iterations, re-audits) skip
 * re-crawling an unchanged site.
 *
 * OPT-IN: does nothing unless TESTER_CRAWL_CACHE=1 — default behavior is
 * byte-identical to before (NO-TOUCH discipline). Tuning:
 *   TESTER_CRAWL_CACHE=1            enable
 *   TESTER_CRAWL_CACHE_TTL_MS       freshness window (default 1h)
 *   TESTER_CRAWL_CACHE_DIR          storage dir (default <tmp>/tester-crawl-cache)
 *
 * Trade-off to know: a cached sitemap also replays the recorded statusCode /
 * console / network errors from crawl time. The 1h default TTL bounds the
 * staleness; deploy hooks can invalidate eagerly via clearCrawlCache().
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import type { CrawlOptions, CrawlResult } from './crawler'

const DEFAULT_TTL_MS = 60 * 60 * 1000

export function crawlCacheEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TESTER_CRAWL_CACHE === '1'
}

export function crawlCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.TESTER_CRAWL_CACHE_DIR || path.join(os.tmpdir(), 'tester-crawl-cache')
}

export function crawlCacheTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.TESTER_CRAWL_CACHE_TTL_MS)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_MS
}

/** Cache key: seed + every option that shapes the crawl output. */
export function cacheKeyFor(seedUrl: string, options: CrawlOptions): string {
  const material = JSON.stringify({
    seed: seedUrl,
    maxPages: options.maxPages,
    maxDepth: options.maxDepth,
    allowedDomains: [...(options.allowedDomains || [])].sort(),
    excludePatterns: [...(options.excludePatterns || [])].sort(),
  })
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 32)
}

export function isFresh(savedAtIso: string, ttlMs: number, now: number = Date.now()): boolean {
  const savedAt = Date.parse(savedAtIso)
  return Number.isFinite(savedAt) && now - savedAt < ttlMs
}

interface CacheFile {
  seedUrl: string
  savedAt: string
  result: CrawlResult
}

/** Load a fresh cached CrawlResult, or null. Never throws. */
export function loadCrawlCache(
  seedUrl: string,
  options: CrawlOptions,
  env: NodeJS.ProcessEnv = process.env,
): CrawlResult | null {
  if (!crawlCacheEnabled(env)) return null
  try {
    const file = path.join(crawlCacheDir(env), `${cacheKeyFor(seedUrl, options)}.json`)
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as CacheFile
    if (!raw?.result?.pages || !isFresh(raw.savedAt, crawlCacheTtlMs(env))) return null
    return raw.result
  } catch {
    return null
  }
}

/** Persist a CrawlResult for the (seed, options) key. Never throws. */
export function saveCrawlCache(
  seedUrl: string,
  options: CrawlOptions,
  result: CrawlResult,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!crawlCacheEnabled(env)) return
  try {
    const dir = crawlCacheDir(env)
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${cacheKeyFor(seedUrl, options)}.json`)
    const payload: CacheFile = { seedUrl, savedAt: new Date().toISOString(), result }
    fs.writeFileSync(file, JSON.stringify(payload))
  } catch (err) {
    console.warn('[crawl-cache] save failed:', err instanceof Error ? err.message : err)
  }
}

/** Drop the whole cache (e.g. from a deploy hook) — fresh crawl on next run. */
export function clearCrawlCache(env: NodeJS.ProcessEnv = process.env): void {
  try {
    fs.rmSync(crawlCacheDir(env), { recursive: true, force: true })
  } catch { /* already gone */ }
}
