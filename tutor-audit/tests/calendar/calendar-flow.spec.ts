import { test, expect } from '@playwright/test'
import { loginAsUser, collectConsoleErrors } from '../../utils/helpers'

test.describe('Calendar - Page Load', () => {
  test('calendar page requires authentication', async ({ page }) => {
    await page.goto('/en/dashboard/calendar')
    expect(page.url()).toMatch(/auth\/signin/)
  })

  test('calendar page loads after login', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/calendar')
    await expect(page).toHaveURL(/calendar/)
  })

  test('calendar page shows connect button if not linked', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/calendar')
    const connectBtn = page.locator('button:has-text("connect"), button:has-text("Connect"), [data-testid="calendar-connect"]').first()
    const calendarView = page.locator('[data-testid="calendar-grid"], .calendar-grid, table').first()
    // Either connect button or calendar view should be visible
    const hasConnect = await connectBtn.isVisible().catch(() => false)
    const hasCalendar = await calendarView.isVisible().catch(() => false)
    expect(hasConnect || hasCalendar).toBe(true)
  })

  test('calendar page has no console errors', async ({ page }) => {
    const errors = await collectConsoleErrors(page)
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/calendar')
    await page.waitForTimeout(2000)
    expect(errors.filter(e => !e.includes('hydration'))).toHaveLength(0)
  })
})

test.describe('Calendar - API Endpoints', () => {
  test('GET /api/aviation/calendar/status requires auth', async ({ request }) => {
    const response = await request.get('/api/aviation/calendar/status')
    expect(response.status()).toBe(401)
  })

  test('POST /api/aviation/calendar/connect requires auth', async ({ request }) => {
    const response = await request.post('/api/aviation/calendar/connect')
    expect(response.status()).toBe(401)
  })

  test('POST /api/aviation/calendar/disconnect requires auth', async ({ request }) => {
    const response = await request.post('/api/aviation/calendar/disconnect')
    expect(response.status()).toBe(401)
  })

  test('GET /api/aviation/calendar/events requires auth', async ({ request }) => {
    const response = await request.get('/api/aviation/calendar/events')
    expect(response.status()).toBe(401)
  })

  test('POST /api/aviation/calendar/schedule requires auth', async ({ request }) => {
    const response = await request.post('/api/aviation/calendar/schedule', {
      data: { title: 'Test', startTime: '2026-04-05T10:00:00Z', endTime: '2026-04-05T11:00:00Z' }
    })
    expect(response.status()).toBe(401)
  })

  test('GET /api/aviation/calendar/free-slots requires auth', async ({ request }) => {
    const response = await request.get('/api/aviation/calendar/free-slots')
    expect(response.status()).toBe(401)
  })
})
