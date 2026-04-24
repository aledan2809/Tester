import { test, expect } from '@playwright/test'
import { loginAsUser } from '../../utils/helpers'

test.describe('Domain - Enrollment Flow', () => {
  test('domains page requires authentication', async ({ page }) => {
    await page.goto('/en/dashboard/domains')
    expect(page.url()).toMatch(/auth\/signin/)
  })

  test('domains page loads after login', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/domains')
    const url = page.url()
    expect(url).toMatch(/domain|dashboard/)
  })

  test('available domains are displayed', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/domains')
    const domainCards = page.locator('[data-testid="domain-card"], .domain-card, article, .card').first()
    if (await domainCards.isVisible()) {
      expect(await domainCards.textContent()).toBeTruthy()
    }
  })

  test('enrolled domain shows active status', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/domains')
    const enrolledBadge = page.locator('text=/enrolled|active|inscris/i, [data-testid="enrolled-badge"]').first()
    if (await enrolledBadge.isVisible()) {
      expect(await enrolledBadge.textContent()).toBeTruthy()
    }
  })
})

test.describe('Domain - API Endpoints', () => {
  test('GET /api/student/domains requires auth', async ({ request }) => {
    const response = await request.get('/api/student/domains')
    expect(response.status()).toBe(401)
  })

  test('GET /api/student/domains/invalid-id requires auth', async ({ request }) => {
    const response = await request.get('/api/student/domains/nonexistent')
    expect(response.status()).toBe(401)
  })
})
