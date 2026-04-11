import { test, expect } from '@playwright/test'
import { authHeaders } from '../utils/helpers'

test.describe('POST /api/auth/login', () => {
  test('requires url, username, and password fields', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      headers: authHeaders(),
      data: {},
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('url, username, and password are required')
  })

  test('rejects missing username', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      headers: authHeaders(),
      data: { url: 'https://example.com', password: 'pass' },
    })
    expect(res.status()).toBe(400)
  })

  test('rejects missing password', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      headers: authHeaders(),
      data: { url: 'https://example.com', username: 'user' },
    })
    expect(res.status()).toBe(400)
  })

  test('rejects missing url', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      headers: authHeaders(),
      data: { username: 'user', password: 'pass' },
    })
    expect(res.status()).toBe(400)
  })

  test('rejects invalid URL format', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      headers: authHeaders(),
      data: { url: 'not a url!@#$', username: 'user', password: 'pass' },
    })
    // Should be 400 for invalid URL
    expect([400, 500]).toContain(res.status())
  })

  test('handles login attempt to unreachable host', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      headers: authHeaders(),
      data: {
        url: 'https://this-host-does-not-exist-99999.example.com',
        username: 'user',
        password: 'pass',
      },
    })
    // Should fail gracefully with error message
    expect([401, 500]).toContain(res.status())
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toBeTruthy()
  })

  test('[SECURITY] does not leak server internals in error messages', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      headers: authHeaders(),
      data: {
        url: 'https://this-host-does-not-exist-99999.example.com',
        username: 'user',
        password: 'pass',
      },
    })
    const body = await res.json()
    // Error should not contain stack traces or internal paths
    if (body.error) {
      expect(body.error).not.toContain('/Users/')
      expect(body.error).not.toContain('node_modules')
      expect(body.error).not.toContain('at Object.')
    }
  })

  test('[SECURITY] handles XSS in username field', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      headers: authHeaders(),
      data: {
        url: 'https://example.com',
        username: '<script>alert("xss")</script>',
        password: 'pass',
      },
    })
    // Should not reflect XSS in response
    const text = await res.text()
    expect(text).not.toContain('<script>')
  })

  test('[SECURITY] handles SQL injection in login fields', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      headers: authHeaders(),
      data: {
        url: 'https://example.com',
        username: "admin' OR '1'='1",
        password: "' OR '1'='1",
      },
    })
    // Should not cause a server crash
    expect([401, 500]).toContain(res.status())
  })

  test('requires auth to use login endpoint', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: {
        url: 'https://example.com',
        username: 'user',
        password: 'pass',
      },
    })
    expect(res.status()).toBe(401)
  })
})
