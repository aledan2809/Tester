/**
 * Pro Coach test runner — bypasses CLI to avoid shell escaping issues
 * Runs with coach account then user account
 */
import { AITester } from './dist/index.js'
import { generateReports } from './dist/index.js'
import * as fs from 'fs'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

const COACH_CREDS = {
  username: 'alex.danciulescu@outlook.com',
  password: 'MihDan74!?><',
  loginUrl: 'https://pro.4pro.io/login',
}

const USER_CREDS = {
  username: 'alex.danciulescu@knowbest.ro',
  password: 'MihDan74!?><',
  loginUrl: 'https://pro.4pro.io/login',
}

async function runTest(label, creds, outputDir) {
  console.log(`\n=== ${label} ===`)
  fs.mkdirSync(outputDir, { recursive: true })

  const tester = new AITester({
    headless: true,
    maxPages: 20,
    maxDepth: 2,
    crawlTimeout: 120000,
    anthropicApiKey: ANTHROPIC_KEY,
    credentials: creds,
    visualRegression: false,
    accessibility: true,
    performance: false,
    outputDir,
  })

  await tester.launch()
  console.log('Browser launched')

  const loginResult = await tester.login()
  console.log('Login result:', loginResult)

  if (!loginResult.success) {
    console.error('LOGIN FAILED:', loginResult.error)
    await tester.close()
    return null
  }

  // Start from /dashboard so the crawler finds authenticated pages
  // (/coaches, /dashboard/profile, etc.) not just the public landing page
  console.log('Discovering pages from /dashboard...')
  const siteMap = await tester.discover('https://pro.4pro.io/dashboard')
  console.log(`Discovered ${siteMap.totalPages} pages`)
  console.log('Pages:', siteMap.pages.map(p => p.url).join('\n  '))

  console.log('Generating scenarios...')
  const scenarios = await tester.generateScenarios(siteMap)
  console.log(`Generated ${scenarios.length} scenarios`)

  console.log('Executing scenarios...')
  const results = await tester.execute(scenarios, siteMap)
  console.log(`Results: ${results.summary.passed}/${results.summary.totalScenarios} passed (score: ${results.summary.overallScore})`)

  if (results.summary.failed > 0) {
    console.log('\nFailed scenarios:')
    for (const s of results.scenarios) {
      if (s.status === 'failed' || s.status === 'error') {
        console.log(`  - [${s.status}] ${s.name}: ${s.error || 'no error msg'}`)
        for (const step of s.steps) {
          if (!step.success) console.log(`    step[${step.stepIndex}] ${step.action}: ${step.error}`)
        }
      }
    }
  }

  generateReports(results, { outputDir, formats: ['html', 'json'] })
  console.log(`Reports saved to ${outputDir}`)

  await tester.close()
  return results
}

async function main() {
  if (!ANTHROPIC_KEY) {
    console.error('ANTHROPIC_API_KEY not set')
    process.exit(1)
  }

  const coachResults = await runTest('COACH ACCOUNT', COACH_CREDS, './reports/pro-coach-test')
  const userResults = await runTest('USER ACCOUNT', USER_CREDS, './reports/pro-user-test')

  console.log('\n=== SUMMARY ===')
  if (coachResults) console.log(`Coach: ${coachResults.summary.passed}/${coachResults.summary.totalScenarios} passed`)
  if (userResults) console.log(`User:  ${userResults.summary.passed}/${userResults.summary.totalScenarios} passed`)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
