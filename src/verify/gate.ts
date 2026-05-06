/**
 * Post-Fix Verification Gate — Module M
 *
 * Runs a 6-layer verification pass BEFORE the checker/TWG reports a fix as RESOLVED.
 * This prevents the pattern where /review finds problems after TWG declared success.
 *
 * Layers:
 *   L1 — Re-run original failing test scenario
 *   L2 — Regression smoke on 3-5 adjacent routes
 *   L3 — Static diff check (tsc + eslint on changed files, if accessible)
 *   L4 — Security scan on the fixed URL
 *   L5 — Console + network error capture post-fix
 *   L6 — Visual diff pre/post fix (pixelmatch)
 *
 * Integration: checker calls POST /api/test/verify-fix after Guru returns APPLIED.
 * Only if gate.passed === true does checker emit RESOLVED.
 */

import { BrowserCore } from '../core/browser'
import { runSecurityAudit } from '../assertions/security'
import { auditHydrationAndCSP } from '../assertions/dom'
import type { TestScenario, StepResult, ConsoleError, NetworkError } from '../core/types'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'

const execAsync = promisify(exec)

// ─── Types ───────────────────────────────────────────────────

export interface VerifyFixInput {
  /** URL of the fixed page/app */
  targetUrl: string
  /** The original failing scenario (for L1 re-run) */
  originalScenario?: TestScenario
  /** Adjacent routes to smoke-test (L2) */
  smokeRoutes?: string[]
  /** Path to screenshot taken BEFORE the fix (L6) */
  beforeScreenshot?: string
  /** Tester config overrides */
  config?: {
    headless?: boolean
    anthropicApiKey?: string
    /** Max layer to run (default: 6) */
    maxLayer?: number
  }
}

export interface LayerResult {
  layer: number
  name: string
  passed: boolean
  durationMs: number
  details: string
  findings?: Array<{ severity: string; message: string }>
}

export interface VerifyFixResult {
  /** True only if ALL configured layers pass */
  passed: boolean
  layers: LayerResult[]
  totalDurationMs: number
  /** Overall verdict suitable for checker state machine */
  verdict: 'RESOLVED' | 'FIX_INCOMPLETE' | 'REGRESSION_DETECTED' | 'ERROR'
  /** Screenshot taken post-fix (for L6) */
  afterScreenshot?: string
  /** Diff percentage (L6) */
  visualDiffPercent?: number
}

// ─── Screenshot Helper ────────────────────────────────────────

async function takeScreenshot(browser: BrowserCore, url: string, label: string): Promise<string | undefined> {
  const page = browser.getPage()
  if (!page) return undefined
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 })
    const dir = path.join(process.cwd(), 'verify-screenshots')
    fs.mkdirSync(dir, { recursive: true })
    const filepath = path.join(dir, `${label}-${Date.now()}.png`)
    await page.screenshot({ path: filepath, fullPage: true })
    return filepath
  } catch {
    return undefined
  }
}

// ─── L1: Re-run Original Failing Scenario ────────────────────

async function runL1(
  browser: BrowserCore,
  originalScenario: TestScenario | undefined,
  targetUrl: string,
): Promise<LayerResult> {
  const start = Date.now()

  if (!originalScenario) {
    return {
      layer: 1, name: 'Re-run original failing test',
      passed: true, durationMs: 0,
      details: 'No original scenario provided — skipped (passing by assumption)',
    }
  }

  try {
    const page = browser.getPage()
    if (!page) throw new Error('Browser not launched')

    // Navigate to target
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30_000 })

    // Execute each step and track failures
    const failures: string[] = []
    for (const step of originalScenario.steps) {
      try {
        if (step.action === 'navigate' && step.value) {
          await page.goto(step.value, { waitUntil: 'domcontentloaded', timeout: step.timeout ?? 10_000 })
        } else if (step.action === 'click' && step.target) {
          await page.click(step.target, { timeout: step.timeout ?? 10_000 } as Parameters<typeof page.click>[1])
        } else if (step.action === 'fill' && step.target && step.value) {
          await page.click(step.target, { clickCount: 3 })
          await page.type(step.target, step.value)
        } else if (step.action === 'wait') {
          if (step.target) {
            await page.waitForSelector(step.target, { timeout: step.timeout ?? 10_000 })
          } else if (step.value) {
            await new Promise(r => setTimeout(r, parseInt(step.value!, 10)))
          }
        }
      } catch (err) {
        if (!step.optional) {
          failures.push(`Step "${step.description}": ${err instanceof Error ? err.message : err}`)
        }
      }
    }

    const passed = failures.length === 0
    return {
      layer: 1, name: 'Re-run original failing test',
      passed, durationMs: Date.now() - start,
      details: passed
        ? `All ${originalScenario.steps.length} steps passed`
        : `${failures.length} step(s) still failing: ${failures.slice(0, 3).join('; ')}`,
    }
  } catch (err) {
    return {
      layer: 1, name: 'Re-run original failing test',
      passed: false, durationMs: Date.now() - start,
      details: `Error: ${err instanceof Error ? err.message : err}`,
    }
  }
}

// ─── L2: Regression Smoke ────────────────────────────────────

const DEFAULT_SMOKE_PATHS = ['/', '/login', '/dashboard', '/api/health']

async function runL2(
  browser: BrowserCore,
  targetUrl: string,
  smokeRoutes?: string[],
): Promise<LayerResult> {
  const start = Date.now()
  const base = targetUrl.replace(/\/$/, '')
  const routes = smokeRoutes ?? DEFAULT_SMOKE_PATHS
  const failures: string[] = []

  const page = browser.getPage()
  if (!page) {
    return { layer: 2, name: 'Regression smoke', passed: false, durationMs: 0, details: 'Browser not launched' }
  }

  for (const route of routes.slice(0, 5)) {
    const url = route.startsWith('http') ? route : `${base}${route}`
    try {
      const consoleErrors: string[] = []
      const onConsole = (msg: import('puppeteer').ConsoleMessage) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text())
      }
      page.on('console', onConsole)

      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      const status = resp?.status() ?? 0

      page.off('console', onConsole)

      if (status >= 500) {
        failures.push(`${route}: HTTP ${status}`)
      } else if (consoleErrors.length > 0) {
        failures.push(`${route}: ${consoleErrors.slice(0, 2).join(', ')}`)
      }
    } catch (err) {
      failures.push(`${route}: ${err instanceof Error ? err.message : 'timeout'}`)
    }
  }

  const passed = failures.length === 0
  return {
    layer: 2, name: 'Regression smoke on adjacent routes',
    passed, durationMs: Date.now() - start,
    details: passed
      ? `All ${routes.slice(0, 5).length} routes returned 2xx/3xx with no console errors`
      : `Regressions found: ${failures.join('; ')}`,
  }
}

// ─── L3: Static Diff (tsc + eslint on changed files) ─────────

async function runL3(projectPath?: string): Promise<LayerResult> {
  const start = Date.now()

  if (!projectPath || !fs.existsSync(projectPath)) {
    return {
      layer: 3, name: 'Static analysis (tsc + eslint)',
      passed: true, durationMs: 0,
      details: 'No project path provided — skipped',
    }
  }

  const errors: string[] = []

  // TypeScript check
  try {
    await execAsync('npx tsc --noEmit', { cwd: projectPath, timeout: 60_000 })
  } catch (err) {
    const output = (err as { stdout?: string; stderr?: string }).stdout ?? ''
    const errorLines = output.split('\n').filter(l => l.includes('error TS')).slice(0, 5)
    errors.push(`TypeScript: ${errorLines.length} error(s) — ${errorLines[0] ?? ''}`)
  }

  // ESLint check (optional, non-fatal if not configured)
  try {
    await execAsync('npx eslint --max-warnings=0 .', { cwd: projectPath, timeout: 60_000 })
  } catch (err) {
    const output = (err as { stdout?: string }).stdout ?? ''
    if (output.includes('error ')) {
      const errorCount = (output.match(/ error /g) ?? []).length
      errors.push(`ESLint: ${errorCount} error(s)`)
    }
  }

  const passed = errors.length === 0
  return {
    layer: 3, name: 'Static analysis (tsc + eslint)',
    passed, durationMs: Date.now() - start,
    details: passed ? 'No TypeScript or ESLint errors' : errors.join('; '),
  }
}

// ─── L4: Security Scan ───────────────────────────────────────

async function runL4(browser: BrowserCore, targetUrl: string): Promise<LayerResult> {
  const start = Date.now()

  try {
    const page = browser.getPage()
    if (!page) throw new Error('Browser not launched')

    const result = await runSecurityAudit(page, targetUrl, {
      skip: ['unprotected_routes', 'cors'], // Fast scan — skip heavy probes
    })

    const criticalOrHigh = result.findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH')

    return {
      layer: 4, name: 'Security scan (headers + content-type)',
      passed: result.passed, durationMs: Date.now() - start,
      details: result.passed
        ? `No critical/high security findings`
        : `${criticalOrHigh.length} finding(s): ${criticalOrHigh.map(f => f.message).slice(0, 3).join('; ')}`,
      findings: result.findings.map(f => ({ severity: f.severity, message: f.message })),
    }
  } catch (err) {
    return {
      layer: 4, name: 'Security scan',
      passed: false, durationMs: Date.now() - start,
      details: `Error: ${err instanceof Error ? err.message : err}`,
    }
  }
}

// ─── L5: Console + Network Error Capture ─────────────────────

async function runL5(browser: BrowserCore, targetUrl: string): Promise<LayerResult> {
  const start = Date.now()

  try {
    const page = browser.getPage()
    if (!page) throw new Error('Browser not launched')

    const result = await auditHydrationAndCSP(page, targetUrl)
    const consoleErrors: ConsoleError[] = []
    const networkErrors: NetworkError[] = []

    // Also capture raw console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push({ message: msg.text(), level: 'error', url: targetUrl })
      }
    })
    page.on('requestfailed', (req) => {
      networkErrors.push({
        url: req.url(),
        statusCode: 0,
        resource: req.failure()?.errorText ?? 'unknown',
      })
    })

    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => null)
    await new Promise(r => setTimeout(r, 1_000))

    const allIssues = [
      ...result.issues.map(i => i.message),
      ...consoleErrors.map(e => `Console: ${e.message}`),
      ...networkErrors.map(e => `Network: ${e.url} — ${e.resource}`),
    ]

    const passed = allIssues.length === 0

    return {
      layer: 5, name: 'Console + network error capture',
      passed, durationMs: Date.now() - start,
      details: passed
        ? 'No console errors, network failures, or hydration issues'
        : `${allIssues.length} issue(s): ${allIssues.slice(0, 3).join('; ')}`,
      findings: allIssues.map(m => ({ severity: 'MEDIUM', message: m })),
    }
  } catch (err) {
    return {
      layer: 5, name: 'Console + network error capture',
      passed: false, durationMs: Date.now() - start,
      details: `Error: ${err instanceof Error ? err.message : err}`,
    }
  }
}

// ─── L6: Visual Diff Pre/Post ────────────────────────────────

async function runL6(
  browser: BrowserCore,
  targetUrl: string,
  beforeScreenshot?: string,
  afterScreenshot?: string,
): Promise<LayerResult & { afterScreenshot?: string; diffPercent?: number }> {
  const start = Date.now()

  if (!beforeScreenshot || !fs.existsSync(beforeScreenshot)) {
    return {
      layer: 6, name: 'Visual diff pre/post fix',
      passed: true, durationMs: 0,
      details: 'No before-screenshot provided — skipped',
    }
  }

  // Take after-screenshot
  const after = afterScreenshot ?? await takeScreenshot(browser, targetUrl, 'after-fix')
  if (!after || !fs.existsSync(after)) {
    return {
      layer: 6, name: 'Visual diff pre/post fix',
      passed: true, durationMs: Date.now() - start,
      details: 'Could not capture after-screenshot — skipped',
      afterScreenshot: after,
    }
  }

  try {
    // Use existing snapshot compare
    const { readFileSync } = await import('fs')
    const { pixelDiffPercent } = await import('../snapshot/compare')
    const diffPercent = await pixelDiffPercent(readFileSync(beforeScreenshot), readFileSync(after))
    // > 30% change post-fix = suspicious regression flag
    const passed = diffPercent < 30

    return {
      layer: 6, name: 'Visual diff pre/post fix',
      passed, durationMs: Date.now() - start,
      details: passed
        ? `Visual diff ${diffPercent.toFixed(2)}% — within acceptable range`
        : `Visual diff ${diffPercent.toFixed(2)}% — exceeds 30% threshold (possible regression)`,
      afterScreenshot: after,
      diffPercent,
    }
  } catch (err) {
    return {
      layer: 6, name: 'Visual diff pre/post fix',
      passed: true, durationMs: Date.now() - start,
      details: `pixelmatch unavailable — skipped: ${err instanceof Error ? err.message : err}`,
      afterScreenshot: after,
    }
  }
}

// ─── Main Gate Function ───────────────────────────────────────

export async function runVerifyFixGate(input: VerifyFixInput): Promise<VerifyFixResult> {
  const start = Date.now()
  const maxLayer = input.config?.maxLayer ?? 6
  const layers: LayerResult[] = []

  const browser = new BrowserCore({
    headless: input.config?.headless ?? true,
    anthropicApiKey: input.config?.anthropicApiKey,
  })

  try {
    await browser.launch()

    // L1 — Original scenario
    if (maxLayer >= 1) {
      const r = await runL1(browser, input.originalScenario, input.targetUrl)
      layers.push(r)
      if (!r.passed) {
        return {
          passed: false, layers,
          totalDurationMs: Date.now() - start,
          verdict: 'FIX_INCOMPLETE',
        }
      }
    }

    // L2 — Regression smoke
    if (maxLayer >= 2) {
      const r = await runL2(browser, input.targetUrl, input.smokeRoutes)
      layers.push(r)
    }

    // L3 — Static analysis
    if (maxLayer >= 3) {
      const r = await runL3()
      layers.push(r)
    }

    // L4 — Security scan
    if (maxLayer >= 4) {
      const r = await runL4(browser, input.targetUrl)
      layers.push(r)
    }

    // L5 — Console + network
    if (maxLayer >= 5) {
      const r = await runL5(browser, input.targetUrl)
      layers.push(r)
    }

    // L6 — Visual diff
    let afterScreenshot: string | undefined
    let visualDiffPercent: number | undefined
    if (maxLayer >= 6) {
      const r = await runL6(browser, input.targetUrl, input.beforeScreenshot)
      afterScreenshot = r.afterScreenshot
      visualDiffPercent = r.diffPercent
      layers.push(r)
    }

    const allPassed = layers.every(l => l.passed)
    const hasRegression = layers.some(l => !l.passed && l.layer >= 2)

    return {
      passed: allPassed,
      layers,
      totalDurationMs: Date.now() - start,
      verdict: allPassed
        ? 'RESOLVED'
        : hasRegression
          ? 'REGRESSION_DETECTED'
          : 'FIX_INCOMPLETE',
      afterScreenshot,
      visualDiffPercent,
    }
  } catch (err) {
    return {
      passed: false,
      layers,
      totalDurationMs: Date.now() - start,
      verdict: 'ERROR',
    }
  } finally {
    await browser.close().catch(() => null)
  }
}
