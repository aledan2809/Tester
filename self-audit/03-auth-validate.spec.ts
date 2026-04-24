import { test, expect } from '@playwright/test'
import { authHeaders } from './helpers'

test.describe('Self-Audit: Auth Validate + Session Persistence', () => {
  test('GET /api/auth/validate returns valid session', async ({ request }) => {
    const res = await request.get('/api/auth/validate', { headers: authHeaders() })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.message).toBe('Session is valid')
  })

  test('session persists across 3 consecutive calls', async ({ request }) => {
    for (let i = 0; i < 3; i++) {
      const res = await request.get('/api/auth/validate', { headers: authHeaders() })
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body.valid).toBe(true)
    }
  })

  test('POST /api/auth/login rejects missing fields', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      headers: authHeaders(),
      data: { url: 'https://example.com' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('required')
  })

  test('POST /api/auth/login rejects invalid URL', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      headers: authHeaders(),
      data: { url: 'not-a-url', username: 'test', password: 'test' },
    })
    // Should be 400 (invalid URL) or 500 (browser error)
    expect([400, 500]).toContain(res.status())
  })
})
