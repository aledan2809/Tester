// lessons:skip-all
/**
 * T-C4 close — run-affected integration tests.
 *
 * We avoid spawning real vitest; dry-run + JSON paths cover the file
 * selection + command assembly behavior deterministically.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'

const REPO = path.resolve(__dirname, '../..')
const CLI = path.join(REPO, 'dist/cli/index.js')
const CLI_EXISTS = fs.existsSync(CLI)

function mkTree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ra-'))
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content, 'utf8')
  }
  return root
}

describe.skipIf(!CLI_EXISTS)('T-C4 run-affected CLI', () => {
  it('--dry-run prints the command + file list', () => {
    const root = mkTree({
      'tests/auth.spec.ts': '// @tags auth\n',
      'tests/billing.spec.ts': '// @tags billing\n',
      'tests/other.spec.ts': '// @tags other\n',
    })
    try {
      const r = spawnSync(
        'node',
        [CLI, 'run-affected', '--project', root, '--tags', 'auth', '--dry-run'],
        { encoding: 'utf8' },
      )
      expect(r.status).toBe(0)
      expect(r.stdout).toMatch(/DRY RUN/)
      expect(r.stdout).toMatch(/auth\.spec\.ts/)
      expect(r.stdout).not.toMatch(/billing\.spec\.ts/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('--json emits matched_files + command string without spawning', () => {
    const root = mkTree({
      'tests/auth.spec.ts': '// @tags auth\n',
      'tests/mix.spec.ts': '// @tags auth billing\n',
    })
    try {
      const r = spawnSync(
        'node',
        [CLI, 'run-affected', '--project', root, '--tags', 'billing', '--json'],
        { encoding: 'utf8' },
      )
      expect(r.status).toBe(0)
      const parsed = JSON.parse(r.stdout)
      expect(parsed.tags).toEqual(['billing'])
      expect(parsed.matched_files).toHaveLength(1)
      expect(parsed.matched_files[0]).toMatch(/mix\.spec\.ts$/)
      expect(parsed.command).toMatch(/npx vitest run/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('honors --runner jest', () => {
    const root = mkTree({
      'tests/x.spec.ts': '// @tags auth\n',
    })
    try {
      const r = spawnSync(
        'node',
        [
          CLI,
          'run-affected',
          '--project',
          root,
          '--tags',
          'auth',
          '--runner',
          'jest',
          '--json',
        ],
        { encoding: 'utf8' },
      )
      expect(r.status).toBe(0)
      const parsed = JSON.parse(r.stdout)
      expect(parsed.runner).toBe('jest')
      expect(parsed.command).toMatch(/npx jest/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('exits 2 when --tags is missing', () => {
    const r = spawnSync('node', [CLI, 'run-affected'], { encoding: 'utf8' })
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/--tags/)
  })

  it('exits 0 with stderr note when no files match (no-op, not failure)', () => {
    const root = mkTree({ 'tests/x.spec.ts': '// @tags other\n' })
    try {
      const r = spawnSync(
        'node',
        [CLI, 'run-affected', '--project', root, '--tags', 'unused-tag'],
        { encoding: 'utf8' },
      )
      expect(r.status).toBe(0)
      expect(r.stderr).toMatch(/No test files matched/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
