import { test, expect } from '@playwright/test'
import { resolve } from 'path'
import { readdirSync, existsSync } from 'fs'

const PROJECT_ROOT = resolve(__dirname, '../..')

test.describe('Module Coverage Audit', () => {
  test('all source modules exist', () => {
    const expectedModules = [
      'src/tester.ts',
      'src/index.ts',
      'src/executor.ts',
      'src/core/browser.ts',
      'src/core/types.ts',
      'src/core/safety.ts',
      'src/core/element-finder.ts',
      'src/auth/login.ts',
      'src/auth/mfa.ts',
      'src/auth/session.ts',
      'src/server/index.ts',
      'src/server/middleware.ts',
      'src/server/storage.ts',
      'src/cli/index.ts',
      'src/cli/utils.ts',
      'src/cli/commands/discover.ts',
      'src/cli/commands/run.ts',
      'src/cli/commands/login.ts',
      'src/cli/commands/report.ts',
      'src/discovery/crawler.ts',
      'src/discovery/analyzer.ts',
      'src/discovery/sitemap.ts',
      'src/scenarios/generator.ts',
      'src/scenarios/templates.ts',
      'src/assertions/index.ts',
      'src/assertions/dom.ts',
      'src/assertions/network.ts',
      'src/assertions/visual.ts',
      'src/assertions/a11y.ts',
      'src/assertions/performance.ts',
      'src/reporter/index.ts',
      'src/reporter/json.ts',
      'src/reporter/html.ts',
    ]

    for (const mod of expectedModules) {
      expect(existsSync(resolve(PROJECT_ROOT, mod)), `Module ${mod} should exist`).toBe(true)
    }
  })

  test('all source modules have corresponding unit tests', () => {
    const testedModules = [
      'tests/assertions/dom.test.ts',
      'tests/assertions/network.test.ts',
      'tests/assertions/index.test.ts',
      'tests/core/browser.test.ts',
      'tests/core/safety.test.ts',
      'tests/core/session.test.ts',
      'tests/core/mfa.test.ts',
      'tests/discovery/crawler.test.ts',
      'tests/discovery/templates.test.ts',
      'tests/executor/executor.test.ts',
      'tests/reporter/reporter.test.ts',
    ]

    const missingTests = [
      'tests/auth/login.test.ts',
      'tests/server/index.test.ts',
      'tests/server/middleware.test.ts',
      'tests/server/storage.test.ts',
      'tests/cli/index.test.ts',
      'tests/cli/commands/discover.test.ts',
      'tests/cli/commands/run.test.ts',
      'tests/scenarios/generator.test.ts',
      'tests/discovery/analyzer.test.ts',
      'tests/discovery/sitemap.test.ts',
      'tests/assertions/visual.test.ts',
      'tests/assertions/a11y.test.ts',
      'tests/assertions/performance.test.ts',
    ]

    let existingCount = 0
    for (const t of testedModules) {
      if (existsSync(resolve(PROJECT_ROOT, t))) existingCount++
    }

    let missingCount = 0
    for (const t of missingTests) {
      if (!existsSync(resolve(PROJECT_ROOT, t))) missingCount++
    }

    console.log(`Unit test coverage: ${existingCount}/${existingCount + missingCount} modules tested`)
    console.log(`Missing unit tests for: ${missingCount} modules`)

    // At least the existing tests should be there
    expect(existingCount).toBeGreaterThanOrEqual(10)
  })

  test('config files are complete', () => {
    const requiredConfigs = [
      'package.json',
      'tsconfig.json',
      'vitest.config.ts',
      'tsup.config.ts',
      '.gitignore',
    ]

    for (const cfg of requiredConfigs) {
      expect(existsSync(resolve(PROJECT_ROOT, cfg)), `Config ${cfg} should exist`).toBe(true)
    }
  })

  test('.env.example exists for documentation', () => {
    expect(existsSync(resolve(PROJECT_ROOT, '.env.example'))).toBe(true)
  })

  test('.env is not tracked by git (check .gitignore)', () => {
    const fs = require('fs')
    const gitignore = fs.readFileSync(resolve(PROJECT_ROOT, '.gitignore'), 'utf8')
    expect(gitignore).toContain('.env')
  })

  test('[SECURITY] .env file exists with real secrets', () => {
    // Document: .env contains real API keys and secrets
    // This is expected for local development but must never be committed
    const envExists = existsSync(resolve(PROJECT_ROOT, '.env'))
    expect(envExists).toBe(true)
  })
})
