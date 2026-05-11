/**
 * T-004 — `tester classify <report-json>` CLI handler.
 *
 * Reads a JSON file containing an array of FailureContext objects (or a single
 * object), classifies each via the AI classifier, and writes results.
 *
 * Exit codes:
 *   0 — all failures are FLAKE / ENV_MISCONFIG / HARNESS_BUG (no product bugs)
 *   1 — at least one PRODUCT_BUG found
 *   2 — input file not found or parse error
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { buildFailureContext } from '../../classifier/failure-context'
import { classifyFailure } from '../../classifier/classifier'
import type { ClassifyOptions, FailureClassification } from '../../classifier/classifier'

export interface ClassifyCommandOptions {
  json?: boolean
  out?: string
  cacheDir?: string
  cacheTtlDays?: number
  forceRefresh?: boolean
  model?: string
}

function printResult(r: FailureClassification, testName: string): void {
  const icon =
    r.category === 'PRODUCT_BUG'
      ? '\x1b[31m✗\x1b[0m'
      : r.category === 'HARNESS_BUG'
        ? '\x1b[33m⚠\x1b[0m'
        : r.category === 'FLAKE'
          ? '\x1b[34m~\x1b[0m'
          : '\x1b[35m⚙\x1b[0m'
  const pct = Math.round(r.confidence * 100)
  const cached = r.cached ? ' (cached)' : ''
  process.stdout.write(
    `  ${icon} [${r.category}] ${pct}%${cached}  ${testName}\n` +
      `      Reason: ${r.reason}\n` +
      `      Fix:    ${r.remediation}\n`,
  )
}

export async function classifyCommand(
  reportPath: string,
  opts: ClassifyCommandOptions = {},
): Promise<void> {
  const resolved = path.resolve(reportPath)
  if (!fs.existsSync(resolved)) {
    process.stderr.write(`[classify] ERROR: file not found: ${resolved}\n`)
    process.exit(2)
  }

  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(resolved, 'utf8'))
  } catch {
    process.stderr.write(`[classify] ERROR: invalid JSON in ${resolved}\n`)
    process.exit(2)
  }

  const items = Array.isArray(raw) ? raw : [raw]

  const aiOpts: ClassifyOptions = {
    cacheDir: opts.cacheDir,
    cacheTtlDays: opts.cacheTtlDays != null ? Number(opts.cacheTtlDays) : undefined,
    forceRefresh: opts.forceRefresh,
    model: opts.model,
  }

  const results: Array<{ testName: string; result: FailureClassification }> = []
  let productBugs = 0

  if (!opts.json) {
    process.stdout.write(`\n[classify] Classifying ${items.length} failure(s)…\n\n`)
  }

  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue
    const ctx = buildFailureContext(item as Parameters<typeof buildFailureContext>[0])
    const result = await classifyFailure(ctx, aiOpts)
    results.push({ testName: ctx.testName, result })
    if (!opts.json) printResult(result, ctx.testName)
    if (result.category === 'PRODUCT_BUG') productBugs++
  }

  if (opts.json) {
    const out = JSON.stringify(results.map(r => ({ ...r.result, testName: r.testName })), null, 2)
    if (opts.out) {
      fs.writeFileSync(path.resolve(opts.out), out + '\n', 'utf8')
    } else {
      process.stdout.write(out + '\n')
    }
  } else {
    const bugs = results.filter(r => r.result.category === 'PRODUCT_BUG').length
    const harness = results.filter(r => r.result.category === 'HARNESS_BUG').length
    const flakes = results.filter(r => r.result.category === 'FLAKE').length
    const env = results.filter(r => r.result.category === 'ENV_MISCONFIG').length
    process.stdout.write(
      `\n${results.length} classified — ` +
        `PRODUCT_BUG: ${bugs}, HARNESS_BUG: ${harness}, FLAKE: ${flakes}, ENV_MISCONFIG: ${env}\n\n`,
    )
  }

  process.exit(productBugs > 0 ? 1 : 0)
}
