import { test, expect } from '@playwright/test'
import { authHeaders, noAuthHeaders } from '../utils/helpers'

test.describe('GET /api/test/:id/report', () => {
  test('requires authentication', async ({ request }) => {
    const res = await request.get('/api/test/nonexistent/report', { headers: noAuthHeaders() })
    expect(res.status()).toBe(401)
  })

  test('returns 404 for non-existent test', async ({ request }) => {
    const res = await request.get('/api/test/no-such-id/report', { headers: authHeaders() })
    expect(res.status()).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Test not found')
  })

  test('returns JSON content-type for error responses', async ({ request }) => {
    const res = await request.get('/api/test/fake-id/report', { headers: authHeaders() })
    expect(res.headers()['content-type']).toContain('application/json')
  })

  test('[SECURITY] handles path traversal in report ID', async ({ request }) => {
    const res = await request.get('/api/test/../../etc/passwd/report', { headers: authHeaders() })
    expect(res.status()).toBe(404)
  })

  test('[SECURITY] handles URL-encoded path traversal in report ID', async ({ request }) => {
    const res = await request.get('/api/test/%2e%2e%2f%2e%2e%2fetc%2fpasswd/report', { headers: authHeaders() })
    expect(res.status()).toBe(404)
  })
})
