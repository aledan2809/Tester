import { test, expect } from '@playwright/test'
import { authHeaders, noAuthHeaders } from './helpers'

test.describe('Self-Audit: Health Endpoint', () => {
  test('GET /api/health returns 200 without auth', async ({ request }) => {
    const res = await request.get('/api/health', { headers: noAuthHeaders() })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.version).toBeDefined()
    expect(typeof body.activeJobs).toBe('number')
    expect(typeof body.completedJobs).toBe('number')
    expect(typeof body.totalJobs).toBe('number')
  })

  test('GET /api/health returns 200 with auth', async ({ request }) => {
    const res = await request.get('/api/health', { headers: authHeaders() })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  test('health response schema is complete', async ({ request }) => {
    const res = await request.get('/api/health')
    const body = await res.json()
    expect(body).toHaveProperty('ok')
    expect(body).toHaveProperty('version')
    expect(body).toHaveProperty('activeJobs')
    expect(body).toHaveProperty('completedJobs')
    expect(body).toHaveProperty('totalJobs')
    expect(body.activeJobs).toBeGreaterThanOrEqual(0)
    expect(body.completedJobs).toBeGreaterThanOrEqual(0)
    expect(body.totalJobs).toBeGreaterThanOrEqual(body.activeJobs + body.completedJobs)
  })
})
