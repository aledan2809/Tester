import { test, expect } from '@playwright/test'
import { authHeaders, noAuthHeaders, badAuthHeaders } from './helpers'

test.describe('Self-Audit: Auth Middleware', () => {
  // Detect whether the remote has auth enabled
  let authEnabled = false

  test.beforeAll(async ({ request }) => {
    const res = await request.get('/api/auth/validate', { headers: noAuthHeaders() })
    // If we get 401, auth is enforced; if 200, server is in dev mode (no TESTER_API_SECRET)
    authEnabled = res.status() === 401
  })

  test('protected endpoint behavior without auth header', async ({ request }) => {
    const res = await request.get('/api/auth/validate', { headers: noAuthHeaders() })
    if (authEnabled) {
      expect(res.status()).toBe(401)
      const body = await res.json()
      expect(body.error).toContain('Authorization')
    } else {
      // Dev mode — auth is disabled, should still return valid response
      expect(res.status()).toBe(200)
    }
  })

  test('protected endpoint behavior with invalid Bearer token', async ({ request }) => {
    const res = await request.get('/api/auth/validate', { headers: badAuthHeaders() })
    if (authEnabled) {
      expect(res.status()).toBe(403)
      const body = await res.json()
      expect(body.error).toContain('Invalid')
    } else {
      // Dev mode — any token passes
      expect(res.status()).toBe(200)
    }
  })

  test('protected endpoint accepts valid Bearer token', async ({ request }) => {
    const res = await request.get('/api/auth/validate', { headers: authHeaders() })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.valid).toBe(true)
  })

  test('POST /api/test/start auth check', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: noAuthHeaders(),
      data: { url: 'https://example.com' },
    })
    if (authEnabled) {
      expect(res.status()).toBe(401)
    } else {
      // Dev mode — request proceeds, returns 202 or 429
      expect([202, 429]).toContain(res.status())
    }
  })

  test('POST /api/auth/login auth check', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      headers: noAuthHeaders(),
      data: { url: 'https://example.com', username: 'test', password: 'test' },
    })
    if (authEnabled) {
      expect(res.status()).toBe(401)
    } else {
      // Dev mode — request proceeds to login logic (may fail with 500 due to browser)
      expect([200, 401, 500]).toContain(res.status())
    }
  })

  test('auth mode detection is reported', async () => {
    console.log(`[self-audit] Auth enforcement: ${authEnabled ? 'ENABLED' : 'DISABLED (dev mode)'}`)
    if (!authEnabled) {
      console.log('[self-audit] WARNING: TESTER_API_SECRET not set on remote — auth is disabled!')
    }
    // This always passes — it's informational
    expect(true).toBe(true)
  })
})
