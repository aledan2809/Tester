/**
 * T-000 — Lesson scanner.
 *
 * Given a corpus of Lessons and a target file (or directory), runs each
 * lesson's detection rules against the file content and returns matches
 * with file:line:column evidence. Day-1 supports `regex_in_test_file` and
 * `regex_in_source_file` (same engine, different file_glob defaults).
 * `ast_pattern` lands in T-003 (linter) post-Day-4.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Lesson, ScanMatch } from './schema'

const DEFAULT_TEST_GLOBS = [/\.spec\.[jt]sx?$/, /\.test\.[jt]sx?$/, /^\/tmp\/.*\.(m?js|[jt]sx?)$/]
const DEFAULT_SOURCE_GLOBS = [/\.[jt]sx?$/]

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  '.git',
  'coverage',
  '.turbo',
  '.vercel',
  'playwright-report',
  'test-results',
])

function fileMatchesGlob(file: string, pattern: string | undefined, type: 'test' | 'source'): boolean {
  if (pattern) {
    try {
      return new RegExp(pattern).test(file)
    } catch {
      return false
    }
  }
  const defaults = type === 'test' ? DEFAULT_TEST_GLOBS : DEFAULT_SOURCE_GLOBS
  return defaults.some((re) => re.test(file))
}

function collectFiles(target: string): string[] {
  if (!fs.existsSync(target)) return []
  const stat = fs.statSync(target)
  if (stat.isFile()) return [path.resolve(target)]

  const results: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        walk(path.join(dir, entry.name))
      } else if (entry.isFile()) {
        if (/\.(m?js|[jt]sx?)$/.test(entry.name)) {
          results.push(path.join(dir, entry.name))
        }
      }
    }
  }
  walk(path.resolve(target))
  return results
}

function lineColumnOf(content: string, index: number): { line: number; column: number } {
  let line = 1
  let lastNewline = -1
  for (let i = 0; i < index; i++) {
    if (content.charCodeAt(i) === 10) {
      line++
      lastNewline = i
    }
  }
  return { line, column: index - lastNewline }
}

export function scanFile(file: string, lessons: Lesson[]): ScanMatch[] {
  const content = fs.readFileSync(file, 'utf8')
  const matches: ScanMatch[] = []

  for (const lesson of lessons) {
    if (lesson.status !== 'active') continue
    for (const rule of lesson.detection) {
      const wantsTest = rule.type === 'regex_in_test_file'
      const wantsSource = rule.type === 'regex_in_source_file'
      if (!wantsTest && !wantsSource) continue

      if (!fileMatchesGlob(file, rule.file_glob, wantsTest ? 'test' : 'source')) continue

      let re: RegExp
      try {
        re = new RegExp(rule.pattern, 'gm')
      } catch {
        continue
      }

      let m: RegExpExecArray | null
      while ((m = re.exec(content)) !== null) {
        const { line, column } = lineColumnOf(content, m.index)
        matches.push({
          lesson_id: lesson.id,
          lesson_title: lesson.title,
          file,
          line,
          column,
          matched_text: m[0].slice(0, 120),
          detection_message: rule.message,
          severity: lesson.severity,
          auto_fixable: !!lesson.prevention?.auto_fix,
        })
        if (m.index === re.lastIndex) re.lastIndex++
      }
    }
  }
  return matches
}

export function scan(target: string, lessons: Lesson[]): ScanMatch[] {
  const files = collectFiles(target)
  const all: ScanMatch[] = []
  for (const f of files) {
    try {
      all.push(...scanFile(f, lessons))
    } catch {
      continue
    }
  }
  return all
}
