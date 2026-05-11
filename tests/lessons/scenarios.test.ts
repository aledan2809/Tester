/**
 * Audit-Suite Module C — scenarios runner tests (offline, zero network).
 *
 * Covers:
 *  - makeFilterPredicate (glob matching)
 *  - discoverScenarios (file discovery + filter)
 *  - runScenarios with mock loader
 *  - ScenarioSession (token, cookies, fetch injection)
 *  - ScenarioAssertions (status, json, header)
 *  - CLI registration (tester scenarios run exists)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { makeFilterPredicate, discoverScenarios, runScenarios } from '../../src/scenarios/runner'
import type { ScenarioContext, ScenarioOutcome, ScenarioFn, ScenarioLoader } from '../../src/scenarios/runner'
import { ScenarioSession } from '../../src/scenarios/session'
import { ScenarioAssertions, AssertionError } from '../../src/scenarios/assertions'

// ── Helpers ───────────────────────────────────────────────────────────────────

let tmpDir: string

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tester-scenarios-'))
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

/** Build a mock loader that returns a predetermined function for each file name. */
function mockLoader(map: Record<string, ScenarioFn | 'no-export'>): ScenarioLoader {
  return async (filePath: string) => {
    const name = path.basename(filePath, path.extname(filePath))
    const fn = map[name]
    if (fn === 'no-export') return {}
    if (fn) return { runScenario: fn }
    return { runScenario: async () => ({ status: 'PASS', durationMs: 0 }) }
  }
}

function makeRes(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

// ── makeFilterPredicate ────────────────────────────────────────────────────────

describe('makeFilterPredicate', () => {
  it('empty filter list matches everything', () => {
    const pred = makeFilterPredicate([])
    expect(pred('E1-happy-path')).toBe(true)
    expect(pred('anything')).toBe(true)
  })

  it('exact match is case-insensitive', () => {
    const pred = makeFilterPredicate(['H1'])
    expect(pred('H1')).toBe(true)
    expect(pred('h1')).toBe(true)
    expect(pred('H2')).toBe(false)
  })

  it('glob * matches any number of characters', () => {
    const pred = makeFilterPredicate(['E*'])
    expect(pred('E1-happy-path')).toBe(true)
    expect(pred('E13-rfq')).toBe(true)
    expect(pred('F1-concurrency')).toBe(false)
  })

  it('multiple patterns are OR-combined', () => {
    const pred = makeFilterPredicate(['E*', 'F*'])
    expect(pred('E1')).toBe(true)
    expect(pred('F3')).toBe(true)
    expect(pred('H1')).toBe(false)
  })

  it('mix of exact and glob', () => {
    const pred = makeFilterPredicate(['E*', 'H1'])
    expect(pred('E7')).toBe(true)
    expect(pred('H1')).toBe(true)
    expect(pred('H2')).toBe(false)
  })

  it('pattern without wildcard does not partial-match', () => {
    const pred = makeFilterPredicate(['E1'])
    expect(pred('E1-happy-path')).toBe(false) // basename != "E1"
    expect(pred('E1')).toBe(true)
  })
})

// ── discoverScenarios ─────────────────────────────────────────────────────────

describe('discoverScenarios', () => {
  let suiteDir: string

  beforeAll(() => {
    suiteDir = fs.mkdtempSync(path.join(tmpDir, 'suite-'))
    fs.writeFileSync(path.join(suiteDir, 'E1-happy-path.ts'), '', 'utf8')
    fs.writeFileSync(path.join(suiteDir, 'E2-partial.ts'), '', 'utf8')
    fs.writeFileSync(path.join(suiteDir, 'F1-concurrency.ts'), '', 'utf8')
    fs.writeFileSync(path.join(suiteDir, 'H1-parity.ts'), '', 'utf8')
    fs.writeFileSync(path.join(suiteDir, 'not-a-scenario.d.ts'), '', 'utf8') // should be excluded
    fs.writeFileSync(path.join(suiteDir, 'readme.md'), '', 'utf8') // should be excluded
  })

  it('returns empty array for non-existent directory', () => {
    expect(discoverScenarios('/no/such/dir', [])).toEqual([])
  })

  it('discovers all .ts files (excluding .d.ts)', () => {
    const files = discoverScenarios(suiteDir, [])
    expect(files).toHaveLength(4)
    expect(files.every((f) => f.endsWith('.ts'))).toBe(true)
    expect(files.some((f) => f.endsWith('.d.ts'))).toBe(false)
  })

  it('applies filter predicate on basename without extension', () => {
    const files = discoverScenarios(suiteDir, ['E*'])
    expect(files).toHaveLength(2)
    expect(files.every((f) => path.basename(f).startsWith('E'))).toBe(true)
  })

  it('returns results sorted alphabetically', () => {
    const files = discoverScenarios(suiteDir, [])
    const names = files.map((f) => path.basename(f))
    expect(names).toEqual([...names].sort())
  })

  it('returns absolute paths', () => {
    const files = discoverScenarios(suiteDir, [])
    expect(files.every((f) => path.isAbsolute(f))).toBe(true)
  })
})

// ── runScenarios ─────────────────────────────────────────────────────────────

describe('runScenarios — mock loader', () => {
  let suiteDir: string

  beforeAll(() => {
    suiteDir = fs.mkdtempSync(path.join(tmpDir, 'run-'))
    // Create 3 scenario files
    fs.writeFileSync(path.join(suiteDir, 'E1.ts'), '', 'utf8')
    fs.writeFileSync(path.join(suiteDir, 'E2.ts'), '', 'utf8')
    fs.writeFileSync(path.join(suiteDir, 'F1.ts'), '', 'utf8')
  })

  it('passes context to each scenario', async () => {
    const seen: string[] = []
    const loader = mockLoader({
      E1: async (ctx: ScenarioContext) => {
        seen.push(ctx.baseUrl)
        return { status: 'PASS', durationMs: 1 }
      },
      E2: async (ctx: ScenarioContext) => {
        seen.push(ctx.baseUrl)
        return { status: 'PASS', durationMs: 1 }
      },
      F1: async (ctx: ScenarioContext) => {
        seen.push(ctx.baseUrl)
        return { status: 'PASS', durationMs: 1 }
      },
    })
    const report = await runScenarios({ suiteDir, baseUrl: 'https://test.local', loader })
    expect(seen).toHaveLength(3)
    expect(seen.every((u) => u === 'https://test.local')).toBe(true)
  })

  it('counts PASS / FAIL / SKIP correctly', async () => {
    const loader = mockLoader({
      E1: async () => ({ status: 'PASS', durationMs: 1 }),
      E2: async () => ({ status: 'FAIL', error: 'boom', durationMs: 1 }),
      F1: async () => ({ status: 'SKIP', reason: 'not ready' }),
    })
    const report = await runScenarios({ suiteDir, loader })
    expect(report.pass).toBe(1)
    expect(report.fail).toBe(1)
    expect(report.skip).toBe(1)
    expect(report.total).toBe(3)
  })

  it('catches thrown errors and marks scenario FAIL', async () => {
    const loader = mockLoader({
      E1: async () => { throw new Error('unexpected crash') },
      E2: async () => ({ status: 'PASS', durationMs: 1 }),
      F1: async () => ({ status: 'PASS', durationMs: 1 }),
    })
    const report = await runScenarios({ suiteDir, loader })
    const e1 = report.results.find((r) => r.name === 'E1')!
    expect(e1.outcome.status).toBe('FAIL')
    expect((e1.outcome as { error: string }).error).toContain('unexpected crash')
  })

  it('marks FAIL when loader returns module with no runScenario export', async () => {
    const loader = mockLoader({ E1: 'no-export', E2: 'no-export', F1: 'no-export' })
    const report = await runScenarios({ suiteDir, loader })
    expect(report.fail).toBe(3)
    expect(report.results[0].outcome.status).toBe('FAIL')
  })

  it('filters scenarios by pattern', async () => {
    const seen: string[] = []
    const loader = mockLoader({
      E1: async (ctx) => { seen.push('E1'); return { status: 'PASS', durationMs: 0 } },
      E2: async (ctx) => { seen.push('E2'); return { status: 'PASS', durationMs: 0 } },
      F1: async (ctx) => { seen.push('F1'); return { status: 'PASS', durationMs: 0 } },
    })
    await runScenarios({ suiteDir, filters: ['E*'], loader })
    expect(seen).toContain('E1')
    expect(seen).toContain('E2')
    expect(seen).not.toContain('F1')
  })

  it('log messages are captured per scenario', async () => {
    const loader = mockLoader({
      E1: async (ctx) => { ctx.log('step 1 ok'); return { status: 'PASS', durationMs: 0 } },
      E2: async () => ({ status: 'PASS', durationMs: 0 }),
      F1: async () => ({ status: 'PASS', durationMs: 0 }),
    })
    const report = await runScenarios({ suiteDir, loader })
    const e1 = report.results.find((r) => r.name === 'E1')!
    expect(e1.logs).toHaveLength(1)
    expect(e1.logs[0]).toContain('step 1 ok')
  })

  it('returns empty report for empty suite dir', async () => {
    const empty = fs.mkdtempSync(path.join(tmpDir, 'empty-'))
    const report = await runScenarios({ suiteDir: empty, loader: mockLoader({}) })
    expect(report.total).toBe(0)
    expect(report.pass).toBe(0)
  })
})

// ── ScenarioSession ───────────────────────────────────────────────────────────

describe('ScenarioSession', () => {
  it('getToken returns null initially', () => {
    const s = new ScenarioSession()
    expect(s.getToken()).toBeNull()
  })

  it('setToken / getToken round-trip', () => {
    const s = new ScenarioSession()
    s.setToken('tok-abc')
    expect(s.getToken()).toBe('tok-abc')
  })

  it('getCookieHeader returns empty string with no cookies', () => {
    const s = new ScenarioSession()
    expect(s.getCookieHeader()).toBe('')
  })

  it('getCookieHeader formats multiple cookies', () => {
    const s = new ScenarioSession()
    s.setCookie('session', 'abc')
    s.setCookie('csrf', 'xyz')
    const header = s.getCookieHeader()
    expect(header).toContain('session=abc')
    expect(header).toContain('csrf=xyz')
  })

  it('fetch injects Authorization header when token is set', async () => {
    const s = new ScenarioSession()
    s.setToken('my-token')
    let capturedHeaders: Headers | null = null
    const origFetch = globalThis.fetch
    globalThis.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers as HeadersInit | undefined)
      return new Response('{}', { status: 200 })
    }
    try {
      await s.fetch('http://example.com/api')
      expect(capturedHeaders!.get('Authorization')).toBe('Bearer my-token')
    } finally {
      globalThis.fetch = origFetch
    }
  })

  it('fetch injects Cookie header when cookies are set', async () => {
    const s = new ScenarioSession()
    s.setCookie('auth', 'xyz')
    let capturedHeaders: Headers | null = null
    const origFetch = globalThis.fetch
    globalThis.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers as HeadersInit | undefined)
      return new Response('{}', { status: 200 })
    }
    try {
      await s.fetch('http://example.com/api')
      expect(capturedHeaders!.get('Cookie')).toContain('auth=xyz')
    } finally {
      globalThis.fetch = origFetch
    }
  })

  it('login throws on non-2xx response', async () => {
    const s = new ScenarioSession()
    const origFetch = globalThis.fetch
    globalThis.fetch = async () => new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' })
    try {
      await expect(s.login('http://example.com/login', { email: 'a', password: 'b' })).rejects.toThrow(
        'Login failed: 401',
      )
    } finally {
      globalThis.fetch = origFetch
    }
  })

  it('login extracts token from response json.token', async () => {
    const s = new ScenarioSession()
    const origFetch = globalThis.fetch
    globalThis.fetch = async () => new Response(JSON.stringify({ token: 'jwt-abc' }), { status: 200 })
    try {
      await s.login('http://example.com/login', { email: 'a', password: 'b' })
      expect(s.getToken()).toBe('jwt-abc')
    } finally {
      globalThis.fetch = origFetch
    }
  })
})

// ── ScenarioAssertions ────────────────────────────────────────────────────────

describe('ScenarioAssertions', () => {
  const assert = new ScenarioAssertions()

  it('status: passes when code matches', () => {
    const res = makeRes(200)
    expect(() => assert.status(res, 200)).not.toThrow()
  })

  it('status: throws AssertionError on mismatch', () => {
    const res = makeRes(404)
    expect(() => assert.status(res, 200)).toThrow(AssertionError)
    expect(() => assert.status(res, 200)).toThrow('Expected HTTP 200, got 404')
  })

  it('json: passes when field matches', async () => {
    const res = makeRes(200, { user: { id: 42 } })
    await expect(assert.json(res, 'user.id', 42)).resolves.toBeUndefined()
  })

  it('json: throws AssertionError on field mismatch', async () => {
    const res = makeRes(200, { status: 'active' })
    await expect(assert.json(res, 'status', 'inactive')).rejects.toThrow(AssertionError)
  })

  it('header: passes when value is present and matches', () => {
    const res = makeRes(200, {}, { 'content-type': 'application/json; charset=utf-8' })
    expect(() => assert.header(res, 'content-type', 'application/json')).not.toThrow()
  })

  it('header: throws when header is absent', () => {
    const res = makeRes(200)
    expect(() => assert.header(res, 'x-custom-header', 'value')).toThrow(AssertionError)
    expect(() => assert.header(res, 'x-custom-header', 'value')).toThrow('Expected header')
  })
})

// ── CLI registration ──────────────────────────────────────────────────────────

describe('CLI — tester scenarios', () => {
  it('scenarios command is registered', async () => {
    const { Command } = await import('commander')
    const { registerScenarios } = await import('../../src/cli/commands/scenarios')
    const program = new Command()
    registerScenarios(program)
    const cmd = program.commands.find((c) => c.name() === 'scenarios')
    expect(cmd).toBeDefined()
  })

  it('scenarios run sub-command is registered', async () => {
    const { Command } = await import('commander')
    const { registerScenarios } = await import('../../src/cli/commands/scenarios')
    const program = new Command()
    registerScenarios(program)
    const scenarios = program.commands.find((c) => c.name() === 'scenarios')!
    const run = scenarios.commands.find((c) => c.name() === 'run')
    expect(run).toBeDefined()
  })

  it('scenarios run requires --suite option', async () => {
    const { Command } = await import('commander')
    const { registerScenarios } = await import('../../src/cli/commands/scenarios')
    const program = new Command().exitOverride()
    registerScenarios(program)
    expect(() => program.parse(['node', 'tester', 'scenarios', 'run'])).toThrow()
  })
})
