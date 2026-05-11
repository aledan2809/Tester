/**
 * T-004 — AI Failure Classifier — Unit Tests
 *
 * Tests:
 *   - buildFailureContext: defaults, domSnapshot truncation
 *   - ClassifierCache: signature, get/set, TTL, prune
 *   - classifyFailure: cache-hit path, no-api-key fallback, mocked AI call
 *   - classifyCommand: exit codes (mocked classifyFailure)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { buildFailureContext } from '../../src/classifier/failure-context'
import { ClassifierCache } from '../../src/classifier/cache'
import { classifyFailure } from '../../src/classifier/classifier'
import type { FailureContext } from '../../src/classifier/failure-context'
import type { FailureClassification } from '../../src/classifier/classifier'
import { classifyCommand } from '../../src/cli/commands/classify'

// ─── buildFailureContext ──────────────────────────────────────────────────────

describe('T-004 AI Failure Classifier', () => {
  describe('buildFailureContext()', () => {
    it('fills defaults for optional fields', () => {
      const ctx = buildFailureContext({
        assertion: 'Expected 200, got 404',
        pageUrl: 'https://example.com/api/users',
        testName: 'GET /api/users returns 200',
      })
      expect(ctx.domSnapshot).toBe('')
      expect(ctx.consoleLogs).toEqual([])
      expect(ctx.networkTail).toEqual([])
      expect(ctx.cssClasses).toEqual([])
      expect(ctx.timeToEventMs).toBeUndefined()
      expect(ctx.screenshotPath).toBeUndefined()
    })

    it('preserves provided values', () => {
      const ctx = buildFailureContext({
        assertion: 'Expected true',
        pageUrl: 'https://example.com',
        testName: 'login test',
        consoleLogs: ['[error] 401 Unauthorized'],
        cssClasses: ['btn', 'btn-primary'],
        timeToEventMs: 1234,
      })
      expect(ctx.consoleLogs).toEqual(['[error] 401 Unauthorized'])
      expect(ctx.cssClasses).toEqual(['btn', 'btn-primary'])
      expect(ctx.timeToEventMs).toBe(1234)
    })

    it('truncates domSnapshot at 4096 chars', () => {
      const big = 'a'.repeat(5000)
      const ctx = buildFailureContext({
        assertion: 'x',
        pageUrl: 'https://example.com',
        testName: 't',
        domSnapshot: big,
      })
      expect(ctx.domSnapshot.length).toBeLessThanOrEqual(4096 + 20)
      expect(ctx.domSnapshot).toContain('…[truncated]')
    })

    it('does not truncate domSnapshot ≤ 4096 chars', () => {
      const small = 'a'.repeat(100)
      const ctx = buildFailureContext({
        assertion: 'x',
        pageUrl: 'https://example.com',
        testName: 't',
        domSnapshot: small,
      })
      expect(ctx.domSnapshot).toBe(small)
      expect(ctx.domSnapshot).not.toContain('truncated')
    })
  })

  // ─── ClassifierCache ──────────────────────────────────────────────────────

  describe('ClassifierCache', () => {
    let tmpDir: string
    let dbPath: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tester-classif-'))
      dbPath = path.join(tmpDir, 'test.db')
    })
    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('returns null for unknown signature', () => {
      const cache = new ClassifierCache(dbPath)
      expect(cache.get('nonexistent')).toBeNull()
      cache.close()
    })

    it('stores and retrieves a result', () => {
      const cache = new ClassifierCache(dbPath)
      cache.set('sig1', {
        category: 'PRODUCT_BUG',
        confidence: 0.9,
        reason: 'The API returned 500.',
        remediation: 'Fix the server-side handler.',
      })
      const r = cache.get('sig1')
      expect(r).not.toBeNull()
      expect(r!.category).toBe('PRODUCT_BUG')
      expect(r!.confidence).toBe(0.9)
      expect(r!.cached).toBe(true)
      expect(r!.signature).toBe('sig1')
      cache.close()
    })

    it('returns null after TTL expires', () => {
      const cache = new ClassifierCache(dbPath, 0) // 0 days = expired immediately
      cache.set('sig2', {
        category: 'FLAKE',
        confidence: 0.5,
        reason: 'Timing issue.',
        remediation: 'Retry the test.',
      })
      expect(cache.get('sig2')).toBeNull()
      cache.close()
    })

    it('prune removes expired entries', () => {
      const cache = new ClassifierCache(dbPath, 0)
      cache.set('sig3', {
        category: 'HARNESS_BUG',
        confidence: 0.8,
        reason: 'Wrong selector.',
        remediation: 'Use data-testid.',
      })
      const removed = cache.prune()
      expect(removed).toBe(1)
      cache.close()
    })

    it('signature is deterministic', () => {
      const ctx: FailureContext = buildFailureContext({
        assertion: 'Expected 200',
        pageUrl: 'https://example.com',
        testName: 'test',
        domSnapshot: '<div class="btn">Click</div>',
      })
      const s1 = ClassifierCache.signature(ctx)
      const s2 = ClassifierCache.signature(ctx)
      expect(s1).toBe(s2)
      expect(s1).toHaveLength(64) // sha256 hex
    })

    it('signature differs when assertion changes', () => {
      const base = { pageUrl: 'https://example.com', testName: 't', domSnapshot: '' }
      const s1 = ClassifierCache.signature(buildFailureContext({ ...base, assertion: 'A' }))
      const s2 = ClassifierCache.signature(buildFailureContext({ ...base, assertion: 'B' }))
      expect(s1).not.toBe(s2)
    })

    it('signature differs when pageUrl changes', () => {
      const base = { assertion: 'x', testName: 't', domSnapshot: '' }
      const s1 = ClassifierCache.signature(buildFailureContext({ ...base, pageUrl: 'https://a.com' }))
      const s2 = ClassifierCache.signature(buildFailureContext({ ...base, pageUrl: 'https://b.com' }))
      expect(s1).not.toBe(s2)
    })

    it('overwrites on duplicate set', () => {
      const cache = new ClassifierCache(dbPath)
      cache.set('sig4', { category: 'FLAKE', confidence: 0.3, reason: 'r', remediation: 'fix' })
      cache.set('sig4', { category: 'PRODUCT_BUG', confidence: 0.9, reason: 'r2', remediation: 'fix2' })
      const r = cache.get('sig4')
      expect(r!.category).toBe('PRODUCT_BUG')
      cache.close()
    })
  })

  // ─── classifyFailure ─────────────────────────────────────────────────────

  describe('classifyFailure()', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tester-cf-'))
    })
    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      delete process.env.ANTHROPIC_API_KEY
    })

    function makeCtx(overrides: Partial<FailureContext> = {}): FailureContext {
      return buildFailureContext({
        assertion: 'Expected status 200, got 500',
        pageUrl: 'https://example.com/api/orders',
        testName: 'POST /api/orders happy path',
        ...overrides,
      })
    }

    it('returns FLAKE fallback when no API key', async () => {
      delete process.env.ANTHROPIC_API_KEY
      const result = await classifyFailure(makeCtx(), { cacheDir: tmpDir })
      expect(result.category).toBe('FLAKE')
      expect(result.confidence).toBe(0)
      expect(result.cached).toBe(false)
    })

    it('returns cached result on second call (no API key needed for cache hit)', async () => {
      const cache = new ClassifierCache(path.join(tmpDir, 'classif-cache.db'))
      const ctx = makeCtx()
      const sig = ClassifierCache.signature(ctx)
      cache.set(sig, { category: 'HARNESS_BUG', confidence: 0.85, reason: 'bad selector', remediation: 'use data-testid' })
      cache.close()

      const result = await classifyFailure(ctx, { cacheDir: tmpDir })
      expect(result.category).toBe('HARNESS_BUG')
      expect(result.cached).toBe(true)
    })

    it('forceRefresh bypasses cache and re-classifies', async () => {
      delete process.env.ANTHROPIC_API_KEY
      const cache = new ClassifierCache(path.join(tmpDir, 'classif-cache.db'))
      const ctx = makeCtx()
      const sig = ClassifierCache.signature(ctx)
      cache.set(sig, { category: 'HARNESS_BUG', confidence: 0.85, reason: 'cached', remediation: 'cached fix' })
      cache.close()

      const result = await classifyFailure(ctx, { cacheDir: tmpDir, forceRefresh: true })
      // No API key → falls back to FLAKE (not the cached HARNESS_BUG)
      expect(result.category).toBe('FLAKE')
      expect(result.cached).toBe(false)
    })

    it('result has all required fields', async () => {
      delete process.env.ANTHROPIC_API_KEY
      const result = await classifyFailure(makeCtx(), { cacheDir: tmpDir })
      expect(typeof result.category).toBe('string')
      expect(typeof result.confidence).toBe('number')
      expect(typeof result.reason).toBe('string')
      expect(typeof result.remediation).toBe('string')
      expect(typeof result.signature).toBe('string')
      expect(typeof result.cached).toBe('boolean')
    })

    it('result is written to cache after first call', async () => {
      delete process.env.ANTHROPIC_API_KEY
      const ctx = makeCtx()
      await classifyFailure(ctx, { cacheDir: tmpDir })

      // Second call should hit cache
      const result2 = await classifyFailure(ctx, { cacheDir: tmpDir })
      expect(result2.cached).toBe(true)
    })
  })

  // ─── classifyCommand exit codes ──────────────────────────────────────────

  describe('classifyCommand() — exit codes', () => {
    let exitSpy: ReturnType<typeof vi.spyOn>
    let tmpDir: string

    beforeEach(() => {
      exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tester-cc-'))
    })
    afterEach(() => {
      exitSpy.mockRestore()
      fs.rmSync(tmpDir, { recursive: true, force: true })
      delete process.env.ANTHROPIC_API_KEY
    })

    it('exits 2 when report file not found', async () => {
      await classifyCommand('/nonexistent/path/report.json', { cacheDir: tmpDir })
      expect(exitSpy).toHaveBeenCalledWith(2)
    })

    it('exits 2 when report file has invalid JSON', async () => {
      const bad = path.join(tmpDir, 'bad.json')
      fs.writeFileSync(bad, 'not json', 'utf8')
      await classifyCommand(bad, { cacheDir: tmpDir })
      expect(exitSpy).toHaveBeenCalledWith(2)
    })

    it('exits 0 when no PRODUCT_BUG (no API key → FLAKE)', async () => {
      delete process.env.ANTHROPIC_API_KEY
      const report = path.join(tmpDir, 'report.json')
      fs.writeFileSync(
        report,
        JSON.stringify([
          { assertion: 'Expected true', pageUrl: 'https://x.com', testName: 'flaky test' },
        ]),
        'utf8',
      )
      await classifyCommand(report, { cacheDir: tmpDir })
      expect(exitSpy).toHaveBeenCalledWith(0)
    })

    it('exits 1 when PRODUCT_BUG found (pre-seeded cache)', async () => {
      const ctx = buildFailureContext({
        assertion: 'Expected 200, got 500',
        pageUrl: 'https://example.com',
        testName: 'broken API',
      })
      const cache = new ClassifierCache(path.join(tmpDir, 'classif-cache.db'))
      cache.set(ClassifierCache.signature(ctx), {
        category: 'PRODUCT_BUG',
        confidence: 0.95,
        reason: 'Server returned 500.',
        remediation: 'Fix the handler.',
      })
      cache.close()

      const report = path.join(tmpDir, 'report.json')
      fs.writeFileSync(
        report,
        JSON.stringify([{ assertion: ctx.assertion, pageUrl: ctx.pageUrl, testName: ctx.testName }]),
        'utf8',
      )
      await classifyCommand(report, { cacheDir: tmpDir })
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('accepts a single object (not array) as input', async () => {
      delete process.env.ANTHROPIC_API_KEY
      const report = path.join(tmpDir, 'single.json')
      fs.writeFileSync(
        report,
        JSON.stringify({ assertion: 'Expected true', pageUrl: 'https://x.com', testName: 'single' }),
        'utf8',
      )
      await classifyCommand(report, { cacheDir: tmpDir })
      expect(exitSpy).toHaveBeenCalledWith(0)
    })

    it('writes JSON to --out file when --json set', async () => {
      delete process.env.ANTHROPIC_API_KEY
      const report = path.join(tmpDir, 'report.json')
      const outFile = path.join(tmpDir, 'out.json')
      fs.writeFileSync(
        report,
        JSON.stringify([{ assertion: 'x', pageUrl: 'https://x.com', testName: 't' }]),
        'utf8',
      )
      await classifyCommand(report, { json: true, out: outFile, cacheDir: tmpDir })
      expect(fs.existsSync(outFile)).toBe(true)
      const content = JSON.parse(fs.readFileSync(outFile, 'utf8'))
      expect(Array.isArray(content)).toBe(true)
      expect(content[0]).toHaveProperty('category')
    })
  })
})
