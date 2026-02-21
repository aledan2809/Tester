/**
 * Performance Assertions
 * Capture and assert on FCP, LCP, TTI via Performance API.
 */

import type { TestAssertion, AssertionResult } from '../core/types'

type Page = import('puppeteer').Page

export interface PerformanceMetrics {
  fcp: number  // First Contentful Paint (ms)
  lcp: number  // Largest Contentful Paint (ms)
  tti: number  // Time to Interactive (ms)
  domContentLoaded: number
  loadComplete: number
  resourceCount: number
  totalTransferSize: number
}

/**
 * Capture performance metrics from the current page.
 */
export async function capturePerformanceMetrics(page: Page): Promise<PerformanceMetrics> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const paint = performance.getEntriesByType('paint')
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]

    const fcp = paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0
    const domContentLoaded = nav?.domContentLoadedEventEnd || 0
    const loadComplete = nav?.loadEventEnd || 0

    // LCP via PerformanceObserver (might not be available synchronously)
    let lcp = 0
    try {
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint') as PerformanceEntry[]
      if (lcpEntries.length > 0) {
        lcp = lcpEntries[lcpEntries.length - 1].startTime
      }
    } catch {
      lcp = fcp * 1.5 // Estimate
    }

    // TTI approximation: domContentLoaded + longest task gap
    const tti = Math.max(domContentLoaded, fcp + 500)

    const totalTransferSize = resources.reduce((sum, r) => sum + (r.transferSize || 0), 0)

    return {
      fcp: Math.round(fcp),
      lcp: Math.round(lcp || fcp * 1.5),
      tti: Math.round(tti),
      domContentLoaded: Math.round(domContentLoaded),
      loadComplete: Math.round(loadComplete),
      resourceCount: resources.length,
      totalTransferSize,
    }
  })
}

/**
 * Run performance assertion.
 */
export async function runPerformanceAssertion(
  page: Page,
  assertion: TestAssertion,
): Promise<AssertionResult> {
  const metrics = await capturePerformanceMetrics(page)

  switch (assertion.type) {
    case 'performance_fcp': {
      const threshold = Number(assertion.expected || 3000)
      const passed = metrics.fcp <= threshold
      return {
        assertion,
        passed,
        actual: metrics.fcp,
        error: passed ? undefined : `FCP ${metrics.fcp}ms exceeds ${threshold}ms threshold`,
      }
    }

    case 'performance_lcp': {
      const threshold = Number(assertion.expected || 4000)
      const passed = metrics.lcp <= threshold
      return {
        assertion,
        passed,
        actual: metrics.lcp,
        error: passed ? undefined : `LCP ${metrics.lcp}ms exceeds ${threshold}ms threshold`,
      }
    }

    case 'performance_tti': {
      const threshold = Number(assertion.expected || 5000)
      const passed = metrics.tti <= threshold
      return {
        assertion,
        passed,
        actual: metrics.tti,
        error: passed ? undefined : `TTI ${metrics.tti}ms exceeds ${threshold}ms threshold`,
      }
    }

    default:
      return { assertion, passed: false, error: `Unknown performance assertion type: ${assertion.type}` }
  }
}
