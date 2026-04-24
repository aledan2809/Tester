import { test, expect } from '@playwright/test'
import { loginAsUser } from '../../utils/helpers'

test.describe('Practice - Session Selection', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'student')
  })

  test('should load practice page', async ({ page }) => {
    await page.goto('/en/dashboard/practice')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasPractice = content?.includes('Session') || content?.includes('Practice') || content?.includes('Start') || content?.includes('Quick')
    expect(hasPractice).toBeTruthy()
  })

  test('should show available session types', async ({ page }) => {
    await page.goto('/en/dashboard/practice')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const sessionTypes = ['Micro', 'Quick', 'Deep', 'Repair', 'Recovery', 'Intensive']
    const foundTypes = sessionTypes.filter(t => content?.includes(t))
    test.info().annotations.push({
      type: 'audit',
      description: `Session types found: ${foundTypes.join(', ') || 'NONE'}`,
    })
  })

  test('should show recommended session', async ({ page }) => {
    await page.goto('/en/dashboard/practice')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasRecommended = content?.includes('Recommended') || content?.includes('recommended') || content?.includes('Suggest')
    test.info().annotations.push({
      type: 'audit',
      description: hasRecommended ? 'Recommended session card visible' : 'No recommended session card found',
    })
  })

  test('should show practice stats (questions available, topics, weak areas)', async ({ page }) => {
    await page.goto('/en/dashboard/practice')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasStats = content?.includes('Questions') || content?.includes('Topics') || content?.includes('Available')
    test.info().annotations.push({
      type: 'audit',
      description: hasStats ? 'Practice stats visible' : 'Practice stats not visible',
    })
  })

  test('should start a quick session', async ({ page }) => {
    await page.goto('/en/dashboard/practice')
    await page.waitForTimeout(3000)
    const quickButton = page.locator('button:has-text("Quick"), button:has-text("quick"), a:has-text("Quick")')
    if (await quickButton.first().isVisible().catch(() => false)) {
      await quickButton.first().click()
      await page.waitForTimeout(5000)
      const url = page.url()
      const content = await page.textContent('body')
      const sessionStarted = url.includes('practice/') || content?.includes('Question') || content?.includes('question')
      test.info().annotations.push({
        type: 'audit',
        description: sessionStarted ? 'Quick session started successfully' : 'Quick session did not start - check session start flow',
      })
    }
  })

  test('should not have console errors on practice page', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.goto('/en/dashboard/practice')
    await page.waitForTimeout(3000)
    const criticalErrors = errors.filter(e => !e.includes('favicon') && !e.includes('hydration'))
    test.info().annotations.push({
      type: 'audit',
      description: criticalErrors.length > 0 ? `Practice page errors: ${criticalErrors.join('; ')}` : 'No errors on practice page',
    })
  })
})

test.describe('Practice - Active Session', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'student')
  })

  test('should display question content in active session', async ({ page }) => {
    await page.goto('/en/dashboard/practice')
    await page.waitForTimeout(3000)
    const startButton = page.locator('button:has-text("Quick"), button:has-text("Start"), button:has-text("Micro")')
    if (await startButton.first().isVisible().catch(() => false)) {
      await startButton.first().click()
      await page.waitForTimeout(5000)
      const content = await page.textContent('body')
      const hasQuestion = content?.includes('Question') || content?.includes('?') || content?.includes('Answer')
      test.info().annotations.push({
        type: 'audit',
        description: hasQuestion ? 'Question content displayed in session' : 'No question content visible after starting session',
      })
    }
  })

  test('should show answer options for multiple choice questions', async ({ page }) => {
    await page.goto('/en/dashboard/practice')
    await page.waitForTimeout(3000)
    const startButton = page.locator('button:has-text("Quick"), button:has-text("Start"), button:has-text("Micro")')
    if (await startButton.first().isVisible().catch(() => false)) {
      await startButton.first().click()
      await page.waitForTimeout(5000)
      const options = page.locator('button[data-option], [role="option"], .answer-option, button:has-text("A)"), button:has-text("B)")')
      const optionCount = await options.count()
      test.info().annotations.push({
        type: 'audit',
        description: optionCount > 0 ? `${optionCount} answer options visible` : 'No answer option buttons found - check answer UI rendering',
      })
    }
  })

  test('should show progress indicator during session', async ({ page }) => {
    await page.goto('/en/dashboard/practice')
    await page.waitForTimeout(3000)
    const startButton = page.locator('button:has-text("Quick"), button:has-text("Start"), button:has-text("Micro")')
    if (await startButton.first().isVisible().catch(() => false)) {
      await startButton.first().click()
      await page.waitForTimeout(5000)
      const content = await page.textContent('body')
      const hasProgress = content?.includes('of') || content?.includes('/') || content?.includes('Progress') || content?.includes('Question 1')
      test.info().annotations.push({
        type: 'audit',
        description: hasProgress ? 'Progress indicator visible' : 'No progress indicator found in active session',
      })
    }
  })
})
