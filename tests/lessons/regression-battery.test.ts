// lessons:skip-all
/**
 * T-000 Day-3 — Regression battery.
 *
 * One `describe` block per lesson. Each asserts:
 *   1. Positive fixture: detection fires on intentional defect
 *   2. Negative fixture: clean code yields zero matches
 *   3. Diagnose: synthetic failure log returns this lesson as top match
 *
 * This file is the authoritative regression coverage for `tester lessons
 * validate`. Each lesson's YAML `regression_test` field points here.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { loadLessons } from '../../src/lessons/loader'
import { scanFile } from '../../src/lessons/scanner'
import { diagnose } from '../../src/lessons/diagnoser'
import type { Lesson } from '../../src/lessons/schema'

const LESSONS_DIR = path.resolve(__dirname, '../../lessons')
let corpus: Lesson[]

beforeAll(() => {
  corpus = loadLessons(LESSONS_DIR).lessons
})

function fixture(content: string, ext = '.spec.ts'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-regr-'))
  const file = path.join(dir, `f${ext}`)
  fs.writeFileSync(file, content, 'utf8')
  return file
}

function cleanup(file: string) {
  fs.rmSync(path.dirname(file), { recursive: true, force: true })
}

describe('regression battery — L-F2 (invalid CSS != operator)', () => {
  it('detects [href!=value] in test file', () => {
    const f = fixture(`document.querySelectorAll('a[href!="/login"]')`)
    try {
      expect(scanFile(f, corpus).some((m) => m.lesson_id === 'L-F2')).toBe(true)
    } finally { cleanup(f) }
  })
  it('clean fixture yields no L-F2 match', () => {
    const f = fixture(`document.querySelectorAll('a:not([href="/login"])')`)
    try {
      expect(scanFile(f, corpus).some((m) => m.lesson_id === 'L-F2')).toBe(false)
    } finally { cleanup(f) }
  })
  it('diagnose on "is not a valid selector" log returns L-F2', () => {
    const log = `Error: Failed to execute 'querySelector': 'a[href!="/x"]' is not a valid selector.`
    expect(diagnose(log, corpus).map((m) => m.lesson_id)).toContain('L-F2')
  })
})

describe('regression battery — L-F8 (Tailwind uppercase)', () => {
  it('detects case-sensitive regex on innerText', () => {
    const f = fixture(`const has = document.body.innerText.match(/Formula Data/)`)
    try {
      expect(scanFile(f, corpus).some((m) => m.lesson_id === 'L-F8')).toBe(true)
    } finally { cleanup(f) }
  })
  it('case-insensitive regex passes', () => {
    const f = fixture(`const has = document.body.innerText.match(/formula data/i)`)
    try {
      expect(scanFile(f, corpus).some((m) => m.lesson_id === 'L-F8')).toBe(false)
    } finally { cleanup(f) }
  })
  it('diagnose on uppercase+assertion failure returns L-F8', () => {
    const log = `expected toBeTruthy() — innerText.match(Formula Data) = false; <button class="uppercase">FORMULA DATA</button>`
    expect(diagnose(log, corpus).map((m) => m.lesson_id)).toContain('L-F8')
  })
})

describe('regression battery — L-F10 (loose text picker)', () => {
  it('detects page.getByText(/regex/) without scope', () => {
    const f = fixture(`await page.getByText(/Add vendor/).click()`)
    try {
      expect(scanFile(f, corpus).some((m) => m.lesson_id === 'L-F10')).toBe(true)
    } finally { cleanup(f) }
  })
  it('scoped locator passes', () => {
    const f = fixture(`await page.locator('[data-testid=vendor-list]').getByText(/Add vendor/).click()`)
    try {
      expect(scanFile(f, corpus).some((m) => m.lesson_id === 'L-F10')).toBe(false)
    } finally { cleanup(f) }
  })
  it('diagnose on Playwright strict-mode violation returns L-F10', () => {
    const log = `Error: strict mode violation: locator text=Add vendor resolved to 3 elements`
    expect(diagnose(log, corpus).map((m) => m.lesson_id)).toContain('L-F10')
  })
})

describe('regression battery — L-05 (networkidle vs domcontentloaded)', () => {
  it('detects domcontentloaded on login flow', () => {
    const f = fixture(`await page.waitForNavigation({ waitUntil: 'domcontentloaded' }) // after login click`)
    try {
      expect(scanFile(f, corpus).some((m) => m.lesson_id === 'L-05')).toBe(true)
    } finally { cleanup(f) }
  })
  it('networkidle2 on login flow passes', () => {
    const f = fixture(`await page.waitForNavigation({ waitUntil: 'networkidle2' }) // after login click`)
    try {
      expect(scanFile(f, corpus).some((m) => m.lesson_id === 'L-05')).toBe(false)
    } finally { cleanup(f) }
  })
  it('diagnose on navigation timeout returns L-05', () => {
    const log = `Error: Navigation timeout of 30000 ms exceeded\n  at login.spec.ts:34\n  <form action="/login">`
    expect(diagnose(log, corpus).map((m) => m.lesson_id)).toContain('L-05')
  })
})

describe('regression battery — L-24 (pipeline zombie cleanup)', () => {
  it('detects 8h timeout constant in mesh code', () => {
    const f = fixture(`const blockedStateTimeout = 28800000 // 8h in ms`, '.mjs')
    // Need path to match mesh/watcher glob
    const meshFile = path.join(path.dirname(f), 'mesh-watcher.mjs')
    fs.renameSync(f, meshFile)
    try {
      // The L-24 glob filter requires mesh/.*watcher in path
      // Create a proper path
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l24-'))
      const sub = path.join(dir, 'mesh', 'engine')
      fs.mkdirSync(sub, { recursive: true })
      const target = path.join(sub, 'watcher.js')
      fs.writeFileSync(target, `const blockedStateTimeout = 28800000`, 'utf8')
      try {
        expect(scanFile(target, corpus).some((m) => m.lesson_id === 'L-24')).toBe(true)
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    } finally {
      fs.rmSync(path.dirname(meshFile), { recursive: true, force: true })
    }
  })
  it('diagnose on "Zombie cleanup" log returns L-24', () => {
    const log = `[pipeline] Zombie cleanup: process 88655 dead, stuck in failed for 7814min`
    expect(diagnose(log, corpus).map((m) => m.lesson_id)).toContain('L-24')
  })
})

describe('regression battery — L-42 (requireDomainAdmin)', () => {
  it('detects requireAdmin near domainId in api route', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l42-'))
    const routeFile = path.join(dir, 'api', 'domain', 'route.ts')
    fs.mkdirSync(path.dirname(routeFile), { recursive: true })
    fs.writeFileSync(
      routeFile,
      `export async function POST(req, { params }) {\n  const { domainId } = params\n  await requireAdmin()\n}`,
      'utf8',
    )
    try {
      expect(scanFile(routeFile, corpus).some((m) => m.lesson_id === 'L-42')).toBe(true)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
  it('skip directive suppresses L-42 match', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l42-skip-'))
    const routeFile = path.join(dir, 'api', 'domain', 'route.ts')
    fs.mkdirSync(path.dirname(routeFile), { recursive: true })
    fs.writeFileSync(
      routeFile,
      `// lessons:skip L-42\nexport async function POST(req, { params }) {\n  const { domainId } = params\n  await requireAdmin()\n  await requireDomainAdmin(session, domainId)\n}`,
      'utf8',
    )
    try {
      expect(scanFile(routeFile, corpus).some((m) => m.lesson_id === 'L-42')).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
