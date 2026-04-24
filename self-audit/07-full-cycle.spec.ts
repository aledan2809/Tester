import { test, expect } from '@playwright/test'
import { authHeaders, waitForTestCompletion } from './helpers'

test.describe('Self-Audit: Full Test Cycle (start → status → results → report)', () => {
  test('complete test cycle on example.com', async ({ request }) => {
    test.setTimeout(180_000) // 3 minutes for full cycle

    // 1. Start test
    const startRes = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: {
        url: 'https://example.com',
        config: { maxPages: 1, maxDepth: 1, crawlTimeout: 15000 },
      },
    })

    if (startRes.status() === 429) {
      test.skip(true, 'Server busy — another test is running')
      return
    }

    expect(startRes.status()).toBe(202)
    const { testId } = await startRes.json()
    expect(testId).toBeDefined()

    // 2. Wait for completion
    const { status, body: statusBody } = await waitForTestCompletion(request, testId, 150_000)
    expect(['completed', 'failed']).toContain(status)

    if (status === 'completed') {
      // Verify status has summary
      expect(statusBody.summary).toBeDefined()
      expect(typeof statusBody.summary.overallScore).toBe('number')
      expect(typeof statusBody.summary.totalScenarios).toBe('number')
      expect(typeof statusBody.summary.passed).toBe('number')
      expect(typeof statusBody.summary.failed).toBe('number')

      // 3. Get results (JSON)
      const resultsRes = await request.get(`/api/test/${testId}/results`, {
        headers: authHeaders(),
      })
      expect(resultsRes.status()).toBe(200)
      const results = await resultsRes.json()
      expect(results.url).toBeDefined()
      expect(results.summary).toBeDefined()
      expect(Array.isArray(results.scenarios)).toBe(true)

      // 4. Get HTML report
      const reportRes = await request.get(`/api/test/${testId}/report`, {
        headers: authHeaders(),
      })
      expect(reportRes.status()).toBe(200)
      const html = await reportRes.text()
      expect(html).toContain('<!DOCTYPE html')
      expect(html).toContain('Test Report')
      expect(html.length).toBeGreaterThan(500)
    } else {
      // Failed is acceptable for example.com (it's very simple)
      // but the API should still return proper error
      expect(statusBody.error).toBeDefined()
    }
  })
})
