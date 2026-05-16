/**
 * Offline unit tests for performLogin() — G-JOURNEY-LOGIN-001 fix.
 *
 * Uses a minimal stubbed Page object (no real browser launched).
 * Covers:
 *   API-direct path (happy + non-2xx fail + CSRF)
 *   UI path (form found → requestSubmit; no form → click fallback)
 *   Enter-key last-resort when still on login page after UI submit
 *   Success-URL pattern check fires in both paths
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { performLogin } from '../src/cli/commands/journey-audit.js'

type LoginCfg = Parameters<typeof performLogin>[1]

const BASE = 'https://test.example.com'
const LOGIN_PATH = '/login'
const EMAIL = 'user@test.com'
const PASS = 'secret123'

const BASE_LOGIN: LoginCfg = {
  path: LOGIN_PATH,
  emailSelector: 'input#email',
  passwordSelector: 'input#password',
  submitSelector: 'button[type=submit]',
  successUrlPattern: '/dashboard',
}

/** Build a minimal Puppeteer Page stub. evaluateResults are returned in order. */
function makePage(opts: {
  evaluateResults?: unknown[]
  startUrl?: string
  navigationUrl?: string
} = {}) {
  let url = opts.startUrl ?? BASE + LOGIN_PATH
  const evalQueue = [...(opts.evaluateResults ?? [])]
  const calls: string[] = []

  return {
    _calls: calls,
    url: () => url,
    goto: vi.fn(async (dest: string) => { url = dest }),
    waitForSelector: vi.fn(async () => {}),
    waitForNavigation: vi.fn(async () => { url = opts.navigationUrl ?? BASE + '/dashboard' }),
    waitForFunction: vi.fn(async () => {}),
    click: vi.fn(async (sel: string) => { calls.push(`click:${sel}`) }),
    type: vi.fn(async (sel: string, val: string) => { calls.push(`type:${sel}:${val}`) }),
    focus: vi.fn(async () => {}),
    keyboard: { press: vi.fn(async () => {}) },
    // Returns queued values in order; defaults to true (success) if queue empty.
    evaluate: vi.fn(async (..._args: unknown[]) => evalQueue.length ? evalQueue.shift() : true),
    screenshot: vi.fn(async () => Buffer.from('')),
  }
}

// ─────────────────────────────────────────────
// API-direct path
// ─────────────────────────────────────────────

describe('performLogin — API-direct path', () => {
  test('calls fetch via evaluate and navigates to root on success', async () => {
    const page = makePage({ evaluateResults: [true] }) // fetch returns ok=true
    const cfg: LoginCfg = { ...BASE_LOGIN, apiPath: '/api/auth/login' }

    await performLogin(page as never, cfg, BASE, EMAIL, PASS)

    expect(page.evaluate).toHaveBeenCalledOnce()
    // After API login, goto(baseUrl + '/') must be called
    expect(page.goto).toHaveBeenCalledWith(BASE + '/', { waitUntil: 'domcontentloaded' })
    // waitForFunction verifies success URL pattern
    expect(page.waitForFunction).toHaveBeenCalledOnce()
    // No form-fill selectors touched
    expect(page._calls.some((c) => c.startsWith('type:'))).toBe(false)
  })

  test('throws on non-2xx API response', async () => {
    const page = makePage({ evaluateResults: [false] })
    const cfg: LoginCfg = { ...BASE_LOGIN, apiPath: '/api/auth/login' }

    await expect(performLogin(page as never, cfg, BASE, EMAIL, PASS)).rejects.toThrow(
      'API-direct login failed',
    )
  })

  test('fetches CSRF token first when apiUseCsrf=true', async () => {
    // First evaluate → csrf fetch returns token; second → login fetch returns ok
    const page = makePage({ evaluateResults: ['csrf-tok-xyz', true] })
    const cfg: LoginCfg = {
      ...BASE_LOGIN,
      apiPath: '/api/auth/callback/credentials',
      apiUseCsrf: true,
    }

    await performLogin(page as never, cfg, BASE, EMAIL, PASS)

    expect(page.evaluate).toHaveBeenCalledTimes(2)
    // First call hits /api/auth/csrf
    const firstCallUrl = (page.evaluate.mock.calls[0] as unknown[])[1] as string
    expect(firstCallUrl).toBe(BASE + '/api/auth/csrf')
  })

  test('uses custom apiEmailField / apiPasswordField names', async () => {
    const page = makePage({ evaluateResults: [true] })
    const cfg: LoginCfg = {
      ...BASE_LOGIN,
      apiPath: '/api/auth/login',
      apiEmailField: 'identifier',
      apiPasswordField: 'pass',
    }

    await performLogin(page as never, cfg, BASE, EMAIL, PASS)

    // The field names are passed as args[2] and args[3] to evaluate
    const evaluateArgs = page.evaluate.mock.calls[0] as unknown[]
    expect(evaluateArgs[2]).toBe('identifier')
    expect(evaluateArgs[3]).toBe('pass')
  })
})

// ─────────────────────────────────────────────
// UI path — requestSubmit
// ─────────────────────────────────────────────

describe('performLogin — UI path (requestSubmit)', () => {
  test('fills inputs and calls requestSubmit when form found', async () => {
    // evaluate: formFound=true (requestSubmit branch)
    const page = makePage({ evaluateResults: [true] })

    await performLogin(page as never, BASE_LOGIN, BASE, EMAIL, PASS)

    expect(page.waitForSelector).toHaveBeenCalledWith(BASE_LOGIN.emailSelector, { timeout: 10_000 })
    // Inputs filled
    expect(page._calls.some((c) => c.includes(`type:${BASE_LOGIN.emailSelector}`))).toBe(true)
    expect(page._calls.some((c) => c.includes(`type:${BASE_LOGIN.passwordSelector}`))).toBe(true)
    // evaluate called for requestSubmit
    expect(page.evaluate).toHaveBeenCalledOnce()
    // waitForNavigation called (requestSubmit branch)
    expect(page.waitForNavigation).toHaveBeenCalled()
    // submitSelector NOT clicked (requestSubmit path)
    expect(page._calls.some((c) => c === `click:${BASE_LOGIN.submitSelector}`)).toBe(false)
  })

  test('falls back to click when no <form> found', async () => {
    // evaluate returns false → no form → click path
    const page = makePage({ evaluateResults: [false] })

    await performLogin(page as never, BASE_LOGIN, BASE, EMAIL, PASS)

    expect(page._calls.some((c) => c === `click:${BASE_LOGIN.submitSelector}`)).toBe(true)
  })

  test('presses Enter as last resort when URL unchanged after requestSubmit', async () => {
    // form found (true) but waitForNavigation won't change URL — page stays on /login
    const page = makePage({
      evaluateResults: [true],
      startUrl: BASE + LOGIN_PATH,
      // navigationUrl NOT overriding → url stays as /login after waitForNavigation
    })
    // Override waitForNavigation to not change URL (simulates SPA that didn't navigate)
    page.waitForNavigation.mockResolvedValue(undefined as never)
    // page.url() stays at /login throughout

    await performLogin(page as never, BASE_LOGIN, BASE, EMAIL, PASS)

    expect(page.keyboard.press).toHaveBeenCalledWith('Enter')
  })

  test('successUrlPattern waitForFunction fires on UI path', async () => {
    const page = makePage({ evaluateResults: [true] })

    await performLogin(page as never, BASE_LOGIN, BASE, EMAIL, PASS)

    expect(page.waitForFunction).toHaveBeenCalledOnce()
    const patternArg = page.waitForFunction.mock.calls[0][2] as string
    expect(patternArg).toBe(BASE_LOGIN.successUrlPattern)
  })

  test('throws descriptive error when success URL pattern not matched', async () => {
    const page = makePage({ evaluateResults: [true] })
    page.waitForFunction.mockRejectedValueOnce(new Error('timeout'))

    await expect(performLogin(page as never, BASE_LOGIN, BASE, EMAIL, PASS)).rejects.toThrow(
      `Login did not redirect to a URL matching ${BASE_LOGIN.successUrlPattern}`,
    )
  })
})
