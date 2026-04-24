import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: '../tutor-audit-report', open: 'never' }],
    ['json', { outputFile: '../tutor-audit-report/results.json' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.TUTOR_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  projects: [
    {
      name: 'public-pages',
      testDir: './tests',
      testMatch: ['auth/**', 'ui/**', 'security/**', 'i18n/**'],
    },
    {
      name: 'authenticated-flows',
      testDir: './tests',
      testMatch: ['dashboard/**', 'practice/**', 'assessment/**', 'exam/**', 'progress/**', 'lessons/**', 'gamification/**', 'calendar/**', 'domain/**', 'notifications/**'],
    },
    {
      name: 'instructor-watcher-flows',
      testDir: './tests',
      testMatch: ['instructor/**', 'watcher/**'],
    },
    {
      name: 'admin-flows',
      testDir: './tests',
      testMatch: ['admin/**'],
    },
    {
      name: 'api-tests',
      testDir: './tests',
      testMatch: ['api/**'],
    },
  ],
})
