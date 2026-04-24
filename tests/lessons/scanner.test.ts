/**
 * T-000 Day-1 — scanner regression tests.
 *
 * The META-TEST gate from TODO_PERSISTENT Phase 0.4:
 *   "Seed broken procu-flows-audit.mjs with F2 ([href!=]), F8 (case-sensitive
 *    regex vs Tailwind uppercase), F10 (loose vendor picker). Run `tester
 *    lessons scan <file>` — MUST flag all 3 with L### matching corpus."
 *
 * This spec implements that gate as a Vitest suite.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { loadLessons } from '../../src/lessons/loader'
import { scanFile, scan } from '../../src/lessons/scanner'
import type { Lesson } from '../../src/lessons/schema'

const LESSONS_DIR = path.resolve(__dirname, '../../lessons')

let corpus: Lesson[]
beforeAll(() => {
  corpus = loadLessons(LESSONS_DIR).lessons
})

function writeFixture(content: string, ext = '.spec.ts'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-fixture-'))
  const file = path.join(dir, `broken-flows-audit${ext}`)
  fs.writeFileSync(file, content, 'utf8')
  return file
}

describe('scanner — META-TEST gate (F2 + F8 + F10 must all be detected)', () => {
  it('flags L-F2 for invalid CSS [href!=] selector', () => {
    const broken = `
      // Procu 2026-04-24 F2 defect: invalid CSS operator
      await page.evaluate(() => {
        const links = document.querySelectorAll('a[href!="/login"]')
        return links.length
      })
    `
    const file = writeFixture(broken)
    try {
      const matches = scanFile(file, corpus)
      const ids = matches.map((m) => m.lesson_id)
      expect(ids).toContain('L-F2')
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true })
    }
  })

  it('flags L-F8 for case-sensitive regex against innerText', () => {
    const broken = `
      // Procu 2026-04-24 F8 defect: case-sensitive regex fails on Tailwind uppercase
      const hasFormula = await page.evaluate(() => {
        return document.body.innerText.match(/Formula Data Source/)
      })
      expect(hasFormula).toBeTruthy()
    `
    const file = writeFixture(broken)
    try {
      const matches = scanFile(file, corpus)
      const ids = matches.map((m) => m.lesson_id)
      expect(ids).toContain('L-F8')
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true })
    }
  })

  it('flags L-F10 for unscoped text picker', () => {
    const broken = `
      // Procu 2026-04-24 F10 defect: loose vendor picker matches onboarding button
      await page.getByText(/Add vendor/).click()
    `
    const file = writeFixture(broken)
    try {
      const matches = scanFile(file, corpus)
      const ids = matches.map((m) => m.lesson_id)
      expect(ids).toContain('L-F10')
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true })
    }
  })

  it('META-GATE — a file containing all 3 defects flags all 3 lessons', () => {
    const broken = `
      // All 3 Procu 2026-04-24 harness defects in one file
      test('F2 + F8 + F10 regression fixture', async () => {
        const links = await page.evaluate(() =>
          document.querySelectorAll('a[href!="/login"]').length
        )
        const hasFormula = document.body.innerText.match(/Formula Data/)
        await page.getByText(/Add vendor/).click()
      })
    `
    const file = writeFixture(broken)
    try {
      const matches = scanFile(file, corpus)
      const uniqueIds = new Set(matches.map((m) => m.lesson_id))
      expect(uniqueIds.has('L-F2')).toBe(true)
      expect(uniqueIds.has('L-F8')).toBe(true)
      expect(uniqueIds.has('L-F10')).toBe(true)
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true })
    }
  })
})

describe('scanner — false-positive controls', () => {
  it('does NOT flag clean code as a defect', () => {
    const clean = `
      test('clean scoped selector', async () => {
        const links = await page.locator('[data-testid=nav]').getByText('Dashboard').click()
        const text = el.textContent.toLowerCase()
      })
    `
    const file = writeFixture(clean)
    try {
      const matches = scanFile(file, corpus)
      expect(matches).toEqual([])
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true })
    }
  })

  it('does NOT flag files outside test glob (e.g., plain .ts source)', () => {
    const broken = `
      // This pattern LOOKS like F2 but it's a utility, not a test.
      export function getAllLinks() {
        return document.querySelectorAll('a[href!="/login"]')
      }
    `
    const file = writeFixture(broken, '.ts')
    try {
      const matches = scanFile(file, corpus)
      const testRuleMatches = matches.filter(
        (m) => corpus.find((l) => l.id === m.lesson_id)?.detection.some((d) => d.type === 'regex_in_test_file'),
      )
      expect(testRuleMatches).toEqual([])
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true })
    }
  })
})

describe('scanner — directory walk', () => {
  it('scans a directory and aggregates matches across files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-walk-'))
    try {
      fs.writeFileSync(
        path.join(dir, 'a.spec.ts'),
        `await page.getByText(/Add vendor/).click()`,
        'utf8',
      )
      fs.writeFileSync(
        path.join(dir, 'b.spec.ts'),
        `document.querySelectorAll('a[href!="/x"]')`,
        'utf8',
      )
      fs.writeFileSync(path.join(dir, 'README.md'), 'should be ignored', 'utf8')

      const matches = scan(dir, corpus)
      const files = new Set(matches.map((m) => m.file))
      expect(files.size).toBe(2)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
