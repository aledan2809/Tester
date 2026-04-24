// lessons:skip-all
/**
 * T-004 — Classifier regression tests.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
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
