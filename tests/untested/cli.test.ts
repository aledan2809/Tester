// lessons:skip-all
/**
 * T-006 — `tester untested` CLI smoke tests (spawn dist binary).
 *
 * Relies on prior `npm run build` being green. If dist/cli/index.js is missing,
 * tests are skipped (same guard as other CLI spawn tests in this repo).
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'

const REPO = path.resolve(__dirname, '../..')
const CLI = path.join(REPO, 'dist/cli/index.js')
const CLI_EXISTS = fs.existsSync(CLI)

function mkFixtureProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'untested-cli-'))
  fs.mkdirSync(path.join(root, 'coverage'))
  fs.writeFileSync(
    path.join(root, 'coverage', 'demo.yaml'),
    `feature: demo
owner: test
scenarios:
  - id: S1
    name: missing high
    severity: high
    covered_by: null
    status: missing
`,
    'utf8',
  )
  fs.writeFileSync(
    path.join(root, 'AUDIT_GAPS.md'),
    `| Gap ID | Severity | Area | Description | Status | Resolution |
|--------|----------|------|-------------|--------|------------|
| G-01   | critical | db   | missing     | Open   | —          |
`,
    'utf8',
  )
  return root
}

describe.skipIf(!CLI_EXISTS)('untested — CLI spawn', () => {
  it('errors with exit 2 when --project is missing', () => {
    const r = spawnSync('node', [CLI, 'untested'], { encoding: 'utf8' })
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/--project/)
  })

  it('errors with exit 2 when --project path does not exist', () => {
    const r = spawnSync('node', [CLI, 'untested', '--project', '/tmp/__never_exists_xyz__'], {
      encoding: 'utf8',
    })
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/does not exist/)
  })

  it('emits JSON with expected shape on a valid fixture', () => {
    const root = mkFixtureProject()
    try {
      const r = spawnSync('node', [CLI, 'untested', '--project', root, '--json'], { encoding: 'utf8' })
      expect(r.status).toBe(0)
      const parsed = JSON.parse(r.stdout) as {
        project: string
        counts: { total: number; by_source: Record<string, number> }
        items: Array<{ id: string; severity: string; source: string }>
      }
      expect(parsed.counts.total).toBe(2)
      expect(parsed.items[0].severity).toBe('critical')
      expect(parsed.items.map((i) => i.source)).toEqual(
        expect.arrayContaining(['coverage', 'audit_gaps']),
      )
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('emits markdown table when --markdown is set', () => {
    const root = mkFixtureProject()
    try {
      const r = spawnSync('node', [CLI, 'untested', '--project', root, '--markdown'], { encoding: 'utf8' })
      expect(r.status).toBe(0)
      expect(r.stdout).toMatch(/^# Untested —/)
      expect(r.stdout).toMatch(/\| # \| Severity \| Source \| ID \| Area \| Title \|/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
