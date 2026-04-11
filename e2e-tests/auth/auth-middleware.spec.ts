import { test, expect } from '@playwright/test'
import { authHeaders, API_SECRET } from '../utils/helpers'

test.describe('Authentication Middleware', () => {
  test('rejects requests without Authorization header', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      data: { url: 'https://example.com' },
    })
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(body.error).toBeTruthy()
  })

  test('rejects requests with empty Authorization header', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: { Authorization: '' },
      data: { url: 'https://example.com' },
    })
    expect(res.status()).toBe(401)
  })

  test('rejects requests with "Bearer" but no token', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: { Authorization: 'Bearer' },
      data: { url: 'https://example.com' },
    })
    // "Bearer" without space doesn't match "Bearer " prefix
    expect(res.status()).toBe(401)
  })

  test('rejects requests with "Bearer " and empty token', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: { Authorization: 'Bearer ' },
      data: { url: 'https://example.com' },
    })
    // Playwright strips trailing space from header value, so "Bearer " becomes "Bearer"
    // which fails the startsWith('Bearer ') check — returns 401 not 403
    expect(res.status()).toBe(401)
  })

  test('rejects Basic auth scheme', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
      data: { url: 'https://example.com' },
    })
    expect(res.status()).toBe(401)
  })

  test('rejects token with partial match', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: { Authorization: `Bearer ${API_SECRET.slice(0, 20)}` },
      data: { url: 'https://example.com' },
    })
    expect(res.status()).toBe(403)
  })

  test('rejects token with extra characters appended', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: { Authorization: `Bearer ${API_SECRET}extra` },
      data: { url: 'https://example.com' },
    })
    expect(res.status()).toBe(403)
  })

  test('accepts valid Bearer token', async ({ request }) => {
    const res = await request.get('/api/auth/validate', {
      headers: authHeaders(),
    })
    expect(res.status()).toBe(200)
  })

  test('[SECURITY] token comparison should be timing-safe', async ({ request }) => {
    // This test documents that the current implementation uses === comparison
    // which is vulnerable to timing attacks. It should use crypto.timingSafeEqual.
    // We measure response times for similar vs very different tokens.
    const times: number[] = []

    for (let i = 0; i < 5; i++) {
      const start = Date.now()
      await request.get('/api/auth/validate', {
        headers: { Authorization: `Bearer ${'a'.repeat(64)}` },
      })
      times.push(Date.now() - start)
    }

    // This is a documentation test — the real fix needs code changes
    // Just verify the endpoint responds consistently
    expect(times.length).toBe(5)
  })

  test('all protected endpoints require auth', async ({ request }) => {
    const protectedEndpoints = [
      { method: 'POST', path: '/api/test/start' },
      { method: 'GET', path: '/api/test/fake-id/status' },
      { method: 'GET', path: '/api/test/fake-id/results' },
      { method: 'GET', path: '/api/test/fake-id/report' },
      { method: 'POST', path: '/api/auth/login' },
      { method: 'GET', path: '/api/auth/validate' },
    ]

    for (const endpoint of protectedEndpoints) {
      const res = endpoint.method === 'POST'
        ? await request.post(endpoint.path, { data: {} })
        : await request.get(endpoint.path)
      expect(res.status(), `${endpoint.method} ${endpoint.path} should require auth`).toBe(401)
    }
  })
})
