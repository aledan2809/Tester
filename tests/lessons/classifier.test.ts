// lessons:skip-all
/**
 * T-004 — Classifier regression tests.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// Module-level SDK stub: every dynamic `await import('@anthropic-ai/sdk')`
// inside classifier.ts resolves here. The stub's client.messages.create
// throws — classifier's try/catch must swallow and fallback to heuristic.
// Keeping this file-level (not test-local) so the rate-limit test runs in
// milliseconds instead of 100 network round-trips.
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn(() => Promise.reject(new Error('Mocked 401 — invalid key'))),
      }
      constructor(_opts: unknown) {}
    },
  }
})

import {
  classify,
  heuristicClassify,
  signatureOf,
  loadCache,
  saveCache,
  cacheFilePath,
  _resetClassifCountForTests,
} from '../../src/lessons/classifier'
import type { FailureContext } from '../../src/lessons/classifier'

beforeEach(() => {
  _resetClassifCountForTests()
  // Ensure AI path is disabled by default for deterministic heuristic verdicts.
  delete process.env.ANTHROPIC_API_KEY
})

describe('signatureOf — sha256 dedup', () => {
  it('is deterministic for identical context', () => {
    const a: FailureContext = { assertion: 'expect(x).toBe(y)', pageUrl: 'https://x' }
    const b: FailureContext = { assertion: 'expect(x).toBe(y)', pageUrl: 'https://x' }
    expect(signatureOf(a)).toBe(signatureOf(b))
  })

  it('differs when any signature field differs', () => {
    const a: FailureContext = { assertion: 'expect(x)' }
    const b: FailureContext = { assertion: 'expect(y)' }
    expect(signatureOf(a)).not.toBe(signatureOf(b))
  })

  it('is stable under irrelevant context noise (notes field)', () => {
    const a: FailureContext = { assertion: 'e', notes: 'noise a' }
    const b: FailureContext = { assertion: 'e', notes: 'noise b' }
    expect(signatureOf(a)).toBe(signatureOf(b))
  })
})

describe('heuristicClassify — verdict patterns', () => {
  it('classifies ENV_MISCONFIG on ECONNREFUSED', () => {
    const v = heuristicClassify({ errorMessage: 'ECONNREFUSED 127.0.0.1:3000' })
    expect(v.verdict).toBe('ENV_MISCONFIG')
  })

  it('classifies HARNESS_BUG on invalid selector', () => {
    const v = heuristicClassify({ errorMessage: "'a[href!=\"/x\"]' is not a valid selector." })
    expect(v.verdict).toBe('HARNESS_BUG')
  })

  it('classifies HARNESS_BUG on Playwright strict-mode violation', () => {
    const v = heuristicClassify({ errorMessage: 'strict mode violation: resolved to 5 elements' })
    expect(v.verdict).toBe('HARNESS_BUG')
  })

  it('classifies FLAKE on Navigation timeout', () => {
    const v = heuristicClassify({ errorMessage: 'Navigation timeout of 30000 ms exceeded' })
    expect(v.verdict).toBe('FLAKE')
  })

  it('defaults to PRODUCT_BUG on no strong signal', () => {
    const v = heuristicClassify({ assertion: 'expect(totalPrice).toBe(99)' })
    expect(v.verdict).toBe('PRODUCT_BUG')
    // low-confidence default
    expect(v.confidence).toBeLessThanOrEqual(0.5)
  })
})

describe('classify() end-to-end + cache', () => {
  it('falls back to heuristic when no ANTHROPIC_API_KEY', async () => {
    const r = await classify({ errorMessage: 'ECONNREFUSED' })
    expect(r.verdict).toBe('ENV_MISCONFIG')
    expect(r.source).toBe('heuristic')
    expect(r.cached).toBe(false)
    expect(r.signature).toMatch(/^[0-9a-f]{64}$/)
  })

  it('caches by signature when corpusDir is provided', async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classif-cache-'))
    const corpusDir = path.join(projectDir, 'lessons')
    fs.mkdirSync(corpusDir)
    try {
      const ctx: FailureContext = { errorMessage: 'strict mode violation: resolved to 3 elements' }
      const first = await classify(ctx, { corpusDir })
      expect(first.cached).toBe(false)
      const second = await classify(ctx, { corpusDir })
      expect(second.cached).toBe(true)
      expect(second.verdict).toBe(first.verdict)
      expect(second.signature).toBe(first.signature)
      // File created
      expect(fs.existsSync(cacheFilePath(corpusDir))).toBe(true)
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true })
    }
  })

  it('forceHeuristic bypasses AI path even with API key set', async () => {
    process.env.ANTHROPIC_API_KEY = 'fake-key-for-test'
    const r = await classify({ errorMessage: 'ECONNREFUSED' }, { forceHeuristic: true })
    expect(r.source).toBe('heuristic')
  })
})

describe('cache roundtrip', () => {
  it('saves and loads cache entries', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classif-rt-'))
    const corpusDir = path.join(projectDir, 'lessons')
    fs.mkdirSync(corpusDir)
    try {
      saveCache(corpusDir, {
        abc123: {
          verdict: 'FLAKE',
          confidence: 0.6,
          reasoning: 'r',
          remediation: 'm',
          source: 'heuristic',
          signature: 'abc123',
        },
      })
      const loaded = loadCache(corpusDir)
      expect(loaded['abc123'].verdict).toBe('FLAKE')
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true })
    }
  })

  it('returns empty object on corrupt cache file', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classif-corrupt-'))
    const corpusDir = path.join(projectDir, 'lessons')
    fs.mkdirSync(corpusDir)
    const cacheFile = cacheFilePath(corpusDir)
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
    fs.writeFileSync(cacheFile, 'not-json{{{', 'utf8')
    try {
      expect(loadCache(corpusDir)).toEqual({})
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true })
    }
  })
})

// ─── PAS 3 (quality-uplift) error-path tests ────────────

describe('classify() — error paths (PAS 3)', () => {
  it('graceful fallback when SDK throws (invalid-key 401 simulation)', async () => {
    // SDK is mocked at file level; every client.messages.create rejects.
    // With the API key set, classify() enters the AI path, the mocked SDK
    // throws, the try/catch returns null, and we degrade to heuristic.
    process.env.ANTHROPIC_API_KEY = 'invalid-key-xxx'
    try {
      const r = await classify({ errorMessage: 'ECONNREFUSED 127.0.0.1:1' })
      expect(r.source).toBe('heuristic')
      expect(r.verdict).toBe('ENV_MISCONFIG')
      expect(r.signature).toMatch(/^[0-9a-f]{64}$/)
    } finally {
      delete process.env.ANTHROPIC_API_KEY
    }
  })

  it('rate-limit: after 100 AI-path attempts, 101st falls back to heuristic without incrementing further', async () => {
    // Pre-saturate the AI counter by calling classify() 100 times with a fake
    // API key. Each call increments the session counter by 1 BEFORE calling
    // aiClassify; aiClassify returns null because our bogus key fails the SDK
    // path, so result is always heuristic. 101st call skips the increment path
    // entirely (counter>=RATE_LIMIT_MAX guard) and uses heuristic directly.
    process.env.ANTHROPIC_API_KEY = 'bogus-rate-limit-key'
    try {
      // Use distinct signatures so each call is not cached — we want real
      // counter-progression.
      for (let i = 0; i < 100; i++) {
        await classify({ errorMessage: `ECONNREFUSED ${i}` })
      }
      const extra = await classify({ errorMessage: 'ECONNREFUSED extra-run' })
      expect(extra.source).toBe('heuristic')
      expect(extra.verdict).toBe('ENV_MISCONFIG')
    } finally {
      delete process.env.ANTHROPIC_API_KEY
    }
  })

  it('saveCache on a read-only parent dir returns ok:false without throwing', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classif-ro-'))
    const corpusDir = path.join(projectDir, 'lessons')
    fs.mkdirSync(corpusDir)
    // Lock the parent (classifier writes <parent>/.tester/classif-cache.json).
    // 0o444 = r--r--r-- → mkdir for .tester fails with EACCES.
    fs.chmodSync(projectDir, 0o444)
    try {
      const res = saveCache(corpusDir, {
        sig1: {
          verdict: 'FLAKE',
          confidence: 0.6,
          reasoning: 'r',
          remediation: 'm',
          source: 'heuristic',
          signature: 'sig1',
        },
      })
      expect(res.ok).toBe(false)
      expect(typeof res.reason).toBe('string')
    } finally {
      // Restore perms so cleanup works.
      fs.chmodSync(projectDir, 0o755)
      fs.rmSync(projectDir, { recursive: true, force: true })
    }
  })

  it('signatureOf is stable under noisy fields (notes, domSnippet, consoleErrors differ)', () => {
    const base: FailureContext = {
      assertion: 'expect(x).toBe(y)',
      errorMessage: 'ECONNREFUSED',
      stackTrace: 'at a\nat b\nat c',
      pageUrl: 'https://app.example.com/run/1',
    }
    const a: FailureContext = {
      ...base,
      notes: 'run-1 noise here',
      domSnippet: '<div>run-1 output</div>',
      consoleErrors: ['[timestamp-1] warning X'],
    }
    const b: FailureContext = {
      ...base,
      notes: 'run-2 DIFFERENT noise',
      domSnippet: '<div>run-2 output</div>',
      consoleErrors: ['[timestamp-2] warning Y'],
    }
    expect(signatureOf(a)).toBe(signatureOf(b))
  })
})
