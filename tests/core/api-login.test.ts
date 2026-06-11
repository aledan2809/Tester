/**
 * apiLogin tests — API-direct login on the crawl path (roadmap R2).
 * Unit-level: stubs the browser page so no real Puppeteer/network is needed.
 * Covers URL resolution, payload field mapping, and success/failure semantics.
 */
import { describe, it, expect, vi } from 'vitest'
import { AITester } from '../../src/tester'
import type { LoginCredentials } from '../../src/core/types'

/** Build an AITester with a stubbed BrowserCore.getPage() returning a fake page. */
function testerWithPage(page: unknown, config = {}) {
  const tester = new AITester(config)
  // @ts-expect-error — reach into the private browser to stub getPage for the test
  tester.browser = { getPage: () => page }
  return tester
}

/** Fake Puppeteer page: records goto + evaluate, returns a scripted fetch result. */
function fakePage(fetchResult: { ok: boolean; status: number; error?: string }) {
  const calls: { gotos: string[]; evalArgs: any[] } = { gotos: [], evalArgs: [] }
  const page = {
    goto: vi.fn(async (u: string) => { calls.gotos.push(u); return null }),
    evaluate: vi.fn(async (_fn: unknown, args: unknown) => {
      calls.evalArgs.push(args)
      return fetchResult
    }),
  }
  return { page, calls }
}

const creds = (over: Partial<LoginCredentials> = {}): LoginCredentials => ({
  username: 'buyer@example.com',
  password: 'pw',
  loginUrl: 'https://app.example.com/login',
  apiPath: '/api/auth/login',
  ...over,
})

describe('AITester.apiLogin', () => {
  it('returns failure when no apiPath credentials', async () => {
    const { page } = fakePage({ ok: true, status: 200 })
    const tester = testerWithPage(page)
    const r = await tester.apiLogin({ username: 'a', password: 'b' })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/No apiPath/)
  })

  it('returns failure when browser not launched', async () => {
    const tester = testerWithPage(null)
    const r = await tester.apiLogin(creds())
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/not launched/)
  })

  it('resolves relative apiPath against loginUrl origin and navigates there first', async () => {
    const { page, calls } = fakePage({ ok: true, status: 200 })
    const tester = testerWithPage(page)
    const r = await tester.apiLogin(creds())
    expect(r.success).toBe(true)
    expect(calls.gotos[0]).toBe('https://app.example.com/')
    expect(page.evaluate).toHaveBeenCalled()
    // posted to the resolved absolute URL
    expect(calls.evalArgs[0].url).toBe('https://app.example.com/api/auth/login')
  })

  it('accepts an absolute apiPath as-is', async () => {
    const { page, calls } = fakePage({ ok: true, status: 200 })
    const tester = testerWithPage(page)
    const r = await tester.apiLogin(creds({ apiPath: 'https://auth.example.com/login', loginUrl: undefined }))
    expect(r.success).toBe(true)
    expect(calls.evalArgs[0].url).toBe('https://auth.example.com/login')
  })

  it('fails clearly when apiPath is relative but no origin is resolvable', async () => {
    const { page } = fakePage({ ok: true, status: 200 })
    const tester = testerWithPage(page)
    const r = await tester.apiLogin(creds({ loginUrl: undefined }))
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/no loginUrl\/origin/)
  })

  it('maps custom identifier/password field names into the JSON body', async () => {
    const { page, calls } = fakePage({ ok: true, status: 200 })
    const tester = testerWithPage(page)
    await tester.apiLogin(creds({ apiEmailField: 'identifier', apiPasswordField: 'pass' }))
    expect(calls.evalArgs[0].body).toEqual({ identifier: 'buyer@example.com', pass: 'pw' })
  })

  it('defaults to email/password field names', async () => {
    const { page, calls } = fakePage({ ok: true, status: 200 })
    const tester = testerWithPage(page)
    await tester.apiLogin(creds())
    expect(calls.evalArgs[0].body).toEqual({ email: 'buyer@example.com', password: 'pw' })
  })

  it('surfaces a non-ok HTTP status as a failure', async () => {
    const { page } = fakePage({ ok: false, status: 401 })
    const tester = testerWithPage(page)
    const r = await tester.apiLogin(creds())
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/HTTP 401/)
  })

  it('uses credentials from config when none passed', async () => {
    const { page, calls } = fakePage({ ok: true, status: 200 })
    const tester = testerWithPage(page, { credentials: creds() })
    const r = await tester.apiLogin()
    expect(r.success).toBe(true)
    expect(calls.evalArgs[0].body.email).toBe('buyer@example.com')
  })
})
