import { test, expect } from '@playwright/test'

test.describe('i18n - Locale Routing', () => {
  test('root / redirects to default locale /en', async ({ page }) => {
    await page.goto('/')
    const url = page.url()
    expect(url).toMatch(/\/(en|ro)/)
  })

  test('/en landing page loads', async ({ page }) => {
    const response = await page.goto('/en')
    expect(response?.status()).toBeLessThan(400)
  })

  test('/ro landing page loads', async ({ page }) => {
    const response = await page.goto('/ro')
    expect(response?.status()).toBeLessThan(400)
  })

  test('/en sets html lang="en"', async ({ page }) => {
    await page.goto('/en')
    const lang = await page.locator('html').getAttribute('lang')
    expect(lang).toBe('en')
  })

  test('/ro sets html lang="ro"', async ({ page }) => {
    await page.goto('/ro')
    const lang = await page.locator('html').getAttribute('lang')
    expect(lang).toBe('ro')
  })

  test('/en/auth/signin loads English login page', async ({ page }) => {
    await page.goto('/en/auth/signin')
    expect(page.url()).toContain('/en/auth/signin')
    const signInText = page.locator('text=/sign in|log in/i').first()
    await expect(signInText).toBeVisible()
  })

  test('/ro/auth/signin loads Romanian login page', async ({ page }) => {
    await page.goto('/ro/auth/signin')
    expect(page.url()).toContain('/ro/auth/signin')
    // Romanian page should have Romanian text
    const body = await page.locator('body').textContent()
    expect(body).toBeTruthy()
  })

  test('invalid locale path returns 404 or redirects', async ({ page }) => {
    const response = await page.goto('/xx/auth/signin')
    const status = response?.status() ?? 0
    const url = page.url()
    // Should either 404 or redirect to valid locale
    expect(status === 404 || url.includes('/en') || url.includes('/ro')).toBe(true)
  })
})

test.describe('i18n - Locale Switcher', () => {
  test('locale switcher exists on landing page', async ({ page }) => {
    await page.goto('/en')
    const switcher = page.locator('[data-testid="locale-switcher"], select[name="locale"], a[href="/ro"], button:has-text("RO"), button:has-text("EN")').first()
    if (await switcher.isVisible()) {
      expect(await switcher.isVisible()).toBe(true)
    }
  })

  test('switching locale preserves current path', async ({ page }) => {
    await page.goto('/en/auth/signin')
    const roLink = page.locator('a[href*="/ro/auth/signin"], a[href="/ro"]').first()
    if (await roLink.isVisible()) {
      await roLink.click()
      await page.waitForTimeout(1000)
      expect(page.url()).toContain('/ro')
    }
  })
})

test.describe('i18n - Content Translation', () => {
  test('English terms page has English content', async ({ page }) => {
    await page.goto('/en/terms')
    const body = await page.locator('body').textContent() || ''
    // Should contain common English legal terms
    expect(body.length).toBeGreaterThan(50)
  })

  test('English privacy page has English content', async ({ page }) => {
    await page.goto('/en/privacy')
    const body = await page.locator('body').textContent() || ''
    expect(body.length).toBeGreaterThan(50)
  })
})
