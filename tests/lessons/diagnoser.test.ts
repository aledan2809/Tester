// lessons:skip-all
/**
 * T-000 Day-2 — diagnoser regression tests.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import * as path from 'node:path'
import { loadLessons } from '../../src/lessons/loader'
import { diagnose } from '../../src/lessons/diagnoser'
import type { Lesson } from '../../src/lessons/schema'

const LESSONS_DIR = path.resolve(__dirname, '../../lessons')
let corpus: Lesson[]

beforeAll(() => {
  corpus = loadLessons(LESSONS_DIR).lessons
})

describe('diagnoser — symptom signature matching', () => {
  it('matches L-F2 from a "is not a valid selector" error', () => {
    const log = `
      Test failed: page.evaluate
        Error: Failed to execute 'querySelector' on 'Document':
          'a[href!="/login"]' is not a valid selector.
        at <anonymous>
    `
    const matches = diagnose(log, corpus)
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0].lesson_id).toBe('L-F2')
    expect(matches[0].confidence).toBeGreaterThan(0)
    expect(matches[0].remediation).toMatch(/rewrite.*selector|:not\(/i)
  })

  it('matches L-F8 from an innerText assertion failure + uppercase class in DOM', () => {
    const log = `
      expect(hasFormula).toBeTruthy() // innerText.match(Formula Data Source) = false
      DOM snippet: <button class="uppercase font-bold">FORMULA DATA SOURCE</button>
    `
    const matches = diagnose(log, corpus)
    expect(matches.map((m) => m.lesson_id)).toContain('L-F8')
  })

  it('matches L-F10 from Playwright strict mode violation', () => {
    const log = `
      Error: strict mode violation: locator('text=/Add vendor/') resolved to 3 elements:
        1) <button>Add vendor</button>
        2) <a>Add vendor guide</a> (in onboarding banner)
        3) <span>Add vendor help</span> (tooltip)
    `
    const matches = diagnose(log, corpus)
    expect(matches.map((m) => m.lesson_id)).toContain('L-F10')
  })

  it('returns empty on unrelated failure log', () => {
    const log = `Error: ECONNREFUSED 127.0.0.1:3000 — service not running`
    const matches = diagnose(log, corpus)
    expect(matches).toEqual([])
  })

  it('respects topN parameter', () => {
    const log = `
      'a[href!="/x"]' is not a valid selector.
      innerText.match(Formula Data) = false
      strict mode violation: resolved to 5 elements
      class="uppercase text-sm"
      text-transform: uppercase
    `
    expect(diagnose(log, corpus, 1).length).toBeLessThanOrEqual(1)
    expect(diagnose(log, corpus, 2).length).toBeLessThanOrEqual(2)
    expect(diagnose(log, corpus, 10).length).toBeGreaterThanOrEqual(1)
  })

  it('sorts matches by confidence descending', () => {
    const log = `
      'a[href!="/x"]' is not a valid selector.
      class="uppercase"
      innerText.match(Formula Data Source) = false
      strict mode violation: resolved to 3 elements
    `
    const matches = diagnose(log, corpus, 5)
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].confidence).toBeGreaterThanOrEqual(matches[i].confidence)
    }
  })

  it('skips lessons without diagnosis block', () => {
    const fakeCorpus: Lesson[] = [
      {
        id: 'L-NODIAG',
        slug: 'no-diagnosis',
        title: 'no diagnosis block',
        first_observed: '2026-04-24',
        projects_hit: [],
        contexts_hit: ['cc-session'],
        hit_count: 0,
        severity: 'low',
        tags: [],
        detection: [{ type: 'regex_in_test_file', pattern: 'foo', message: 'm' }],
        status: 'active',
      },
    ]
    expect(diagnose('anything', fakeCorpus)).toEqual([])
  })
})
