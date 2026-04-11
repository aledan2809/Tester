import { test, expect } from '@playwright/test'

const BASE = 'https://tutor.knowbest.ro'

test.describe('Tutor Import Page - UI Verification', () => {

  test('1. Import page loads and shows form', async ({ page }) => {
    await page.goto(`${BASE}/en/dashboard/admin/questions/import`)

    // Take screenshot of whatever we see
    await page.screenshot({ path: 'e2e-report/import-page-initial.png', fullPage: true })

    // Check if we got redirected to login
    const url = page.url()
    console.log('Current URL:', url)

    if (url.includes('/auth/signin')) {
      console.log('REDIRECTED TO LOGIN - need auth')
      // Take screenshot of login page
      await page.screenshot({ path: 'e2e-report/import-page-login-redirect.png', fullPage: true })
    }

    // Log the page title and content
    const title = await page.title()
    console.log('Page title:', title)

    const bodyText = await page.textContent('body')
    console.log('Page content (first 500 chars):', bodyText?.substring(0, 500))
  })

  test('2. Check import form fields (after login)', async ({ page }) => {
    // Go to login page first
    await page.goto(`${BASE}/en/auth/signin`)
    await page.screenshot({ path: 'e2e-report/login-page.png', fullPage: true })

    // Try credentials login
    const emailInput = page.locator('input[type="email"], input[name="email"]')
    const passwordInput = page.locator('input[type="password"], input[name="password"]')

    if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await emailInput.fill('alexdanciulescu@gmail.com')
      await passwordInput.fill('admin123') // placeholder - will fail but shows form

      const submitBtn = page.locator('button[type="submit"]')
      if (await submitBtn.isVisible()) {
        await submitBtn.click()
        await page.waitForTimeout(3000)
      }
    }

    await page.screenshot({ path: 'e2e-report/after-login-attempt.png', fullPage: true })
    console.log('URL after login attempt:', page.url())

    // Try to navigate to import page
    await page.goto(`${BASE}/en/dashboard/admin/questions/import`)
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'e2e-report/import-page-after-auth.png', fullPage: true })

    const currentUrl = page.url()
    console.log('Import page URL:', currentUrl)

    // Check what's on the page
    const bodyText = await page.textContent('body')
    console.log('Import page content:', bodyText?.substring(0, 1000))

    // Check for Subject field
    const subjectInput = page.locator('input[placeholder*="Subject"], input[placeholder*="Aviation Safety"], input[placeholder*="optional"]')
    const subjectCount = await subjectInput.count()
    console.log('Subject inputs found:', subjectCount)

    if (subjectCount > 0) {
      const placeholder = await subjectInput.first().getAttribute('placeholder')
      const required = await subjectInput.first().getAttribute('required')
      console.log('Subject placeholder:', placeholder)
      console.log('Subject required attr:', required)
    }

    // Check for Topic field
    const topicInput = page.locator('input[placeholder*="Topic"], input[placeholder*="Emergency"], input[placeholder*="optional"]')
    const topicCount = await topicInput.count()
    console.log('Topic inputs found:', topicCount)

    // Check for file input
    const fileInput = page.locator('input[type="file"]')
    const fileCount = await fileInput.count()
    console.log('File inputs found:', fileCount)

    if (fileCount > 0) {
      const accept = await fileInput.first().getAttribute('accept')
      console.log('File accept attribute:', accept)

      // Check if .jfif is in accept list
      const hasJfif = accept?.includes('.jfif')
      console.log('JFIF supported:', hasJfif)
    }

    // Check all labels
    const labels = page.locator('label')
    const labelCount = await labels.count()
    for (let i = 0; i < labelCount; i++) {
      const labelText = await labels.nth(i).textContent()
      console.log(`Label ${i}:`, labelText?.trim())
    }

    // Check for "required" text anywhere
    const hasRequiredText = bodyText?.includes('required')
    console.log('Page contains word "required":', hasRequiredText)

    // Check for any error messages
    const errors = page.locator('[class*="red"], [class*="error"]')
    const errorCount = await errors.count()
    console.log('Error elements found:', errorCount)
  })

  test('3. Try submit with empty subject/topic', async ({ page }) => {
    await page.goto(`${BASE}/en/auth/signin`)

    const emailInput = page.locator('input[type="email"], input[name="email"]')
    if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await emailInput.fill('alexdanciulescu@gmail.com')
      const passwordInput = page.locator('input[type="password"], input[name="password"]')
      await passwordInput.fill('admin123')
      await page.locator('button[type="submit"]').click()
      await page.waitForTimeout(3000)
    }

    await page.goto(`${BASE}/en/dashboard/admin/questions/import`)
    await page.waitForTimeout(3000)

    // Try to submit without filling subject/topic
    const submitBtn = page.locator('button[type="submit"]')
    if (await submitBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click submit
      await submitBtn.click()
      await page.waitForTimeout(2000)
      await page.screenshot({ path: 'e2e-report/submit-empty-fields.png', fullPage: true })

      const bodyText = await page.textContent('body')
      console.log('After submit with empty fields:', bodyText?.substring(0, 500))
    } else {
      console.log('Submit button not found - may not be on import page')
      await page.screenshot({ path: 'e2e-report/no-submit-btn.png', fullPage: true })
    }
  })
})
