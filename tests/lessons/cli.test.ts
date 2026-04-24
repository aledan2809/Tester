// lessons:skip-all
/**
 * T-000 Day-1 — CLI-level regression tests (gap fixes #1, #2, #3).
 *
 * Spawns the built `dist/cli/index.js` and asserts exit codes + stderr on:
 *   - gap #1: --severity WRONG must error + exit 2
 *   - gap #2: scan <nonexistent> must error + exit 2
 *   - gap #3: self-referential scan of repo produces ZERO matches
 *   - positive: scan broken fixture exits 1; clean fixture exits 0
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const REPO = path.resolve(__dirname, '../..')
const CLI = path.join(REPO, 'dist/cli/index.js')

function runCli(args: string[]) {
  const res = spawnSync('node', [CLI, ...args], { encoding: 'utf8' })
  return { stdout: res.stdout || '', stderr: res.stderr || '', exit: res.status }
}

function writeFixture(content: string, ext = '.spec.ts'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-fixture-'))
  const file = path.join(dir, `fixture${ext}`)
  fs.writeFileSync(file, content, 'utf8')
  return file
}

beforeAll(() => {
  if (!fs.existsSync(CLI)) {
    throw new Error(`CLI not built: ${CLI} — run \`npm run build\` first`)
  }
})

describe('CLI — lessons list', () => {
  it('default prints all active lessons with exit 0', () => {
    const r = runCli(['lessons', 'list'])
    expect(r.exit).toBe(0)
    expect(r.stdout).toMatch(/L-F2/)
    expect(r.stdout).toMatch(/L-F8/)
    expect(r.stdout).toMatch(/L-F10/)
  })

  it('--json emits parseable JSON with correct shape', () => {
    const r = runCli(['lessons', 'list', '--json'])
    expect(r.exit).toBe(0)
    const parsed = JSON.parse(r.stdout)
    expect(parsed.count).toBe(3)
    expect(parsed.lessons).toHaveLength(3)
    expect(parsed.lessons.every((l: unknown) => (l as { id: string }).id.startsWith('L-'))).toBe(true)
  })

  it('gap #1: --severity WRONG errors with exit 2 + stderr message', () => {
    const r = runCli(['lessons', 'list', '--severity', 'WRONG'])
    expect(r.exit).toBe(2)
    expect(r.stderr).toMatch(/--severity must be one of/i)
  })

  it('--severity high filters to 2 lessons', () => {
    const r = runCli(['lessons', 'list', '--severity', 'high', '--json'])
    expect(r.exit).toBe(0)
    const parsed = JSON.parse(r.stdout)
    expect(parsed.count).toBe(2)
    expect(parsed.lessons.every((l: { severity: string }) => l.severity === 'high')).toBe(true)
  })
})

describe('CLI — lessons scan', () => {
  it('exits 1 on broken fixture with matches', () => {
    const file = writeFixture(`await page.getByText(/Add vendor/).click()`)
    try {
      const r = runCli(['lessons', 'scan', file])
      expect(r.exit).toBe(1)
      expect(r.stdout).toMatch(/L-F10/)
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true })
    }
  })

  it('exits 0 on clean fixture', () => {
    const file = writeFixture(`await page.locator('[data-testid=nav]').getByText('Home').click()`)
    try {
      const r = runCli(['lessons', 'scan', file])
      expect(r.exit).toBe(0)
      expect(r.stdout).toMatch(/No matches/)
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true })
    }
  })

  it('--no-fail-on-match exits 0 even when matches present', () => {
    const file = writeFixture(`await page.getByText(/Add vendor/).click()`)
    try {
      const r = runCli(['lessons', 'scan', '--no-fail-on-match', file])
      expect(r.exit).toBe(0)
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true })
    }
  })

  it('gap #2: scan <nonexistent> errors with exit 2 + stderr message', () => {
    const r = runCli(['lessons', 'scan', '/tmp/absolutely-nonexistent-xyz-123'])
    expect(r.exit).toBe(2)
    expect(r.stderr).toMatch(/does not exist/i)
  })

  it('gap #3: scanning Tester repo root finds ZERO matches in tests/lessons (self-reference)', () => {
    const testsLessonsDir = path.join(REPO, 'tests', 'lessons')
    const r = runCli(['lessons', 'scan', testsLessonsDir])
    expect(r.exit).toBe(0)
    expect(r.stdout).toMatch(/No matches/)
  })

  it('--json emits parseable JSON on both match and no-match paths', () => {
    const clean = writeFixture(`const x = 1`)
    try {
      const r = runCli(['lessons', 'scan', '--json', clean])
      expect(r.exit).toBe(0)
      const parsed = JSON.parse(r.stdout)
      expect(parsed.matches_count).toBe(0)
      expect(parsed.matches).toEqual([])
    } finally {
      fs.rmSync(path.dirname(clean), { recursive: true, force: true })
    }

    const broken = writeFixture(`document.querySelectorAll('a[href!="/x"]')`)
    try {
      const r = runCli(['lessons', 'scan', '--json', broken])
      expect(r.exit).toBe(1)
      const parsed = JSON.parse(r.stdout)
      expect(parsed.matches_count).toBeGreaterThan(0)
      expect(parsed.matches.some((m: { lesson_id: string }) => m.lesson_id === 'L-F2')).toBe(true)
    } finally {
      fs.rmSync(path.dirname(broken), { recursive: true, force: true })
    }
  })
})
