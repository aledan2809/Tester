/**
 * T-000 Day-3 — Lesson validator.
 *
 * Validates that each active lesson's `regression_test` passes. Currently
 * checks file existence; in Day-4 CI mode, spawns vitest on each regression
 * test with pass/fail accounting.
 *
 * Why: lessons are only useful if the detection/diagnosis logic is itself
 * regression-tested. `tester lessons validate` fails CI if any lesson has
 * regressed on its own fixtures — the ultimate "Tester tests itself" check.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Lesson } from './schema'

export interface ValidationResult {
  lesson_id: string
  title: string
  severity: Lesson['severity']
  regression_test?: string
  status: 'pass' | 'fail' | 'missing' | 'skipped'
  reason?: string
}

export interface ValidationSummary {
  total: number
  pass: number
  fail: number
  missing: number
  skipped: number
  results: ValidationResult[]
}

export function validateLessonFiles(lessons: Lesson[], repoRoot: string): ValidationSummary {
  const results: ValidationResult[] = []
  let pass = 0,
    fail = 0,
    missing = 0,
    skipped = 0

  for (const lesson of lessons) {
    if (lesson.status !== 'active') {
      results.push({
        lesson_id: lesson.id,
        title: lesson.title,
        severity: lesson.severity,
        regression_test: lesson.regression_test,
        status: 'skipped',
        reason: `lesson status=${lesson.status}`,
      })
      skipped++
      continue
    }

    if (!lesson.regression_test) {
      results.push({
        lesson_id: lesson.id,
        title: lesson.title,
        severity: lesson.severity,
        status: 'missing',
        reason: 'no regression_test declared in YAML',
      })
      missing++
      continue
    }

    const candidate = path.isAbsolute(lesson.regression_test)
      ? lesson.regression_test
      : path.join(repoRoot, lesson.regression_test)

    // Accept .spec.ts or .test.ts variants (ecosystem uses both)
    const candidates = [
      candidate,
      candidate.replace(/\.spec\.([jt]sx?)$/, '.test.$1'),
      candidate.replace(/\.test\.([jt]sx?)$/, '.spec.$1'),
    ]

    const found = candidates.find((c) => fs.existsSync(c))

    if (!found) {
      results.push({
        lesson_id: lesson.id,
        title: lesson.title,
        severity: lesson.severity,
        regression_test: lesson.regression_test,
        status: 'missing',
        reason: `file not found: ${lesson.regression_test}`,
      })
      missing++
      continue
    }

    results.push({
      lesson_id: lesson.id,
      title: lesson.title,
      severity: lesson.severity,
      regression_test: path.relative(repoRoot, found),
      status: 'pass',
    })
    pass++
  }

  return { total: results.length, pass, fail, missing, skipped, results }
}
