import { test, expect } from '@playwright/test'
import { authHeaders } from '../utils/helpers'

test.describe('Concurrency & Rate Limiting', () => {
  test('returns 429 when test already running', async ({ request }) => {
    // Start first test
    const res1 = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: { url: 'https://example.com' },
    })

    if (res1.status() === 429) {
      // Already busy, test passes — demonstrates concurrency protection
      expect(res1.status()).toBe(429)
      const body = await res1.json()
      expect(body.error).toContain('busy')
      return
    }

    expect(res1.status()).toBe(202)

    // Immediately try to start second test
    const res2 = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: { url: 'https://another-example.com' },
    })

    expect(res2.status()).toBe(429)
    const body = await res2.json()
    expect(body.error).toContain('busy')
    expect(body.retryAfter).toBe(30)
  })

  test('[SECURITY] no rate limiting on auth validate endpoint', async ({ request }) => {
    // Document: there is no rate limiting on any endpoint
    // An attacker could brute-force the API secret
    const results: number[] = []
    for (let i = 0; i < 10; i++) {
      const res = await request.get('/api/auth/validate', {
        headers: { Authorization: `Bearer wrong-token-${i}` },
      })
      results.push(res.status())
    }
    // All should return 403 — no rate limiting blocks rapid requests
    expect(results.every(s => s === 403)).toBe(true)
  })

  test('[SECURITY] no rate limiting on login endpoint', async ({ request }) => {
    const results: number[] = []
    for (let i = 0; i < 5; i++) {
      const res = await request.post('/api/auth/login', {
        headers: { Authorization: `Bearer wrong-token-${i}` },
        data: { url: 'https://example.com', username: 'u', password: 'p' },
      })
      results.push(res.status())
    }
    // All should return 403 — no rate limiting
    expect(results.every(s => s === 403)).toBe(true)
  })
})
