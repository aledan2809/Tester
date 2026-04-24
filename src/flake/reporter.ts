/**
 * T-007 §4 — `tester flake-report`.
 *
 * Walks a directory of historical test-run JSON reports (as produced
 * by `generateJsonReport`) and aggregates retry metadata (retryCount,
 * retryFinalVerdict, timeToVerdictMs) stamped by T-007 retry helper.
 *
 * Output: per-step flake density — how often this step needed a retry,
 * how often retries couldn't save it, total retries consumed, p90
 * time-to-verdict. Downstream: identifies hard-fix candidates.
 *
 * Schema of input JSON (relevant subset):
 *   {
 *     "startedAt": ISO,
 *     "scenarios": [
 *       {
 *         "scenario": { "id": "...", "name": "..." },
 *         "steps": [
 *           {
 *             "stepIndex": N,
 *             "action": "click|fill|...",
 *             "description": "...",
 *             "success": bool,
 *             "retryCount"?: N,
 *             "timeToVerdictMs"?: N,
 *             "retryFinalVerdict"?: "passed|failed|none"
 *           }
 *         ]
 *       }
 *     ]
 *   }
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

export interface RawStepReport {
  stepIndex?: number
  action?: string
  description?: string
  success?: boolean
  retryCount?: number
  timeToVerdictMs?: number
  retryFinalVerdict?: 'passed' | 'failed' | 'none'
}

export interface FlakeStepKey {
  scenarioId: string
  scenarioName: string
  stepIndex: number
  action: string
  description: string
}

export interface FlakeStepStats {
  key: FlakeStepKey
  runs: number
  retries_consumed: number
  retries_that_passed: number
  retries_that_failed: number
  time_to_verdict_ms_samples: number[]
  time_to_verdict_ms_p90: number | null
  flake_rate: number // retries_consumed / runs
  recovery_rate: number // retries_that_passed / retries_consumed (NaN-guarded)
}

export interface FlakeReport {
  scanned_files: number
  scanned_runs: number
  since?: string
  steps: FlakeStepStats[]
  // Top-line aggregate across all scanned runs.
  totals: {
    runs: number
    steps: number
    steps_with_retries: number
    total_retries: number
  }
}

function keyOf(scenarioId: string, scenarioName: string, s: RawStepReport): string {
  return `${scenarioId}::${s.stepIndex ?? -1}::${s.action ?? '?'}::${(s.description ?? '').slice(0, 80)}`
}

function parseReport(file: string): { startedAt?: string; scenarios: Array<{ scenario: { id: string; name: string }; steps: RawStepReport[] }> } | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      startedAt?: string
      scenarios?: Array<{ scenario?: { id?: string; name?: string }; steps?: RawStepReport[] }>
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.scenarios)) return null
    const scenarios = parsed.scenarios.map((s) => ({
      scenario: {
        id: typeof s.scenario?.id === 'string' ? s.scenario.id : '',
        name: typeof s.scenario?.name === 'string' ? s.scenario.name : '(unnamed)',
      },
      steps: Array.isArray(s.steps) ? s.steps : [],
    }))
    return { startedAt: parsed.startedAt, scenarios }
  } catch {
    return null
  }
}

export interface ScanOptions {
  /** Only include reports whose startedAt is >= since ISO. */
  since?: string
  /** Override file extension filter. */
  fileRegex?: RegExp
}

function collectReportFiles(dir: string, fileRegex: RegExp): string[] {
  if (!fs.existsSync(dir)) return []
  const out: string[] = []
  const stack: string[] = [dir]
  while (stack.length > 0) {
    const cur = stack.pop()!
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const full = path.join(cur, e.name)
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue
        stack.push(full)
      } else if (e.isFile() && fileRegex.test(e.name)) {
        out.push(full)
      }
    }
  }
  return out.sort()
}

function percentile(samples: number[], p: number): number | null {
  if (samples.length === 0) return null
  const sorted = [...samples].sort((a, b) => a - b)
  const rank = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[rank]
}

export function aggregateFlakes(reportDir: string, opts: ScanOptions = {}): FlakeReport {
  const fileRegex = opts.fileRegex ?? /\.json$/
  const files = collectReportFiles(reportDir, fileRegex)
  const sinceTs = opts.since ? Date.parse(opts.since) : NaN
  const bySig: Record<string, { key: FlakeStepKey; runs: number; retries: number; passed: number; failed: number; samples: number[] }> = {}
  let scannedRuns = 0
  let scannedFiles = 0
  let totalSteps = 0
  let totalRetries = 0
  let stepsWithRetries = 0
  for (const f of files) {
    const rep = parseReport(f)
    if (!rep) continue
    if (Number.isFinite(sinceTs) && rep.startedAt) {
      const t = Date.parse(rep.startedAt)
      if (!Number.isNaN(t) && t < sinceTs) continue
    }
    scannedFiles++
    scannedRuns++
    for (const s of rep.scenarios) {
      for (const step of s.steps) {
        totalSteps++
        const sig = keyOf(s.scenario.id, s.scenario.name, step)
        if (!bySig[sig]) {
          bySig[sig] = {
            key: {
              scenarioId: s.scenario.id,
              scenarioName: s.scenario.name,
              stepIndex: step.stepIndex ?? -1,
              action: step.action ?? '?',
              description: step.description ?? '',
            },
            runs: 0,
            retries: 0,
            passed: 0,
            failed: 0,
            samples: [],
          }
        }
        const agg = bySig[sig]
        agg.runs++
        const rc = step.retryCount ?? 0
        if (rc > 0) {
          stepsWithRetries++
          agg.retries += rc
          totalRetries += rc
          if (step.retryFinalVerdict === 'passed') agg.passed++
          if (step.retryFinalVerdict === 'failed') agg.failed++
        }
        if (typeof step.timeToVerdictMs === 'number' && Number.isFinite(step.timeToVerdictMs)) {
          agg.samples.push(step.timeToVerdictMs)
        }
      }
    }
  }

  const steps: FlakeStepStats[] = Object.values(bySig)
    .map((a) => ({
      key: a.key,
      runs: a.runs,
      retries_consumed: a.retries,
      retries_that_passed: a.passed,
      retries_that_failed: a.failed,
      time_to_verdict_ms_samples: a.samples,
      time_to_verdict_ms_p90: percentile(a.samples, 90),
      flake_rate: a.runs > 0 ? a.retries / a.runs : 0,
      recovery_rate: a.retries > 0 ? a.passed / a.retries : 0,
    }))
    .filter((s) => s.retries_consumed > 0 || s.retries_that_failed > 0)
    .sort((a, b) => {
      if (b.flake_rate !== a.flake_rate) return b.flake_rate - a.flake_rate
      return b.retries_consumed - a.retries_consumed
    })

  return {
    scanned_files: scannedFiles,
    scanned_runs: scannedRuns,
    since: opts.since,
    steps,
    totals: {
      runs: scannedRuns,
      steps: totalSteps,
      steps_with_retries: stepsWithRetries,
      total_retries: totalRetries,
    },
  }
}

export function renderFlakeMarkdown(r: FlakeReport): string {
  const lines: string[] = []
  lines.push(`# Flake report`)
  lines.push('')
  if (r.since) lines.push(`- **Since:** ${r.since}`)
  lines.push(`- **Runs scanned:** ${r.scanned_runs}`)
  lines.push(`- **Steps total:** ${r.totals.steps}`)
  lines.push(`- **Steps with retries:** ${r.totals.steps_with_retries} (${r.totals.total_retries} total retries)`)
  lines.push('')
  if (r.steps.length === 0) {
    lines.push('_No flaky steps found — no retries consumed in scanned runs._')
    return lines.join('\n')
  }
  lines.push(`## Top flaky steps`)
  lines.push('')
  lines.push(`| # | Scenario | Step | Description | Runs | Retries | Pass% | Flake% | p90 ms |`)
  lines.push(`|---|----------|------|-------------|------|---------|-------|--------|--------|`)
  r.steps.slice(0, 20).forEach((s, i) => {
    const desc = s.key.description.slice(0, 60).replace(/\|/g, '\\|')
    lines.push(
      `| ${i + 1} | \`${s.key.scenarioName.slice(0, 40).replace(/\|/g, '\\|')}\` | \`${s.key.action}\` #${s.key.stepIndex} | ${desc} | ${s.runs} | ${s.retries_consumed} | ${(s.recovery_rate * 100).toFixed(0)}% | ${(s.flake_rate * 100).toFixed(1)}% | ${s.time_to_verdict_ms_p90 ?? '-'} |`,
    )
  })
  return lines.join('\n')
}
