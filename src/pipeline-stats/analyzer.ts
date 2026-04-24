/**
 * T-C5 — Pipeline failure analytics.
 *
 * Consumes Master `mesh/state/pipelines.json` (same shape used by the
 * T-C6 zombie-scan) and returns per-phase failure buckets + signature
 * clusters + cost summaries. Pure data-in / data-out; CLI wraps this
 * with the same Master-path discovery logic as zombie-scan.
 */

import * as crypto from 'node:crypto'

export interface PipelineRecord {
  id: string
  state: string
  project?: string
  phase?: string
  mode?: string
  pid?: number
  createdAt?: string
  updatedAt?: string
  errors?: Array<{ phase?: string; message?: string } | string>
  contextTokens?: number
  /** Free-form extra fields tolerated. */
  [k: string]: unknown
}

export interface PhaseBucket {
  phase: string
  total: number
  failed: number
  running: number
  completed: number
  fail_rate: number
}

export interface SignatureCluster {
  signature: string
  exemplar: string
  count: number
  projects: string[]
}

export interface StatsReport {
  window: { since?: string; until?: string }
  total_pipelines: number
  failed: number
  completed: number
  fail_rate: number
  phases: PhaseBucket[]
  top_signatures: SignatureCluster[]
  avg_context_tokens: number | null
}

const FAILED_STATES = new Set(['failed', 'aborted', 'error'])
const COMPLETED_STATES = new Set(['done', 'completed', 'success'])
const RUNNING_STATES = new Set([
  'dev',
  'planning',
  'qa',
  'deploy',
  'monitor',
  'ci',
  'running',
  'waiting_clarification',
  'waiting_validation',
])

export function normalizeSignature(raw: string): string {
  const truncated = raw.slice(0, 500).toLowerCase()
  const reduced = truncated
    .replace(/\b\d+\b/g, 'N')
    .replace(/[0-9a-f]{8,}/g, 'H')
    .replace(/\s+/g, ' ')
    .trim()
  // Short-hash for dedup ids (not for security).
  return crypto.createHash('sha1').update(reduced).digest('hex').slice(0, 12)
}

function extractErrorText(rec: PipelineRecord): string | null {
  if (!rec.errors || !Array.isArray(rec.errors) || rec.errors.length === 0) return null
  const first = rec.errors[0]
  if (typeof first === 'string') return first
  if (first && typeof first === 'object' && typeof first.message === 'string') return first.message
  return null
}

function inWindow(ts: string | undefined, since?: string, until?: string): boolean {
  if (!ts) return true
  const t = Date.parse(ts)
  if (Number.isNaN(t)) return true
  if (since) {
    const s = Date.parse(since)
    if (!Number.isNaN(s) && t < s) return false
  }
  if (until) {
    const u = Date.parse(until)
    if (!Number.isNaN(u) && t > u) return false
  }
  return true
}

export interface AnalyzeOptions {
  since?: string
  until?: string
  topN?: number
}

export function analyzePipelines(
  pipelines: PipelineRecord[],
  opts: AnalyzeOptions = {},
): StatsReport {
  const topN = Math.max(1, opts.topN ?? 5)
  const inScope = pipelines.filter((p) => inWindow(p.updatedAt || p.createdAt, opts.since, opts.until))
  const total = inScope.length
  let failed = 0
  let completed = 0
  const phaseAgg: Record<string, PhaseBucket> = {}
  const sigAgg: Record<string, { exemplar: string; count: number; projects: Set<string> }> = {}
  let tokensSum = 0
  let tokensN = 0

  for (const p of inScope) {
    const phase = p.phase || '(unknown)'
    if (!phaseAgg[phase]) {
      phaseAgg[phase] = { phase, total: 0, failed: 0, running: 0, completed: 0, fail_rate: 0 }
    }
    phaseAgg[phase].total++
    const state = (p.state || '').toLowerCase()
    if (FAILED_STATES.has(state)) {
      failed++
      phaseAgg[phase].failed++
      const errText = extractErrorText(p)
      if (errText) {
        const sig = normalizeSignature(errText)
        if (!sigAgg[sig]) {
          sigAgg[sig] = { exemplar: errText.slice(0, 200), count: 0, projects: new Set() }
        }
        sigAgg[sig].count++
        if (p.project) sigAgg[sig].projects.add(p.project)
      }
    } else if (COMPLETED_STATES.has(state)) {
      completed++
      phaseAgg[phase].completed++
    } else if (RUNNING_STATES.has(state)) {
      phaseAgg[phase].running++
    }
    if (typeof p.contextTokens === 'number' && Number.isFinite(p.contextTokens)) {
      tokensSum += p.contextTokens
      tokensN++
    }
  }
  for (const b of Object.values(phaseAgg)) {
    b.fail_rate = b.total > 0 ? b.failed / b.total : 0
  }
  const phases = Object.values(phaseAgg).sort((a, b) => b.failed - a.failed)
  const top_signatures: SignatureCluster[] = Object.entries(sigAgg)
    .map(([signature, v]) => ({
      signature,
      exemplar: v.exemplar,
      count: v.count,
      projects: [...v.projects].sort(),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN)

  return {
    window: { since: opts.since, until: opts.until },
    total_pipelines: total,
    failed,
    completed,
    fail_rate: total > 0 ? failed / total : 0,
    phases,
    top_signatures,
    avg_context_tokens: tokensN > 0 ? Math.round(tokensSum / tokensN) : null,
  }
}

export function renderStatsMarkdown(r: StatsReport): string {
  const lines: string[] = []
  lines.push(`# Pipeline Stats`)
  lines.push(``)
  if (r.window.since || r.window.until) {
    lines.push(`- **Window:** ${r.window.since ?? '-∞'} → ${r.window.until ?? 'now'}`)
  }
  lines.push(`- **Total:** ${r.total_pipelines} pipelines`)
  lines.push(`- **Fail rate:** ${(r.fail_rate * 100).toFixed(1)}% (${r.failed} failed / ${r.completed} done)`)
  if (r.avg_context_tokens !== null) {
    lines.push(`- **Avg context tokens:** ${r.avg_context_tokens}`)
  }
  lines.push(``)
  lines.push(`## Phases (failed-desc)`)
  lines.push(``)
  lines.push(`| Phase | Total | Failed | Done | Running | Fail% |`)
  lines.push(`|-------|-------|--------|------|---------|-------|`)
  for (const p of r.phases) {
    lines.push(
      `| \`${p.phase}\` | ${p.total} | ${p.failed} | ${p.completed} | ${p.running} | ${(p.fail_rate * 100).toFixed(1)}% |`,
    )
  }
  lines.push(``)
  lines.push(`## Top failure signatures`)
  lines.push(``)
  lines.push(`| # | Count | Projects | Exemplar |`)
  lines.push(`|---|-------|----------|----------|`)
  r.top_signatures.forEach((s, i) => {
    lines.push(`| ${i + 1} | ${s.count} | ${s.projects.join(', ')} | ${s.exemplar.replace(/\|/g, '\\|')} |`)
  })
  lines.push(``)
  return lines.join('\n')
}
