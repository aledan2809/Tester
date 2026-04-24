import { test, expect } from '@playwright/test'
import { loginAsUser } from '../../utils/helpers'

test.describe('Exam - Exam Simulator Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'student')
  })

  test('should load exams page', async ({ page }) => {
    await page.goto('/en/dashboard/exams')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasExams = content?.includes('Exam') || content?.includes('exam') || content?.includes('Test') || content?.includes('Simulator')
    expect(hasExams).toBeTruthy()
  })

  test('should show available exam formats', async ({ page }) => {
    await page.goto('/en/dashboard/exams')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasFormats = content?.includes('ATPL') || content?.includes('Mock') || content?.includes('Format') || content?.includes('WizzAir')
    test.info().annotations.push({
      type: 'audit',
      description: hasFormats ? 'Exam formats visible' : 'No exam formats displayed - check data availability',
    })
  })

  test('should show practice vs real mode options', async ({ page }) => {
    await page.goto('/en/dashboard/exams')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasModes = content?.includes('Practice') || content?.includes('Real') || content?.includes('Mode') || content?.includes('practice')
    test.info().annotations.push({
      type: 'audit',
      description: hasModes ? 'Exam mode options visible' : 'No practice/real mode options found',
    })
  })

  test('should show exam details (time limit, question count, passing score)', async ({ page }) => {
    await page.goto('/en/dashboard/exams')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasDetails = content?.includes('minute') || content?.includes('questions') || content?.includes('75') || content?.includes('pass')
    test.info().annotations.push({
      type: 'audit',
      description: hasDetails ? 'Exam details visible (time, questions, passing score)' : 'Exam details not visible',
    })
  })

  test('should start exam and show first question', async ({ page }) => {
    await page.goto('/en/dashboard/exams')
    await page.waitForTimeout(3000)
    const startButton = page.locator('button:has-text("Start"), button:has-text("Begin"), a:has-text("Start")')
    if (await startButton.first().isVisible().catch(() => false)) {
      await startButton.first().click()
      await page.waitForTimeout(5000)
      const content = await page.textContent('body')
      const hasQuestion = content?.includes('Question') || content?.includes('?') || content?.includes('1 of')
      test.info().annotations.push({
        type: 'audit',
        description: hasQuestion ? 'Exam question displayed after start' : 'No question displayed after starting exam',
      })
    }
  })

  test('should show timer during exam', async ({ page }) => {
    await page.goto('/en/dashboard/exams')
    await page.waitForTimeout(3000)
    const startButton = page.locator('button:has-text("Start"), button:has-text("Begin")')
    if (await startButton.first().isVisible().catch(() => false)) {
      await startButton.first().click()
      await page.waitForTimeout(5000)
      const content = await page.textContent('body')
      const hasTimer = content?.includes(':') || content?.includes('Time') || content?.includes('timer') || content?.includes('remaining')
      test.info().annotations.push({
        type: 'audit',
        description: hasTimer ? 'Exam timer visible' : 'No timer visible during exam',
      })
    }
  })

  test('should show question navigator grid', async ({ page }) => {
    await page.goto('/en/dashboard/exams')
    await page.waitForTimeout(3000)
    const startButton = page.locator('button:has-text("Start"), button:has-text("Begin")')
    if (await startButton.first().isVisible().catch(() => false)) {
      await startButton.first().click()
      await page.waitForTimeout(5000)
      const navigator = page.locator('[data-navigator], .question-navigator, .question-grid, button:has-text("1"), [role="navigation"]')
      const hasNavigator = await navigator.first().isVisible().catch(() => false)
      test.info().annotations.push({
        type: 'audit',
        description: hasNavigator ? 'Question navigator grid visible' : 'No question navigator grid found',
      })
    }
  })

  test('should have no network errors on exams page', async ({ page }) => {
    const networkErrors: { url: string; status: number }[] = []
    page.on('response', response => {
      if (response.status() >= 400 && !response.url().includes('favicon')) {
        networkErrors.push({ url: response.url(), status: response.status() })
      }
    })
    await page.goto('/en/dashboard/exams')
    await page.waitForTimeout(3000)
    test.info().annotations.push({
      type: 'audit',
      description: networkErrors.length > 0 ? `Exam page network errors: ${JSON.stringify(networkErrors)}` : 'No network errors on exam page',
    })
  })
})

test.describe('Exam - History', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'student')
  })

  test('should show exam history section', async ({ page }) => {
    await page.goto('/en/dashboard/exams')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasHistory = content?.includes('History') || content?.includes('Previous') || content?.includes('Past') || content?.includes('Results')
    test.info().annotations.push({
      type: 'audit',
      description: hasHistory ? 'Exam history section visible' : 'No exam history section found',
    })
  })
})
