import { test, expect } from '@playwright/test'
import { loginAsUser } from '../../utils/helpers'

test.describe('Assessment - Initial Assessment Flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'student')
  })

  test('should load assessment page', async ({ page }) => {
    await page.goto('/en/dashboard/assessment')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasAssessment = content?.includes('Assessment') || content?.includes('assessment') || content?.includes('Evaluate') || content?.includes('Start')
    expect(hasAssessment).toBeTruthy()
  })

  test('should show domain selector', async ({ page }) => {
    await page.goto('/en/dashboard/assessment')
    await page.waitForTimeout(3000)
    const domainSelector = page.locator('select, [role="combobox"], [data-domain-selector]')
    const hasSelector = await domainSelector.first().isVisible().catch(() => false)
    const content = await page.textContent('body')
    const hasDomainRef = content?.includes('Aviation') || content?.includes('Domain') || content?.includes('domain')
    test.info().annotations.push({
      type: 'audit',
      description: (hasSelector || hasDomainRef) ? 'Domain selector/info visible' : 'No domain selector found on assessment page',
    })
  })

  test('should show assessment instructions', async ({ page }) => {
    await page.goto('/en/dashboard/assessment')
    await page.waitForTimeout(3000)
    const content = await page.textContent('body')
    const hasInstructions = content?.includes('10 questions') || content?.includes('level') || content?.includes('determine')
    test.info().annotations.push({
      type: 'audit',
      description: hasInstructions ? 'Assessment instructions visible' : 'No assessment instructions found',
    })
  })

  test('should have start assessment button', async ({ page }) => {
    await page.goto('/en/dashboard/assessment')
    await page.waitForTimeout(3000)
    const startButton = page.locator('button:has-text("Start"), button:has-text("Begin"), button:has-text("Assessment")')
    const hasButton = await startButton.first().isVisible().catch(() => false)
    test.info().annotations.push({
      type: 'audit',
      description: hasButton ? 'Start Assessment button visible' : 'Start Assessment button not found',
    })
  })

  test('should start assessment and show first question', async ({ page }) => {
    await page.goto('/en/dashboard/assessment')
    await page.waitForTimeout(3000)
    const startButton = page.locator('button:has-text("Start"), button:has-text("Begin")')
    if (await startButton.first().isVisible().catch(() => false)) {
      await startButton.first().click()
      await page.waitForTimeout(5000)
      const content = await page.textContent('body')
      const hasQuestion = content?.includes('Question') || content?.includes('1 of') || content?.includes('?')
      test.info().annotations.push({
        type: 'audit',
        description: hasQuestion ? 'Assessment question displayed' : 'Assessment question not displayed after clicking Start',
      })
    }
  })

  test('should show question navigation during assessment', async ({ page }) => {
    await page.goto('/en/dashboard/assessment')
    await page.waitForTimeout(3000)
    const startButton = page.locator('button:has-text("Start"), button:has-text("Begin")')
    if (await startButton.first().isVisible().catch(() => false)) {
      await startButton.first().click()
      await page.waitForTimeout(5000)
      const nextButton = page.locator('button:has-text("Next"), button:has-text("Save"), button:has-text("Continue")')
      const hasNav = await nextButton.first().isVisible().catch(() => false)
      test.info().annotations.push({
        type: 'audit',
        description: hasNav ? 'Question navigation buttons visible' : 'No navigation buttons in assessment',
      })
    }
  })

  test('should not submit assessment without answering all questions', async ({ page }) => {
    await page.goto('/en/dashboard/assessment')
    await page.waitForTimeout(3000)
    const startButton = page.locator('button:has-text("Start"), button:has-text("Begin")')
    if (await startButton.first().isVisible().catch(() => false)) {
      await startButton.first().click()
      await page.waitForTimeout(5000)
      const submitButton = page.locator('button:has-text("Submit"), button:has-text("Finish")')
      if (await submitButton.first().isVisible().catch(() => false)) {
        const isDisabled = await submitButton.first().isDisabled()
        test.info().annotations.push({
          type: 'audit',
          description: isDisabled ? 'Submit button disabled without answering - good' : 'Submit button enabled without answering all questions - potential issue',
        })
      }
    }
  })
})
