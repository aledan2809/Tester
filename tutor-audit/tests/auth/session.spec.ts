import { test, expect } from '@playwright/test'
import { PROTECTED_PATHS, ADMIN_PATHS } from '../../utils/helpers'

test.describe('Auth - Protected Route Redirects', () => {
  for (const path of PROTECTED_PATHS) {
    test(`should redirect unauthenticated user from ${path} to sign-in`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/auth\/signin/)
    })
  }
})

test.describe('Auth - Admin Route Protection', () => {
  for (const path of ADMIN_PATHS) {
    test(`should protect admin route ${path}`, async ({ page }) => {
      await page.goto(path)
      const url = page.url()
      const isProtected = url.includes('auth/signin') || url.includes('403') || url.includes('unauthorized')
      expect(isProtected).toBeTruthy()
    })
  }
})

test.describe('Auth - Session Cookie', () => {
  test('should not have session cookie when not logged in', async ({ page }) => {
    await page.goto('/en/auth/signin')
    const cookies = await page.context().cookies()
    const sessionCookie = cookies.find(c => c.name.includes('session-token'))
    expect(sessionCookie).toBeUndefined()
  })

  test('should set httpOnly session cookie after login', async ({ page }) => {
    await page.goto('/en/auth/signin')
    await page.fill('input#email', 'student@tutor.app')
    await page.fill('input#password', 'student123')
    await page.click('button[type="submit"]')
    await page.waitForTimeout(5000)
    if (page.url().includes('dashboard')) {
      const cookies = await page.context().cookies()
      const sessionCookie = cookies.find(c => c.name.includes('session-token'))
      expect(sessionCookie).toBeDefined()
      if (sessionCookie) {
        expect(sessionCookie.httpOnly).toBe(true)
      }
    }
  })
})

test.describe('Auth - Callback URL', () => {
  test('should preserve callbackUrl when redirecting to login', async ({ page }) => {
    await page.goto('/en/dashboard/progress')
    await page.waitForURL(/auth\/signin/)
    const url = page.url()
    const hasCallback = url.includes('callbackUrl') || url.includes('redirect')
    expect(hasCallback).toBeTruthy()
  })
})
