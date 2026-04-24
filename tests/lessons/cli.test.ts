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
    expect(parsed.count).toBeGreaterThanOrEqual(3)
    expect(parsed.lessons.length).toBe(parsed.count)
    expect(parsed.lessons.every((l: unknown) => (l as { id: string }).id.startsWith('L-'))).toBe(true)
    const ids = new Set(parsed.lessons.map((l: { id: string }) => l.id))
    expect(ids.has('L-F2')).toBe(true)
    expect(ids.has('L-F8')).toBe(true)
    expect(ids.has('L-F10')).toBe(true)
  })

  it('gap #1: --severity WRONG errors with exit 2 + stderr message', () => {
    const r = runCli(['lessons', 'list', '--severity', 'WRONG'])
    expect(r.exit).toBe(2)
    expect(r.stderr).toMatch(/--severity must be one of/i)
  })

  it('--severity high filters correctly (all returned lessons are severity=high)', () => {
    const r = runCli(['lessons', 'list', '--severity', 'high', '--json'])
    expect(r.exit).toBe(0)
    const parsed = JSON.parse(r.stdout)
    expect(parsed.count).toBeGreaterThanOrEqual(2)
    expect(parsed.lessons.every((l: { severity: string }) => l.severity === 'high')).toBe(true)
    const ids = new Set(parsed.lessons.map((l: { id: string }) => l.id))
    expect(ids.has('L-F8')).toBe(true)
    expect(ids.has('L-F10')).toBe(true)
  })
})

describe('CLI — lessons scan', () => {
  it('exits 1 on broken fixture with matches', () => {
    const file = writeFixture(`await page.getByText(/Add vendor/).click()`)
    try {
      const r = runCli(['lessons', 'scan', '--no-record-stats', file])
      expect(r.exit).toBe(1)
      expect(r.stdout).toMatch(/L-F10/)
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true })
    }
  })

  it('exits 0 on clean fixture', () => {
    const file = writeFixture(`await page.locator('[data-testid=nav]').getByText('Home').click()`)
    try {
      const r = runCli(['lessons', 'scan', '--no-record-stats', file])
      expect(r.exit).toBe(0)
      expect(r.stdout).toMatch(/No matches/)
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true })
    }
  })

  it('--no-fail-on-match exits 0 even when matches present', () => {
    const file = writeFixture(`await page.getByText(/Add vendor/).click()`)
    try {
      const r = runCli(['lessons', 'scan', '--no-fail-on-match', '--no-record-stats', file])
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
      const r = runCli(['lessons', 'scan', '--json', '--no-record-stats', clean])
      expect(r.exit).toBe(0)
      const parsed = JSON.parse(r.stdout)
      expect(parsed.matches_count).toBe(0)
      expect(parsed.matches).toEqual([])
    } finally {
      fs.rmSync(path.dirname(clean), { recursive: true, force: true })
    }

    const broken = writeFixture(`document.querySelectorAll('a[href!="/x"]')`)
    try {
      const r = runCli(['lessons', 'scan', '--json', '--no-record-stats', broken])
      expect(r.exit).toBe(1)
      const parsed = JSON.parse(r.stdout)
      expect(parsed.matches_count).toBeGreaterThan(0)
      expect(parsed.matches.some((m: { lesson_id: string }) => m.lesson_id === 'L-F2')).toBe(true)
    } finally {
      fs.rmSync(path.dirname(broken), { recursive: true, force: true })
    }
  })
})

// ─── PAS 1 (quality-uplift) integration tests ────────────

describe('CLI — selfcheck (T-001)', () => {
  it('happy path: exits 0 with pass/skipped counts on stdout', () => {
    const r = runCli(['selfcheck'])
    expect(r.exit).toBe(0)
    expect(r.stdout).toMatch(/pass:\s*\d+/)
    expect(r.stdout).toMatch(/skipped:\s*\d+/)
    expect(r.stdout).toMatch(/probe\(s\)/)
  })

  it('--json emits parseable JSON with required fields', () => {
    const r = runCli(['selfcheck', '--json'])
    expect(r.exit).toBe(0)
    const parsed = JSON.parse(r.stdout)
    expect(typeof parsed.total).toBe('number')
    expect(typeof parsed.pass).toBe('number')
    expect(typeof parsed.skipped).toBe('number')
    expect(Array.isArray(parsed.results)).toBe(true)
    expect(parsed.exitCode).toBe(0)
  })
})

function writeTmpYaml(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-yaml-'))
  const file = path.join(dir, 'sample.yaml')
  fs.writeFileSync(file, content, 'utf8')
  return file
}

describe('CLI — coverage (T-002)', () => {
  it('happy path: exits 0 with coverage summary on a fully-covered fixture', () => {
    const file = writeTmpYaml(`feature: demo
owner: test
scenarios:
  - id: A
    name: covered
    severity: low
    covered_by: tests/a.spec.ts
    status: covered
`)
    try {
      const r = runCli(['coverage', '--feature', file])
      expect(r.exit).toBe(0)
      expect(r.stdout).toMatch(/Aggregate:/)
      expect(r.stdout).toMatch(/100.0%/)
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true })
    }
  })

  it('exits 1 on critical-missing scenario', () => {
    const file = writeTmpYaml(`feature: demo
owner: test
scenarios:
  - id: A
    name: critical gap
    severity: critical
    covered_by: null
    status: missing
`)
    try {
      const r = runCli(['coverage', '--feature', file])
      expect(r.exit).toBe(1)
      expect(r.stdout).toMatch(/critical-missing=1/)
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true })
    }
  })

  it('--fail-under fails when ratio < threshold', () => {
    const file = writeTmpYaml(`feature: demo
owner: test
scenarios:
  - id: A
    name: covered
    severity: low
    covered_by: tests/a.spec.ts
    status: covered
  - id: B
    name: missing-low
    severity: low
    covered_by: null
    status: missing
`)
    try {
      const r = runCli(['coverage', '--feature', file, '--fail-under', '0.9'])
      expect(r.exit).toBe(1)
      expect(r.stdout).toMatch(/FAIL/)
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true })
    }
  })

  it('--json emits valid aggregate shape', () => {
    const file = writeTmpYaml(`feature: demo
owner: test
scenarios:
  - id: A
    name: ok
    severity: low
    covered_by: tests/a.spec.ts
    status: covered
`)
    try {
      const r = runCli(['coverage', '--feature', file, '--json'])
      expect(r.exit).toBe(0)
      const parsed = JSON.parse(r.stdout)
      expect(parsed.aggregate.features).toBe(1)
      expect(parsed.aggregate.coverage_ratio).toBe(1)
      expect(Array.isArray(parsed.reports)).toBe(true)
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true })
    }
  })
})

function writeLogFixture(body: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-fixture-'))
  const file = path.join(dir, 'fail.log')
  fs.writeFileSync(file, body, 'utf8')
  return file
}

describe('CLI — lessons classify (T-004)', () => {
  it('ENV_MISCONFIG on ECONNREFUSED fixture', () => {
    const log = writeLogFixture(`
Error: fetch failed — ECONNREFUSED 127.0.0.1:8000
    at Object.fetch (internal/fetch:1:1)
`)
    try {
      const r = runCli(['lessons', 'classify', log, '--force-heuristic', '--json'])
      expect(r.exit).toBe(0)
      const parsed = JSON.parse(r.stdout)
      expect(parsed.verdict).toBe('ENV_MISCONFIG')
      expect(parsed.source).toBe('heuristic')
    } finally {
      fs.rmSync(path.dirname(log), { recursive: true, force: true })
    }
  })

  it('HARNESS_BUG on invalid-selector fixture', () => {
    const log = writeLogFixture(`
Error: 'a[href!="/x"]' is not a valid selector
    at page.evaluate (line 1)
`)
    try {
      const r = runCli(['lessons', 'classify', log, '--force-heuristic', '--json'])
      expect(r.exit).toBe(0)
      const parsed = JSON.parse(r.stdout)
      expect(parsed.verdict).toBe('HARNESS_BUG')
    } finally {
      fs.rmSync(path.dirname(log), { recursive: true, force: true })
    }
  })

  it('FLAKE on Navigation-timeout fixture', () => {
    const log = writeLogFixture(`
Error: Navigation timeout of 30000 ms exceeded
    at NavigationWatcher (line 1)
`)
    try {
      const r = runCli(['lessons', 'classify', log, '--force-heuristic', '--json'])
      expect(r.exit).toBe(0)
      const parsed = JSON.parse(r.stdout)
      expect(parsed.verdict).toBe('FLAKE')
    } finally {
      fs.rmSync(path.dirname(log), { recursive: true, force: true })
    }
  })

  it('PRODUCT_BUG on generic assertion fixture', () => {
    const log = writeLogFixture(`
expected 200 but got 500 from /api/users
Error: Request failed with status 500
    at request (line 1)
`)
    try {
      const r = runCli(['lessons', 'classify', log, '--force-heuristic', '--json'])
      expect(r.exit).toBe(0)
      const parsed = JSON.parse(r.stdout)
      expect(parsed.verdict).toBe('PRODUCT_BUG')
    } finally {
      fs.rmSync(path.dirname(log), { recursive: true, force: true })
    }
  })
})

function writePrismaSchema(extraFields = ''): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-prisma-'))
  const prismaDir = path.join(dir, 'prisma')
  fs.mkdirSync(prismaDir)
  const schema = `generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model Widget {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  ${extraFields}
}
`
  const schemaPath = path.join(prismaDir, 'schema.prisma')
  fs.writeFileSync(schemaPath, schema, 'utf8')
  return schemaPath
}

describe('CLI — generate --from-prisma (T-005)', () => {
  it('happy path: generates a test file + prints scenario list', () => {
    const schema = writePrismaSchema()
    try {
      const r = runCli(['generate', '--from-prisma', schema, '--model', 'Widget'])
      expect(r.exit).toBe(0)
      expect(r.stdout).toMatch(/Generated\s+\d+\s+file\(s\)/)
      expect(r.stdout).toMatch(/unauth-401|create-read-delete|missing-required-400/)
    } finally {
      fs.rmSync(path.dirname(path.dirname(schema)), { recursive: true, force: true })
    }
  })

  it('skips re-generation when output exists without --overwrite (exit 1)', () => {
    const schema = writePrismaSchema()
    try {
      const first = runCli(['generate', '--from-prisma', schema, '--model', 'Widget'])
      expect(first.exit).toBe(0)
      const second = runCli(['generate', '--from-prisma', schema, '--model', 'Widget'])
      expect(second.exit).toBe(1)
      expect(second.stdout).toMatch(/already exists/)
    } finally {
      fs.rmSync(path.dirname(path.dirname(schema)), { recursive: true, force: true })
    }
  })

  it('--overwrite re-generates cleanly', () => {
    const schema = writePrismaSchema()
    try {
      runCli(['generate', '--from-prisma', schema, '--model', 'Widget'])
      const r = runCli(['generate', '--from-prisma', schema, '--model', 'Widget', '--overwrite'])
      expect(r.exit).toBe(0)
      expect(r.stdout).toMatch(/Generated/)
    } finally {
      fs.rmSync(path.dirname(path.dirname(schema)), { recursive: true, force: true })
    }
  })

  it('--auth none omits Authorization header in the generated spec', () => {
    const schema = writePrismaSchema()
    try {
      const r = runCli([
        'generate',
        '--from-prisma',
        schema,
        '--model',
        'Widget',
        '--auth',
        'none',
        '--json',
      ])
      expect(r.exit).toBe(0)
      const parsed = JSON.parse(r.stdout)
      expect(parsed.filesWritten.length).toBeGreaterThanOrEqual(1)
      const generatedFile = fs.readFileSync(parsed.filesWritten[0], 'utf8')
      expect(generatedFile).not.toMatch(/Authorization:/)
      expect(generatedFile).toMatch(/Auth: none/)
    } finally {
      fs.rmSync(path.dirname(path.dirname(schema)), { recursive: true, force: true })
    }
  })

  it('rejects invalid --auth value with exit 2', () => {
    const schema = writePrismaSchema()
    try {
      const r = runCli(['generate', '--from-prisma', schema, '--model', 'Widget', '--auth', 'bogus'])
      expect(r.exit).toBe(2)
      expect(r.stderr).toMatch(/--auth must be/)
    } finally {
      fs.rmSync(path.dirname(path.dirname(schema)), { recursive: true, force: true })
    }
  })
})
