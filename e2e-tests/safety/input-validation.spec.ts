import { test, expect } from '@playwright/test'
import { authHeaders } from '../utils/helpers'

test.describe('Input Validation & Edge Cases', () => {
  test('handles missing Content-Type header', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: {
        Authorization: `Bearer ${(await import('../utils/helpers')).API_SECRET}`,
      },
      data: JSON.stringify({ url: 'https://example.com' }),
    })
    // Express should still parse if body is JSON string
    expect([202, 400, 429]).toContain(res.status())
  })

  test('handles empty JSON body', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: {},
    })
    expect(res.status()).toBe(400)
  })

  test('handles malformed JSON body gracefully', async ({ request }) => {
    const res = await request.fetch('/api/test/start', {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      data: 'not json{{{',
    })
    // Express JSON parser should reject this
    expect([400, 500]).toContain(res.status())
  })

  test('handles extremely large request body', async ({ request }) => {
    const largeData = { url: 'https://example.com', config: { data: 'x'.repeat(100000) } }
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: largeData,
    })
    // Should handle gracefully (accept or reject, not crash)
    expect([202, 400, 413, 429]).toContain(res.status())
  })

  test('handles unicode in request fields', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      headers: authHeaders(),
      data: {
        url: 'https://例え.jp',
        username: '用户@テスト.com',
        password: 'пароль123',
      },
    })
    // Should not crash
    expect([400, 401, 500]).toContain(res.status())
  })

  test('handles null values in config object', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: {
        url: 'https://example.com',
        config: { maxPages: null, maxDepth: null },
      },
    })
    expect([202, 429]).toContain(res.status())
  })

  test('handles negative values in config', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: {
        url: 'https://example.com',
        config: { maxPages: -1, maxDepth: -1 },
      },
    })
    // Should handle gracefully
    expect([202, 400, 429]).toContain(res.status())
  })

  test('handles zero values in config', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: {
        url: 'https://example.com',
        config: { maxPages: 0, maxDepth: 0, crawlTimeout: 0 },
      },
    })
    expect([202, 400, 429]).toContain(res.status())
  })

  test('handles string values where numbers expected in config', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: {
        url: 'https://example.com',
        config: { maxPages: 'abc', maxDepth: 'xyz' },
      },
    })
    expect([202, 400, 429, 500]).toContain(res.status())
  })
})

test.describe('HTTP Method Handling', () => {
  test('rejects GET on POST-only endpoints', async ({ request }) => {
    const res = await request.get('/api/test/start', {
      headers: authHeaders(),
    })
    // Express should return 404 (no GET route) or 405
    expect([404, 405]).toContain(res.status())
  })

  test('rejects POST on GET-only endpoints', async ({ request }) => {
    const res = await request.post('/api/health', {
      headers: authHeaders(),
      data: {},
    })
    expect([404, 405]).toContain(res.status())
  })

  test('rejects DELETE on all endpoints', async ({ request }) => {
    const res = await request.delete('/api/test/fake-id/status', {
      headers: authHeaders(),
    })
    expect([404, 405]).toContain(res.status())
  })

  test('rejects PUT on all endpoints', async ({ request }) => {
    const res = await request.put('/api/test/start', {
      headers: authHeaders(),
      data: { url: 'https://example.com' },
    })
    expect([404, 405]).toContain(res.status())
  })
})

test.describe('Non-existent Routes', () => {
  test('returns 404 for unknown API path', async ({ request }) => {
    const res = await request.get('/api/nonexistent', {
      headers: authHeaders(),
    })
    expect(res.status()).toBe(404)
  })

  test('returns 401 for root path (auth middleware catches first)', async ({ request }) => {
    const res = await request.get('/')
    // Auth middleware runs before route matching, so unauthenticated
    // requests to non-existent routes get 401 instead of 404
    expect(res.status()).toBe(401)
  })

  test('returns 404 for /api without subpath', async ({ request }) => {
    const res = await request.get('/api', {
      headers: authHeaders(),
    })
    expect(res.status()).toBe(404)
  })
})
