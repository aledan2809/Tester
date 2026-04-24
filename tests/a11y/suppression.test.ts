// lessons:skip-all
/**
 * T-009 — suppressed_until + HTML diff + runtime scan writer tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { diffAgainstBaseline, type BaselineFile } from '../../src/a11y/baseline'
import { writeA11yHtmlReport, renderA11yHtml } from '../../src/a11y/html-report'
import { runAllA11y, writeA11yScanFile } from '../../src/a11y/runtime'

function mkProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-sup-'))
}

describe('T-009 suppressed_until', () => {
  const baseline: BaselineFile = {
    project: 'demo',
    captured_at: '2026-04-01',
    routes: {
      '/home': {
        violations: [
          {
            id: 'color-contrast',
            impact: 'serious',
            count: 3,
            suppressed_until: '2999-12-31',
            suppressed_reason: 'design is refreshing new palette',
          },
        ],
      },
    },
  }

  it('future suppressed_until bucketizes as suppressed + does NOT fire regression', () => {
    const r = diffAgainstBaseline(baseline, [
      { route: '/home', violations: [{ id: 'color-contrast', impact: 'serious', count: 10 }] },
    ])
    expect(r.regression).toBe(false)
    const home = r.routes.find((x) => x.route === '/home')!
    expect(home.suppressed.length).toBe(1)
    expect(home.suppressed[0].suppressed).toBe(true)
    expect(home.new_or_worse.length).toBe(0)
  })

  it('past suppressed_until falls through to regular diff (regression fires)', () => {
    const baselinePast: BaselineFile = {
      ...baseline,
      routes: {
        '/home': {
          violations: [
            {
              id: 'color-contrast',
              impact: 'serious',
              count: 3,
              suppressed_until: '2020-01-01',
            },
          ],
        },
      },
    }
    const r = diffAgainstBaseline(baselinePast, [
      { route: '/home', violations: [{ id: 'color-contrast', impact: 'serious', count: 10 }] },
    ])
    expect(r.regression).toBe(true)
    const home = r.routes.find((x) => x.route === '/home')!
    expect(home.new_or_worse.some((e) => e.id === 'color-contrast')).toBe(true)
    expect(home.suppressed.length).toBe(0)
  })

  it('invalid suppressed_until ISO is treated as not-suppressed', () => {
    const b: BaselineFile = {
      ...baseline,
      routes: {
        '/home': {
          violations: [
            { id: 'x', impact: 'serious', count: 1, suppressed_until: 'not-a-date' },
          ],
        },
      },
    }
    const r = diffAgainstBaseline(b, [
      { route: '/home', violations: [{ id: 'x', impact: 'serious', count: 5 }] },
    ])
    expect(r.routes[0].suppressed.length).toBe(0)
  })

  it('opts.now allows deterministic time-travel testing', () => {
    const b: BaselineFile = {
      project: 'demo',
      captured_at: '2026-04-01',
      routes: {
        '/home': {
          violations: [
            { id: 'x', impact: 'serious', count: 2, suppressed_until: '2026-06-01' },
          ],
        },
      },
    }
    // A now BEFORE the suppression → suppressed
    const r1 = diffAgainstBaseline(
      b,
      [{ route: '/home', violations: [{ id: 'x', impact: 'serious', count: 5 }] }],
      { now: new Date('2026-05-01') },
    )
    expect(r1.routes[0].suppressed.length).toBe(1)
    // A now AFTER → regression
    const r2 = diffAgainstBaseline(
      b,
      [{ route: '/home', violations: [{ id: 'x', impact: 'serious', count: 5 }] }],
      { now: new Date('2026-07-01') },
    )
    expect(r2.regression).toBe(true)
  })
})

describe('T-009 HTML diff report', () => {
  it('renders regression banner + per-route sections', () => {
    const html = renderA11yHtml(
      {
        project: 'demo',
        baselinePath: 'x',
        regression: true,
        routes: [
          {
            route: '/home',
            new_or_worse: [{ id: 'color-contrast', impact: 'serious', baseline: 0, current: 3, delta: 3 }],
            fixed: [{ id: 'label', impact: 'critical', baseline: 2, current: 0, delta: -2 }],
            unchanged: [],
            suppressed: [
              {
                id: 'aria-valid-attr',
                impact: 'moderate',
                baseline: 1,
                current: 1,
                delta: 0,
                suppressed: true,
                suppressed_until: '2999-12-31',
              },
            ],
          },
        ],
      },
      undefined,
    )
    expect(html).toMatch(/✗ Regression/)
    expect(html).toMatch(/\/home/)
    expect(html).toMatch(/New \/ worse/)
    expect(html).toMatch(/Fixed/)
    expect(html).toMatch(/Suppressed \(time-boxed\)/)
    expect(html).toMatch(/aria-valid-attr/)
  })

  it('renders OK banner when no regression', () => {
    const html = renderA11yHtml(
      { project: 'demo', baselinePath: 'x', regression: false, routes: [] },
      undefined,
    )
    expect(html).toMatch(/✓ No a11y regression/)
  })

  it('writeA11yHtmlReport persists HTML to disk + creates parent dirs', async () => {
    const root = mkProject()
    try {
      const out = path.join(root, 'nested', 'dir', 'a11y.html')
      const file = await writeA11yHtmlReport({
        project: 'demo',
        diff: { project: 'demo', baselinePath: 'x', regression: false, routes: [] },
        outputPath: out,
      })
      expect(file).toBe(out)
      expect(fs.existsSync(out)).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('T-009 runtime — runAllA11y + writeA11yScanFile', () => {
  // Mock BrowserCoreLike + Page + assertion/a11y module. Goal is to verify
  // the batch iteration + aggregation + JSON write, not axe itself.
  it('aggregates violations across targets and produces RouteScan[] shape', async () => {
    const { vi } = await import('vitest')
    vi.resetModules()

    // Stub runA11yScan to return a stable summary depending on the URL.
    vi.doMock('../../src/assertions/a11y', () => ({
      runA11yScan: vi.fn(async (_page: unknown) => ({
        critical: 1,
        serious: 2,
        moderate: 0,
        minor: 0,
        violations: [
          { id: 'label', impact: 'critical', nodes: 1, description: '' },
          { id: 'color-contrast', impact: 'serious', nodes: 2, description: '' },
        ],
      })),
    }))

    const runtimeMod = (await import('../../src/a11y/runtime')) as typeof import('../../src/a11y/runtime')
    const fakePage = {} as unknown as import('puppeteer').Page
    const browser = {
      goto: async (_url: string) => 200,
      getPage: () => fakePage,
    }
    const targets = [
      { url: 'https://app.example.com/home' },
      { url: 'https://app.example.com/admin' },
    ]
    const scans = await runtimeMod.runAllA11y(browser, targets)
    expect(scans).toHaveLength(2)
    expect(scans[0].route).toBe('/home')
    expect(scans[1].route).toBe('/admin')
    // Aggregation: critical count 1 + serious count 2 = 2 violations per scan.
    expect(scans[0].violations.length).toBe(2)

    const root = mkProject()
    try {
      const out = path.join(root, 'a11y-scan.json')
      await runtimeMod.writeA11yScanFile(out, scans, 'demo')
      const parsed = JSON.parse(fs.readFileSync(out, 'utf8'))
      expect(parsed.project).toBe('demo')
      expect(parsed.scans).toHaveLength(2)
      expect(parsed.generatedAt).toBeTruthy()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
    vi.doUnmock('../../src/assertions/a11y')
  })

  it('honors maxPages + filter options', async () => {
    const { vi } = await import('vitest')
    vi.resetModules()
    vi.doMock('../../src/assertions/a11y', () => ({
      runA11yScan: vi.fn(async () => ({
        critical: 0,
        serious: 0,
        moderate: 0,
        minor: 0,
        violations: [],
      })),
    }))
    const runtimeMod = (await import('../../src/a11y/runtime')) as typeof import('../../src/a11y/runtime')
    const fakePage = {} as unknown as import('puppeteer').Page
    const browser = { goto: async () => 200, getPage: () => fakePage }
    const scans = await runtimeMod.runAllA11y(
      browser,
      [
        { url: 'https://x/a' },
        { url: 'https://x/b' },
        { url: 'https://x/c' },
      ],
      { maxPages: 2 },
    )
    expect(scans).toHaveLength(2)

    const filtered = await runtimeMod.runAllA11y(
      browser,
      [
        { url: 'https://x/keep' },
        { url: 'https://x/skip-me' },
      ],
      { filter: (t) => !t.url.includes('skip') },
    )
    expect(filtered.every((s) => !s.route.includes('skip'))).toBe(true)
    vi.doUnmock('../../src/assertions/a11y')
  })

  it('swallows per-page errors + still produces a scan entry', async () => {
    const { vi } = await import('vitest')
    vi.resetModules()
    vi.doMock('../../src/assertions/a11y', () => ({
      runA11yScan: vi.fn(async () => {
        throw new Error('axe crashed')
      }),
    }))
    const runtimeMod = (await import('../../src/a11y/runtime')) as typeof import('../../src/a11y/runtime')
    const fakePage = {} as unknown as import('puppeteer').Page
    const browser = { goto: async () => 200, getPage: () => fakePage }
    const scans = await runtimeMod.runAllA11y(browser, [{ url: 'https://x/home' }])
    expect(scans).toHaveLength(1)
    expect(scans[0].violations).toEqual([])
    vi.doUnmock('../../src/assertions/a11y')
  })
})
