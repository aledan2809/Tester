/**
 * T-000 Day-3 — Prose lesson importer.
 *
 * Parses markdown from ~/.claude/.../memory/*.md or Master/knowledge/lessons-learned.md
 * and emits YAML skeletons. Does NOT auto-commit — user reviews each stub and
 * fills detection regex + diagnosis signatures before moving to lessons/.
 *
 * Heuristics:
 *   - Section headers like `### L42 — Title` or `## L42. Title` become candidates
 *   - Inline text with "### L### — " inferred as lesson boundary
 *   - Severity auto-mapped: "CRITICAL" → critical, "HIGH" → high, etc.
 *   - projects_hit extracted from patterns like "(eCabinet, Tutor)"
 *   - first_observed extracted from date patterns (2026-MM-DD)
 *
 * Day-4 augmentation: AI-assisted detection-regex extraction via AIRouter.
 */

import * as fs from 'node:fs'
import * as yaml from 'js-yaml'
import type { Lesson, LessonSeverity } from './schema'

export interface ImportedLesson {
  yaml: string
  proposed_id: string
  title: string
  source_file: string
  source_line: number
  needs_review: string[]
}

const HEADER_RE = /^#{2,4}\s*(L[-_]?\d+[A-Za-z0-9]*)\s*[—\-:.]\s*(.+?)\s*$/gm
const DATE_RE = /(20\d{2}-\d{2}-\d{2})/
const SEVERITY_WORD_RE = /\b(CRITICAL|HIGH|MEDIUM|LOW|INFO|critical|high|medium|low|info)\b/

function extractSeverity(body: string): LessonSeverity {
  const m = body.match(SEVERITY_WORD_RE)
  if (!m) return 'medium'
  const v = m[1].toLowerCase()
  if (['info', 'low', 'medium', 'high', 'critical'].includes(v)) return v as LessonSeverity
  return 'medium'
}

function extractProjects(body: string): string[] {
  const projects: string[] = []
  // Common naming patterns across Master registry: CamelCase or lowercased project names
  const KNOWN = [
    'procuchaingo2',
    'eCabinet',
    'PRO',
    'BlocHub',
    'TradeInvest',
    'Tutor',
    'SEAP',
    'ave-platform',
    'website-guru',
    'Tester',
    'Master',
    '4pro-client',
    '4pro-biz',
    '4pro-landing',
    '4uPDF',
    'MarketingAutomation',
    'AIRouter',
  ]
  for (const p of KNOWN) {
    const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    if (re.test(body) && !projects.includes(p)) projects.push(p)
  }
  return projects
}

function titleSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function normalizeId(rawId: string): string {
  const upper = rawId.toUpperCase()
  if (/^L[-_]\d/.test(upper)) return upper
  const digits = upper.replace(/[^0-9]/g, '')
  return digits ? `L-${digits.padStart(2, '0')}` : `L-${upper.replace(/^L/, '')}`
}

export function parseMarkdownForLessons(markdown: string, sourceFile: string): ImportedLesson[] {
  const results: ImportedLesson[] = []
  const lines = markdown.split('\n')

  const matches: Array<{ rawId: string; title: string; startLine: number }> = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#{2,4}\s*(L[-_]?\d+[A-Za-z0-9]*)\s*[—\-:.]\s*(.+?)\s*$/)
    if (m) {
      matches.push({ rawId: m[1], title: m[2], startLine: i })
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const { rawId, title, startLine } = matches[i]
    const endLine = i + 1 < matches.length ? matches[i + 1].startLine : Math.min(lines.length, startLine + 40)
    const body = lines.slice(startLine, endLine).join('\n')

    const proposed_id = normalizeId(rawId)
    const severity = extractSeverity(body)
    const projects = extractProjects(body)
    const dateM = body.match(DATE_RE)
    const first_observed = dateM ? dateM[1] : new Date().toISOString().slice(0, 10)

    const stub: Partial<Lesson> = {
      id: proposed_id,
      slug: titleSlug(title),
      title,
      first_observed,
      projects_hit: projects.length ? projects : [],
      contexts_hit: ['cc-session'],
      hit_count: 0,
      severity,
      tags: [],
      detection: [
        {
          type: 'regex_in_test_file',
          pattern: 'TODO_REPLACE_WITH_REAL_REGEX',
          message: `detection rule for "${title}" — fill in before activating`,
        },
      ],
      status: 'active',
    }

    const needs_review: string[] = [
      'detection.pattern — placeholder; replace with real regex',
    ]
    if (!projects.length) needs_review.push('projects_hit — parser found none; add manually if relevant')
    if (!dateM) needs_review.push('first_observed — defaulted to today; adjust if known')
    needs_review.push('diagnosis block missing — add symptom_signatures + suggested_remediation for post-failure use')
    needs_review.push('regression_test — point at a spec that proves detection works')

    const yamlStr = yaml.dump(stub, { lineWidth: 100, noRefs: true })

    results.push({
      yaml: yamlStr,
      proposed_id,
      title,
      source_file: sourceFile,
      source_line: startLine + 1,
      needs_review,
    })
  }

  return results
}

export function importFromFile(filePath: string): ImportedLesson[] {
  const content = fs.readFileSync(filePath, 'utf8')
  return parseMarkdownForLessons(content, filePath)
}
