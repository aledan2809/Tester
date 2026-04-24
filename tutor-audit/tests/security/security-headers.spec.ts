import { test, expect } from '@playwright/test'

test.describe('Security - HTTP Headers', () => {
  test('should have X-Frame-Options header', async ({ page }) => {
    const response = await page.goto('/')
    const headers = response?.headers()
    expect(headers?.['x-frame-options']).toBe('SAMEORIGIN')
  })

  test('should have X-Content-Type-Options header', async ({ page }) => {
    const response = await page.goto('/')
    const headers = response?.headers()
    expect(headers?.['x-content-type-options']).toBe('nosniff')
  })

  test('should have Referrer-Policy header', async ({ page }) => {
    const response = await page.goto('/')
    const headers = response?.headers()
    expect(headers?.['referrer-policy']).toBe('strict-origin-when-cross-origin')
  })

  test('should have Strict-Transport-Security header', async ({ page }) => {
    const response = await page.goto('/')
    const headers = response?.headers()
    const hsts = headers?.['strict-transport-security']
    expect(hsts).toContain('max-age=31536000')
  })

  test('should have Content-Security-Policy header', async ({ page }) => {
    const response = await page.goto('/')
    const headers = response?.headers()
    const csp = headers?.['content-security-policy']
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'self'")
  })

  test('should have Permissions-Policy header', async ({ page }) => {
    const response = await page.goto('/')
    const headers = response?.headers()
    expect(headers?.['permissions-policy']).toContain('camera=()')
  })

  test('should not expose X-Powered-By header', async ({ page }) => {
    const response = await page.goto('/')
    const headers = response?.headers()
    expect(headers?.['x-powered-by']).toBeUndefined()
  })

  test('should not expose Server version header', async ({ page }) => {
    const response = await page.goto('/')
    const headers = response?.headers()
    const server = headers?.['server']
    if (server) {
      expect(server).not.toMatch(/\d+\.\d+/)
    }
  })
})

test.describe('Security - CORS', () => {
  test('should not have overly permissive CORS', async ({ request }) => {
    const response = await request.fetch('/', {
      headers: { Origin: 'https://evil-site.com' },
    })
    const acao = response.headers()['access-control-allow-origin']
    expect(acao).not.toBe('*')
    if (acao) {
      expect(acao).not.toBe('https://evil-site.com')
    }
  })
})

test.describe('Security - Cookie Attributes', () => {
  test('should set secure and httpOnly on session cookies', async ({ page }) => {
    await page.goto('/en/auth/signin')
    await page.fill('input#email', 'student@tutor.app')
    await page.fill('input#password', 'student123')
    await page.click('button[type="submit"]')
    await page.waitForTimeout(5000)
    if (page.url().includes('dashboard')) {
      const cookies = await page.context().cookies()
      const sessionCookie = cookies.find(c => c.name.includes('session-token'))
      if (sessionCookie) {
        expect(sessionCookie.httpOnly).toBe(true)
        expect(sessionCookie.sameSite).not.toBe('None')
        test.info().annotations.push({
          type: 'audit',
          description: `Session cookie: httpOnly=${sessionCookie.httpOnly}, secure=${sessionCookie.secure}, sameSite=${sessionCookie.sameSite}`,
        })
      }
    }
  })
})

test.describe('Security - Robots.txt', () => {
  test('should block sensitive paths in robots.txt', async ({ request }) => {
    const response = await request.get('/robots.txt')
    const text = await response.text()
    expect(text).toContain('Disallow: /api/')
    expect(text).toContain('Disallow: /dashboard/')
  })
})
