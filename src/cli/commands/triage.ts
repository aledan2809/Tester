/**
 * T-B3 — `tester triage <log>` CLI.
 *
 * Reads a failure log (same shape as `tester lessons classify`) and emits
 * a routing decision the TWG orchestrator can consume. Uses the T-004
 * classifier under the hood — so no new AI surface is introduced.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { triageFailure } from '../../triage/decision'
import type { FailureContext } from '../../lessons/classifier'

export interface TriageCliOptions {
  json?: boolean
  dir?: string
  forceHeuristic?: boolean
  minConfidence?: number
}

export async function triageCommand(logPath: string, opts: TriageCliOptions): Promise<void> {
  const full = path.resolve(logPath)
  if (!fs.existsSync(full)) {
    process.stderr.write(`[triage] ERROR: log file does not exist: ${full}\n`)
    process.exit(2)
  }
  const raw = fs.readFileSync(full, 'utf8')
  // Mirror the same heuristic parse as `tester lessons classify`
  const assertion = raw.match(/(?:expected|assertion|expect\()([^\n]*)/i)
  const errorMsg = raw.match(/(?:Error:|TypeError:|SyntaxError:|RangeError:|ReferenceError:)([^\n]*)/)
  const urlMatch = raw.match(/https?:\/\/[^\s"')]+/)
  const stack = raw
    .split('\n')
    .filter((l) => /^\s+at\s/.test(l))
    .slice(0, 20)
    .join('\n')
  const consoleLines = raw
    .split('\n')
    .filter((l) => /console\.(log|error|warn|info)/.test(l))
    .slice(0, 10)
  const ctx: FailureContext = {
    assertion: assertion ? assertion[0] : undefined,
    errorMessage: errorMsg ? errorMsg[0] : undefined,
    stackTrace: stack || undefined,
    consoleErrors: consoleLines.length ? consoleLines : undefined,
    pageUrl: urlMatch ? urlMatch[0] : undefined,
    notes: raw.slice(0, 2000),
  }

  const decision = await triageFailure(ctx, {
    corpusDir: opts.dir,
    forceHeuristic: opts.forceHeuristic,
    minConfidence: opts.minConfidence,
  })

  if (opts.json) {
    process.stdout.write(JSON.stringify({ log: full, ...decision }, null, 2) + '\n')
    return
  }

  const badge =
    decision.route === 'guru'
      ? '→ GURU (product fix)'
      : decision.route === 'tester-self'
        ? '→ TESTER SELF (harness fix)'
        : decision.route === 'flake-retry'
          ? '→ FLAKE RETRY'
          : '→ ENV FIX (human)'
  process.stdout.write(`Log: ${full}\n\n`)
  process.stdout.write(
    `${badge}  verdict=${decision.verdict}  confidence=${Math.round(decision.confidence * 100)}%\n`,
  )
  process.stdout.write(`  reasoning:   ${decision.reasoning}\n`)
  process.stdout.write(`  remediation: ${decision.remediation}\n`)
  process.stdout.write(`  signature:   ${decision.signature.slice(0, 16)}…${decision.cached ? ' (cached)' : ''}\n`)
}
