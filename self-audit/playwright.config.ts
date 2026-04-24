import { defineConfig } from '@playwright/test'

/**
 * Self-audit Playwright config.
 * Targets the live deployment at tester.techbiz.ae.
 * Uses TESTER_API_SECRET from .env for Bearer auth.
 */
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  retries: 1,
  workers: 1,
  reporter: [
    ['html', { outputFolder: '../self-audit-report', open: 'never' }],
    ['json', { outputFile: '../self-audit-report/results.json' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.SELF_AUDIT_URL || 'https://tester.techbiz.ae',
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },
  projects: [
    {
      name: 'self-audit',
      testDir: '.',
    },
  ],
})
