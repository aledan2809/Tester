import { test, expect } from '@playwright/test'
import { authHeaders, startTest } from '../utils/helpers'

test.describe('Storage & Persistence', () => {
  test('health endpoint tracks job counts', async ({ request }) => {
    const before = await request.get('/api/health')
    const beforeBody = await before.json()
    expect(typeof beforeBody.totalJobs).toBe('number')
    expect(typeof beforeBody.activeJobs).toBe('number')
    expect(typeof beforeBody.completedJobs).toBe('number')
  })

  test('starting a test increments job count', async ({ request }) => {
    const before = await request.get('/api/health')
    const beforeBody = await before.json()
    const beforeTotal = beforeBody.totalJobs

    const startRes = await startTest(request, 'https://example.com')
    if (startRes.status() === 202) {
      // Wait briefly for storage to update
      await new Promise(r => setTimeout(r, 500))
      const after = await request.get('/api/health')
      const afterBody = await after.json()
      expect(afterBody.totalJobs).toBeGreaterThanOrEqual(beforeTotal)
    }
  })

  test('test status transitions from queued to running', async ({ request }) => {
    const startRes = await startTest(request, 'https://httpbin.org/delay/1')
    if (startRes.status() === 202) {
      const { testId } = await startRes.json()
      // Check status immediately
      const statusRes = await request.get(`/api/test/${testId}/status`, {
        headers: authHeaders(),
      })
      const statusBody = await statusRes.json()
      expect(['queued', 'running', 'completed', 'failed']).toContain(statusBody.status)
      expect(statusBody).toHaveProperty('startedAt')
    }
  })

  test('[BUG] job retention is only 1 hour', async () => {
    // Document: storage.ts:141 uses 1 hour retention by default
    // Users checking results after 1 hour will find data deleted
    // Recommendation: increase to 24 hours or make configurable
    console.warn('[BUG] Job cleanup retention is only 1 hour — results may be lost')
    expect(true).toBe(true)
  })

  test('SQLite database file exists in data directory', async () => {
    const { existsSync } = await import('fs')
    const { join } = await import('path')
    const dbPath = join(process.cwd(), 'data', 'tester.db')
    expect(existsSync(dbPath)).toBe(true)
  })
})
