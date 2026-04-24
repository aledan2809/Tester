import { test, expect } from '@playwright/test'
import { authHeaders } from './helpers'

test.describe('Self-Audit: GET /api/test/:id/status', () => {
  test('returns 404 for nonexistent test', async ({ request }) => {
    const res = await request.get('/api/test/nonexistent-id-12345/status', {
      headers: authHeaders(),
    })
    expect(res.status()).toBe(404)
    const body = await res.json()
    expect(body.error).toContain('not found')
  })

  test('returns valid status for a started test', async ({ request }) => {
    // Start a minimal test first
    const startRes = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: {
        url: 'https://example.com',
        config: { maxPages: 1, maxDepth: 1, crawlTimeout: 10000 },
      },
    })

    if (startRes.status() === 429) {
      test.skip(true, 'Server busy — another test is running')
      return
    }

    const { testId } = await startRes.json()
    expect(testId).toBeDefined()

    // Check status immediately
    const statusRes = await request.get(`/api/test/${testId}/status`, {
      headers: authHeaders(),
    })
    expect(statusRes.status()).toBe(200)
    const body = await statusRes.json()
    expect(['queued', 'running', 'completed', 'failed']).toContain(body.status)
    expect(body.startedAt).toBeDefined()
    expect(typeof body.durationMs).toBe('number')
  })
})
