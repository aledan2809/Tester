/**
 * Tests — crawl cache (flag-gated sitemap persistence, NO-TOUCH discipline).
 * Pure fs + env injection — no browser/network.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  cacheKeyFor, isFresh, loadCrawlCache, saveCrawlCache, clearCrawlCache,
  crawlCacheEnabled, crawlCacheTtlMs,
} from '../../src/discovery/crawl-cache'
import type { CrawlOptions, CrawlResult } from '../../src/discovery/crawler'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-cache-'))
const baseOpts: CrawlOptions = { maxPages: 10, maxDepth: 2, timeout: 60000, allowedDomains: ['x.com'] }
const result: CrawlResult = { pages: [{ url: 'https://x.com' } as any], durationMs: 123 }

const envOn = (over: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  TESTER_CRAWL_CACHE: '1',
  TESTER_CRAWL_CACHE_DIR: tmpDir,
  ...over,
})

beforeEach(() => clearCrawlCache(envOn()))
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

describe('flag gating (NO-TOUCH: default OFF)', () => {
  it('disabled by default — load returns null, save is a no-op', () => {
    const env = { TESTER_CRAWL_CACHE_DIR: tmpDir } as NodeJS.ProcessEnv
    expect(crawlCacheEnabled(env)).toBe(false)
    saveCrawlCache('https://x.com', baseOpts, result, env)
    expect(fs.existsSync(tmpDir) && fs.readdirSync(tmpDir).length).toBeFalsy()
    expect(loadCrawlCache('https://x.com', baseOpts, env)).toBeNull()
  })
})

describe('cache key', () => {
  it('stable for same inputs; changes with seed or any shaping option', () => {
    const k = cacheKeyFor('https://x.com', baseOpts)
    expect(cacheKeyFor('https://x.com', { ...baseOpts })).toBe(k)
    expect(cacheKeyFor('https://y.com', baseOpts)).not.toBe(k)
    expect(cacheKeyFor('https://x.com', { ...baseOpts, maxPages: 11 })).not.toBe(k)
    expect(cacheKeyFor('https://x.com', { ...baseOpts, maxDepth: 3 })).not.toBe(k)
    expect(cacheKeyFor('https://x.com', { ...baseOpts, excludePatterns: ['/admin'] })).not.toBe(k)
  })

  it('allowedDomains order does not matter', () => {
    const a = cacheKeyFor('https://x.com', { ...baseOpts, allowedDomains: ['a.com', 'b.com'] })
    const b = cacheKeyFor('https://x.com', { ...baseOpts, allowedDomains: ['b.com', 'a.com'] })
    expect(a).toBe(b)
  })
})

describe('save → load round-trip', () => {
  it('returns the stored result while fresh', () => {
    saveCrawlCache('https://x.com', baseOpts, result, envOn())
    const hit = loadCrawlCache('https://x.com', baseOpts, envOn())
    expect(hit?.pages).toHaveLength(1)
    expect(hit?.durationMs).toBe(123)
  })

  it('different options miss', () => {
    saveCrawlCache('https://x.com', baseOpts, result, envOn())
    expect(loadCrawlCache('https://x.com', { ...baseOpts, maxPages: 99 }, envOn())).toBeNull()
  })

  it('expired TTL misses', () => {
    saveCrawlCache('https://x.com', baseOpts, result, envOn())
    const file = path.join(tmpDir, fs.readdirSync(tmpDir)[0])
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    raw.savedAt = new Date(Date.now() - 2 * 3600 * 1000).toISOString()
    fs.writeFileSync(file, JSON.stringify(raw))
    expect(loadCrawlCache('https://x.com', baseOpts, envOn())).toBeNull()
    expect(loadCrawlCache('https://x.com', baseOpts, envOn({ TESTER_CRAWL_CACHE_TTL_MS: String(3 * 3600 * 1000) }))).not.toBeNull()
  })

  it('corrupt cache file misses without throwing', () => {
    saveCrawlCache('https://x.com', baseOpts, result, envOn())
    const file = path.join(tmpDir, fs.readdirSync(tmpDir)[0])
    fs.writeFileSync(file, '{not json')
    expect(loadCrawlCache('https://x.com', baseOpts, envOn())).toBeNull()
  })

  it('clearCrawlCache drops everything', () => {
    saveCrawlCache('https://x.com', baseOpts, result, envOn())
    clearCrawlCache(envOn())
    expect(loadCrawlCache('https://x.com', baseOpts, envOn())).toBeNull()
  })
})

describe('isFresh + ttl parsing', () => {
  it('boundary + junk handling', () => {
    const now = Date.now()
    expect(isFresh(new Date(now - 1000).toISOString(), 2000, now)).toBe(true)
    expect(isFresh(new Date(now - 3000).toISOString(), 2000, now)).toBe(false)
    expect(isFresh('garbage', 2000, now)).toBe(false)
    expect(crawlCacheTtlMs({} as NodeJS.ProcessEnv)).toBe(3600000)
    expect(crawlCacheTtlMs({ TESTER_CRAWL_CACHE_TTL_MS: '-5' } as NodeJS.ProcessEnv)).toBe(3600000)
    expect(crawlCacheTtlMs({ TESTER_CRAWL_CACHE_TTL_MS: '120000' } as NodeJS.ProcessEnv)).toBe(120000)
  })
})
