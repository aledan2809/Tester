import { test, expect } from '@playwright/test'

test.describe('Security - Session & Token Handling', () => {
  test('session cookie uses httpOnly flag', async ({ page }) => {
    await page.goto('/en/auth/signin')
    const cookies = await page.context().cookies()
    const sessionCookie = cookies.find(c => c.name.includes('session') || c.name.includes('token'))
    if (sessionCookie) {
      expect(sessionCookie.httpOnly).toBe(true)
    }
  })

  test('session cookie uses SameSite attribute', async ({ page }) => {
    await page.goto('/en/auth/signin')
    const cookies = await page.context().cookies()
    const sessionCookie = cookies.find(c => c.name.includes('session') || c.name.includes('token'))
    if (sessionCookie) {
      expect(['Strict', 'Lax']).toContain(sessionCookie.sameSite)
    }
  })

  test('no sensitive data in localStorage', async ({ page }) => {
    await page.goto('/en')
    const storage = await page.evaluate(() => {
      const items: Record<string, string> = {}
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) || ''
        items[key] = localStorage.getItem(key) || ''
      }
      return items
    })
    const sensitiveKeys = Object.keys(storage).filter(k =>
      k.toLowerCase().includes('password') ||
      k.toLowerCase().includes('secret') ||
      k.toLowerCase().includes('token') ||
      k.toLowerCase().includes('api_key')
    )
    expect(sensitiveKeys).toHaveLength(0)
  })
})

test.describe('Security - HTTP Method Enforcement', () => {
  test('GET on POST-only /api/admin/users returns 405 or 401', async ({ request }) => {
    const response = await request.get('/api/admin/users')
    expect([401, 405]).toContain(response.status())
  })

  test('DELETE on /api/student/dashboard returns 401 or 405', async ({ request }) => {
    const response = await request.delete('/api/student/dashboard')
    expect([401, 405]).toContain(response.status())
  })

  test('PATCH on /api/student/domains returns 401 or 405', async ({ request }) => {
    const response = await request.patch('/api/student/domains')
    expect([401, 405]).toContain(response.status())
  })
})

test.describe('Security - Input Sanitization', () => {
  test('XSS payload in query params is sanitized', async ({ page }) => {
    await page.goto('/en?q=<script>alert("xss")</script>')
    const content = await page.content()
    expect(content).not.toContain('<script>alert("xss")</script>')
  })

  test('XSS payload in URL path is handled safely', async ({ page }) => {
    const response = await page.goto('/en/<script>alert(1)</script>')
    expect(response?.status()).toBeGreaterThanOrEqual(400)
  })

  test('SQL injection in API query params', async ({ request }) => {
    const response = await request.get("/api/student/domains?id=1' OR '1'='1")
    expect([400, 401, 404]).toContain(response.status())
    const body = await response.text()
    expect(body).not.toContain('postgresql')
    expect(body).not.toContain('syntax error')
  })

  test('NoSQL injection in API body', async ({ request }) => {
    const response = await request.post('/api/admin/questions', {
      data: { domainId: { '$gt': '' }, content: 'test' }
    })
    expect([400, 401]).toContain(response.status())
  })
})

test.describe('Security - Directory Traversal', () => {
  test('accessing /../../../etc/passwd returns safe response', async ({ request }) => {
    const response = await request.get('/../../../etc/passwd')
    expect(response.status()).toBeGreaterThanOrEqual(400)
    const body = await response.text()
    expect(body).not.toContain('root:')
  })

  test('accessing /api/../.env returns safe response', async ({ request }) => {
    const response = await request.get('/api/../.env')
    const body = await response.text()
    expect(body).not.toContain('DATABASE_URL')
    expect(body).not.toContain('NEXTAUTH_SECRET')
  })

  test('accessing /.git/config is blocked', async ({ request }) => {
    const response = await request.get('/.git/config')
    expect(response.status()).toBeGreaterThanOrEqual(400)
  })

  test('accessing /node_modules is blocked', async ({ request }) => {
    const response = await request.get('/node_modules/package.json')
    const body = await response.text()
    expect(body).not.toContain('"dependencies"')
  })
})

test.describe('Security - Error Response Sanitization', () => {
  test('API 500 does not leak stack traces', async ({ request }) => {
    const response = await request.post('/api/student/dashboard', {
      data: null,
      headers: { 'Content-Type': 'application/json' }
    })
    const body = await response.text()
    expect(body).not.toMatch(/at\s+\w+\s*\(/)
    expect(body).not.toContain('node_modules')
  })

  test('API 404 does not leak internal paths', async ({ request }) => {
    const response = await request.get('/api/this/endpoint/does/not/exist')
    const body = await response.text()
    expect(body).not.toContain('/Users/')
    expect(body).not.toContain('/home/')
    expect(body).not.toContain('node_modules')
  })

  test('database errors do not leak connection strings', async ({ request }) => {
    const response = await request.post('/api/admin/questions', {
      data: { invalid: true },
    })
    const body = await response.text()
    expect(body).not.toContain('postgresql://')
    expect(body).not.toContain('prisma')
  })
})

test.describe('Security - CORS', () => {
  test('CORS does not allow wildcard origin', async ({ request }) => {
    const response = await request.get('/en', {
      headers: { Origin: 'https://evil.com' }
    })
    const corsHeader = response.headers()['access-control-allow-origin']
    expect(corsHeader).not.toBe('*')
  })

  test('CORS preflight rejects unknown origins', async ({ request }) => {
    const response = await request.fetch('/api/student/dashboard', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil-domain.com',
        'Access-Control-Request-Method': 'POST'
      }
    })
    const corsHeader = response.headers()['access-control-allow-origin']
    if (corsHeader) {
      expect(corsHeader).not.toBe('https://evil-domain.com')
    }
  })
})

test.describe('Security - Stripe Webhook', () => {
  test('POST /api/admin/stripe/webhook without signature returns error', async ({ request }) => {
    const response = await request.post('/api/admin/stripe/webhook', {
      data: { type: 'checkout.session.completed' },
    })
    expect([400, 401, 403]).toContain(response.status())
  })
})
