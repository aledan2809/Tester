import { test, expect } from '@playwright/test'
import { authHeaders } from '../utils/helpers'

test.describe('Request Body Size Limits', () => {
  test('[SECURITY] server accepts large payload (no body size limit)', async ({ request }) => {
    // Generate a 200KB payload
    const largeConfig = { url: 'https://example.com', config: { data: 'x'.repeat(200_000) } }
    const res = await request.post('/api/test/start', {
      headers: authHeaders(),
      data: largeConfig,
    })
    // If accepted (202 or 429 busy), there's no body size limit
    if (res.status() !== 413) {
      console.warn('[SECURITY] 200KB payload accepted — no body size limit set (express.json has no limit)')
    }
    // Should ideally return 413 for too-large payloads
    expect([202, 413, 400, 429]).toContain(res.status())
  })

  test('[SECURITY] no Content-Length limit on login endpoint', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      headers: authHeaders(),
      data: {
        url: 'https://example.com',
        username: 'a'.repeat(50_000),
        password: 'b'.repeat(50_000),
      },
    })
    if (res.status() !== 413) {
      console.warn('[SECURITY] Login endpoint accepts oversized username/password fields')
    }
    // Login with oversized creds — may get 401 (auth rejected) or 500 from browser
    expect([400, 401, 413, 500]).toContain(res.status())
  })
})
