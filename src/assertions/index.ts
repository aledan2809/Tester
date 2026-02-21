/**
 * Assertion Runner — routes assertions to the correct handler.
 */

import type { TestAssertion, AssertionResult, ConsoleError, NetworkError } from '../core/types'
import { runDomAssertion } from './dom'
import { runNetworkAssertion } from './network'
import { runVisualAssertion } from './visual'
import { runA11yAssertion } from './a11y'
import { runPerformanceAssertion } from './performance'

type Page = import('puppeteer').Page

const DOM_TYPES = new Set([
  'element_exists', 'element_visible', 'element_hidden',
  'text_equals', 'text_contains', 'text_matches',
  'attribute_equals', 'attribute_contains',
  'url_equals', 'url_contains', 'url_matches',
  'title_equals', 'title_contains',
  'cookie_exists', 'cookie_value',
])

const NETWORK_TYPES = new Set([
  'no_console_errors', 'no_network_errors', 'status_code',
])

const A11Y_TYPES = new Set([
  'a11y_no_violations', 'a11y_max_violations',
])

const PERF_TYPES = new Set([
  'performance_fcp', 'performance_lcp', 'performance_tti',
])

export async function runAssertion(
  page: Page,
  assertion: TestAssertion,
  context: {
    consoleErrors: ConsoleError[]
    networkErrors: NetworkError[]
    beforeScreenshot?: string
    afterScreenshot?: string
  },
): Promise<AssertionResult> {
  if (DOM_TYPES.has(assertion.type)) {
    return runDomAssertion(page, assertion)
  }

  if (NETWORK_TYPES.has(assertion.type)) {
    return runNetworkAssertion(page, assertion, context.consoleErrors, context.networkErrors)
  }

  if (assertion.type === 'visual_no_regression') {
    if (context.beforeScreenshot && context.afterScreenshot) {
      return runVisualAssertion(assertion, context.beforeScreenshot, context.afterScreenshot)
    }
    return { assertion, passed: true, error: undefined } // Skip if no screenshots
  }

  if (A11Y_TYPES.has(assertion.type)) {
    return runA11yAssertion(page, assertion)
  }

  if (PERF_TYPES.has(assertion.type)) {
    return runPerformanceAssertion(page, assertion)
  }

  return { assertion, passed: false, error: `Unknown assertion type: ${assertion.type}` }
}
