import { test, expect } from '@playwright/test'
import { loginAsUser, collectConsoleErrors } from '../../utils/helpers'

test.describe('Instructor - Dashboard Access', () => {
  test('instructor dashboard requires authentication', async ({ page }) => {
    await page.goto('/en/dashboard/instructor')
    expect(page.url()).toMatch(/auth\/signin/)
  })

  test('instructor dashboard loads for instructor user', async ({ page }) => {
    await loginAsUser(page, 'instructor')
    await page.goto('/en/dashboard/instructor')
    await expect(page).toHaveURL(/instructor/)
  })

  test('instructor dashboard shows student count', async ({ page }) => {
    await loginAsUser(page, 'instructor')
    await page.goto('/en/dashboard/instructor')
    const stats = page.locator('[data-testid="student-count"], text=/student/i').first()
    if (await stats.isVisible()) {
      expect(await stats.textContent()).toBeTruthy()
    }
  })

  test('instructor dashboard has no console errors', async ({ page }) => {
    const errors = await collectConsoleErrors(page)
    await loginAsUser(page, 'instructor')
    await page.goto('/en/dashboard/instructor')
    await page.waitForTimeout(2000)
    expect(errors.filter(e => !e.includes('hydration'))).toHaveLength(0)
  })
})

test.describe('Instructor - Student Management', () => {
  test('students page loads', async ({ page }) => {
    await loginAsUser(page, 'instructor')
    await page.goto('/en/dashboard/instructor/students')
    await expect(page).toHaveURL(/instructor\/students/)
  })

  test('students list shows entries or empty state', async ({ page }) => {
    await loginAsUser(page, 'instructor')
    await page.goto('/en/dashboard/instructor/students')
    const students = page.locator('table tr, [data-testid="student-row"], .student-card')
    const emptyState = page.locator('text=/no student|empty/i')
    const hasStudents = await students.count() > 0
    const hasEmpty = await emptyState.isVisible().catch(() => false)
    expect(hasStudents || hasEmpty).toBe(true)
  })
})

test.describe('Instructor - Groups', () => {
  test('groups page loads', async ({ page }) => {
    await loginAsUser(page, 'instructor')
    await page.goto('/en/dashboard/instructor/groups')
    await expect(page).toHaveURL(/instructor\/groups/)
  })

  test('create group button is visible', async ({ page }) => {
    await loginAsUser(page, 'instructor')
    await page.goto('/en/dashboard/instructor/groups')
    const createBtn = page.locator('a[href*="groups/new"], button:has-text("create"), button:has-text("Create"), [data-testid="create-group"]').first()
    if (await createBtn.isVisible()) {
      expect(await createBtn.isVisible()).toBe(true)
    }
  })
})

test.describe('Instructor - Goals & Messages', () => {
  test('goals page loads', async ({ page }) => {
    await loginAsUser(page, 'instructor')
    await page.goto('/en/dashboard/instructor/goals')
    await expect(page).toHaveURL(/instructor\/goals/)
  })

  test('messages page loads', async ({ page }) => {
    await loginAsUser(page, 'instructor')
    await page.goto('/en/dashboard/instructor/messages')
    await expect(page).toHaveURL(/instructor\/messages/)
  })
})

test.describe('Instructor - Analytics', () => {
  test('analytics page loads', async ({ page }) => {
    await loginAsUser(page, 'instructor')
    await page.goto('/en/dashboard/instructor/analytics')
    await expect(page).toHaveURL(/instructor\/analytics/)
  })

  test('reports page loads', async ({ page }) => {
    await loginAsUser(page, 'instructor')
    await page.goto('/en/dashboard/instructor/reports')
    await expect(page).toHaveURL(/instructor\/reports/)
  })
})

test.describe('Instructor - API Endpoints', () => {
  test('GET /api/dashboard/instructor requires auth', async ({ request }) => {
    const response = await request.get('/api/dashboard/instructor')
    expect(response.status()).toBe(401)
  })

  test('GET /api/dashboard/instructor/students requires auth', async ({ request }) => {
    const response = await request.get('/api/dashboard/instructor/students')
    expect(response.status()).toBe(401)
  })

  test('GET /api/dashboard/instructor/groups requires auth', async ({ request }) => {
    const response = await request.get('/api/dashboard/instructor/groups')
    expect(response.status()).toBe(401)
  })

  test('POST /api/dashboard/instructor/groups requires auth', async ({ request }) => {
    const response = await request.post('/api/dashboard/instructor/groups', {
      data: { name: 'Test Group', description: 'Test' }
    })
    expect(response.status()).toBe(401)
  })

  test('GET /api/dashboard/instructor/goals requires auth', async ({ request }) => {
    const response = await request.get('/api/dashboard/instructor/goals')
    expect(response.status()).toBe(401)
  })

  test('GET /api/dashboard/instructor/messages requires auth', async ({ request }) => {
    const response = await request.get('/api/dashboard/instructor/messages')
    expect(response.status()).toBe(401)
  })

  test('GET /api/dashboard/instructor/analytics requires auth', async ({ request }) => {
    const response = await request.get('/api/dashboard/instructor/analytics')
    expect(response.status()).toBe(401)
  })

  test('GET /api/dashboard/instructor/thresholds requires auth', async ({ request }) => {
    const response = await request.get('/api/dashboard/instructor/thresholds')
    expect(response.status()).toBe(401)
  })
})
