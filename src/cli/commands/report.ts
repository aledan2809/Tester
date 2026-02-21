/**
 * CLI Command: tester report <json-path>
 * Regenerate HTML report from existing JSON results.
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { generateHtmlReport } from '../../reporter/html'
import { log, logSuccess, logError } from '../utils'
import type { TestRun } from '../../core/types'

interface ReportOptions {
  output?: string
  title?: string
  screenshots: boolean
}

export function reportCommand(jsonPath: string, options: ReportOptions): void {
  try {
    const fullPath = resolve(jsonPath)
    log(`Reading results from ${fullPath}`)

    const raw = readFileSync(fullPath, 'utf-8')
    const testRun: TestRun = JSON.parse(raw)

    // Validate minimal structure
    if (!testRun.url || !testRun.summary) {
      logError('Invalid test results JSON — missing url or summary')
      process.exit(1)
    }

    const outputPath = options.output || resolve(dirname(fullPath), 'report.html')

    const result = generateHtmlReport(testRun, {
      outputPath,
      includeScreenshots: options.screenshots,
      title: options.title,
    })

    logSuccess(`HTML report generated: ${result}`)
  } catch (err) {
    logError(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
