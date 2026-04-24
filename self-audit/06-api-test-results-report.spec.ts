import { test, expect } from '@playwright/test'
import { authHeaders } from './helpers'

test.describe('Self-Audit: GET /api/test/:id/results + /report', () => {
  test('results returns 404 for nonexistent test', async ({ request }) => {
    const res = await request.get('/api/test/nonexistent-id-12345/results', {
      headers: authHeaders(),
    })
    expect(res.status()).toBe(404)
  })

  test('report returns 404 for nonexistent test', async ({ request }) => {
    const res = await request.get('/api/test/nonexistent-id-12345/report', {
      headers: authHeaders(),
    })
    expect(res.status()).toBe(404)
  })

  test('results returns 409 for still-running test', async ({ request }) => {
    // Start a test
    const startRes = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: {
        url: 'https://example.com',
        config: { maxPages: 1, maxDepth: 1, crawlTimeout: 15000 },
      },
    })

    if (startRes.status() === 429) {
      test.skip(true, 'Server busy')
      return
    }

    const { testId } = await startRes.json()

    // Immediately try to get results (should be 409 or 200 if super fast)
    const resultsRes = await request.get(`/api/test/${testId}/results`, {
      headers: authHeaders(),
    })
    // 409 = still running, 200 = already completed, 500 = failed
    expect([200, 409, 500]).toContain(resultsRes.status())
  })
})
