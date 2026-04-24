// lessons:skip-all
/**
 * T-C1 + T-C2 — scope-check + coupling tests against ephemeral git repos.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { checkScope, hasAllowWideScope } from '../../src/scope-check/guard'
import { checkCoupling } from '../../src/scope-check/coupling'

function mkRepo(): string {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'))
  execFileSync('git', ['init', '-q'], { cwd: r })
  execFileSync('git', ['config', 'user.email', 't@x'], { cwd: r })
  execFileSync('git', ['config', 'user.name', 't'], { cwd: r })
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: r })
  return r
}

function commit(r: string, msg: string): string {
  execFileSync('git', ['add', '-A'], { cwd: r })
  execFileSync('git', ['commit', '-q', '-m', msg, '--allow-empty'], { cwd: r })
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: r, encoding: 'utf8' }).trim()
}

describe('T-C1 hasAllowWideScope', () => {
  it('matches allow-wide-scope + synonyms', () => {
    expect(hasAllowWideScope('allow-wide-scope bulk refactor')).toBe(true)
    expect(hasAllowWideScope('please mass-rename all foo → bar')).toBe(true)
    expect(hasAllowWideScope('wide rewrite of module')).toBe(true)
    expect(hasAllowWideScope('fix a small bug')).toBe(false)
    expect(hasAllowWideScope(undefined)).toBe(false)
  })
})

describe('T-C1 checkScope behavior', () => {
  it('detects breach when filesChanged > threshold', () => {
    const r = mkRepo()
    fs.writeFileSync(path.join(r, 'README.md'), '#', 'utf8')
    const base = commit(r, 'init')
    for (let i = 0; i < 12; i++) fs.writeFileSync(path.join(r, `f${i}.txt`), 'x'.repeat(20), 'utf8')
    commit(r, 'blowup')
    try {
      const res = checkScope({ repoPath: r, since: base })
      expect(res.ok).toBe(true)
      expect(res.breached).toBe(true)
      expect(res.filesChanged).toBe(12)
      expect(res.reason).toMatch(/files=12/)
    } finally {
      fs.rmSync(r, { recursive: true, force: true })
    }
  })

  it('stays under threshold for small scope', () => {
    const r = mkRepo()
    fs.writeFileSync(path.join(r, 'README.md'), '#', 'utf8')
    const base = commit(r, 'init')
    fs.writeFileSync(path.join(r, 'one.txt'), 'x', 'utf8')
    commit(r, 'small')
    try {
      const res = checkScope({ repoPath: r, since: base })
      expect(res.breached).toBe(false)
      expect(res.filesChanged).toBe(1)
    } finally {
      fs.rmSync(r, { recursive: true, force: true })
    }
  })

  it('allow-wide-scope token suppresses breach', () => {
    const r = mkRepo()
    fs.writeFileSync(path.join(r, 'README.md'), '#', 'utf8')
    const base = commit(r, 'init')
    for (let i = 0; i < 15; i++) fs.writeFileSync(path.join(r, `f${i}.txt`), 'x'.repeat(20), 'utf8')
    commit(r, 'wide')
    try {
      const res = checkScope({
        repoPath: r,
        since: base,
        taskDescription: 'allow-wide-scope: bulk refactor of layout',
      })
      expect(res.allowWide).toBe(true)
      expect(res.breached).toBe(false)
    } finally {
      fs.rmSync(r, { recursive: true, force: true })
    }
  })

  it('returns ok:false when git invocation fails', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nogit-'))
    try {
      const res = checkScope({ repoPath: dir, since: 'deadbeef' })
      expect(res.ok).toBe(false)
      expect(res.reason).toMatch(/git diff failed/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('T-C2 checkCoupling behavior', () => {
  it('passes when source + test files both change', () => {
    const r = mkRepo()
    fs.writeFileSync(path.join(r, 'README.md'), '#', 'utf8')
    const base = commit(r, 'init')
    fs.mkdirSync(path.join(r, 'src'), { recursive: true })
    fs.mkdirSync(path.join(r, 'tests'), { recursive: true })
    fs.writeFileSync(path.join(r, 'src/index.ts'), 'export const x = 1', 'utf8')
    fs.writeFileSync(path.join(r, 'tests/index.spec.ts'), 'import "../src/index"', 'utf8')
    commit(r, 'feat + test')
    try {
      const res = checkCoupling({ repoPath: r, since: base })
      expect(res.passed).toBe(true)
    } finally {
      fs.rmSync(r, { recursive: true, force: true })
    }
  })

  it('fails when source changes without tests', () => {
    const r = mkRepo()
    fs.writeFileSync(path.join(r, 'README.md'), '#', 'utf8')
    const base = commit(r, 'init')
    fs.mkdirSync(path.join(r, 'src'), { recursive: true })
    fs.writeFileSync(path.join(r, 'src/a.ts'), 'export const a = 1', 'utf8')
    commit(r, 'feat only, no test')
    try {
      const res = checkCoupling({ repoPath: r, since: base })
      expect(res.passed).toBe(false)
      expect(res.unmatchedSources).toContain('src/a.ts')
      expect(res.reason).toMatch(/no test file changes/)
    } finally {
      fs.rmSync(r, { recursive: true, force: true })
    }
  })

  it('honors `Test-Coverage: existing` override in commit messages', () => {
    const r = mkRepo()
    fs.writeFileSync(path.join(r, 'README.md'), '#', 'utf8')
    const base = commit(r, 'init')
    fs.mkdirSync(path.join(r, 'src'), { recursive: true })
    fs.writeFileSync(path.join(r, 'src/a.ts'), 'export const a = 1', 'utf8')
    commit(r, 'feat: refactor\n\nTest-Coverage: existing')
    try {
      const res = checkCoupling({ repoPath: r, since: base })
      expect(res.passed).toBe(true)
      expect(res.override).toBe(true)
    } finally {
      fs.rmSync(r, { recursive: true, force: true })
    }
  })

  it('warnOnly returns passed:true even with mismatch', () => {
    const r = mkRepo()
    fs.writeFileSync(path.join(r, 'README.md'), '#', 'utf8')
    const base = commit(r, 'init')
    fs.mkdirSync(path.join(r, 'src'), { recursive: true })
    fs.writeFileSync(path.join(r, 'src/a.ts'), 'export const a = 1', 'utf8')
    commit(r, 'feat')
    try {
      const res = checkCoupling({ repoPath: r, since: base, warnOnly: true })
      expect(res.passed).toBe(true)
      expect(res.unmatchedSources.length).toBeGreaterThan(0)
    } finally {
      fs.rmSync(r, { recursive: true, force: true })
    }
  })

  it('recognizes pure-refactor (0 insertions) as passed', () => {
    const r = mkRepo()
    fs.writeFileSync(path.join(r, 'README.md'), '#', 'utf8')
    fs.mkdirSync(path.join(r, 'src'), { recursive: true })
    fs.writeFileSync(path.join(r, 'src/a.ts'), 'export const a = 1\n', 'utf8')
    commit(r, 'init with src')
    const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: r, encoding: 'utf8' }).trim()
    // Delete a line — 0 insertions, 1 deletion.
    fs.writeFileSync(path.join(r, 'src/a.ts'), '', 'utf8')
    commit(r, 'refactor: strip body')
    try {
      const res = checkCoupling({ repoPath: r, since: base })
      expect(res.refactorOnly).toBe(true)
      expect(res.passed).toBe(true)
    } finally {
      fs.rmSync(r, { recursive: true, force: true })
    }
  })
})
