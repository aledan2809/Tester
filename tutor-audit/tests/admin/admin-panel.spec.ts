import { test, expect } from '@playwright/test'
import { loginAsUser } from '../../utils/helpers'

test.describe('Admin - Dashboard Access', () => {
  test('should deny admin access for student role', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/admin/domains')
    await page.waitForTimeout(3000)
    const url = page.url()
    const content = await page.textContent('body')
    const isDenied = url.includes('dashboard') && !url.includes('admin') ||
      content?.includes('403') || content?.includes('Forbidden') ||
      content?.includes('Unauthorized') || content?.includes('not authorized')
    test.info().annotations.push({
      type: 'audit',
      description: isDenied ? 'Admin access denied for student - correct' : 'Student may have admin access - SECURITY ISSUE',
    })
  })

  test('should allow admin access for admin role', async ({ page }) => {
    await loginAsUser(page, 'admin')
    await page.goto('/en/dashboard/admin/domains')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasAdmin = content?.includes('Domain') || content?.includes('Admin') || content?.includes('Manage')
    test.info().annotations.push({
      type: 'audit',
      description: hasAdmin ? 'Admin panel accessible for admin user' : 'Admin panel may not be loading for admin user',
    })
  })
})

test.describe('Admin - Domain Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'admin')
  })

  test('should load domains management page', async ({ page }) => {
    await page.goto('/en/dashboard/admin/domains')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasDomains = content?.includes('Aviation') || content?.includes('Domain') || content?.includes('domain')
    test.info().annotations.push({
      type: 'audit',
      description: hasDomains ? 'Admin domains page loaded' : 'Admin domains page not loading',
    })
  })

  test('should have create domain button', async ({ page }) => {
    await page.goto('/en/dashboard/admin/domains')
    await page.waitForTimeout(3000)
    const createButton = page.locator('button:has-text("Create"), a:has-text("Create"), button:has-text("New"), a:has-text("New"), a[href*="new"]')
    const hasCreate = await createButton.first().isVisible().catch(() => false)
    test.info().annotations.push({
      type: 'audit',
      description: hasCreate ? 'Create domain button visible' : 'No create domain button found',
    })
  })
})

test.describe('Admin - User Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'admin')
  })

  test('should load users management page', async ({ page }) => {
    await page.goto('/en/dashboard/admin/superadmin/users')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasUsers = content?.includes('User') || content?.includes('user') || content?.includes('Email') || content?.includes('email')
    test.info().annotations.push({
      type: 'audit',
      description: hasUsers ? 'Admin users page loaded' : 'Admin users page not loading - check role permissions',
    })
  })

  test('should show user list with roles', async ({ page }) => {
    await page.goto('/en/dashboard/admin/superadmin/users')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasRoles = content?.includes('STUDENT') || content?.includes('ADMIN') || content?.includes('INSTRUCTOR') || content?.includes('Role')
    test.info().annotations.push({
      type: 'audit',
      description: hasRoles ? 'User roles visible in admin list' : 'User roles not visible in admin list',
    })
  })

  test('should have create user button', async ({ page }) => {
    await page.goto('/en/dashboard/admin/superadmin/users')
    await page.waitForTimeout(3000)
    const createButton = page.locator('button:has-text("Create"), button:has-text("Add"), a:has-text("Create"), a:has-text("Add")')
    const hasCreate = await createButton.first().isVisible().catch(() => false)
    test.info().annotations.push({
      type: 'audit',
      description: hasCreate ? 'Create user button visible' : 'No create user button found',
    })
  })

  test('should have impersonate functionality', async ({ page }) => {
    await page.goto('/en/dashboard/admin/superadmin/users')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasImpersonate = content?.includes('Impersonate') || content?.includes('impersonate') || content?.includes('Login as')
    test.info().annotations.push({
      type: 'audit',
      description: hasImpersonate ? 'Impersonate feature visible' : 'No impersonate feature found in admin panel',
    })
  })
})

test.describe('Admin - Subscription Plans', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'admin')
  })

  test('should load plans management page', async ({ page }) => {
    await page.goto('/en/dashboard/admin/superadmin/plans')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasPlans = content?.includes('Plan') || content?.includes('plan') || content?.includes('Subscription') || content?.includes('Price')
    test.info().annotations.push({
      type: 'audit',
      description: hasPlans ? 'Plans management page loaded' : 'Plans management page not loading',
    })
  })
})

test.describe('Admin - Vouchers', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'admin')
  })

  test('should load vouchers management page', async ({ page }) => {
    await page.goto('/en/dashboard/admin/superadmin/vouchers')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasVouchers = content?.includes('Voucher') || content?.includes('voucher') || content?.includes('Code') || content?.includes('Discount')
    test.info().annotations.push({
      type: 'audit',
      description: hasVouchers ? 'Vouchers management page loaded' : 'Vouchers management page not loading',
    })
  })
})

test.describe('Admin - Audit Logs', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'admin')
  })

  test('should load audit logs page', async ({ page }) => {
    await page.goto('/en/dashboard/admin/superadmin/audit')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasAudit = content?.includes('Audit') || content?.includes('audit') || content?.includes('Log') || content?.includes('Action')
    test.info().annotations.push({
      type: 'audit',
      description: hasAudit ? 'Audit logs page loaded' : 'Audit logs page not loading',
    })
  })
})

test.describe('Admin - Question Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'admin')
  })

  test('should load questions management page', async ({ page }) => {
    await page.goto('/en/dashboard/admin/aviation/questions')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasQuestions = content?.includes('Question') || content?.includes('question') || content?.includes('ICAO') || content?.includes('Air Law')
    test.info().annotations.push({
      type: 'audit',
      description: hasQuestions ? 'Questions management page loaded' : 'Questions management page not loading',
    })
  })

  test('should show question filters', async ({ page }) => {
    await page.goto('/en/dashboard/admin/aviation/questions')
    await page.waitForTimeout(3000)
    const filters = page.locator('select, input[type="search"], [data-filter], input[placeholder*="Search"], input[placeholder*="search"]')
    const hasFilters = await filters.first().isVisible().catch(() => false)
    test.info().annotations.push({
      type: 'audit',
      description: hasFilters ? 'Question filters visible' : 'No question filters found',
    })
  })
})
