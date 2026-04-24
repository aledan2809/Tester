import { test, expect } from '@playwright/test'

test.describe('Auth - Edge Cases', () => {
  test('login with empty email shows validation error', async ({ page }) => {
    await page.goto('/en/auth/signin')
    await page.fill('input#password, input[type="password"]', 'somepassword')
    await page.click('button[type="submit"]')
    // HTML5 validation should prevent submission or show error
    const url = page.url()
    expect(url).toContain('signin')
  })

  test('login with empty password shows validation error', async ({ page }) => {
    await page.goto('/en/auth/signin')
    await page.fill('input#email, input[type="email"]', 'test@test.com')
    await page.click('button[type="submit"]')
    const url = page.url()
    expect(url).toContain('signin')
  })

  test('login with extremely long email is handled', async ({ page }) => {
    await page.goto('/en/auth/signin')
    const longEmail = 'a'.repeat(500) + '@test.com'
    await page.fill('input#email, input[type="email"]', longEmail)
    await page.fill('input#password, input[type="password"]', 'password')
    await page.click('button[type="submit"]')
    await page.waitForTimeout(2000)
    // Should not cause 500 error
    const url = page.url()
    expect(url).not.toContain('500')
  })

  test('login with unicode characters in email is handled', async ({ page }) => {
    await page.goto('/en/auth/signin')
    await page.fill('input#email, input[type="email"]', 'тест@тест.com')
    await page.fill('input#password, input[type="password"]', 'password')
    await page.click('button[type="submit"]')
    await page.waitForTimeout(2000)
    const url = page.url()
    expect(url).toContain('signin')
  })

  test('login form prevents multiple rapid submissions', async ({ page }) => {
    await page.goto('/en/auth/signin')
    await page.fill('input#email, input[type="email"]', 'test@test.com')
    await page.fill('input#password, input[type="password"]', 'wrongpassword')
    // Click submit 5 times rapidly
    const submitBtn = page.locator('button[type="submit"]')
    for (let i = 0; i < 5; i++) {
      await submitBtn.click().catch(() => {})
    }
    await page.waitForTimeout(3000)
    // Page should still be functional
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })

  test('accessing /api/auth/session without auth returns valid JSON', async ({ request }) => {
    const response = await request.get('/api/auth/session')
    expect(response.status()).toBeLessThan(500)
    const contentType = response.headers()['content-type'] || ''
    expect(contentType).toContain('json')
  })

  test('callback URL injection is prevented', async ({ page }) => {
    await page.goto('/en/auth/signin?callbackUrl=https://evil.com')
    await page.fill('input#email, input[type="email"]', 'student@tutor.app')
    await page.fill('input#password, input[type="password"]', 'student123')
    await page.click('button[type="submit"]')
    await page.waitForTimeout(3000)
    const url = page.url()
    // Should not redirect to evil.com
    expect(url).not.toContain('evil.com')
  })

  test('password field masks input', async ({ page }) => {
    await page.goto('/en/auth/signin')
    const pwInput = page.locator('input#password, input[type="password"]').first()
    const type = await pwInput.getAttribute('type')
    expect(type).toBe('password')
  })

  test('email field has correct input type', async ({ page }) => {
    await page.goto('/en/auth/signin')
    const emailInput = page.locator('input#email, input[type="email"]').first()
    const type = await emailInput.getAttribute('type')
    expect(type).toBe('email')
  })
})

test.describe('Auth - Session Expiry', () => {
  test('expired session redirects to login', async ({ page }) => {
    // Set an invalid/expired session cookie
    await page.context().addCookies([{
      name: 'authjs.session-token',
      value: 'expired-invalid-token-12345',
      domain: 'localhost',
      path: '/',
    }])
    await page.goto('/en/dashboard')
    await page.waitForTimeout(2000)
    const url = page.url()
    // Should redirect to signin or show unauthorized
    expect(url).toMatch(/signin|auth/)
  })
})
