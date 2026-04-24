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

  // F4: Parallel scenario execution in batches (concurrency configurable, default 1 = sequential)
  const concurrency = config.concurrency || 1
  if (concurrency <= 1) {
    // Sequential (original behavior, safest with single browser context)
    for (const scenario of scenarios) {
      const result = await executeScenario(browser, scenario, config)
      results.push(result)
    }
  } else {
    // Batched parallel — scenarios in each batch run concurrently
    for (let i = 0; i < scenarios.length; i += concurrency) {
      const batch = scenarios.slice(i, i + concurrency)
      const batchResults = await Promise.allSettled(
        batch.map(scenario => executeScenario(browser, scenario, config))
      )
      for (const r of batchResults) {
        if (r.status === 'fulfilled') {
          results.push(r.value)
        } else {
          // Rejected scenario — create a failed result
          results.push({
            scenario: batch[batchResults.indexOf(r)],
            status: 'error' as const,
            steps: [],
            assertions: [],
            screenshots: [],
            error: r.reason?.message || String(r.reason),
            durationMs: 0,
          } as unknown as ScenarioResult)
        }
      }
    }
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

  // F5: Video recording — start screencast if videoDir configured
  let screencastSession: { stop: () => Promise<void> } | null = null
  try {
    const page = browser.getPage()
    if (page && config.videoDir) {
      const { mkdirSync } = await import('fs')
      mkdirSync(config.videoDir, { recursive: true })
      const videoPath = `${config.videoDir}/${scenario.id || 'scenario'}_${Date.now()}.webm` as `${string}.webm`
      const recorder = await page.screencast({ path: videoPath })
      screencastSession = recorder
    }
  } catch {}

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

      const stepStartedAt = Date.now()
      let result = await browser.executeStep(scenario.steps[i], i)

      // T-007 — Self-healing retry with exponential backoff + settle extension.
      // Behavior:
      //   - Skipped when step is marked optional OR config.noRetry = true.
      //   - Budget: config.retryBudget (default 2).
      //   - Settle: starts at retryInitialSettleMs (default 1000ms), multiplied
      //     by retryBackoffMultiplier (default 1.5) per retry, capped at
      //     retrySettleCapMs (default 8000ms).
      //   - Stops as soon as a retry succeeds; reports retryCount +
      //     retryFinalVerdict + timeToVerdictMs on the result for downstream
      //     flake analytics.
      if (!result.success && !scenario.steps[i].optional && !config.noRetry) {
        result = await retryStepWithBackoff(
          browser,
          scenario.steps[i],
          i,
          result,
          {
            budget: config.retryBudget ?? 2,
            initialSettleMs: config.retryInitialSettleMs ?? 1000,
            backoffMultiplier: config.retryBackoffMultiplier ?? 1.5,
            settleCapMs: config.retrySettleCapMs ?? 8000,
            startedAt: stepStartedAt,
          },
        )
      }

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
    // F5: Stop video recording
    if (screencastSession) {
      try { await screencastSession.stop() } catch {}
    }
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export interface RetryStepOptions {
  budget: number
  initialSettleMs: number
  backoffMultiplier: number
  settleCapMs: number
  startedAt: number
  /** Injection hook for tests — defaults to real sleep. */
  sleepFn?: (ms: number) => Promise<void>
}

/**
 * T-007 — Self-healing retry with exponential backoff + settle extension.
 * Pure helper (exported for unit testing). Caller guarantees:
 *   - initialResult.success === false
 *   - step is non-optional
 *   - retries are not disabled by config.noRetry
 *
 * On retry success, returns the passing result annotated with retryCount
 * and retryFinalVerdict='passed'. On exhaustion, returns the last failing
 * result annotated with retryFinalVerdict='failed'.
 */
export async function retryStepWithBackoff(
  browser: Pick<BrowserCore, 'executeStep'>,
  step: TestScenario['steps'][number],
  stepIndex: number,
  initialResult: StepResult,
  opts: RetryStepOptions,
): Promise<StepResult> {
  const budget = Math.max(0, opts.budget | 0)
  if (budget === 0) {
    return {
      ...initialResult,
      retryCount: 0,
      retryFinalVerdict: 'none',
      timeToVerdictMs: Date.now() - opts.startedAt,
    }
  }
  const multiplier = opts.backoffMultiplier > 0 ? opts.backoffMultiplier : 1.5
  const capMs = Math.max(0, opts.settleCapMs | 0)
  const sleepFn = opts.sleepFn || sleep
  let settleMs = Math.max(0, opts.initialSettleMs | 0)
  let lastResult = initialResult
  for (let attempt = 1; attempt <= budget; attempt++) {
    await sleepFn(settleMs)
    const retryResult = await browser.executeStep(step, stepIndex)
    if (retryResult.success) {
      return {
        ...retryResult,
        description: `[retried×${attempt}] ${retryResult.description}`,
        retryCount: attempt,
        retryFinalVerdict: 'passed',
        timeToVerdictMs: Date.now() - opts.startedAt,
      }
    }
    lastResult = retryResult
    settleMs = Math.min(Math.round(settleMs * multiplier), capMs)
  }
  return {
    ...lastResult,
    retryCount: budget,
    retryFinalVerdict: 'failed',
    timeToVerdictMs: Date.now() - opts.startedAt,
  }
}
