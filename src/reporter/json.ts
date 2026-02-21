/**
 * JSON Reporter
 * Generates structured JSON test report for CI/CD consumption.
 */

import type { TestRun } from '../core/types'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'

export interface JsonReportOptions {
  outputPath: string
  /** Include screenshot data (base64) in report. Default: false (saves space) */
  includeScreenshots?: boolean
  /** Pretty-print JSON. Default: true */
  pretty?: boolean
}

/**
 * Generate a JSON report from a TestRun and save to file.
 */
export function generateJsonReport(testRun: TestRun, options: JsonReportOptions): string {
  const report = options.includeScreenshots
    ? testRun
    : stripScreenshots(testRun)

  const json = JSON.stringify(report, null, options.pretty !== false ? 2 : undefined)

  const outputPath = resolve(options.outputPath)
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, json, 'utf-8')

  return outputPath
}

/**
 * Remove base64 screenshot data to reduce file size.
 * Replaces data with placeholder markers.
 */
function stripScreenshots(testRun: TestRun): TestRun {
  return {
    ...testRun,
    scenarios: testRun.scenarios.map(s => ({
      ...s,
      screenshots: s.screenshots.map(ss => ({
        label: ss.label,
        data: `[screenshot: ${ss.label}]`,
      })),
    })),
  }
}

/**
 * Format a TestRun summary as a minimal JSON string for CI output.
 */
export function formatCiSummary(testRun: TestRun): string {
  return JSON.stringify({
    url: testRun.url,
    score: testRun.summary.overallScore,
    total: testRun.summary.totalScenarios,
    passed: testRun.summary.passed,
    failed: testRun.summary.failed,
    errors: testRun.summary.errors,
    skipped: testRun.summary.skipped,
    brokenLinks: testRun.summary.brokenLinks.length,
    a11yCritical: testRun.summary.a11yViolations.critical,
    durationMs: testRun.durationMs,
  })
}
