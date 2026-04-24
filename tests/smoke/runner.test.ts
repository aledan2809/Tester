// lessons:skip-all
/**
 * T-C3 — smoke runner tests.
 */

import { describe, it, expect, vi } from 'vitest'
import { runSmoke, formatSmokeMarkdown } from '../../src/smoke/runner'

function makeFetch(responses: Record<string, { status: number; delayMs?: number; throwMsg?: string }>) {
  // Rank keys by "how specific they are for a given URL" — pick the key
  // that appears LATEST in the URL (substring position). Ties broken by
  // longer-key-wins. This handles `/api/health` vs `https://example.com/`
  // correctly.
  return vi.fn(async (url: string): Promise<Response> => {
    let best: [string, { status: number; delayMs?: number; throwMsg?: string }] | undefined
    let bestPos = -1
    let bestLen = -1
    for (const entry of Object.entries(responses)) {
      const idx = url.indexOf(entry[0])
      if (idx < 0) continue
      if (idx > bestPos || (idx === bestPos && entry[0].length > bestLen)) {
        best = entry
        bestPos = idx
        bestLen = entry[0].length
      }
    }
    if (!best) throw new Error(`unexpected fetch: ${url}`)
    const plan = best[1]
    if (plan.throwMsg) throw new Error(plan.throwMsg)
    if (plan.delayMs) await new Promise((r) => setTimeout(r, plan.delayMs))
    return {
      ok: plan.status >= 200 && plan.status < 400,
      status: plan.status,
      statusText: '',
    } as unknown as Response
  })
}

describe('T-C3 runSmoke', () => {
  it('passes when every URL returns 200', async () => {
    const r = await runSmoke({
      url: 'https://example.com/',
      healthPaths: ['/api/health'],
      fetchImpl: makeFetch({
        'https://example.com/': { status: 200 },
        '/api/health': { status: 200 },
      }),
    })
    expect(r.ok).toBe(true)
    expect(r.checks).toHaveLength(2)
    expect(r.failures).toEqual([])
  })

  it('fails when any URL returns non-2xx', async () => {
    const r = await runSmoke({
      url: 'https://example.com/',
      healthPaths: ['/api/health'],
      fetchImpl: makeFetch({
        'https://example.com/': { status: 200 },
        '/api/health': { status: 503 },
      }),
    })
    expect(r.ok).toBe(false)
    expect(r.failures.join(' ')).toMatch(/503/)
  })

  it('fails when a fetch throws', async () => {
    const r = await runSmoke({
      url: 'https://example.com/',
      fetchImpl: makeFetch({
        'https://example.com/': { status: 0, throwMsg: 'network error' },
      }),
    })
    expect(r.ok).toBe(false)
    expect(r.failures.join(' ')).toMatch(/network error/)
  })

  it('formats markdown report', () => {
    const md = formatSmokeMarkdown({
      ok: false,
      failures: ['https://x/ → 500'],
      checks: [{ url: 'https://x/', status: 500, ms: 42, ok: false }],
    })
    expect(md).toMatch(/✗ FAIL/)
    expect(md).toMatch(/\| URL \| Status \| ms \| OK \|/)
    expect(md).toMatch(/Failures/)
  })

  it('markdown for passing smoke shows PASS', () => {
    const md = formatSmokeMarkdown({
      ok: true,
      failures: [],
      checks: [{ url: 'https://x/', status: 200, ms: 30, ok: true }],
    })
    expect(md).toMatch(/✓ PASS/)
  })
})
