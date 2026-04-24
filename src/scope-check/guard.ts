/**
 * T-C1 — Pre-commit scope guard (Tester-side standalone).
 *
 * Given a repo path + a "since" sha + a task description, runs
 * `git diff --stat <sha>..HEAD`, parses the summary, and returns a
 * structured breach decision. Independent of Master mesh — can be
 * used in CI, git hooks, or from `tester done`/`tester scope-check`
 * subcommand.
 *
 * Mirrors the semantics of Master `mesh/dev/dev-agent.js`
 * checkScopeCreep but is pure (no filesystem side effects) and
 * independent of the pipeline runtime.
 */

import { spawnSync } from 'node:child_process'

export interface ScopeCheckInput {
  repoPath: string
  since: string
  taskDescription?: string
  fileThreshold?: number
  lineThreshold?: number
}

export interface ScopeCheckResult {
  ok: boolean
  breached: boolean
  reason?: string
  filesChanged: number
  linesAdded: number
  linesDeleted: number
  linesTotal: number
  fileThreshold: number
  lineThreshold: number
  allowWide: boolean
  diffSummary: string
}

const WIDE_TOKENS = [
  /\ballow[-_ ]wide[-_ ]scope\b/i,
  /\bbulk[-_ ]refactor\b/i,
  /\bmass[-_ ]rename\b/i,
  /\bwide[-_ ]rewrite\b/i,
]

export function hasAllowWideScope(description: string | undefined): boolean {
  if (!description) return false
  return WIDE_TOKENS.some((re) => re.test(description))
}

export function checkScope(input: ScopeCheckInput): ScopeCheckResult {
  const fileThreshold = input.fileThreshold ?? 10
  const lineThreshold = input.lineThreshold ?? 500
  const res = spawnSync('git', ['-C', input.repoPath, 'diff', '--stat', `${input.since}..HEAD`], {
    encoding: 'utf8',
  })
  if (res.status !== 0) {
    return {
      ok: false,
      breached: false,
      reason: `git diff failed: ${(res.stderr || '').trim().split('\n')[0]}`,
      filesChanged: 0,
      linesAdded: 0,
      linesDeleted: 0,
      linesTotal: 0,
      fileThreshold,
      lineThreshold,
      allowWide: false,
      diffSummary: '',
    }
  }
  const out = (res.stdout || '').trim()
  const sumLine = out.split('\n').pop() || ''
  const filesMatch = sumLine.match(/(\d+)\s+files?\s+changed/)
  const insMatch = sumLine.match(/(\d+)\s+insertions?/)
  const delMatch = sumLine.match(/(\d+)\s+deletions?/)
  const filesChanged = filesMatch ? Number(filesMatch[1]) : 0
  const linesAdded = insMatch ? Number(insMatch[1]) : 0
  const linesDeleted = delMatch ? Number(delMatch[1]) : 0
  const linesTotal = linesAdded + linesDeleted
  const allowWide = hasAllowWideScope(input.taskDescription)
  const overFiles = filesChanged > fileThreshold
  const overLines = linesTotal > lineThreshold
  const breached = !allowWide && (overFiles || overLines)
  let reason: string | undefined
  if (breached) {
    const parts: string[] = []
    if (overFiles) parts.push(`files=${filesChanged} > ${fileThreshold}`)
    if (overLines) parts.push(`lines=${linesTotal} > ${lineThreshold}`)
    reason = `scope breach: ${parts.join(', ')}`
  }
  return {
    ok: true,
    breached,
    reason,
    filesChanged,
    linesAdded,
    linesDeleted,
    linesTotal,
    fileThreshold,
    lineThreshold,
    allowWide,
    diffSummary: sumLine,
  }
}
