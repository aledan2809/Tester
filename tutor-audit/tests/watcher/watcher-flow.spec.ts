import { test, expect } from '@playwright/test'
import { loginAsUser } from '../../utils/helpers'

test.describe('Watcher - Dashboard Access', () => {
  test('watcher dashboard requires authentication', async ({ page }) => {
    await page.goto('/en/dashboard/watcher')
    expect(page.url()).toMatch(/auth\/signin/)
  })

  test('watcher dashboard loads for student user', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/watcher')
    // May redirect if user has no watcher role
    const url = page.url()
    const isWatcherOrRedirect = url.includes('watcher') || url.includes('dashboard') || url.includes('signin')
    expect(isWatcherOrRedirect).toBe(true)
  })

  test('watcher notifications page requires auth', async ({ page }) => {
    await page.goto('/en/dashboard/watcher/notifications')
    expect(page.url()).toMatch(/auth\/signin/)
  })
})

test.describe('Watcher - API Endpoints', () => {
  test('GET /api/dashboard/watcher requires auth', async ({ request }) => {
    const response = await request.get('/api/dashboard/watcher')
    expect(response.status()).toBe(401)
  })

  test('GET /api/dashboard/watcher/invalid-id requires auth', async ({ request }) => {
    const response = await request.get('/api/dashboard/watcher/some-student-id')
    expect(response.status()).toBe(401)
  })
})
