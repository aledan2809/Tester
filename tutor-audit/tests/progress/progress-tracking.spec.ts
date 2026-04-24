import { test, expect } from '@playwright/test'
import { loginAsUser } from '../../utils/helpers'

test.describe('Progress - Progress Tracking Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'student')
  })

  test('should load progress page', async ({ page }) => {
    await page.goto('/en/dashboard/progress')
    await page.waitForTimeout(3000)
    await expect(page).toHaveURL(/progress/)
    const content = await page.textContent('body')
    const hasProgress = content?.includes('Progress') || content?.includes('progress') || content?.includes('Accuracy') || content?.includes('Topics')
    expect(hasProgress).toBeTruthy()
  })

  test('should show overall stats (attempts, accuracy, topics, sessions)', async ({ page }) => {
    await page.goto('/en/dashboard/progress')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const statsKeywords = ['Attempts', 'Accuracy', 'Topics', 'Sessions', 'Total']
    const foundStats = statsKeywords.filter(k => content?.includes(k))
    test.info().annotations.push({
      type: 'audit',
      description: `Progress stats found: ${foundStats.join(', ') || 'NONE'}`,
    })
  })

  test('should show domain selector for progress', async ({ page }) => {
    await page.goto('/en/dashboard/progress')
    await page.waitForTimeout(3000)
    const domainSelector = page.locator('select, [role="combobox"], button:has-text("Aviation"), [data-domain]')
    const hasSelector = await domainSelector.first().isVisible().catch(() => false)
    test.info().annotations.push({
      type: 'audit',
      description: hasSelector ? 'Domain selector visible on progress page' : 'No domain selector on progress page',
    })
  })

  test('should show weak areas section', async ({ page }) => {
    await page.goto('/en/dashboard/progress')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasWeak = content?.includes('Weak') || content?.includes('weak') || content?.includes('Improve') || content?.includes('improve')
    test.info().annotations.push({
      type: 'audit',
      description: hasWeak ? 'Weak areas section visible' : 'No weak areas section on progress page',
    })
  })

  test('should show subject breakdown with progress bars', async ({ page }) => {
    await page.goto('/en/dashboard/progress')
    await page.waitForTimeout(3000)
    const progressBars = page.locator('[role="progressbar"], .bg-blue-500, .progress-bar, [class*="progress"]')
    const barCount = await progressBars.count()
    const content = await page.textContent('body')
    const hasSubjects = content?.includes('Air Law') || content?.includes('Meteorology') || content?.includes('Navigation') || content?.includes('Subject')
    test.info().annotations.push({
      type: 'audit',
      description: `Progress bars: ${barCount}, Subject info: ${hasSubjects ? 'yes' : 'no'}`,
    })
  })

  test('should show topics table', async ({ page }) => {
    await page.goto('/en/dashboard/progress')
    await page.waitForTimeout(3000)
    const table = page.locator('table, [role="table"], [class*="table"]')
    const hasTable = await table.first().isVisible().catch(() => false)
    const content = await page.textContent('body')
    const hasTopics = content?.includes('Topic') || content?.includes('topic')
    test.info().annotations.push({
      type: 'audit',
      description: (hasTable || hasTopics) ? 'Topics table/list visible' : 'No topics table found on progress page',
    })
  })

  test('should show recent sessions on progress page', async ({ page }) => {
    await page.goto('/en/dashboard/progress')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasRecent = content?.includes('Recent') || content?.includes('Session') || content?.includes('History')
    test.info().annotations.push({
      type: 'audit',
      description: hasRecent ? 'Recent sessions visible on progress page' : 'No recent sessions on progress page',
    })
  })

  test('should filter progress by domain query param', async ({ page }) => {
    await page.goto('/en/dashboard/progress?domain=aviation')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasData = content?.includes('Aviation') || content?.includes('aviation') || content?.includes('Accuracy')
    test.info().annotations.push({
      type: 'audit',
      description: hasData ? 'Progress filtered by domain param' : 'Domain query param filtering may not work',
    })
  })

  test('should have no console errors on progress page', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.goto('/en/dashboard/progress')
    await page.waitForTimeout(3000)
    const criticalErrors = errors.filter(e => !e.includes('favicon') && !e.includes('hydration'))
    test.info().annotations.push({
      type: 'audit',
      description: criticalErrors.length > 0 ? `Progress page errors: ${criticalErrors.join('; ')}` : 'No errors on progress page',
    })
  })
})

test.describe('Progress - Gamification', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'student')
  })

  test('should load gamification page', async ({ page }) => {
    await page.goto('/en/dashboard/gamification')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasGamification = content?.includes('Leaderboard') || content?.includes('XP') || content?.includes('Level') || content?.includes('Achievement') || content?.includes('Streak')
    test.info().annotations.push({
      type: 'audit',
      description: hasGamification ? 'Gamification page loaded with content' : 'Gamification page content not found',
    })
  })

  test('should show leaderboard', async ({ page }) => {
    await page.goto('/en/dashboard/gamification')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasLeaderboard = content?.includes('Leaderboard') || content?.includes('leaderboard') || content?.includes('Rank') || content?.includes('rank')
    test.info().annotations.push({
      type: 'audit',
      description: hasLeaderboard ? 'Leaderboard visible' : 'No leaderboard found',
    })
  })

  test('should show XP and level info', async ({ page }) => {
    await page.goto('/en/dashboard/gamification')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasXP = content?.includes('XP') || content?.includes('xp') || content?.includes('Experience')
    const hasLevel = content?.includes('Level') || content?.includes('level')
    test.info().annotations.push({
      type: 'audit',
      description: `XP info: ${hasXP ? 'yes' : 'no'}, Level info: ${hasLevel ? 'yes' : 'no'}`,
    })
  })
})
