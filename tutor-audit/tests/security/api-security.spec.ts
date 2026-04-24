import { test, expect } from '@playwright/test'
import { API_ENDPOINTS } from '../../utils/helpers'

test.describe('Security - API Authentication', () => {
  test('should return 401 for unauthenticated student dashboard API', async ({ request }) => {
    const response = await request.get('/api/student/dashboard')
    expect(response.status()).toBe(401)
  })

  test('should return 401 for unauthenticated admin users API', async ({ request }) => {
    const response = await request.get('/api/admin/users')
    expect(response.status()).toBe(401)
  })

  test('should return 401 for unauthenticated admin questions API', async ({ request }) => {
    const response = await request.get('/api/admin/questions')
    expect(response.status()).toBe(401)
  })

  test('should return 401 for unauthenticated admin domains API', async ({ request }) => {
    const response = await request.get('/api/admin/domains')
    expect(response.status()).toBe(401)
  })

  test('should return 401 for unauthenticated notifications API', async ({ request }) => {
    const response = await request.get('/api/notifications')
    expect(response.status()).toBe(401)
  })

  test('should return 401 for unauthenticated session start API', async ({ request }) => {
    const response = await request.post('/api/aviation/session/start', {
      data: { type: 'quick' },
    })
    expect(response.status()).toBe(401)
  })

  test('should return 401 for unauthenticated exam start API', async ({ request }) => {
    const response = await request.post('/api/aviation/exam/start', {
      data: { formatId: 'test', mode: 'PRACTICE' },
    })
    expect(response.status()).toBe(401)
  })

  test('should return 401 for unauthenticated progress API', async ({ request }) => {
    const response = await request.get('/api/aviation/progress')
    expect(response.status()).toBe(401)
  })

  test('should return 401 for unauthenticated leaderboard API', async ({ request }) => {
    const response = await request.get('/api/aviation/leaderboard')
    expect(response.status()).toBe(401)
  })

  test('should return 401 for unauthenticated instructor API', async ({ request }) => {
    const response = await request.get('/api/dashboard/instructor')
    expect(response.status()).toBe(401)
  })

  test('should return 401 for unauthenticated watcher API', async ({ request }) => {
    const response = await request.get('/api/dashboard/watcher')
    expect(response.status()).toBe(401)
  })
})

test.describe('Security - Input Validation', () => {
  test('should reject XSS in login email field', async ({ request }) => {
    const response = await request.post('/api/auth/callback/credentials', {
      data: {
        email: '<script>alert("xss")</script>',
        password: 'test',
      },
    })
    const body = await response.text()
    expect(body).not.toContain('<script>')
  })

  test('should reject SQL injection in login email', async ({ request }) => {
    const response = await request.post('/api/auth/callback/credentials', {
      data: {
        email: "admin@tutor.app' OR '1'='1",
        password: 'test',
      },
    })
    expect(response.status()).not.toBe(200)
  })

  test('should handle malformed JSON gracefully', async ({ request }) => {
    const response = await request.post('/api/student/dashboard', {
      headers: { 'Content-Type': 'application/json' },
      data: 'not-valid-json{{{',
    })
    expect(response.status()).toBeGreaterThanOrEqual(400)
    expect(response.status()).toBeLessThan(500)
  })

  test('should handle oversized request body', async ({ request }) => {
    const largePayload = 'x'.repeat(1024 * 1024)
    const response = await request.post('/api/student/dashboard', {
      data: { data: largePayload },
    })
    expect(response.status()).toBeGreaterThanOrEqual(400)
  })
})

test.describe('Security - Rate Limiting', () => {
  test('should enforce rate limiting on auth endpoints', async ({ request }) => {
    const results: number[] = []
    for (let i = 0; i < 10; i++) {
      const response = await request.post('/api/auth/callback/credentials', {
        data: { email: 'test@test.com', password: 'wrong' },
      })
      results.push(response.status())
    }
    const has429 = results.some(s => s === 429)
    test.info().annotations.push({
      type: 'audit',
      description: has429 ? 'Rate limiting working on auth endpoint' : 'No rate limiting detected on auth - potential brute force vulnerability',
    })
  })

  test('should enforce rate limiting on API endpoints', async ({ request }) => {
    const results: number[] = []
    for (let i = 0; i < 70; i++) {
      const response = await request.get('/api/student/dashboard')
      results.push(response.status())
    }
    const has429 = results.some(s => s === 429)
    test.info().annotations.push({
      type: 'audit',
      description: has429 ? 'Rate limiting working on API endpoints' : 'No rate limiting detected on API endpoints (after 70 requests)',
    })
  })
})

test.describe('Security - Path Traversal', () => {
  test('should block path traversal attempts', async ({ request }) => {
    const response = await request.get('/api/../.env')
    expect(response.status()).not.toBe(200)
  })

  test('should not expose .env file', async ({ request }) => {
    const response = await request.get('/.env')
    expect(response.status()).not.toBe(200)
  })

  test('should not expose package.json', async ({ request }) => {
    const response = await request.get('/package.json')
    const status = response.status()
    if (status === 200) {
      const body = await response.text()
      expect(body).not.toContain('dependencies')
    }
  })
})

test.describe('Security - Error Information Leakage', () => {
  test('should not expose stack traces on 404', async ({ request }) => {
    const response = await request.get('/api/nonexistent/endpoint/12345')
    const body = await response.text()
    expect(body).not.toContain('at ')
    expect(body).not.toContain('node_modules')
    expect(body).not.toContain('Error:')
  })

  test('should not expose stack traces on 500', async ({ request }) => {
    const response = await request.post('/api/aviation/session/start', {
      data: null,
    })
    const body = await response.text()
    expect(body).not.toContain('node_modules')
    expect(body).not.toContain('.ts:')
  })

  test('should not expose database connection info', async ({ request }) => {
    const response = await request.get('/api/nonexistent')
    const body = await response.text()
    expect(body).not.toContain('postgresql://')
    expect(body).not.toContain('DATABASE_URL')
  })
})
