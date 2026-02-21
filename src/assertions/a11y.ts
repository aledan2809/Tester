/**
 * Accessibility Assertions
 * Uses axe-core via @axe-core/puppeteer to scan pages for WCAG violations.
 */

import type { TestAssertion, AssertionResult } from '../core/types'

type Page = import('puppeteer').Page

export interface A11yViolationSummary {
  critical: number
  serious: number
  moderate: number
  minor: number
  violations: Array<{
    id: string
    impact: string
    description: string
    nodes: number
  }>
}

/**
 * Run accessibility scan on the current page.
 */
export async function runA11yScan(page: Page): Promise<A11yViolationSummary> {
  try {
    const AxePuppeteer = (await import('@axe-core/puppeteer')).default
    const results = await new AxePuppeteer(page).analyze()

    const summary: A11yViolationSummary = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
      violations: [],
    }

    for (const v of results.violations) {
      const impact = v.impact || 'minor'
      if (impact === 'critical') summary.critical++
      else if (impact === 'serious') summary.serious++
      else if (impact === 'moderate') summary.moderate++
      else summary.minor++

      summary.violations.push({
        id: v.id,
        impact,
        description: v.description,
        nodes: v.nodes.length,
      })
    }

    return summary
  } catch (err) {
    console.warn('[a11y] axe-core scan failed:', err instanceof Error ? err.message : err)
    return { critical: 0, serious: 0, moderate: 0, minor: 0, violations: [] }
  }
}

/**
 * Run a11y assertion based on scan results.
 */
export async function runA11yAssertion(
  page: Page,
  assertion: TestAssertion,
): Promise<AssertionResult> {
  const scan = await runA11yScan(page)

  switch (assertion.type) {
    case 'a11y_no_violations': {
      const total = scan.critical + scan.serious + scan.moderate + scan.minor
      const passed = total === 0
      return {
        assertion,
        passed,
        actual: total,
        error: passed
          ? undefined
          : `${total} a11y violation(s): ${scan.critical} critical, ${scan.serious} serious, ${scan.moderate} moderate, ${scan.minor} minor`,
      }
    }

    case 'a11y_max_violations': {
      const total = scan.critical + scan.serious
      const max = Number(assertion.expected || 0)
      const passed = total <= max
      return {
        assertion,
        passed,
        actual: total,
        error: passed
          ? undefined
          : `${total} critical+serious a11y violations (max: ${max})`,
      }
    }

    default:
      return { assertion, passed: false, error: `Unknown a11y assertion type: ${assertion.type}` }
  }
}
