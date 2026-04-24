// lessons:skip-all
/**
 * T-003 — AST linter regression tests.
 * Verifies that the `require-domain-admin-pair` checker closes the L-42
 * regex false-positive (file containing BOTH requireAdmin + requireDomainAdmin
 * should NOT be flagged).
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { loadLessons } from '../../src/lessons/loader'
import { scanFile } from '../../src/lessons/scanner'
import { refineMatches, buildAstChecksFromLessons, runSingleCheck, AST_CHECK_IDS } from '../../src/lessons/ast-linter'
import type { Lesson, ScanMatch } from '../../src/lessons/schema'

const LESSONS_DIR = path.resolve(__dirname, '../../lessons')

function writeFixture(content: string, relPath = 'app/api/domain/route.ts'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-'))
  const full = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf8')
  return full
}

describe('ast-linter — registered checkers', () => {
  it('exports expected check ids', () => {
    expect(AST_CHECK_IDS).toContain('require-domain-admin-pair')
  })
})

describe('require-domain-admin-pair — closes L-42 regex false-positive', () => {
  let corpus: Lesson[]
  let astMap: Record<string, string | undefined>

  beforeAll(() => {
    corpus = loadLessons(LESSONS_DIR).lessons
    astMap = buildAstChecksFromLessons(corpus as Array<{ id: string; detection: Array<{ ast_check?: string }> }>)
  })

  it('regex match on route file WITHOUT requireDomainAdmin → kept after refinement', () => {
    const content = `export async function POST(req: Request, { params }: { params: { domainId: string } }) {
  const { domainId } = params
  await requireAdmin()
  return Response.json({ ok: true, domainId })
}`
    const file = writeFixture(content)
    try {
      const matches = scanFile(file, corpus)
      const l42 = matches.filter((m) => m.lesson_id === 'L-42')
      expect(l42.length).toBeGreaterThan(0)
      const refined = refineMatches(matches, { astChecksPerLesson: astMap })
      const l42Refined = refined.filter((m) => m.lesson_id === 'L-42')
      expect(l42Refined.length).toBeGreaterThan(0) // still flagged — no pair satisfied
    } finally {
      fs.rmSync(path.dirname(path.dirname(path.dirname(file))), { recursive: true, force: true })
    }
  })

  it('regex match on route file WITH requireDomainAdmin → discarded after refinement', () => {
    const content = `export async function POST(req: Request, { params }: { params: { domainId: string } }) {
  const { domainId } = params
  await requireAdmin()
  await requireDomainAdmin(session, domainId)
  return Response.json({ ok: true, domainId })
}`
    const file = writeFixture(content)
    try {
      const matches = scanFile(file, corpus)
      const l42 = matches.filter((m) => m.lesson_id === 'L-42')
      expect(l42.length).toBeGreaterThan(0) // regex alone still matches
      const refined = refineMatches(matches, { astChecksPerLesson: astMap })
      const l42Refined = refined.filter((m) => m.lesson_id === 'L-42')
      expect(l42Refined.length).toBe(0) // AST refinement dropped the false positive
    } finally {
      fs.rmSync(path.dirname(path.dirname(path.dirname(file))), { recursive: true, force: true })
    }
  })

  it('runSingleCheck on file containing requireDomainAdmin returns keep=false', () => {
    const content = `await requireAdmin()
const x = { domainId: "y" }
await requireDomainAdmin(session, x.domainId)`
    const file = writeFixture(content)
    try {
      const fakeMatch: ScanMatch = {
        lesson_id: 'L-42',
        lesson_title: 't',
        file,
        line: 1,
        column: 1,
        matched_text: 'requireAdmin()',
        detection_message: 'm',
        severity: 'high',
        auto_fixable: false,
      }
      const v = runSingleCheck('require-domain-admin-pair', file, fakeMatch)
      expect(v.keep).toBe(false)
      expect(v.note).toMatch(/already calls requireDomainAdmin/)
    } finally {
      fs.rmSync(path.dirname(path.dirname(path.dirname(file))), { recursive: true, force: true })
    }
  })

  it('runSingleCheck on file WITHOUT requireDomainAdmin returns keep=true', () => {
    const content = `await requireAdmin()
const x = { domainId: "y" }
return Response.json(x)`
    const file = writeFixture(content)
    try {
      const fakeMatch: ScanMatch = {
        lesson_id: 'L-42',
        lesson_title: 't',
        file,
        line: 1,
        column: 1,
        matched_text: 'requireAdmin()',
        detection_message: 'm',
        severity: 'high',
        auto_fixable: false,
      }
      const v = runSingleCheck('require-domain-admin-pair', file, fakeMatch)
      expect(v.keep).toBe(true)
    } finally {
      fs.rmSync(path.dirname(path.dirname(path.dirname(file))), { recursive: true, force: true })
    }
  })

  it('unknown ast_check id → fail-open (keep match, warn to stderr)', () => {
    const fakeMatch: ScanMatch = {
      lesson_id: 'L-UNKNOWN',
      lesson_title: 't',
      file: '/tmp/fake.ts',
      line: 1,
      column: 1,
      matched_text: 'x',
      detection_message: 'm',
      severity: 'low',
      auto_fixable: false,
    }
    // runSingleCheck with an unknown id returns keep=true + note
    const v = runSingleCheck('totally-made-up-check-id', '/tmp/nope', fakeMatch)
    expect(v.keep).toBe(true)
    expect(v.note).toMatch(/unknown checker/)
  })

  it('buildAstChecksFromLessons extracts ast_check from detection rules', () => {
    const synthetic: Array<{ id: string; detection: Array<{ ast_check?: string }> }> = [
      { id: 'L-X', detection: [{ ast_check: 'require-domain-admin-pair' }] },
      { id: 'L-Y', detection: [{}] }, // no ast_check
    ]
    const map = buildAstChecksFromLessons(synthetic)
    expect(map['L-X']).toBe('require-domain-admin-pair')
    expect(map['L-Y']).toBeUndefined()
  })
})

// helper import
import { beforeAll } from 'vitest'
