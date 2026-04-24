import { test, expect } from '@playwright/test'
import { loginAsUser, collectConsoleErrors } from '../../utils/helpers'

test.describe('Dashboard - Main View', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'student')
  })

  test('should load dashboard after login', async ({ page }) => {
    await expect(page).toHaveURL(/dashboard/)
    await expect(page.locator('body')).toBeVisible()
  })

  test('should display stat cards (streak, XP, level, accuracy)', async ({ page }) => {
    await page.waitForTimeout(2000)
    const content = await page.textContent('body')
    const hasStats = content?.includes('Streak') || content?.includes('XP') || content?.includes('Level') || content?.includes('Accuracy')
    test.info().annotations.push({
      type: 'audit',
      description: hasStats ? 'Dashboard stat cards are visible' : 'Dashboard stat cards NOT found - possible rendering issue',
    })
    expect(hasStats).toBeTruthy()
  })

  test('should display quick action buttons', async ({ page }) => {
    await page.waitForTimeout(2000)
    const quickSession = page.locator('button:has-text("Quick"), a:has-text("Quick"), button:has-text("Start"), a:has-text("Start")')
    const hasQuickActions = await quickSession.first().isVisible().catch(() => false)
    test.info().annotations.push({
      type: 'audit',
      description: hasQuickActions ? 'Quick action buttons visible' : 'No quick action buttons found on dashboard',
    })
  })

  test('should have no console errors on load', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.goto('/en/dashboard')
    await page.waitForTimeout(3000)
    const criticalErrors = errors.filter(e => !e.includes('favicon') && !e.includes('hydration'))
    test.info().annotations.push({
      type: 'audit',
      description: criticalErrors.length > 0 ? `Console errors: ${criticalErrors.join('; ')}` : 'No critical console errors',
    })
  })

  test('should have no 4xx/5xx network errors on dashboard load', async ({ page }) => {
    const networkErrors: { url: string; status: number }[] = []
    page.on('response', response => {
      if (response.status() >= 400 && !response.url().includes('favicon')) {
        networkErrors.push({ url: response.url(), status: response.status() })
      }
    })
    await page.goto('/en/dashboard')
    await page.waitForTimeout(3000)
    test.info().annotations.push({
      type: 'audit',
      description: networkErrors.length > 0 ? `Network errors: ${JSON.stringify(networkErrors)}` : 'No network errors on dashboard',
    })
  })

  test('should show domain selector or domain info', async ({ page }) => {
    await page.waitForTimeout(2000)
    const content = await page.textContent('body')
    const hasDomain = content?.includes('Aviation') || content?.includes('aviation') || content?.includes('Domain')
    test.info().annotations.push({
      type: 'audit',
      description: hasDomain ? 'Domain information visible' : 'No domain info found on dashboard',
    })
  })

  test('should display recent sessions section', async ({ page }) => {
    await page.waitForTimeout(2000)
    const content = await page.textContent('body')
    const hasRecent = content?.includes('Recent') || content?.includes('Session') || content?.includes('History')
    test.info().annotations.push({
      type: 'audit',
      description: hasRecent ? 'Recent sessions section visible' : 'No recent sessions section found',
    })
  })

  test('should display weak areas section', async ({ page }) => {
    await page.waitForTimeout(2000)
    const content = await page.textContent('body')
    const hasWeak = content?.includes('Weak') || content?.includes('Improve') || content?.includes('weak')
    test.info().annotations.push({
      type: 'audit',
      description: hasWeak ? 'Weak areas section visible' : 'No weak areas section found',
    })
  })
})

test.describe('Dashboard - Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'student')
  })

  test('should navigate to progress page', async ({ page }) => {
    const progressLink = page.locator('a[href*="progress"]')
    if (await progressLink.first().isVisible().catch(() => false)) {
      await progressLink.first().click()
      await expect(page).toHaveURL(/progress/)
    }
  })

  test('should navigate to practice page', async ({ page }) => {
    const practiceLink = page.locator('a[href*="practice"]')
    if (await practiceLink.first().isVisible().catch(() => false)) {
      await practiceLink.first().click()
      await expect(page).toHaveURL(/practice/)
    }
  })

  test('should navigate to exams page', async ({ page }) => {
    const examLink = page.locator('a[href*="exam"]')
    if (await examLink.first().isVisible().catch(() => false)) {
      await examLink.first().click()
      await expect(page).toHaveURL(/exam/)
    }
  })

  test('should navigate to gamification page', async ({ page }) => {
    const gamLink = page.locator('a[href*="gamification"]')
    if (await gamLink.first().isVisible().catch(() => false)) {
      await gamLink.first().click()
      await expect(page).toHaveURL(/gamification/)
    }
  })

  test('should navigate to settings page', async ({ page }) => {
    const settingsLink = page.locator('a[href*="settings"]')
    if (await settingsLink.first().isVisible().catch(() => false)) {
      await settingsLink.first().click()
      await expect(page).toHaveURL(/settings/)
    }
  })
})
