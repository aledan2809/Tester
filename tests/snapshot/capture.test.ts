// lessons:skip-all
/**
 * T-008 — Puppeteer capture helper tests.
 *
 * Unit-test the helpers against a mocked Page/Browser — real Puppeteer
 * launch is tested elsewhere (self-audit). Here we verify the shape of
 * calls: viewport setup, settleMs delay, fullPage:true screenshot flag,
 * page cleanup, --no-sandbox gating by env vars.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { captureFullPage, captureUrl, captureUrlStandalone } from '../../src/snapshot/capture'

type AnyFn = (...args: unknown[]) => unknown

function makePage(overrides: Record<string, AnyFn> = {}) {
  const calls: Array<{ fn: string; args: unknown[] }> = []
  const page = {
    viewport: () => ({ width: 1280, height: 800 }),
    setViewport: vi.fn((vp: unknown) => {
      calls.push({ fn: 'setViewport', args: [vp] })
    }),
    emulateMediaFeatures: vi.fn((feats: unknown) => {
      calls.push({ fn: 'emulateMediaFeatures', args: [feats] })
    }),
    goto: vi.fn((url: string, opts: unknown) => {
      calls.push({ fn: 'goto', args: [url, opts] })
      return Promise.resolve()
    }),
    screenshot: vi.fn((opts: unknown) => {
      calls.push({ fn: 'screenshot', args: [opts] })
      return Promise.resolve(Buffer.from('pngbytes'))
    }),
    close: vi.fn(() => {
      calls.push({ fn: 'close', args: [] })
      return Promise.resolve()
    }),
    ...overrides,
  }
  return { page, calls }
}

describe('T-008 captureFullPage', () => {
  it('calls screenshot with fullPage:true + type:png', async () => {
    const { page, calls } = makePage()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buf = await captureFullPage(page as any)
    expect(buf).toBeInstanceOf(Buffer)
    const shot = calls.find((c) => c.fn === 'screenshot')!
    expect(shot.args[0]).toEqual({ fullPage: true, type: 'png' })
  })

  it('resets viewport width when different from requested', async () => {
    const { page, calls } = makePage()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await captureFullPage(page as any, { viewportWidth: 1920 })
    const sv = calls.find((c) => c.fn === 'setViewport')!
    expect((sv.args[0] as { width: number }).width).toBe(1920)
  })

  it('applies prefers-color-scheme when colorScheme is set', async () => {
    const { page, calls } = makePage()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await captureFullPage(page as any, { colorScheme: 'dark' })
    const em = calls.find((c) => c.fn === 'emulateMediaFeatures')!
    expect(em.args[0]).toEqual([{ name: 'prefers-color-scheme', value: 'dark' }])
  })

  it('respects settleMs by sleeping before screenshot', async () => {
    const { page, calls } = makePage()
    const t0 = Date.now()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await captureFullPage(page as any, { settleMs: 80 })
    expect(Date.now() - t0).toBeGreaterThanOrEqual(70)
    expect(calls.find((c) => c.fn === 'screenshot')).toBeDefined()
  })
})

describe('T-008 captureUrl', () => {
  it('creates a page, navigates, captures, then closes the page', async () => {
    const { page, calls } = makePage()
    const browser = {
      newPage: vi.fn(() => Promise.resolve(page)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    await captureUrl(browser, 'https://example.com/x')
    expect(browser.newPage).toHaveBeenCalled()
    expect(calls.find((c) => c.fn === 'goto')).toBeDefined()
    expect(calls.find((c) => c.fn === 'close')).toBeDefined()
  })

  it('calls preCapture hook before screenshot', async () => {
    const { page, calls } = makePage()
    const browser = {
      newPage: vi.fn(() => Promise.resolve(page)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const hook = vi.fn(() => Promise.resolve())
    await captureUrl(browser, 'https://example.com/y', { preCapture: hook })
    expect(hook).toHaveBeenCalled()
    // screenshot should come after preCapture
    const preIdx = hook.mock.invocationCallOrder[0]
    const shotIdx = (page.screenshot as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
    expect(shotIdx).toBeGreaterThan(preIdx)
  })

  it('still closes the page when navigation throws', async () => {
    const { page, calls } = makePage({
      goto: vi.fn(() => Promise.reject(new Error('nav failed'))),
    })
    const browser = {
      newPage: vi.fn(() => Promise.resolve(page)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    await expect(captureUrl(browser, 'https://example.com/z')).rejects.toThrow('nav failed')
    expect(calls.find((c) => c.fn === 'close')).toBeDefined()
  })
})

describe('T-008 captureUrlStandalone — F-004 no-sandbox gating', () => {
  const origEnv = { ...process.env }
  afterEach(() => {
    for (const k of ['VERCEL', 'NETLIFY', 'LAMBDA_TASK_ROOT', 'AWS_LAMBDA_FUNCTION_NAME']) {
      delete process.env[k]
    }
    // restore
    process.env = { ...origEnv }
  })

  it('does NOT pass --no-sandbox on bare Linux/macOS runs', async () => {
    for (const k of ['VERCEL', 'NETLIFY', 'LAMBDA_TASK_ROOT', 'AWS_LAMBDA_FUNCTION_NAME']) {
      delete process.env[k]
    }
    const launchSpy = vi.fn(() =>
      Promise.resolve({
        newPage: vi.fn(() => Promise.resolve(makePage().page)),
        close: vi.fn(),
      }),
    )
    vi.doMock('puppeteer', () => ({ default: { launch: launchSpy } }))
    const mod = await import('../../src/snapshot/capture')
    await mod.captureUrlStandalone('https://example.com/nsb-off').catch(() => {})
    const args = (launchSpy.mock.calls[0]?.[0] as { args?: string[] })?.args || []
    expect(args).not.toContain('--no-sandbox')
    vi.doUnmock('puppeteer')
  })

  it('passes --no-sandbox on serverless markers', async () => {
    process.env.VERCEL = '1'
    const launchSpy = vi.fn(() =>
      Promise.resolve({
        newPage: vi.fn(() => Promise.resolve(makePage().page)),
        close: vi.fn(),
      }),
    )
    vi.doMock('puppeteer', () => ({ default: { launch: launchSpy } }))
    const mod = await import('../../src/snapshot/capture')
    await mod.captureUrlStandalone('https://example.com/nsb-on').catch(() => {})
    const args = (launchSpy.mock.calls[0]?.[0] as { args?: string[] })?.args || []
    expect(args).toContain('--no-sandbox')
    expect(args).toContain('--disable-setuid-sandbox')
    vi.doUnmock('puppeteer')
    delete process.env.VERCEL
  })
})

// Suppress the unused-import lint when `captureUrlStandalone` is only touched
// inside `vi.doMock` re-imports above.
void captureUrlStandalone
