/**
 * Reporter — generates JSON and HTML reports from test results.
 */

import type { TestRun } from '../core/types'
import { generateJsonReport, type JsonReportOptions } from './json'
import { generateHtmlReport, type HtmlReportOptions } from './html'
import { resolve } from 'path'

export { generateJsonReport, formatCiSummary } from './json'
export type { JsonReportOptions } from './json'
export { generateHtmlReport, generateHtmlString } from './html'
export type { HtmlReportOptions } from './html'

export interface ReportOptions {
  outputDir: string
  formats?: ('html' | 'json')[]
  includeScreenshots?: boolean
  title?: string
}

/**
 * Generate all configured reports and return paths.
 */
export function generateReports(testRun: TestRun, options: ReportOptions): string[] {
  const formats = options.formats || ['html', 'json']
  const paths: string[] = []

  if (formats.includes('json')) {
    const jsonPath = generateJsonReport(testRun, {
      outputPath: resolve(options.outputDir, 'results.json'),
      includeScreenshots: options.includeScreenshots ?? false,
      pretty: true,
    })
    paths.push(jsonPath)
  }

  if (formats.includes('html')) {
    const htmlPath = generateHtmlReport(testRun, {
      outputPath: resolve(options.outputDir, 'report.html'),
      includeScreenshots: options.includeScreenshots ?? true,
      title: options.title,
    })
    paths.push(htmlPath)
  }

  return paths
}
