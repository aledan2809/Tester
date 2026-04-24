// lessons:skip-all
/**
 * T-006 (spec item 3-4) — `--since <sha>` git-filter + blame attribution.
 *
 * Uses a real ephemeral git repo (created per test) to exercise the
 * filter end-to-end. These tests are slower than the rest of the
 * untested suite (~100ms/test for the git calls) but that's the only
 * way to verify the integration honestly.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { buildUntestedReport } from '../../src/untested/loader'
import { filesChangedSince, blameFile, attributeByText, wasChangedSince } from '../../src/untested/git'

function gitInit(root: string): void {
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: root })
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: root })
}

function gitCommit(root: string, message: string): string {
  execFileSync('git', ['add', '-A'], { cwd: root })
  execFileSync('git', ['commit', '-q', '-m', message, '--allow-empty'], { cwd: root })
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
}

function writeFile(root: string, rel: string, content: string): void {
  const full = path.join(root, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf8')
}

function mkRepo(): string {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'since-'))
  gitInit(r)
  return r
}

describe('T-006 --since — filesChangedSince', () => {
  it('returns changed files between a sha and HEAD', () => {
    const root = mkRepo()
    try {
      writeFile(root, 'a.txt', 'initial')
      const baseSha = gitCommit(root, 'base')
      writeFile(root, 'a.txt', 'modified')
      writeFile(root, 'b.txt', 'new file')
      gitCommit(root, 'edits')
      const r = filesChangedSince(root, baseSha)
      expect(r.ok).toBe(true)
      expect(r.changed.has('a.txt')).toBe(true)
      expect(r.changed.has('b.txt')).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns ok:false for a non-git directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'no-git-'))
    try {
      const r = filesChangedSince(root, 'deadbeef')
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/not a git repository/i)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns ok:false for an unknown sha', () => {
    const root = mkRepo()
    try {
      writeFile(root, 'a.txt', 'x')
      gitCommit(root, 'init')
      const r = filesChangedSince(root, 'deadbeefcafebabe00000000')
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/git diff failed/i)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('T-006 --since — blameFile + attributeByText', () => {
  it('attributes a specific line to its introducing commit', () => {
    const root = mkRepo()
    try {
      writeFile(root, 'AUDIT_GAPS.md', '| G-1 | high | auth | first gap | Open | — |\n')
      const firstSha = gitCommit(root, 'first gap')
      const extra = '| G-2 | critical | db | second gap | Open | — |\n'
      fs.appendFileSync(path.join(root, 'AUDIT_GAPS.md'), extra, 'utf8')
      const secondSha = gitCommit(root, 'second gap')

      const blame = blameFile(root, path.join(root, 'AUDIT_GAPS.md'))
      expect(blame.length).toBeGreaterThanOrEqual(2)
      const g1 = attributeByText(blame, 'G-1')
      const g2 = attributeByText(blame, 'G-2')
      expect(g1?.sha).toBe(firstSha)
      expect(g2?.sha).toBe(secondSha)
      expect(g1?.author).toBe('test')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('T-006 --since — end-to-end via buildUntestedReport', () => {
  it('filters AUDIT_GAPS rows introduced after --since', () => {
    const root = mkRepo()
    try {
      writeFile(
        root,
        'AUDIT_GAPS.md',
        `| Gap ID | Severity | Area | Description | Status | Resolution |\n|---|---|---|---|---|---|\n| G-OLD | high | x | pre-existing | Open | - |\n`,
      )
      const baseSha = gitCommit(root, 'old gap')
      fs.appendFileSync(
        path.join(root, 'AUDIT_GAPS.md'),
        `| G-NEW | critical | db | new gap | Open | - |\n`,
        'utf8',
      )
      gitCommit(root, 'new gap')
      const full = buildUntestedReport(root, { sources: ['audit_gaps'] })
      expect(full.items.length).toBe(2)
      const filtered = buildUntestedReport(root, { sources: ['audit_gaps'], since: baseSha })
      expect(filtered.since).toBe(baseSha)
      expect(filtered.items.length).toBe(1)
      expect(filtered.items[0].id).toBe('G-NEW')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('surfaces since_error when git repo is missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'no-git-'))
    try {
      writeFile(
        root,
        'AUDIT_GAPS.md',
        `| Gap ID | Severity | Area | Description | Status | Resolution |\n|---|---|---|---|---|---|\n| G-X | high | x | x | Open | - |\n`,
      )
      const r = buildUntestedReport(root, { sources: ['audit_gaps'], since: 'deadbeef' })
      expect(r.since_error).toMatch(/not a git repository/i)
      // Falls back to unfiltered — still surfaces the item.
      expect(r.items.length).toBe(1)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('attaches attribution when --attribute is set + --since', () => {
    const root = mkRepo()
    try {
      writeFile(
        root,
        'AUDIT_GAPS.md',
        `| Gap ID | Severity | Area | Description | Status | Resolution |\n|---|---|---|---|---|---|\n`,
      )
      const baseSha = gitCommit(root, 'scaffold')
      fs.appendFileSync(
        path.join(root, 'AUDIT_GAPS.md'),
        `| G-NEW | critical | db | new gap | Open | - |\n`,
        'utf8',
      )
      gitCommit(root, 'add gap')
      const r = buildUntestedReport(root, {
        sources: ['audit_gaps'],
        since: baseSha,
        attribute: true,
      })
      expect(r.blame_used).toBe(true)
      expect(r.items.length).toBe(1)
      const item = r.items[0]
      expect(item.extra?.git_sha).toBeTruthy()
      expect(item.extra?.git_author).toBe('test')
      expect(item.extra?.git_line).toBeTruthy()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('filters coverage by file-level change — coverage/*.yaml touched after --since includes its missing scenarios', () => {
    const root = mkRepo()
    try {
      writeFile(root, 'README.md', '#')
      const baseSha = gitCommit(root, 'base')
      writeFile(
        root,
        'coverage/demo.yaml',
        `feature: demo\nowner: test\nscenarios:\n  - id: A\n    name: critical\n    severity: critical\n    covered_by: null\n    status: missing\n`,
      )
      gitCommit(root, 'add coverage')
      const r = buildUntestedReport(root, { since: baseSha })
      expect(r.items.some((i) => i.source === 'coverage')).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('T-006 --since — wasChangedSince helper', () => {
  it('returns false for a file not in the changed set', () => {
    const result = { ok: true, changed: new Set(['a.txt']), changedAbs: new Set(['/tmp/a.txt']) }
    expect(wasChangedSince(result, '/tmp/b.txt')).toBe(false)
    expect(wasChangedSince(result, '/tmp/a.txt')).toBe(true)
  })

  it('returns false when the result is ok:false', () => {
    expect(
      wasChangedSince({ ok: false, changed: new Set(), changedAbs: new Set() }, '/tmp/a'),
    ).toBe(false)
  })
})
