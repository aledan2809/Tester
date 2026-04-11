import { test, expect } from '@playwright/test'
import { authHeaders, noAuthHeaders } from '../utils/helpers'

test.describe('GET /api/health', () => {
  test('returns 200 without authentication', async ({ request }) => {
    const res = await request.get('/api/health', { headers: noAuthHeaders() })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.version).toBe('0.1.0')
    expect(typeof body.activeJobs).toBe('number')
    expect(typeof body.completedJobs).toBe('number')
    expect(typeof body.totalJobs).toBe('number')
  })

  test('returns 200 with authentication too', async ({ request }) => {
    const res = await request.get('/api/health', { headers: authHeaders() })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  test('health check response has correct schema', async ({ request }) => {
    const res = await request.get('/api/health')
    const body = await res.json()
    const keys = Object.keys(body)
    expect(keys).toContain('ok')
    expect(keys).toContain('version')
    expect(keys).toContain('activeJobs')
    expect(keys).toContain('completedJobs')
    expect(keys).toContain('totalJobs')
  })

  test('activeJobs and completedJobs are non-negative', async ({ request }) => {
    const res = await request.get('/api/health')
    const body = await res.json()
    expect(body.activeJobs).toBeGreaterThanOrEqual(0)
    expect(body.completedJobs).toBeGreaterThanOrEqual(0)
    expect(body.totalJobs).toBeGreaterThanOrEqual(0)
  })

  test('totalJobs >= activeJobs + completedJobs', async ({ request }) => {
    const res = await request.get('/api/health')
    const body = await res.json()
    expect(body.totalJobs).toBeGreaterThanOrEqual(body.activeJobs + body.completedJobs)
  })
})
