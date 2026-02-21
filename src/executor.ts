/**
 * Test Executor
 * Runs test scenarios against a live browser, captures results.
 */

import type {
  TestScenario,
  ScenarioResult,
  StepResult,
  AssertionResult,
  TestRun,
  TestSummary,
  TestCategory,
  SiteMap,
  TesterConfig,
  ConsoleError,
  NetworkError,
} from './core/types'
import type { BrowserCore } from './core/browser'
import { runAssertion } from './assertions/index'
import { runA11yScan, type A11yViolationSummary } from './assertions/a11y'
import { capturePerformanceMetrics } from './assertions/performance'
import { createTimeoutGuard } from './core/safety'

/**
 * Execute all scenarios and produce a TestRun result.
 */
export async function executeScenarios(
  browser: BrowserCore,
  scenarios: TestScenario[],
  siteMap: SiteMap,
  config: TesterConfig,
): Promise<TestRun> {
  const startedAt = new Date()
  const results: ScenarioResult[] = []

  // Aggregate a11y + performance across pages
  let totalA11y: A11yViolationSummary = { critical: 0, serious: 0, moderate: 0, minor: 0, violations: [] }

  for (const scenario of scenarios) {
    const result = await executeScenario(browser, scenario, config)
    results.push(result)
  }

  // Run page-level a11y + perf if features enabled
  const page = browser.getPage()
  if (page && config.accessibility !== false) {
    try {
      totalA11y = await runA11yScan(page)
    } catch {}
  }

  const completedAt = new Date()
  const summary = buildSummary(results, siteMap, totalA11y)

  return {
    id: `run-${Date.now()}`,
    url: siteMap.baseUrl,
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    config,
    siteMap,
    scenarios: results,
    summary,
  }
}

/**
 * Execute a single scenario.
 */
async function executeScenario(
  browser: BrowserCore,
  scenario: TestScenario,
  config: TesterConfig,
): Promise<ScenarioResult> {
  const startTime = Date.now()
  const stepResults: StepResult[] = []
  const assertionResults: AssertionResult[] = []
  const screenshots: { label: string; data: string }[] = []

  // Timeout guard for the whole scenario
  const guard = createTimeoutGuard(300_000) // 5 min per scenario

  try {
    // Clear errors before scenario
    browser.clearErrors()

    // Take before screenshot
    let beforeScreenshot: string | undefined
    try { beforeScreenshot = await browser.screenshot() } catch {}

    // Execute steps
    for (let i = 0; i < scenario.steps.length; i++) {
      if (guard.signal.aborted) {
        stepResults.push({
          stepIndex: i,
          action: scenario.steps[i].action,
          description: scenario.steps[i].description,
          success: false,
          error: 'Scenario timeout exceeded',
          durationMs: 0,
        })
        break
      }

      const result = await browser.executeStep(scenario.steps[i], i)
      stepResults.push(result)

      // Capture screenshot on failure
      if (!result.success && result.screenshot) {
        screenshots.push({ label: `Step ${i} failed`, data: result.screenshot })
      }

      // Stop on non-optional failure
      if (!result.success && !scenario.steps[i].optional) {
        break
      }
    }

    // Take after screenshot
    let afterScreenshot: string | undefined
    try { afterScreenshot = await browser.screenshot() } catch {}

    if (afterScreenshot) {
      screenshots.push({ label: 'After all steps', data: afterScreenshot })
    }

    // Run assertions
    const page = browser.getPage()
    if (page) {
      for (const assertion of scenario.assertions) {
        const result = await runAssertion(page, assertion, {
          consoleErrors: browser.consoleErrors,
          networkErrors: browser.networkErrors,
          beforeScreenshot,
          afterScreenshot,
        })
        assertionResults.push(result)
      }
    }

    // Determine status
    const allStepsPassed = stepResults.every(r => r.success || scenario.steps[r.stepIndex]?.optional)
    const allAssertionsPassed = assertionResults.every(r => r.passed)
    const status = allStepsPassed && allAssertionsPassed ? 'passed' : 'failed'

    return {
      scenario,
      status,
      steps: stepResults,
      assertions: assertionResults,
      durationMs: Date.now() - startTime,
      screenshots,
    }
  } catch (err) {
    return {
      scenario,
      status: 'error',
      steps: stepResults,
      assertions: assertionResults,
      durationMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
      screenshots,
    }
  } finally {
    guard.clear()
  }
}

/**
 * Build summary from results.
 */
function buildSummary(
  results: ScenarioResult[],
  siteMap: SiteMap,
  a11y: A11yViolationSummary,
): TestSummary {
  const passed = results.filter(r => r.status === 'passed').length
  const failed = results.filter(r => r.status === 'failed').length
  const skipped = results.filter(r => r.status === 'skipped').length
  const errors = results.filter(r => r.status === 'error').length

  // By category
  const categories: TestCategory[] = ['auth', 'navigation', 'forms', 'functionality', 'error_handling', 'visual', 'a11y', 'performance']
  const byCategory = {} as Record<TestCategory, { passed: number; failed: number }>
  for (const cat of categories) {
    const catResults = results.filter(r => r.scenario.category === cat)
    byCategory[cat] = {
      passed: catResults.filter(r => r.status === 'passed').length,
      failed: catResults.filter(r => r.status !== 'passed').length,
    }
  }

  // Console + network errors from siteMap
  const consoleErrors: ConsoleError[] = siteMap.pages.flatMap(p => p.consoleErrors)
  const networkErrors: NetworkError[] = siteMap.pages.flatMap(p => p.networkErrors)
  const brokenLinks = siteMap.pages
    .filter(p => p.statusCode >= 400)
    .map(p => ({ url: p.url, linkedFrom: siteMap.baseUrl, statusCode: p.statusCode }))

  // Performance
  const loadTimes = siteMap.pages.filter(p => p.loadTimeMs > 0).map(p => p.loadTimeMs)
  const avgLoadTimeMs = loadTimes.length > 0 ? loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length : 0
  const slowestPages = [...siteMap.pages]
    .sort((a, b) => b.loadTimeMs - a.loadTimeMs)
    .slice(0, 5)
    .map(p => ({ url: p.url, loadTimeMs: p.loadTimeMs }))

  // Score: 100 - penalties
  let score = 100
  score -= failed * 5
  score -= errors * 10
  score -= (a11y.critical * 10 + a11y.serious * 5 + a11y.moderate * 2 + a11y.minor * 1)
  score -= brokenLinks.length * 3
  score -= consoleErrors.filter(e => e.level === 'error').length * 2
  score = Math.max(0, Math.min(100, Math.round(score)))

  return {
    totalScenarios: results.length,
    passed,
    failed,
    skipped,
    errors,
    byCategory,
    visualRegressions: 0, // Updated if visual tests run
    a11yViolations: a11y,
    avgLoadTimeMs: Math.round(avgLoadTimeMs),
    slowestPages,
    consoleErrors,
    networkErrors,
    brokenLinks,
    overallScore: score,
  }
}
