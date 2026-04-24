// lessons:skip-all
/**
 * T-010 close — Lighthouse runner (mocked spawn), trend JSONL, GitHub PR poster.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  appendTrendRecord,
  readTrend,
  computeWeekOverWeek,
  renderTrendMarkdown,
  perRouteSeries,
  defaultTrendPath,
} from '../../src/perf/trend'
import { postPrComment, parseGithubActionsContext } from '../../src/perf/github'

function mkProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'perf-ext-'))
}

describe('T-010 lighthouse runner (mocked spawn)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('parses Lighthouse JSON + returns PerfRun with mapped metrics', async () => {
    const fakeLhr = {
      audits: {
        'first-contentful-paint': { numericValue: 1200.7 },
        'largest-contentful-paint': { numericValue: 2201.1 },
        'interactive': { numericValue: 3100.4 },
        'cumulative-layout-shift': { numericValue: 0.087 },
        'total-byte-weight': { numericValue: 280_000.9 },
      },
    }

    vi.doMock('node:child_process', () => {
      const { EventEmitter } = require('node:events')
      return {
        spawn: vi.fn(() => {
          const proc = new EventEmitter() as EventEmitter & {
            stdout: EventEmitter
            stderr: EventEmitter
            kill: (s: string) => void
          }
          proc.stdout = new EventEmitter()
          proc.stderr = new EventEmitter()
          proc.kill = () => {}
          // Emit JSON + close(0) on next tick so the promise resolves.
          setImmediate(() => {
            proc.stdout.emit('data', Buffer.from(JSON.stringify(fakeLhr)))
            proc.emit('close', 0)
          })
          return proc
        }),
      }
    })

    const mod = await import('../../src/perf/lighthouse')
    const run = await mod.runLighthouse('https://app.example.com/home')
    expect(run.route).toBe('/home')
    expect(run.metrics.fcp_ms).toBe(1201) // rounded
    expect(run.metrics.lcp_ms).toBe(2201)
    expect(run.metrics.tti_ms).toBe(3100)
    expect(run.metrics.cls).toBe(0.087)
    expect(run.metrics.transfer_bytes).toBe(280001)
    vi.doUnmock('node:child_process')
  })

  it('runLighthouseMulti surfaces per-URL failure as empty metrics + stderr log', async () => {
    const origErr = process.stderr.write.bind(process.stderr)
    const errBuf: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(process.stderr as any).write = (chunk: string) => {
      errBuf.push(String(chunk))
      return true
    }
    try {
      vi.doMock('node:child_process', () => {
        const { EventEmitter } = require('node:events')
        return {
          spawn: vi.fn(() => {
            const proc = new EventEmitter() as EventEmitter & {
              stdout: EventEmitter
              stderr: EventEmitter
              kill: (s: string) => void
            }
            proc.stdout = new EventEmitter()
            proc.stderr = new EventEmitter()
            proc.kill = () => {}
            setImmediate(() => {
              proc.stderr.emit('data', Buffer.from('boom'))
              proc.emit('close', 1)
            })
            return proc
          }),
        }
      })
      const mod = await import('../../src/perf/lighthouse')
      const runs = await mod.runLighthouseMulti(['https://x/a', { url: 'https://x/b', alias: '/b-alias' }])
      expect(runs).toHaveLength(2)
      expect(runs[0].route).toBe('/a')
      expect(runs[1].route).toBe('/b-alias')
      // Metrics should be empty (parse / exit code failures).
      expect(runs[0].metrics).toEqual({})
      expect(errBuf.join('')).toMatch(/lighthouse.*failed/)
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(process.stderr as any).write = origErr
      vi.doUnmock('node:child_process')
    }
  })
})

describe('T-010 trend JSONL', () => {
  it('appends + reads records; skips corrupt lines', () => {
    const root = mkProject()
    try {
      expect(readTrend(root)).toEqual([])
      appendTrendRecord(root, {
        ts: '2026-04-01T00:00:00Z',
        runs: [{ route: '/home', metrics: { lcp_ms: 2000 } }],
      })
      appendTrendRecord(root, {
        ts: '2026-04-08T00:00:00Z',
        runs: [{ route: '/home', metrics: { lcp_ms: 2300 } }],
      })
      // Corrupt line directly appended
      fs.appendFileSync(defaultTrendPath(root), '{not-json\n', 'utf8')
      const records = readTrend(root)
      expect(records).toHaveLength(2)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('perRouteSeries groups + sorts ascending by ts', () => {
    const records = [
      {
        ts: '2026-04-10T00:00:00Z',
        runs: [{ route: '/home', metrics: { lcp_ms: 2300 } }],
      },
      {
        ts: '2026-04-01T00:00:00Z',
        runs: [{ route: '/home', metrics: { lcp_ms: 2000 } }],
      },
    ]
    const series = perRouteSeries(records)
    expect(series['/home']).toHaveLength(2)
    expect(series['/home'][0].ts < series['/home'][1].ts).toBe(true)
  })

  it('computeWeekOverWeek returns curr vs prev medians + sorted by |percent|', () => {
    const now = new Date('2026-04-20T00:00:00Z')
    const weekAgo = '2026-04-15T00:00:00Z'
    const twoWeeksAgo = '2026-04-08T00:00:00Z'
    const records = [
      { ts: twoWeeksAgo, runs: [{ route: '/home', metrics: { lcp_ms: 2000 } }] },
      { ts: twoWeeksAgo, runs: [{ route: '/home', metrics: { lcp_ms: 2100 } }] },
      { ts: weekAgo, runs: [{ route: '/home', metrics: { lcp_ms: 2300 } }] },
      { ts: weekAgo, runs: [{ route: '/home', metrics: { lcp_ms: 2500 } }] },
    ]
    const wow = computeWeekOverWeek(records, now)
    const home = wow.find((e) => e.route === '/home' && e.metric === 'lcp_ms')!
    expect(home.prev_week_median).toBe(2050) // median(2000, 2100)
    expect(home.curr_week_median).toBe(2400) // median(2300, 2500)
    expect(home.delta).toBe(350)
    expect(home.percent).toBeCloseTo((350 / 2050) * 100, 1)
  })

  it('renderTrendMarkdown emits the not-enough-data fallback on empty entries', () => {
    expect(renderTrendMarkdown([])).toMatch(/Not enough data/)
  })
})

describe('T-010 GitHub PR poster', () => {
  function makeFakeFetch(plan: Array<{ url?: RegExp; method?: string; res: Partial<Response> & { _body?: unknown } }>) {
    return vi.fn(async (url: string, init?: RequestInit) => {
      const step = plan.shift()
      if (!step) throw new Error(`Unexpected extra fetch: ${url}`)
      if (step.url && !step.url.test(url)) throw new Error(`URL mismatch: ${url} vs ${step.url}`)
      if (step.method && step.method !== (init?.method || 'GET')) {
        throw new Error(`Method mismatch: ${init?.method} vs ${step.method}`)
      }
      return {
        ok: step.res.ok ?? true,
        status: step.res.status ?? 200,
        json: async () => step.res._body,
        text: async () => JSON.stringify(step.res._body ?? ''),
      } as unknown as Response
    })
  }

  it('POSTs a new comment when no existing comment matches the marker', async () => {
    const fetchImpl = makeFakeFetch([
      {
        url: /issues\/42\/comments\?per_page=100/,
        method: 'GET',
        res: { ok: true, _body: [{ id: 1, body: 'unrelated' }] },
      },
      {
        url: /issues\/42\/comments$/,
        method: 'POST',
        res: { ok: true, status: 201, _body: { id: 99 } },
      },
    ])
    const r = await postPrComment({
      owner: 'o',
      repo: 'r',
      prNumber: 42,
      body: 'hello',
      marker: '<!-- tester-perf -->',
      token: 'fake',
      fetchImpl,
    })
    expect(r.ok).toBe(true)
    expect(r.action).toBe('created')
    expect(r.commentId).toBe(99)
  })

  it('PATCHes when an existing comment contains the marker (idempotent)', async () => {
    const fetchImpl = makeFakeFetch([
      {
        url: /issues\/42\/comments\?per_page=100/,
        method: 'GET',
        res: {
          ok: true,
          _body: [
            { id: 1, body: 'old' },
            { id: 88, body: 'prev with <!-- tester-perf -->' },
          ],
        },
      },
      {
        url: /issues\/comments\/88/,
        method: 'PATCH',
        res: { ok: true, status: 200, _body: { id: 88 } },
      },
    ])
    const r = await postPrComment({
      owner: 'o',
      repo: 'r',
      prNumber: 42,
      body: 'new',
      marker: '<!-- tester-perf -->',
      token: 'fake',
      fetchImpl,
    })
    expect(r.ok).toBe(true)
    expect(r.action).toBe('updated')
    expect(r.commentId).toBe(88)
  })

  it('returns error when GITHUB_TOKEN is missing', async () => {
    const old = process.env.GITHUB_TOKEN
    delete process.env.GITHUB_TOKEN
    try {
      const r = await postPrComment({
        owner: 'o',
        repo: 'r',
        prNumber: 1,
        body: 'x',
      })
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/GITHUB_TOKEN/)
    } finally {
      if (old) process.env.GITHUB_TOKEN = old
    }
  })

  it('parseGithubActionsContext returns null when not in a PR workflow', () => {
    const prior = {
      GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
      GITHUB_EVENT_PATH: process.env.GITHUB_EVENT_PATH,
    }
    try {
      delete process.env.GITHUB_REPOSITORY
      delete process.env.GITHUB_EVENT_PATH
      expect(parseGithubActionsContext()).toBeNull()
    } finally {
      if (prior.GITHUB_REPOSITORY) process.env.GITHUB_REPOSITORY = prior.GITHUB_REPOSITORY
      if (prior.GITHUB_EVENT_PATH) process.env.GITHUB_EVENT_PATH = prior.GITHUB_EVENT_PATH
    }
  })

  it('parseGithubActionsContext parses pull_request.number from event payload', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-evt-'))
    const evt = path.join(tmp, 'event.json')
    fs.writeFileSync(evt, JSON.stringify({ pull_request: { number: 77 } }), 'utf8')
    const prior = {
      GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
      GITHUB_EVENT_PATH: process.env.GITHUB_EVENT_PATH,
    }
    process.env.GITHUB_REPOSITORY = 'ownerX/repoY'
    process.env.GITHUB_EVENT_PATH = evt
    try {
      const ctx = parseGithubActionsContext()
      expect(ctx).toEqual({ owner: 'ownerX', repo: 'repoY', prNumber: 77 })
    } finally {
      if (prior.GITHUB_REPOSITORY) process.env.GITHUB_REPOSITORY = prior.GITHUB_REPOSITORY
      else delete process.env.GITHUB_REPOSITORY
      if (prior.GITHUB_EVENT_PATH) process.env.GITHUB_EVENT_PATH = prior.GITHUB_EVENT_PATH
      else delete process.env.GITHUB_EVENT_PATH
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
