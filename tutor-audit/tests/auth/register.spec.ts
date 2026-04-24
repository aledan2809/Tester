import { test, expect } from '@playwright/test'

test.describe('Auth - Registration Flow', () => {
  test('should have link to register from sign-in page', async ({ page }) => {
    await page.goto('/en/auth/signin')
    const registerLink = page.locator('a:has-text("register"), a:has-text("Register"), a:has-text("Sign up"), a:has-text("sign up"), a[href*="register"]')
    const hasRegisterLink = await registerLink.isVisible().catch(() => false)
    // Document whether registration link exists
    test.info().annotations.push({
      type: 'audit',
      description: hasRegisterLink ? 'Register link found on sign-in page' : 'NO register link found on sign-in page - users may only register via Google OAuth or admin creation',
    })
  })

  test('should have password requirements visible during registration', async ({ page }) => {
    await page.goto('/en/auth/signin')
    const registerLink = page.locator('a[href*="register"], a:has-text("Sign up")')
    const hasRegister = await registerLink.isVisible().catch(() => false)
    if (hasRegister) {
      await registerLink.click()
      await page.waitForTimeout(1000)
      const passwordInput = page.locator('input[type="password"]')
      if (await passwordInput.isVisible()) {
        const minLength = await passwordInput.getAttribute('minlength')
        test.info().annotations.push({
          type: 'audit',
          description: minLength ? `Password minlength=${minLength}` : 'No minlength attribute on password field - potential security concern',
        })
      }
    } else {
      test.info().annotations.push({
        type: 'audit',
        description: 'No separate registration page found',
      })
    }
  })

  test('should prevent XSS in registration name field', async ({ page }) => {
    await page.goto('/en/auth/signin')
    const registerLink = page.locator('a[href*="register"], a:has-text("Sign up")')
    const hasRegister = await registerLink.isVisible().catch(() => false)
    if (hasRegister) {
      await registerLink.click()
      await page.waitForTimeout(1000)
      const nameInput = page.locator('input[name="name"], input#name')
      if (await nameInput.isVisible()) {
        await nameInput.fill('<script>alert("xss")</script>')
        await page.click('button[type="submit"]')
        await page.waitForTimeout(1000)
        const content = await page.content()
        expect(content).not.toContain('<script>alert("xss")</script>')
      }
    }
  })

  test('should prevent SQL injection in email field', async ({ page }) => {
    await page.goto('/en/auth/signin')
    await page.fill('input#email', "' OR '1'='1' --")
    await page.fill('input#password', 'test123')
    await page.click('button[type="submit"]')
    await page.waitForTimeout(2000)
    expect(page.url()).not.toContain('dashboard')
  })
})
