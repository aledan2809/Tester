import { test, expect } from '@playwright/test'
import { authHeaders, noAuthHeaders } from '../utils/helpers'

test.describe('GET /api/test/:id/status', () => {
  test('requires authentication', async ({ request }) => {
    const res = await request.get('/api/test/fake-id/status', {
      headers: noAuthHeaders(),
    })
    expect(res.status()).toBe(401)
  })

  test('returns 404 for non-existent test ID', async ({ request }) => {
    const res = await request.get('/api/test/non-existent-id-12345/status', {
      headers: authHeaders(),
    })
    expect(res.status()).toBe(404)
    const body = await res.json()
    expect(body.error).toContain('not found')
  })

  test('returns status for existing test', async ({ request }) => {
    // First start a test
    const startRes = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: { url: 'https://example.com' },
    })

    if (startRes.status() === 429) {
      test.skip()
      return
    }

    const { testId } = await startRes.json()

    // Then check its status
    const statusRes = await request.get(`/api/test/${testId}/status`, {
      headers: authHeaders(),
    })
    expect(statusRes.status()).toBe(200)
    const body = await statusRes.json()
    expect(['queued', 'running', 'completed', 'failed']).toContain(body.status)
    expect(body.startedAt).toBeTruthy()
    expect(typeof body.durationMs).toBe('number')
  })

  test('returns correct schema for status response', async ({ request }) => {
    const startRes = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: { url: 'https://example.com' },
    })

    if (startRes.status() === 429) {
      test.skip()
      return
    }

    const { testId } = await startRes.json()

    const statusRes = await request.get(`/api/test/${testId}/status`, {
      headers: authHeaders(),
    })
    const body = await statusRes.json()
    expect(body).toHaveProperty('status')
    expect(body).toHaveProperty('startedAt')
    expect(body).toHaveProperty('durationMs')
  })

  test('handles SQL injection in test ID parameter', async ({ request }) => {
    const maliciousId = "'; DROP TABLE jobs; --"
    const res = await request.get(`/api/test/${encodeURIComponent(maliciousId)}/status`, {
      headers: authHeaders(),
    })
    // Should return 404, NOT a server error
    expect(res.status()).toBe(404)
  })
})
