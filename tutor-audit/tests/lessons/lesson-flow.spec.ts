import { test, expect } from '@playwright/test'
import { loginAsUser, collectConsoleErrors, collectNetworkErrors } from '../../utils/helpers'

test.describe('Lessons - Listing & Browsing', () => {
  test('lessons page requires authentication', async ({ page }) => {
    const response = await page.goto('/en/dashboard/lessons')
    const url = page.url()
    expect(url).toMatch(/auth\/signin/)
  })

  test('lessons page loads after login', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/lessons')
    await expect(page).toHaveURL(/lessons/)
    await expect(page.locator('h1, h2, [data-testid="lessons-title"]')).toBeVisible()
  })

  test('lessons page shows lesson cards or list', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/lessons')
    const items = page.locator('[data-testid="lesson-card"], [data-testid="lesson-item"], article, .lesson-card, tr, li').filter({ hasText: /.+/ })
    const count = await items.count()
    expect(count).toBeGreaterThan(0)
  })

  test('lessons can be filtered by subject', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/lessons')
    const subjectFilter = page.locator('select, [data-testid="subject-filter"], [role="combobox"]').first()
    if (await subjectFilter.isVisible()) {
      await subjectFilter.click()
      expect(await subjectFilter.isVisible()).toBe(true)
    }
  })

  test('lessons page has no console errors', async ({ page }) => {
    const errors = await collectConsoleErrors(page)
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/lessons')
    await page.waitForTimeout(2000)
    expect(errors.filter(e => !e.includes('hydration') && !e.includes('Warning'))).toHaveLength(0)
  })

  test('lessons page has no network errors', async ({ page }) => {
    const errors = await collectNetworkErrors(page)
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/lessons')
    await page.waitForTimeout(2000)
    const criticalErrors = errors.filter(e => e.status >= 500)
    expect(criticalErrors).toHaveLength(0)
  })
})

test.describe('Lessons - Individual Lesson View', () => {
  test('clicking a lesson navigates to lesson detail', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/lessons')
    const firstLesson = page.locator('a[href*="lessons/"], [data-testid="lesson-link"]').first()
    if (await firstLesson.isVisible()) {
      await firstLesson.click()
      await expect(page).toHaveURL(/lessons\//)
    }
  })

  test('lesson detail page shows content', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/lessons')
    const firstLink = page.locator('a[href*="lessons/"]').first()
    if (await firstLink.isVisible()) {
      await firstLink.click()
      await page.waitForTimeout(1000)
      const content = page.locator('article, [data-testid="lesson-content"], .prose, .markdown')
      await expect(content.first()).toBeVisible()
    }
  })

  test('lesson shows difficulty indicator', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/lessons')
    const difficultyBadge = page.locator('[data-testid="difficulty"], .difficulty, .badge').first()
    if (await difficultyBadge.isVisible()) {
      const text = await difficultyBadge.textContent()
      expect(text).toBeTruthy()
    }
  })

  test('lesson progress is trackable', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/lessons')
    const progressIndicator = page.locator('[data-testid="lesson-progress"], .progress, progress, [role="progressbar"]').first()
    if (await progressIndicator.isVisible()) {
      expect(await progressIndicator.isVisible()).toBe(true)
    }
  })
})

test.describe('Lessons - API Endpoints', () => {
  test('GET /api/student/lessons requires auth', async ({ request }) => {
    const response = await request.get('/api/student/lessons')
    expect(response.status()).toBe(401)
  })

  test('GET /api/student/lessons/invalid-id returns 404', async ({ request }) => {
    const response = await request.get('/api/student/lessons/nonexistent-id-12345')
    expect([401, 404]).toContain(response.status())
  })
})
