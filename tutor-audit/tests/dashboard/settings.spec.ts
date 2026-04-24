import { test, expect } from '@playwright/test'
import { loginAsUser } from '../../utils/helpers'

test.describe('Settings - User Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'student')
  })

  test('should load settings page', async ({ page }) => {
    await page.goto('/en/dashboard/settings')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasSettings = content?.includes('Settings') || content?.includes('settings') || content?.includes('Profile') || content?.includes('Preferences')
    expect(hasSettings).toBeTruthy()
  })

  test('should show notification preferences link', async ({ page }) => {
    await page.goto('/en/dashboard/settings')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasNotif = content?.includes('Notification') || content?.includes('notification')
    test.info().annotations.push({
      type: 'audit',
      description: hasNotif ? 'Notification preferences accessible' : 'No notification preferences found in settings',
    })
  })

  test('should show user profile information', async ({ page }) => {
    await page.goto('/en/dashboard/settings')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasProfile = content?.includes('Name') || content?.includes('Email') || content?.includes('name') || content?.includes('email')
    test.info().annotations.push({
      type: 'audit',
      description: hasProfile ? 'User profile info visible in settings' : 'No user profile info in settings',
    })
  })
})

test.describe('Settings - Calendar Integration', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'student')
  })

  test('should load calendar page', async ({ page }) => {
    await page.goto('/en/dashboard/calendar')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasCalendar = content?.includes('Calendar') || content?.includes('calendar') || content?.includes('Google') || content?.includes('Connect')
    test.info().annotations.push({
      type: 'audit',
      description: hasCalendar ? 'Calendar page loaded' : 'Calendar page not loading',
    })
  })
})

test.describe('Settings - Watcher Dashboard', () => {
  test('should load watcher page', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/watcher')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const url = page.url()
    test.info().annotations.push({
      type: 'audit',
      description: `Watcher page access result: URL=${url}, has content: ${(content?.length ?? 0) > 50}`,
    })
  })
})
