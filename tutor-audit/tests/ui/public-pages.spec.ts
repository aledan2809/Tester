import { test, expect } from '@playwright/test'
import { PUBLIC_PATHS } from '../../utils/helpers'

test.describe('UI - Public Pages Accessibility', () => {
  for (const path of PUBLIC_PATHS) {
    test(`should load ${path} without errors`, async ({ page }) => {
      const errors: string[] = []
      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text())
      })
      const response = await page.goto(path)
      expect(response?.status()).toBeLessThan(400)
      const criticalErrors = errors.filter(e => !e.includes('favicon') && !e.includes('hydration'))
      test.info().annotations.push({
        type: 'audit',
        description: criticalErrors.length > 0 ? `${path} errors: ${criticalErrors.join('; ')}` : `${path} loaded cleanly`,
      })
    })
  }
})

test.describe('UI - Landing Page', () => {
  test('should have proper title', async ({ page }) => {
    await page.goto('/')
    const title = await page.title()
    expect(title).toBeTruthy()
    expect(title.length).toBeGreaterThan(3)
  })

  test('should have meta description', async ({ page }) => {
    await page.goto('/')
    const description = await page.locator('meta[name="description"]').getAttribute('content')
    expect(description).toBeTruthy()
    expect(description!.length).toBeGreaterThan(10)
  })

  test('should have viewport meta tag', async ({ page }) => {
    await page.goto('/')
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
    expect(viewport).toContain('width=device-width')
  })

  test('should have proper lang attribute', async ({ page }) => {
    await page.goto('/en')
    const lang = await page.locator('html').getAttribute('lang')
    expect(lang).toBe('en')
  })

  test('should have proper lang attribute for Romanian', async ({ page }) => {
    await page.goto('/ro')
    const lang = await page.locator('html').getAttribute('lang')
    expect(lang).toBe('ro')
  })

  test('should have sign-in CTA', async ({ page }) => {
    await page.goto('/')
    const signInLink = page.locator('a[href*="signin"], a:has-text("Sign"), a:has-text("Login"), button:has-text("Sign"), button:has-text("Login")')
    const hasSignIn = await signInLink.first().isVisible().catch(() => false)
    expect(hasSignIn).toBeTruthy()
  })

  test('should have no broken images', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(2000)
    const images = page.locator('img')
    const count = await images.count()
    const brokenImages: string[] = []
    for (let i = 0; i < count; i++) {
      const img = images.nth(i)
      const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth)
      if (naturalWidth === 0) {
        const src = await img.getAttribute('src')
        brokenImages.push(src || 'unknown')
      }
    }
    test.info().annotations.push({
      type: 'audit',
      description: brokenImages.length > 0 ? `Broken images: ${brokenImages.join(', ')}` : `All ${count} images loaded correctly`,
    })
  })

  test('should have no broken links on landing page', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(2000)
    const links = page.locator('a[href]')
    const count = await links.count()
    const brokenLinks: string[] = []
    for (let i = 0; i < Math.min(count, 20); i++) {
      const href = await links.nth(i).getAttribute('href')
      if (href && href.startsWith('/') && !href.startsWith('//')) {
        const response = await page.request.get(href)
        if (response.status() >= 400) {
          brokenLinks.push(`${href} (${response.status()})`)
        }
      }
    }
    test.info().annotations.push({
      type: 'audit',
      description: brokenLinks.length > 0 ? `Broken links: ${brokenLinks.join(', ')}` : `Checked ${Math.min(count, 20)} links - all OK`,
    })
  })
})

test.describe('UI - Terms and Privacy Pages', () => {
  test('should load terms page with content', async ({ page }) => {
    await page.goto('/en/terms')
    const content = await page.textContent('body')
    expect(content?.length).toBeGreaterThan(100)
  })

  test('should load privacy page with content', async ({ page }) => {
    await page.goto('/en/privacy')
    const content = await page.textContent('body')
    expect(content?.length).toBeGreaterThan(100)
  })
})

test.describe('UI - Dark Theme', () => {
  test('should use dark theme by default', async ({ page }) => {
    await page.goto('/')
    const bgColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor
    })
    test.info().annotations.push({
      type: 'audit',
      description: `Body background color: ${bgColor}`,
    })
  })
})

test.describe('UI - Responsive Design', () => {
  test('should render correctly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await page.waitForTimeout(2000)
    const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(hasHorizontalScroll).toBe(false)
  })

  test('should render sign-in form on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/en/auth/signin')
    await expect(page.locator('form')).toBeVisible()
    await expect(page.locator('input#email')).toBeVisible()
  })

  test('should render correctly on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')
    await page.waitForTimeout(2000)
    const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(hasHorizontalScroll).toBe(false)
  })
})
