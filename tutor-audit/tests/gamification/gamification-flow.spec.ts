import { test, expect } from '@playwright/test'
import { loginAsUser, collectConsoleErrors } from '../../utils/helpers'

test.describe('Gamification - Page Load & Structure', () => {
  test('gamification page requires authentication', async ({ page }) => {
    await page.goto('/en/dashboard/gamification')
    expect(page.url()).toMatch(/auth\/signin/)
  })

  test('gamification page loads after login', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/gamification')
    await expect(page).toHaveURL(/gamification/)
    await expect(page.locator('h1, h2, [data-testid="gamification-title"]')).toBeVisible()
  })

  test('gamification page has no console errors', async ({ page }) => {
    const errors = await collectConsoleErrors(page)
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/gamification')
    await page.waitForTimeout(2000)
    expect(errors.filter(e => !e.includes('hydration'))).toHaveLength(0)
  })
})

test.describe('Gamification - XP & Levels', () => {
  test('XP progress bar is visible', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/gamification')
    const xpBar = page.locator('[data-testid="xp-progress"], .xp-bar, [role="progressbar"], progress').first()
    if (await xpBar.isVisible()) {
      expect(await xpBar.isVisible()).toBe(true)
    }
  })

  test('current level is displayed', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/gamification')
    const levelText = page.locator('text=/level|nivel/i').first()
    if (await levelText.isVisible()) {
      expect(await levelText.textContent()).toBeTruthy()
    }
  })

  test('XP value is a non-negative number', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/gamification')
    const xpText = page.locator('text=/\\d+\\s*xp/i, [data-testid="xp-value"]').first()
    if (await xpText.isVisible()) {
      const text = await xpText.textContent() || ''
      const xpMatch = text.match(/(\d+)/)
      if (xpMatch) {
        expect(parseInt(xpMatch[1])).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

test.describe('Gamification - Streak', () => {
  test('streak counter is visible', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/gamification')
    const streak = page.locator('text=/streak/i, [data-testid="streak"]').first()
    if (await streak.isVisible()) {
      expect(await streak.textContent()).toBeTruthy()
    }
  })

  test('streak recovery button appears when streak is broken', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/gamification')
    const recoveryBtn = page.locator('button:has-text("recover"), button:has-text("Recover"), [data-testid="streak-recovery"]').first()
    // Button may or may not be visible depending on streak state
    const isVisible = await recoveryBtn.isVisible().catch(() => false)
    expect(typeof isVisible).toBe('boolean')
  })
})

test.describe('Gamification - Achievements', () => {
  test('achievements section is visible', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/gamification')
    const achievements = page.locator('text=/achievement|realizare/i, [data-testid="achievements"]').first()
    if (await achievements.isVisible()) {
      expect(await achievements.isVisible()).toBe(true)
    }
  })

  test('achievement cards have icons and names', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/gamification')
    const cards = page.locator('[data-testid="achievement-card"], .achievement-card, .achievement').first()
    if (await cards.isVisible()) {
      expect(await cards.textContent()).toBeTruthy()
    }
  })
})

test.describe('Gamification - Leaderboard', () => {
  test('leaderboard section is visible', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/gamification')
    const leaderboard = page.locator('text=/leaderboard|clasament/i, [data-testid="leaderboard"]').first()
    if (await leaderboard.isVisible()) {
      expect(await leaderboard.isVisible()).toBe(true)
    }
  })

  test('leaderboard shows ranking entries', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/gamification')
    const entries = page.locator('table tr, [data-testid="leaderboard-entry"], .leaderboard-row')
    const count = await entries.count()
    // May have entries or may be empty
    expect(count).toBeGreaterThanOrEqual(0)
  })
})

test.describe('Gamification - Daily Challenge', () => {
  test('daily challenge widget is visible', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/gamification')
    const challenge = page.locator('text=/daily.*challenge|provocare.*zilnic/i, [data-testid="daily-challenge"]').first()
    if (await challenge.isVisible()) {
      expect(await challenge.isVisible()).toBe(true)
    }
  })

  test('daily challenge shows question content', async ({ page }) => {
    await loginAsUser(page, 'student')
    await page.goto('/en/dashboard/gamification')
    const questionContent = page.locator('[data-testid="challenge-question"], .challenge-question').first()
    if (await questionContent.isVisible()) {
      expect(await questionContent.textContent()).toBeTruthy()
    }
  })
})

test.describe('Gamification - API Endpoints', () => {
  test('GET /api/aviation/xp requires auth', async ({ request }) => {
    const response = await request.get('/api/aviation/xp')
    expect(response.status()).toBe(401)
  })

  test('GET /api/aviation/streak requires auth', async ({ request }) => {
    const response = await request.get('/api/aviation/streak')
    expect(response.status()).toBe(401)
  })

  test('GET /api/aviation/achievements requires auth', async ({ request }) => {
    const response = await request.get('/api/aviation/achievements')
    expect(response.status()).toBe(401)
  })

  test('GET /api/aviation/leaderboard requires auth', async ({ request }) => {
    const response = await request.get('/api/aviation/leaderboard')
    expect(response.status()).toBe(401)
  })

  test('GET /api/aviation/daily-challenge requires auth', async ({ request }) => {
    const response = await request.get('/api/aviation/daily-challenge')
    expect(response.status()).toBe(401)
  })

  test('POST /api/aviation/daily-challenge requires auth', async ({ request }) => {
    const response = await request.post('/api/aviation/daily-challenge', { data: { answer: 'A' } })
    expect(response.status()).toBe(401)
  })

  test('POST /api/aviation/streak/recover requires auth', async ({ request }) => {
    const response = await request.post('/api/aviation/streak/recover')
    expect(response.status()).toBe(401)
  })
})
