// lessons:skip-all
/**
 * T-000 Day-3 — validator regression tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { validateLessonFiles } from '../../src/lessons/validator'
import { loadLessons } from '../../src/lessons/loader'
import type { Lesson } from '../../src/lessons/schema'

const REPO = path.resolve(__dirname, '../..')
const LESSONS_DIR = path.join(REPO, 'lessons')

describe('validator', () => {
  it('all 6 active seed lessons have their regression_test file present', () => {
    const { lessons } = loadLessons(LESSONS_DIR)
    const summary = validateLessonFiles(lessons, REPO)
    expect(summary.total).toBe(lessons.length)
    expect(summary.pass).toBe(lessons.length)
    expect(summary.missing).toBe(0)
    expect(summary.fail).toBe(0)
  })

  it('marks missing regression_test file as "missing"', () => {
    const fake: Lesson[] = [
      {
        id: 'L-MISSING',
        slug: 'x',
        title: 'x',
        first_observed: '2026-04-24',
        projects_hit: [],
        contexts_hit: ['cc-session'],
        hit_count: 0,
        severity: 'low',
        tags: [],
        detection: [{ type: 'regex_in_test_file', pattern: 'x', message: 'x' }],
        regression_test: 'tests/lessons/does-not-exist.test.ts',
        status: 'active',
      },
    ]
    const summary = validateLessonFiles(fake, REPO)
    expect(summary.missing).toBe(1)
    expect(summary.results[0].status).toBe('missing')
  })

  it('marks deprecated lessons as "skipped"', () => {
    const fake: Lesson[] = [
      {
        id: 'L-DEP',
        slug: 'x',
        title: 'x',
        first_observed: '2026-04-24',
        projects_hit: [],
        contexts_hit: ['cc-session'],
        hit_count: 0,
        severity: 'low',
        tags: [],
        detection: [{ type: 'regex_in_test_file', pattern: 'x', message: 'x' }],
        regression_test: 'tests/lessons/whatever.test.ts',
        status: 'deprecated',
      },
    ]
    const summary = validateLessonFiles(fake, REPO)
    expect(summary.skipped).toBe(1)
    expect(summary.results[0].status).toBe('skipped')
  })

  it('accepts .spec.ts ↔ .test.ts variant as equivalent', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'val-test-'))
    try {
      const testsDir = path.join(tmp, 'tests')
      fs.mkdirSync(testsDir)
      fs.writeFileSync(path.join(testsDir, 'foo.test.ts'), '// real file', 'utf8')

      const lessons: Lesson[] = [
        {
          id: 'L-VAR',
          slug: 'v',
          title: 'v',
          first_observed: '2026-04-24',
          projects_hit: [],
          contexts_hit: ['cc-session'],
          hit_count: 0,
          severity: 'low',
          tags: [],
          detection: [{ type: 'regex_in_test_file', pattern: 'x', message: 'x' }],
          regression_test: 'tests/foo.spec.ts',
          status: 'active',
        },
      ]
      const summary = validateLessonFiles(lessons, tmp)
      expect(summary.pass).toBe(1)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
