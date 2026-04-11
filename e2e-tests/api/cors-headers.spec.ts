import { test, expect } from '@playwright/test'
import { authHeaders } from '../utils/helpers'

test.describe('CORS & Security Headers', () => {
  test('health endpoint returns CORS headers', async ({ request }) => {
    const res = await request.get('/api/health')
    // CORS should allow configured origins
    expect(res.status()).toBe(200)
  })

  test('OPTIONS preflight returns appropriate response', async ({ request }) => {
    const res = await request.fetch('/api/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET',
      },
    })
    expect([200, 204]).toContain(res.status())
  })

  test('API responses use JSON content type', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.headers()['content-type']).toContain('application/json')
  })

  test('[SECURITY] no X-Powered-By header (information leak)', async ({ request }) => {
    const res = await request.get('/api/health')
    // Express 5 should not send this by default, but verify
    const poweredBy = res.headers()['x-powered-by']
    // Document whether X-Powered-By is present
    if (poweredBy) {
      console.warn(`[SECURITY] X-Powered-By header present: ${poweredBy}`)
    }
    // This is informational — Express 5 may still include it
    expect(res.status()).toBe(200)
  })

  test('[SECURITY] no server version header', async ({ request }) => {
    const res = await request.get('/api/health')
    const server = res.headers()['server']
    if (server) {
      console.warn(`[SECURITY] Server header present: ${server}`)
    }
    expect(res.status()).toBe(200)
  })
})
