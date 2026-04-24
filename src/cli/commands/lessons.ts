/**
 * T-000 Day-1 — `tester lessons <action>` CLI handler.
 *
 * Day-1 supports two actions:
 *   - list         : enumerate corpus (optional --severity filter)
 *   - scan <path>  : run detection regexes, report matches
 *
 * Day-2 will add: diagnose, validate, stats, import, learn.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadLessons, findLessonsDir } from '../../lessons/loader'
import { scan } from '../../lessons/scanner'
import type { Lesson, LessonSeverity, ScanMatch } from '../../lessons/schema'

const fsExistsSync = fs.existsSync

interface ListOptions {
  severity?: string
  tags?: string
  json?: boolean
  dir?: string
}

interface ScanOptions {
  json?: boolean
  dir?: string
  failOnMatch?: boolean
}

const SEVERITY_ORDER: Record<LessonSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

const VALID_SEVERITIES = new Set<string>(['info', 'low', 'medium', 'high', 'critical'])

function validateSeverityFlag(severity: string | undefined): void {
  if (severity && !VALID_SEVERITIES.has(severity)) {
    process.stderr.write(
      `[lessons] ERROR: --severity must be one of info|low|medium|high|critical, got: ${severity}\n`,
    )
    process.exit(2)
  }
}

function resolveCorpus(override?: string): { lessons: Lesson[]; dir: string; errors: number } {
  const dir = override ? path.resolve(override) : findLessonsDir()
  const result = loadLessons(dir)
  if (result.errors.length) {
    for (const err of result.errors) {
      process.stderr.write(`[lessons] WARN: ${err.file}: ${err.message}\n`)
    }
  }
  return { lessons: result.lessons, dir, errors: result.errors.length }
}

export async function lessonsList(opts: ListOptions): Promise<void> {
  validateSeverityFlag(opts.severity)
  const { lessons, dir } = resolveCorpus(opts.dir)

  const filterTags = opts.tags
    ? new Set(opts.tags.split(',').map((t) => t.trim()).filter(Boolean))
    : null

  const filtered = lessons.filter((l) => {
    if (opts.severity && l.severity !== opts.severity) return false
    if (filterTags) {
      if (!l.tags.some((t) => filterTags.has(t))) return false
    }
    return true
  })

  filtered.sort((a, b) => {
    const ord = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]
    if (ord !== 0) return ord
    return a.id.localeCompare(b.id)
  })

  if (opts.json) {
    process.stdout.write(JSON.stringify({ corpus: dir, count: filtered.length, lessons: filtered }, null, 2) + '\n')
    return
  }

  process.stdout.write(`Corpus: ${dir}\n`)
  process.stdout.write(`Total: ${filtered.length} active lesson(s)\n\n`)

  for (const l of filtered) {
    const badge = `[${l.severity.toUpperCase()}]`
    process.stdout.write(`${l.id.padEnd(8)} ${badge.padEnd(12)} ${l.title}\n`)
    process.stdout.write(`         tags: ${l.tags.join(', ') || '(none)'}\n`)
    process.stdout.write(`         projects: ${l.projects_hit.join(', ') || '(none)'} | hit_count: ${l.hit_count} | status: ${l.status}\n`)
    process.stdout.write(`         detection rules: ${l.detection.length}\n`)
    if (l.regression_test) {
      process.stdout.write(`         regression: ${l.regression_test}\n`)
    }
    process.stdout.write('\n')
  }
}

export async function lessonsScan(target: string, opts: ScanOptions): Promise<void> {
  const { lessons, dir } = resolveCorpus(opts.dir)

  if (lessons.length === 0) {
    process.stderr.write(`[lessons] no lessons loaded from ${dir}\n`)
    process.exit(2)
  }

  const resolvedTarget = path.resolve(target)
  if (!fsExistsSync(resolvedTarget)) {
    process.stderr.write(`[lessons] ERROR: scan target does not exist: ${resolvedTarget}\n`)
    process.exit(2)
  }
  const matches = scan(resolvedTarget, lessons)

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          corpus: dir,
          target: resolvedTarget,
          lessons_loaded: lessons.length,
          matches_count: matches.length,
          matches,
        },
        null,
        2,
      ) + '\n',
    )
  } else {
    process.stdout.write(`Corpus: ${dir} (${lessons.length} lessons)\n`)
    process.stdout.write(`Target: ${resolvedTarget}\n\n`)

    if (matches.length === 0) {
      process.stdout.write('No matches. ✓\n')
    } else {
      process.stdout.write(`${matches.length} match(es):\n\n`)
      const byFile = new Map<string, ScanMatch[]>()
      for (const m of matches) {
        const arr = byFile.get(m.file) || []
        arr.push(m)
        byFile.set(m.file, arr)
      }
      for (const [file, fileMatches] of byFile) {
        process.stdout.write(`${file}\n`)
        for (const m of fileMatches) {
          const badge = `[${m.severity.toUpperCase()}]`
          process.stdout.write(`  ${m.line}:${m.column}  ${badge.padEnd(11)} ${m.lesson_id} — ${m.lesson_title}\n`)
          process.stdout.write(`                         ${m.detection_message}\n`)
          process.stdout.write(`                         matched: ${m.matched_text.replace(/\n/g, '\\n').slice(0, 100)}\n`)
        }
        process.stdout.write('\n')
      }
    }
  }

  if (opts.failOnMatch !== false && matches.length > 0) {
    process.exit(1)
  }
}
