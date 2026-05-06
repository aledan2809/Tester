/**
 * DOM Assertions
 * Verify element existence, visibility, text content, attributes, URL, title.
 *
 * Module G (loading timer) and Module J (hydration + CSP) exports are appended
 * at the bottom of this file — they are additive and do not modify the existing
 * runDomAssertion switch.
 */

import type { TestAssertion, AssertionResult } from '../core/types'

type Page = import('puppeteer').Page

export async function runDomAssertion(
  page: Page,
  assertion: TestAssertion,
): Promise<AssertionResult> {
  try {
    switch (assertion.type) {
      case 'element_exists': {
        const exists = await page.$(assertion.target!) !== null
        return { assertion, passed: exists, actual: exists, error: exists ? undefined : `Element "${assertion.target}" not found` }
      }

      case 'element_visible': {
        const visible = await page.evaluate((sel) => {
          const el = document.querySelector(sel)
          if (!el) return false
          const style = window.getComputedStyle(el)
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
        }, assertion.target!)
        return { assertion, passed: visible, actual: visible, error: visible ? undefined : `Element "${assertion.target}" not visible` }
      }

      case 'element_hidden': {
        const hidden = await page.evaluate((sel) => {
          const el = document.querySelector(sel)
          if (!el) return true
          const style = window.getComputedStyle(el)
          return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0'
        }, assertion.target!)
        return { assertion, passed: hidden, actual: hidden, error: hidden ? undefined : `Element "${assertion.target}" is visible` }
      }

      case 'text_equals': {
        const text = await page.evaluate((sel) => document.querySelector(sel)?.textContent?.trim() || '', assertion.target!)
        const passed = text === assertion.expected
        return { assertion, passed, actual: text, error: passed ? undefined : `Expected "${assertion.expected}", got "${text}"` }
      }

      case 'text_contains': {
        const text = await page.evaluate((sel) => document.querySelector(sel)?.textContent?.trim() || '', assertion.target!)
        const passed = text.includes(String(assertion.expected || ''))
        return { assertion, passed, actual: text, error: passed ? undefined : `"${text}" does not contain "${assertion.expected}"` }
      }

      case 'text_matches': {
        const text = await page.evaluate((sel) => document.querySelector(sel)?.textContent?.trim() || '', assertion.target!)
        const regex = new RegExp(String(assertion.expected || ''))
        const passed = regex.test(text)
        return { assertion, passed, actual: text, error: passed ? undefined : `"${text}" does not match /${assertion.expected}/` }
      }

      case 'attribute_equals': {
        const [selector, attrName] = (assertion.target || '').split('|')
        const value = await page.evaluate((sel, attr) => document.querySelector(sel)?.getAttribute(attr) || '', selector, attrName || 'class')
        const passed = value === assertion.expected
        return { assertion, passed, actual: value, error: passed ? undefined : `Attribute ${attrName}="${value}", expected "${assertion.expected}"` }
      }

      case 'attribute_contains': {
        const [selector, attrName] = (assertion.target || '').split('|')
        const value = await page.evaluate((sel, attr) => document.querySelector(sel)?.getAttribute(attr) || '', selector, attrName || 'class')
        const passed = value.includes(String(assertion.expected || ''))
        return { assertion, passed, actual: value, error: passed ? undefined : `Attribute ${attrName}="${value}" doesn't contain "${assertion.expected}"` }
      }

      case 'url_equals': {
        const url = page.url()
        const passed = url === assertion.expected
        return { assertion, passed, actual: url, error: passed ? undefined : `URL "${url}" !== "${assertion.expected}"` }
      }

      case 'url_contains': {
        const url = page.url()
        const passed = url.includes(String(assertion.expected || ''))
        return { assertion, passed, actual: url, error: passed ? undefined : `URL "${url}" doesn't contain "${assertion.expected}"` }
      }

      case 'url_matches': {
        const url = page.url()
        const regex = new RegExp(String(assertion.expected || ''))
        const passed = regex.test(url)
        return { assertion, passed, actual: url, error: passed ? undefined : `URL "${url}" doesn't match /${assertion.expected}/` }
      }

      case 'title_equals': {
        const title = await page.title()
        const passed = title === assertion.expected
        return { assertion, passed, actual: title, error: passed ? undefined : `Title "${title}" !== "${assertion.expected}"` }
      }

      case 'title_contains': {
        const title = await page.title()
        const passed = title.includes(String(assertion.expected || ''))
        return { assertion, passed, actual: title, error: passed ? undefined : `Title "${title}" doesn't contain "${assertion.expected}"` }
      }

      case 'cookie_exists': {
        const cookies = await page.cookies()
        const exists = cookies.some(c => c.name === assertion.expected)
        return { assertion, passed: exists, actual: exists, error: exists ? undefined : `Cookie "${assertion.expected}" not found` }
      }

      case 'cookie_value': {
        const cookies = await page.cookies()
        const cookie = cookies.find(c => c.name === assertion.target)
        const passed = cookie?.value === assertion.expected
        return { assertion, passed, actual: cookie?.value, error: passed ? undefined : `Cookie "${assertion.target}" = "${cookie?.value}", expected "${assertion.expected}"` }
      }

      default:
        return { assertion, passed: false, error: `Unknown DOM assertion type: ${assertion.type}` }
    }
  } catch (err) {
    return { assertion, passed: false, error: `DOM assertion error: ${err instanceof Error ? err.message : err}` }
  }
}

// ─── Module G: Loading Timer ─────────────────────────────────

export interface LoadTimingResult {
  /** True if page loaded within the threshold */
  passed: boolean
  /** Actual load time in milliseconds */
  loadTimeMs: number
  /** Threshold used */
  thresholdMs: number
  /** CRITICAL when loadTimeMs exceeds criticalThresholdMs */
  severity: 'ok' | 'warn' | 'critical'
  /** Breakdown of browser performance timings */
  timings?: {
    domContentLoaded: number
    load: number
    firstPaint?: number
    firstContentfulPaint?: number
  }
}

/**
 * Measures page load time and flags slow loads.
 * CRITICAL when > criticalThresholdMs (default 15 000 ms).
 * WARN when > warnThresholdMs (default 5 000 ms).
 */
export async function auditLoadTiming(
  page: Page,
  targetUrl: string,
  options: {
    warnThresholdMs?: number
    criticalThresholdMs?: number
  } = {},
): Promise<LoadTimingResult> {
  const warnMs = options.warnThresholdMs ?? 5_000
  const criticalMs = options.criticalThresholdMs ?? 15_000

  const start = Date.now()
  await page.goto(targetUrl, { waitUntil: 'load', timeout: criticalMs + 5_000 }).catch(() => null)
  const loadTimeMs = Date.now() - start

  const timings = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const paintEntries = performance.getEntriesByType('paint')
    const fp = paintEntries.find(e => e.name === 'first-paint')?.startTime
    const fcp = paintEntries.find(e => e.name === 'first-contentful-paint')?.startTime
    return {
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : 0,
      load: nav ? Math.round(nav.loadEventEnd) : 0,
      firstPaint: fp ? Math.round(fp) : undefined,
      firstContentfulPaint: fcp ? Math.round(fcp) : undefined,
    }
  }).catch(() => undefined)

  const severity = loadTimeMs > criticalMs ? 'critical' : loadTimeMs > warnMs ? 'warn' : 'ok'

  return {
    passed: severity !== 'critical',
    loadTimeMs,
    thresholdMs: criticalMs,
    severity,
    timings,
  }
}

// ─── Module J: Hydration & CSP Audit ─────────────────────────

export interface HydrationIssue {
  type: 'hydration_mismatch' | 'csp_violation' | 'csp_missing' | 'uncaught_error'
  message: string
  source?: string
}

export interface HydrationAuditResult {
  passed: boolean
  issues: HydrationIssue[]
}

/**
 * Loads a page and collects:
 * - React/Next.js hydration mismatch warnings
 * - CSP violations (via securitypolicyviolation events or console)
 * - Missing CSP header
 * - Uncaught JS errors
 */
export async function auditHydrationAndCSP(
  page: Page,
  targetUrl: string,
): Promise<HydrationAuditResult> {
  const issues: HydrationIssue[] = []

  // Inject violation listener before navigation
  await page.evaluateOnNewDocument(() => {
    ;(window as unknown as Record<string, unknown>).__cspViolations = []
    document.addEventListener('securitypolicyviolation', (e) => {
      ;((window as unknown as Record<string, unknown>).__cspViolations as string[]).push(
        `${e.violatedDirective}: ${e.blockedURI}`
      )
    })
  })

  const consoleMessages: { type: string; text: string }[] = []
  const onConsole = (msg: import('puppeteer').ConsoleMessage) => {
    consoleMessages.push({ type: msg.type(), text: msg.text() })
  }
  page.on('console', onConsole)

  const response = await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => null)

  // Check CSP header presence
  const cspHeader = response?.headers()['content-security-policy']
  if (!cspHeader) {
    issues.push({ type: 'csp_missing', message: 'Content-Security-Policy header not set' })
  }

  // Collect CSP violations from event listener
  const cspViolations = await page.evaluate(
    () => (window as unknown as Record<string, string[]>).__cspViolations ?? []
  ).catch(() => [] as string[])

  for (const v of cspViolations) {
    issues.push({ type: 'csp_violation', message: `CSP violation: ${v}`, source: targetUrl })
  }

  // Parse console messages for hydration + runtime errors
  for (const { type, text } of consoleMessages) {
    const isHydration =
      /hydrat|did not match|server.*client|Hydration failed/i.test(text)
    const isCSPConsole =
      /content.security.policy|csp.*block|refused to (load|execute|connect)/i.test(text)
    const isError = type === 'error' || type === 'warning'

    if (isHydration) {
      issues.push({ type: 'hydration_mismatch', message: text.slice(0, 300) })
    } else if (isCSPConsole) {
      issues.push({ type: 'csp_violation', message: text.slice(0, 300) })
    } else if (isError && /uncaught|unhandled|TypeError|ReferenceError|SyntaxError/i.test(text)) {
      issues.push({ type: 'uncaught_error', message: text.slice(0, 300) })
    }
  }

  page.off('console', onConsole)

  return {
    passed: issues.filter(i => i.type !== 'csp_missing').length === 0,
    issues,
  }
}
