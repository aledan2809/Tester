import { test, expect } from '@playwright/test'
import { authHeaders } from '../utils/helpers'

test.describe('GET /api/auth/validate', () => {
  test('returns valid:true for authenticated requests', async ({ request }) => {
    const res = await request.get('/api/auth/validate', {
      headers: authHeaders(),
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.message).toBeTruthy()
  })

  test('rejects unauthenticated requests', async ({ request }) => {
    const res = await request.get('/api/auth/validate')
    expect(res.status()).toBe(401)
  })

  test('[BUG] validate endpoint always returns valid:true regardless of token type', async ({ request }) => {
    // The validate endpoint doesn't actually validate any session.
    // It just checks if the request passed the auth middleware (API secret check).
    // This means it cannot distinguish between API secret and session tokens.
    // It always returns { valid: true, message: 'Session is valid' }
    // This is misleading — it validates the API secret, not a user session.
    const res = await request.get('/api/auth/validate', {
      headers: authHeaders(),
    })
    const body = await res.json()
    expect(body.valid).toBe(true)
    // Document: this endpoint provides no real session validation
  })
})
