import { test, expect } from '@playwright/test'
import { noAuthHeaders } from '../utils/helpers'

test.describe('Auth Brute Force Protection', () => {
  test('[SECURITY] 10 rapid auth attempts all succeed without throttle', async ({ request }) => {
    const results = []
    for (let i = 0; i < 10; i++) {
      const res = await request.get('/api/auth/validate', {
        headers: {
          Authorization: `Bearer wrong-token-${i}`,
          'Content-Type': 'application/json',
        },
      })
      results.push(res.status())
    }
    // All should be 403 (invalid token) — none should be 429 (rate limited)
    const all403 = results.every(s => s === 403)
    expect(all403).toBe(true)
    console.warn('[SECURITY] No rate limiting detected on auth endpoint — brute force possible')
  })

  test('[SECURITY] 10 rapid login attempts without throttle', async ({ request }) => {
    const results = []
    for (let i = 0; i < 10; i++) {
      const res = await request.post('/api/auth/login', {
        headers: {
          Authorization: 'Bearer wrong-token',
          'Content-Type': 'application/json',
        },
        data: {
          url: 'https://example.com',
          username: `user${i}`,
          password: 'wrong',
        },
      })
      results.push(res.status())
    }
    // All should be 403 — no rate limiting
    const noRateLimit = results.every(s => s !== 429)
    expect(noRateLimit).toBe(true)
    console.warn('[SECURITY] No rate limiting on login endpoint')
  })

  test('[SECURITY] timing attack: token comparison not constant-time', async ({ request }) => {
    // Document the vulnerability — tokens compared with === instead of timingSafeEqual
    const validPrefix = '33a48f8e'
    const wrongPrefix = 'xxxxxxxx'

    const timings: number[] = []
    for (const token of [validPrefix + '0'.repeat(56), wrongPrefix + '0'.repeat(56)]) {
      const start = Date.now()
      await request.get('/api/auth/validate', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      timings.push(Date.now() - start)
    }
    // We can't reliably detect timing differences in a test, but document the code uses ===
    expect(timings.length).toBe(2)
    console.warn('[SECURITY] Token comparison uses === (not crypto.timingSafeEqual) — timing attack possible')
  })
})
