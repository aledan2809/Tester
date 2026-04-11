import { test, expect } from '@playwright/test'
import { authHeaders, noAuthHeaders } from '../utils/helpers'

test.describe('GET /api/test/:id/results', () => {
  test('requires authentication', async ({ request }) => {
    const res = await request.get('/api/test/fake-id/results', {
      headers: noAuthHeaders(),
    })
    expect(res.status()).toBe(401)
  })

  test('returns 404 for non-existent test', async ({ request }) => {
    const res = await request.get('/api/test/non-existent-id/results', {
      headers: authHeaders(),
    })
    expect(res.status()).toBe(404)
  })

  test('returns 409 for running/queued test', async ({ request }) => {
    const startRes = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: { url: 'https://example.com' },
    })

    if (startRes.status() === 429) {
      test.skip()
      return
    }

    const { testId } = await startRes.json()

    // Immediately try to get results (test should still be running/queued)
    const resultsRes = await request.get(`/api/test/${testId}/results`, {
      headers: authHeaders(),
    })
    // Should be 409 (still running) or 500 (failed)
    expect([409, 500]).toContain(resultsRes.status())
  })

  test('handles special characters in test ID', async ({ request }) => {
    const res = await request.get('/api/test/../../etc/passwd/results', {
      headers: authHeaders(),
    })
    expect(res.status()).toBe(404)
  })
})

test.describe('GET /api/test/:id/report', () => {
  test('requires authentication', async ({ request }) => {
    const res = await request.get('/api/test/fake-id/report', {
      headers: noAuthHeaders(),
    })
    expect(res.status()).toBe(401)
  })

  test('returns 404 for non-existent test', async ({ request }) => {
    const res = await request.get('/api/test/non-existent-id/report', {
      headers: authHeaders(),
    })
    expect(res.status()).toBe(404)
  })

  test('returns 409 for incomplete test', async ({ request }) => {
    const startRes = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: { url: 'https://example.com' },
    })

    if (startRes.status() === 429) {
      test.skip()
      return
    }

    const { testId } = await startRes.json()

    const reportRes = await request.get(`/api/test/${testId}/report`, {
      headers: authHeaders(),
    })
    expect([409, 500]).toContain(reportRes.status())
  })
})
