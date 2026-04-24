import { Page, expect } from '@playwright/test'

export const TEST_USERS = {
  admin: { email: 'admin@tutor.app', password: 'admin123' },
  student: { email: 'student@tutor.app', password: 'student123' },
  instructor: { email: 'instructor@tutor.app', password: 'instructor123' },
}

export async function loginAsUser(page: Page, user: keyof typeof TEST_USERS) {
  const creds = TEST_USERS[user]
  await page.goto('/en/auth/signin')
  await page.fill('input#email', creds.email)
  await page.fill('input#password', creds.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/dashboard/, { timeout: 15_000 })
}

export async function expectPageLoaded(page: Page, urlPattern: RegExp) {
  await expect(page).toHaveURL(urlPattern)
  const status = await page.evaluate(() => document.readyState)
  expect(status).toBe('complete')
}

export async function getResponseStatus(page: Page, url: string): Promise<number> {
  const response = await page.goto(url)
  return response?.status() ?? 0
}

export async function collectConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  return errors
}

export async function collectNetworkErrors(page: Page): Promise<{ url: string; status: number }[]> {
  const errors: { url: string; status: number }[] = []
  page.on('response', response => {
    if (response.status() >= 400) {
      errors.push({ url: response.url(), status: response.status() })
    }
  })
  return errors
}

export const LOCALES = ['en', 'ro'] as const

export const PUBLIC_PATHS = ['/', '/en', '/ro', '/en/auth/signin', '/ro/auth/signin', '/en/terms', '/en/privacy']

export const PROTECTED_PATHS = [
  '/en/dashboard',
  '/en/dashboard/progress',
  '/en/dashboard/practice',
  '/en/dashboard/assessment',
  '/en/dashboard/exams',
  '/en/dashboard/gamification',
  '/en/dashboard/calendar',
  '/en/dashboard/settings',
]

export const ADMIN_PATHS = [
  '/en/dashboard/admin/domains',
  '/en/dashboard/admin/superadmin/users',
  '/en/dashboard/admin/superadmin/plans',
  '/en/dashboard/admin/superadmin/vouchers',
  '/en/dashboard/admin/superadmin/audit',
]

export const API_ENDPOINTS = {
  studentDashboard: '/api/student/dashboard',
  studentDomains: '/api/student/domains',
  adminUsers: '/api/admin/users',
  adminDomains: '/api/admin/domains',
  adminQuestions: '/api/admin/questions',
  notifications: '/api/notifications',
}
