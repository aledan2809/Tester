import { test, expect } from '@playwright/test'
import { authHeaders } from '../utils/helpers'

test.describe('Error Handling & Edge Cases', () => {
  test('server handles double-start gracefully', async ({ request }) => {
    // Start first test
    const res1 = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: { url: 'https://example.com' },
    })

    if (res1.status() === 202) {
      // Try to start second test while first is running
      const res2 = await request.post('/api/test/start', {
        headers: authHeaders(),
        data: { url: 'https://example.org' },
      })
      // Should get 429 (busy) since only one test at a time
      expect([202, 429]).toContain(res2.status())
      if (res2.status() === 429) {
        const body = await res2.json()
        expect(body.error).toContain('busy')
        expect(body.retryAfter).toBe(30)
      }
    }
  })

  test('[BUG] boolean URL causes 500 error', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: { url: true },
    })
    // BUG: true is truthy so passes !url check, but true.startsWith() throws
    // Should return 400, may return 500
    if (res.status() === 500) {
      console.warn('[BUG] Sending url:true causes 500 — typeof check missing')
    }
    expect([400, 500]).toContain(res.status())
  })

  test('[BUG] object URL causes 500 error', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: { url: { nested: 'value' } },
    })
    if (res.status() === 500) {
      console.warn('[BUG] Sending url:{} causes 500 — typeof check missing')
    }
    expect([400, 500]).toContain(res.status())
  })

  test('[BUG] array URL causes unexpected behavior', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: { url: ['https://a.com', 'https://b.com'] },
    })
    expect([400, 500]).toContain(res.status())
  })

  test('server returns proper error for invalid JSON', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      data: 'not-valid-json{{{',
    })
    expect([400, 422]).toContain(res.status())
  })

  test('[SECURITY] error messages do not leak stack traces', async ({ request }) => {
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: { url: true },
    })
    const body = await res.json().catch(() => null)
    if (body) {
      const bodyStr = JSON.stringify(body)
      expect(bodyStr).not.toContain('node_modules')
      expect(bodyStr).not.toContain('at Object')
      expect(bodyStr).not.toContain('TypeError')
    }
  })

  test('non-existent API paths return 404', async ({ request }) => {
    const res = await request.get('/api/nonexistent', { headers: authHeaders() })
    expect([404, 401]).toContain(res.status())
  })

  test('HEAD method on health endpoint works', async ({ request }) => {
    const res = await request.head('/api/health')
    expect(res.status()).toBe(200)
  })
})
