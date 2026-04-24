// lessons:skip-all
/**
 * T-000 Day-3 — git hook installer regression tests.
 */

import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { installHooks, uninstallHooks } from '../../src/lessons/hooks'

function makeGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-'))
  const r = spawnSync('git', ['init', '-q', dir], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git init failed: ${r.stderr}`)
  return dir
}

describe('hooks installer', () => {
  it('refuses to install in a non-git directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nogit-'))
    try {
      const r = installHooks(dir)
      expect(r.installed).toBe(false)
      expect(r.message).toMatch(/not a git repo/i)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('creates a new pre-commit hook in a fresh git repo', () => {
    const repo = makeGitRepo()
    try {
      const r = installHooks(repo)
      expect(r.installed).toBe(true)
      const hookFile = path.join(repo, '.git', 'hooks', 'pre-commit')
      expect(fs.existsSync(hookFile)).toBe(true)
      const content = fs.readFileSync(hookFile, 'utf8')
      expect(content).toMatch(/lessons scan/)
      // Marker block present
      expect(content).toMatch(/>>> @aledan007\/tester/)
      expect(content).toMatch(/<<< @aledan007\/tester/)
    } finally {
      fs.rmSync(repo, { recursive: true, force: true })
    }
  })

  it('backs up an existing non-tester pre-commit hook before appending', () => {
    const repo = makeGitRepo()
    const hookFile = path.join(repo, '.git', 'hooks', 'pre-commit')
    fs.writeFileSync(hookFile, '#!/usr/bin/env bash\n# user hook\nexit 0\n', 'utf8')
    try {
      const r = installHooks(repo)
      expect(r.installed).toBe(true)
      expect(r.backed_up).toBeDefined()
      expect(fs.existsSync(r.backed_up as string)).toBe(true)
      expect(fs.readFileSync(hookFile, 'utf8')).toMatch(/# user hook/) // preserved
      expect(fs.readFileSync(hookFile, 'utf8')).toMatch(/lessons scan/) // appended
    } finally {
      fs.rmSync(repo, { recursive: true, force: true })
    }
  })

  it('re-installing replaces only the tester-managed block (idempotent)', () => {
    const repo = makeGitRepo()
    try {
      installHooks(repo, ['tests/'])
      const before = fs.readFileSync(path.join(repo, '.git', 'hooks', 'pre-commit'), 'utf8')
      expect(before).toMatch(/"tests\/"/)

      installHooks(repo, ['src/', 'tests/'])
      const after = fs.readFileSync(path.join(repo, '.git', 'hooks', 'pre-commit'), 'utf8')
      expect(after).toMatch(/"src\/"/)
      expect(after).toMatch(/"tests\/"/)
      // No duplicate blocks
      const startCount = (after.match(/>>> @aledan007\/tester/g) || []).length
      expect(startCount).toBe(1)
    } finally {
      fs.rmSync(repo, { recursive: true, force: true })
    }
  })

  it('uninstall removes the tester block; file deleted if only tester content', () => {
    const repo = makeGitRepo()
    try {
      installHooks(repo)
      const r = uninstallHooks(repo)
      expect(r.installed).toBe(false)
      expect(r.message).toMatch(/removed/i)
      const hookFile = path.join(repo, '.git', 'hooks', 'pre-commit')
      expect(fs.existsSync(hookFile)).toBe(false)
    } finally {
      fs.rmSync(repo, { recursive: true, force: true })
    }
  })

  it('uninstall preserves user content after removing tester block', () => {
    const repo = makeGitRepo()
    const hookFile = path.join(repo, '.git', 'hooks', 'pre-commit')
    fs.writeFileSync(hookFile, '#!/usr/bin/env bash\n# my-lint\nnpm run lint\n', 'utf8')
    try {
      installHooks(repo)
      uninstallHooks(repo)
      const content = fs.readFileSync(hookFile, 'utf8')
      expect(content).toMatch(/my-lint/)
      expect(content).not.toMatch(/@aledan007\/tester/)
    } finally {
      fs.rmSync(repo, { recursive: true, force: true })
    }
  })

  it('uninstall reports no-op on a repo with no tester-managed block', () => {
    const repo = makeGitRepo()
    const hookFile = path.join(repo, '.git', 'hooks', 'pre-commit')
    fs.writeFileSync(hookFile, '#!/usr/bin/env bash\necho "hi"\n', 'utf8')
    try {
      const r = uninstallHooks(repo)
      expect(r.installed).toBe(false)
      expect(r.message).toMatch(/no tester-managed block/i)
    } finally {
      fs.rmSync(repo, { recursive: true, force: true })
    }
  })
})
