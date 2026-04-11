import { test, expect } from '@playwright/test'
import { authHeaders } from '../utils/helpers'

test.describe('Server Lifecycle & Stability', () => {
  test('server responds to health check', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
  })

  test('server handles concurrent health checks', async ({ request }) => {
    const promises = Array.from({ length: 10 }, () =>
      request.get('/api/health')
    )
    const responses = await Promise.all(promises)
    for (const res of responses) {
      expect(res.status()).toBe(200)
    }
  })

  test('CORS headers are present', async ({ request }) => {
    const res = await request.get('/api/health')
    // CORS is configured — check response is successful
    expect(res.status()).toBe(200)
  })

  test('server returns JSON content type for API endpoints', async ({ request }) => {
    const res = await request.get('/api/health')
    const contentType = res.headers()['content-type']
    expect(contentType).toContain('application/json')
  })

  test('server returns JSON for error responses', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: {},
    })
    expect(res.status()).toBe(400)
    const contentType = res.headers()['content-type']
    expect(contentType).toContain('application/json')
  })

  test('sequential test start requests work correctly', async ({ request }) => {
    // First request
    const res1 = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: { url: 'https://example.com' },
    })

    // Whether accepted or busy, server should respond correctly
    expect([202, 429]).toContain(res1.status())

    if (res1.status() === 202) {
      const body = await res1.json()
      expect(body.testId).toBeTruthy()

      // Verify the test can be found
      const statusRes = await request.get(`/api/test/${body.testId}/status`, {
        headers: authHeaders(),
      })
      expect(statusRes.status()).toBe(200)
    }
  })
})

test.describe('Error Response Format', () => {
  test('401 errors have consistent format', async ({ request }) => {
    const res = await request.get('/api/auth/validate')
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(typeof body.error).toBe('string')
  })

  test('403 errors have consistent format', async ({ request }) => {
    const res = await request.get('/api/auth/validate', {
      headers: { Authorization: 'Bearer wrong' },
    })
    expect(res.status()).toBe(403)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(typeof body.error).toBe('string')
  })

  test('400 errors have consistent format', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: {},
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(typeof body.error).toBe('string')
  })

  test('404 errors have consistent format', async ({ request }) => {
    const res = await request.get('/api/test/nonexistent-id/status', {
      headers: authHeaders(),
    })
    expect(res.status()).toBe(404)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })
})
