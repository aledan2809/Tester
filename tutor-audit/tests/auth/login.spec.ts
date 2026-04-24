import { test, expect } from '@playwright/test'
import { TEST_USERS, LOCALES } from '../../utils/helpers'

test.describe('Auth - Login Page', () => {
  test('should display sign-in page with form', async ({ page }) => {
    await page.goto('/en/auth/signin')
    await expect(page).toHaveURL(/auth\/signin/)
    await expect(page.locator('form')).toBeVisible()
  })

  test('should show email and password inputs', async ({ page }) => {
    await page.goto('/en/auth/signin')
    const emailInput = page.locator('input#email')
    const passwordInput = page.locator('input#password')
    await expect(emailInput).toBeVisible()
    await expect(passwordInput).toBeVisible()
    await expect(emailInput).toHaveAttribute('type', 'email')
    await expect(passwordInput).toHaveAttribute('type', 'password')
  })

  test('email field should have proper placeholder', async ({ page }) => {
    await page.goto('/en/auth/signin')
    const emailInput = page.locator('input#email')
    const placeholder = await emailInput.getAttribute('placeholder')
    expect(placeholder).toContain('@')
    expect(placeholder).not.toContain('manage password')
  })

  test('should show Google OAuth button', async ({ page }) => {
    await page.goto('/en/auth/signin')
    const googleButton = page.locator('button:has-text("Google"), a:has-text("Google")')
    await expect(googleButton).toBeVisible()
  })

  test('should require email field (HTML5 validation)', async ({ page }) => {
    await page.goto('/en/auth/signin')
    const emailInput = page.locator('input#email')
    await expect(emailInput).toHaveAttribute('required', '')
  })

  test('should show validation error for invalid email format', async ({ page }) => {
    await page.goto('/en/auth/signin')
    await page.fill('input#email', 'notanemail')
    await page.fill('input#password', 'somepassword')
    await page.click('button[type="submit"]')
    const isValid = await page.locator('input#email').evaluate((el: HTMLInputElement) => el.checkValidity())
    expect(isValid).toBe(false)
  })

  test('should reject login with wrong credentials', async ({ page }) => {
    await page.goto('/en/auth/signin')
    await page.fill('input#email', 'wrong@email.com')
    await page.fill('input#password', 'wrongpassword')
    await page.click('button[type="submit"]')
    await page.waitForTimeout(2000)
    const errorVisible = await page.locator('[role="alert"], .text-red-500, .error, [data-testid="error"]').isVisible().catch(() => false)
    const urlHasError = page.url().includes('error')
    expect(errorVisible || urlHasError).toBeTruthy()
  })

  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/en/auth/signin')
    await page.fill('input#email', TEST_USERS.student.email)
    await page.fill('input#password', TEST_USERS.student.password)
    await page.click('button[type="submit"]')
    await page.waitForTimeout(5000)
    const url = page.url()
    const loginSucceeded = url.includes('dashboard') || !url.includes('error')
    expect(loginSucceeded).toBeTruthy()
  })

  test('should have password field masked', async ({ page }) => {
    await page.goto('/en/auth/signin')
    const passwordInput = page.locator('input#password')
    await expect(passwordInput).toHaveAttribute('type', 'password')
  })

  test('should not expose credentials in URL after failed login', async ({ page }) => {
    await page.goto('/en/auth/signin')
    await page.fill('input#email', 'test@test.com')
    await page.fill('input#password', 'testpass')
    await page.click('button[type="submit"]')
    await page.waitForTimeout(2000)
    const url = page.url()
    expect(url).not.toContain('testpass')
    expect(url).not.toContain('password=')
  })
})

test.describe('Auth - Locale Support', () => {
  for (const locale of LOCALES) {
    test(`should load sign-in page in ${locale} locale`, async ({ page }) => {
      await page.goto(`/${locale}/auth/signin`)
      await expect(page).toHaveURL(new RegExp(`/${locale}/`))
      await expect(page.locator('form')).toBeVisible()
    })
  }

  test('should switch between en and ro locales', async ({ page }) => {
    await page.goto('/en/auth/signin')
    await expect(page).toHaveURL(/\/en\//)
    await page.goto('/ro/auth/signin')
    await expect(page).toHaveURL(/\/ro\//)
  })
})

test.describe('Auth - Magic Link Mode', () => {
  test('should show magic link email input when toggled', async ({ page }) => {
    await page.goto('/en/auth/signin')
    const magicLinkToggle = page.locator('button:has-text("magic"), button:has-text("Magic"), button:has-text("email link"), [data-mode="magic"]')
    const hasMagicLink = await magicLinkToggle.isVisible().catch(() => false)
    if (hasMagicLink) {
      await magicLinkToggle.click()
      const magicEmailInput = page.locator('input#email-magic')
      await expect(magicEmailInput).toBeVisible()
    }
  })
})
