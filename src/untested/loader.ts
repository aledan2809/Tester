/**
 * T-006 — `tester untested` loader. Parses the four sources described in
 * schema.ts and returns a ranked list. Pure functions; no I/O helpers other
 * than `fs.readFileSync` / `fs.existsSync` / `fs.readdirSync` for target
 * project walks.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadCoverageForProject } from '../coverage/loader'
import type { CoverageMatrix } from '../coverage/schema'
import type {
  UntestedItem,
  UntestedReport,
  UntestedSeverity,
  UntestedSource,
} from './schema'
import {
  filesChangedSince,
  blameFile,
  attributeByText,
  wasChangedSince,
} from './git'
import { execFileSync } from 'node:child_process'

const SEVERITY_ORDER: Record<UntestedSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
}

const SOURCE_ORDER: Record<UntestedSource, number> = {
  coverage: 3,
  audit_gaps: 2,
  dev_status: 1,
  reports: 0,
}

function normalizeSeverity(raw: string | undefined): UntestedSeverity {
  const s = (raw || '').toLowerCase().trim()
  if (s === 'critical' || s === 'crit') return 'critical'
  if (s === 'high' || s === 'p0' || s === 'blocker') return 'high'
  if (s === 'medium' || s === 'med' || s === 'p1') return 'medium'
  if (s === 'low' || s === 'p2') return 'low'
  return 'info'
}

export function loadCoverageUntested(projectRoot: string): UntestedItem[] {
  const items: UntestedItem[] = []
  const loaded = loadCoverageForProject(projectRoot)
  for (const entry of loaded) {
    const result = entry.result
    if ('message' in result && !('feature' in result)) continue
    const matrix = result as CoverageMatrix
    for (const sc of matrix.scenarios) {
      if (sc.status !== 'missing') continue
      items.push({
        id: `COV:${matrix.feature}:${sc.id}`,
        title: sc.name,
        source: 'coverage',
        severity: normalizeSeverity(sc.severity),
        area: sc.category || matrix.feature,
        evidenceFile: entry.file,
        extra: sc.notes ? { notes: sc.notes } : undefined,
      })
    }
  }
  return items
}

/**
 * Parse AUDIT_GAPS.md markdown tables. Accepts rows in the canonical
 * `| Gap ID | Severity | Area | Description | Status | Resolution |` shape.
 * Rows with Status containing "open" (case-insensitive) are surfaced;
 * "eliminated"/"closed"/"resolved" are skipped. Placeholder `-` rows are
 * skipped as well (scaffolded files often include a ` | — | — | ... ` row).
 */
export function parseAuditGapsMarkdown(content: string, file: string): UntestedItem[] {
  const items: UntestedItem[] = []
  const lines = content.split(/\r?\n/)
  // Find header row → locate columns
  let headerIdx = -1
  let cols: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.startsWith('|')) continue
    const cells = splitMarkdownRow(line)
    const lower = cells.map((c) => c.toLowerCase())
    if (lower.includes('gap id') || lower.includes('id')) {
      if (lower.includes('status')) {
        headerIdx = i
        cols = lower
        break
      }
    }
  }
  if (headerIdx < 0) return items
  const idxId = cols.findIndex((c) => c === 'gap id' || c === 'id')
  const idxSev = cols.findIndex((c) => c === 'severity')
  const idxArea = cols.findIndex((c) => c === 'area' || c === 'category')
  const idxDesc = cols.findIndex((c) => c === 'description' || c === 'desc' || c === 'summary')
  const idxStatus = cols.findIndex((c) => c === 'status')

  // Skip separator row
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i]
    if (!line.startsWith('|')) break // first non-pipe line ends the table
    const cells = splitMarkdownRow(line)
    if (cells.length < cols.length) continue
    const id = (cells[idxId] || '').trim()
    if (!id || id === '—' || id === '-') continue
    const statusRaw = (idxStatus >= 0 ? cells[idxStatus] : '').toLowerCase()
    if (!/open/.test(statusRaw)) continue
    items.push({
      id,
      title: idxDesc >= 0 ? cells[idxDesc].trim() : id,
      source: 'audit_gaps',
      severity: normalizeSeverity(idxSev >= 0 ? cells[idxSev] : undefined),
      area: idxArea >= 0 ? cells[idxArea].trim() || undefined : undefined,
      evidenceFile: file,
    })
  }
  return items
}

function splitMarkdownRow(line: string): string[] {
  // Strip leading + trailing pipe, then split.
  const trimmed = line.replace(/^\|/, '').replace(/\|\s*$/, '')
  return trimmed.split('|').map((c) => c.trim())
}

/**
 * Parse DEVELOPMENT_STATUS.md. Finds first heading matching `## TODO` or
 * `### TODO` (case-insensitive, any trailing text like "(next sessions)").
 * Captures `- [ ]` items until next heading at the same or shallower depth.
 * Ignores `- [x]` completed items.
 */
export function parseDevStatusTodo(content: string, file: string): UntestedItem[] {
  const items: UntestedItem[] = []
  const lines = content.split(/\r?\n/)
  let inTodo = false
  let todoDepth = 0
  let counter = 0
  for (const line of lines) {
    const headingMatch = line.match(/^(#+)\s+(.+?)\s*$/)
    if (headingMatch) {
      const depth = headingMatch[1].length
      const title = headingMatch[2].toLowerCase()
      if (!inTodo) {
        if (/^todo\b/.test(title) || /^\(?todo\b/i.test(title)) {
          inTodo = true
          todoDepth = depth
          continue
        }
      } else {
        if (depth <= todoDepth) {
          inTodo = false
        }
      }
    }
    if (!inTodo) continue
    const m = line.match(/^\s*[-*]\s*\[ \]\s*(.+?)\s*$/)
    if (!m) continue
    counter++
    const raw = m[1]
    const idMatch = raw.match(/^\*\*(T-[A-Z0-9-]+|[A-Z]{1,4}-\d{3,4})\*\*/)
    const firstWord = idMatch ? idMatch[1] : null
    const id = firstWord || `DS-${String(counter).padStart(3, '0')}`
    const severity = detectInlineSeverity(raw)
    items.push({
      id,
      title: raw.replace(/\*\*/g, '').trim(),
      source: 'dev_status',
      severity,
      evidenceFile: file,
    })
  }
  return items
}

function detectInlineSeverity(text: string): UntestedSeverity {
  const low = text.toLowerCase()
  if (/\bp0\b|\bcritical\b|\bblocker\b/.test(low)) return 'high'
  if (/\bp1\b|\bhigh\b/.test(low)) return 'medium'
  if (/\bp2\b|\bmedium\b/.test(low)) return 'low'
  return 'info'
}

/**
 * Best-effort: walk `<project>/Reports/` for *.json files and surface any
 * array-valued `findings` / `issues` / `gaps` with status !== resolved. The
 * shape is tolerant: we only extract items that have an id + severity.
 */
export function loadReportsUntested(projectRoot: string): UntestedItem[] {
  const items: UntestedItem[] = []
  const dir = path.join(projectRoot, 'Reports')
  if (!fs.existsSync(dir)) return items
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile() || !/\.json$/i.test(entry.name)) continue
    const full = path.join(dir, entry.name)
    let parsed: unknown
    try {
      parsed = JSON.parse(fs.readFileSync(full, 'utf8'))
    } catch {
      continue
    }
    if (!parsed || typeof parsed !== 'object') continue
    const record = parsed as Record<string, unknown>
    for (const key of ['findings', 'issues', 'gaps']) {
      const arr = record[key]
      if (!Array.isArray(arr)) continue
      for (const raw of arr) {
        if (!raw || typeof raw !== 'object') continue
        const r = raw as Record<string, unknown>
        const id = typeof r.id === 'string' ? r.id : undefined
        if (!id) continue
        const status = typeof r.status === 'string' ? r.status.toLowerCase() : ''
        if (/(resolved|closed|eliminated|done)/.test(status)) continue
        items.push({
          id: `${entry.name}:${id}`,
          title: typeof r.title === 'string' ? r.title : typeof r.description === 'string' ? r.description : id,
          source: 'reports',
          severity: normalizeSeverity(typeof r.severity === 'string' ? r.severity : undefined),
          area: typeof r.area === 'string' ? r.area : typeof r.category === 'string' ? r.category : undefined,
          evidenceFile: full,
        })
      }
    }
  }
  return items
}

export function loadAuditGapsUntested(projectRoot: string): UntestedItem[] {
  const file = path.join(projectRoot, 'AUDIT_GAPS.md')
  if (!fs.existsSync(file)) return []
  const content = fs.readFileSync(file, 'utf8')
  return parseAuditGapsMarkdown(content, file)
}

export function loadDevStatusUntested(projectRoot: string): UntestedItem[] {
  const file = path.join(projectRoot, 'DEVELOPMENT_STATUS.md')
  if (!fs.existsSync(file)) return []
  const content = fs.readFileSync(file, 'utf8')
  return parseDevStatusTodo(content, file)
}

export function rankItems(items: UntestedItem[]): UntestedItem[] {
  return [...items].sort((a, b) => {
    const sev = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]
    if (sev !== 0) return sev
    const src = SOURCE_ORDER[b.source] - SOURCE_ORDER[a.source]
    if (src !== 0) return src
    return a.id.localeCompare(b.id)
  })
}

export interface BuildReportOptions {
  sources?: UntestedSource[]
  /** When set, only return items whose evidence file OR first-introduced line changed since this sha. */
  since?: string
  /** When true + since is set, attach git attribution to each item (author, sha, date, line). */
  attribute?: boolean
}

const DEFAULT_SOURCES: UntestedSource[] = ['coverage', 'audit_gaps', 'dev_status', 'reports']

export function buildUntestedReport(
  projectRoot: string,
  opts: BuildReportOptions = {},
): UntestedReport {
  const sources = opts.sources && opts.sources.length > 0 ? opts.sources : DEFAULT_SOURCES
  const all: UntestedItem[] = []
  if (sources.includes('coverage')) all.push(...loadCoverageUntested(projectRoot))
  if (sources.includes('audit_gaps')) all.push(...loadAuditGapsUntested(projectRoot))
  if (sources.includes('dev_status')) all.push(...loadDevStatusUntested(projectRoot))
  if (sources.includes('reports')) all.push(...loadReportsUntested(projectRoot))

  let filtered = all
  let sinceError: string | undefined
  let blameUsed = false
  if (opts.since) {
    const changed = filesChangedSince(projectRoot, opts.since)
    if (!changed.ok) {
      sinceError = changed.error
    } else {
      const fileChangedCache: Record<string, boolean> = {}
      filtered = []
      const blameCache: Record<string, ReturnType<typeof blameFile>> = {}
      for (const item of all) {
        const abs = item.evidenceFile
        if (fileChangedCache[abs] === undefined) {
          fileChangedCache[abs] = wasChangedSince(changed, abs)
        }
        if (!fileChangedCache[abs]) continue // evidence file not touched since sha
        // If coverage / reports — whole-file granularity is fine.
        if (item.source === 'coverage' || item.source === 'reports') {
          filtered.push(item)
          continue
        }
        // For AUDIT_GAPS + DEV_STATUS, do row-level attribution via blame.
        if (!blameCache[abs]) {
          blameCache[abs] = blameFile(projectRoot, abs)
          blameUsed = true
        }
        const attribution =
          attributeByText(blameCache[abs], item.id) ||
          attributeByText(blameCache[abs], item.title.slice(0, 40))
        if (!attribution) {
          filtered.push(item)
          continue
        }
        const isNewer = isCommitAfter(projectRoot, attribution.sha, opts.since)
        if (!isNewer) continue
        const withAttribution: UntestedItem = {
          ...item,
          extra: {
            ...(item.extra || {}),
            git_sha: attribution.sha,
            git_author: attribution.author,
            git_date: attribution.date,
            git_line: String(attribution.line),
          },
        }
        filtered.push(opts.attribute ? withAttribution : item)
      }
    }
  }

  const ranked = rankItems(filtered)
  const by_source: Record<UntestedSource, number> = { coverage: 0, audit_gaps: 0, dev_status: 0, reports: 0 }
  const by_severity: Record<UntestedSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  }
  for (const it of ranked) {
    by_source[it.source]++
    by_severity[it.severity]++
  }
  return {
    project: path.basename(projectRoot),
    projectRoot,
    counts: {
      total: ranked.length,
      by_source,
      by_severity,
    },
    items: ranked,
    since: opts.since,
    since_error: sinceError,
    blame_used: blameUsed,
  }
}

/**
 * Returns true if `candidate` is a descendant of `ancestor` (i.e. `candidate`
 * was committed after `ancestor`). Uses `git merge-base --is-ancestor`.
 */
function isCommitAfter(projectRoot: string, candidate: string, ancestor: string): boolean {
  try {
    execFileSync(
      'git',
      ['-C', projectRoot, 'merge-base', '--is-ancestor', ancestor, candidate],
      { stdio: ['ignore', 'ignore', 'ignore'] },
    )
    return candidate !== ancestor
  } catch {
    return false
  }
}
