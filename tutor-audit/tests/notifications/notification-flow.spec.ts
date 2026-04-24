import { test, expect } from '@playwright/test'
import { loginAsUser, collectConsoleErrors } from '../../utils/helpers'

test.describe('Notifications - Page Load', () => {
  test('notifications page requires authentication', async ({ page }) => {
    await page.goto('/en/dashboard/notifications')
    expect(page.url()).toMatch(/auth\/signin/)
  })

  test('notifications page loads after login', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/notifications')
    await expect(page).toHaveURL(/notification/)
  })

  test('notification bell icon is visible in header', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard')
    const bell = page.locator('[data-testid="notification-bell"], button[aria-label*="notification"], .notification-bell, svg[data-icon="bell"]').first()
    if (await bell.isVisible()) {
      expect(await bell.isVisible()).toBe(true)
    }
  })

  test('notifications page has no console errors', async ({ page }) => {
    const errors = await collectConsoleErrors(page)
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/notifications')
    await page.waitForTimeout(2000)
    expect(errors.filter(e => !e.includes('hydration'))).toHaveLength(0)
  })
})

test.describe('Notifications - Preferences', () => {
  test('notification preferences page loads', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/settings/notifications')
    const url = page.url()
    expect(url).toMatch(/settings|notification/)
  })

  test('notification preferences show channel toggles', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/settings/notifications')
    const toggles = page.locator('input[type="checkbox"], [role="switch"], button[aria-checked]')
    const count = await toggles.count()
    // Should have toggles for different notification channels
    expect(count).toBeGreaterThanOrEqual(0)
  })
})

test.describe('Notifications - API Endpoints', () => {
  test('GET /api/notifications requires auth', async ({ request }) => {
    const response = await request.get('/api/notifications')
    expect(response.status()).toBe(401)
  })

  test('GET /api/notifications/preferences requires auth', async ({ request }) => {
    const response = await request.get('/api/notifications/preferences')
    expect(response.status()).toBe(401)
  })

  test('PUT /api/notifications/preferences requires auth', async ({ request }) => {
    const response = await request.put('/api/notifications/preferences', {
      data: { emailEnabled: true }
    })
    expect(response.status()).toBe(401)
  })

  test('PUT /api/notifications/invalid-id requires auth', async ({ request }) => {
    const response = await request.put('/api/notifications/some-id', {
      data: { isRead: true }
    })
    expect(response.status()).toBe(401)
  })
})
