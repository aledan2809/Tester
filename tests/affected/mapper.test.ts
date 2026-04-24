// lessons:skip-all
/**
 * T-C4 — Affected-file mapper tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  parseTagsFromHeader,
  indexTaggedFiles,
  findAffectedFiles,
  walkTestFiles,
} from '../../src/affected/mapper'

function mkTree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aff-'))
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content, 'utf8')
  }
  return root
}

describe('T-C4 parseTagsFromHeader', () => {
  it('reads `// @tags a b c`', () => {
    expect(parseTagsFromHeader('// @tags auth billing db.users')).toEqual([
      'auth',
      'billing',
      'db.users',
    ])
  })

  it('reads `// tester-tags: a,b`', () => {
    expect(parseTagsFromHeader('// tester-tags: auth,billing')).toEqual(['auth', 'billing'])
  })

  it('reads block-comment style `* @tags a b`', () => {
    expect(parseTagsFromHeader('/**\n * @tags auth\n*/')).toEqual(['auth'])
  })

  it('deduplicates and sanitizes', () => {
    expect(parseTagsFromHeader('// @tags Auth AUTH auth!')).toEqual(['auth'])
  })

  it('returns empty when header has no tags', () => {
    expect(parseTagsFromHeader('describe("x")')).toEqual([])
  })

  it('ignores tag-lines past headerLines window', () => {
    const body = Array.from({ length: 25 }).map(() => 'nothing').join('\n') + '\n// @tags late'
    expect(parseTagsFromHeader(body, 20)).toEqual([])
  })
})

describe('T-C4 walkTestFiles', () => {
  it('finds *.spec.ts and *.test.ts recursively; skips node_modules/.dotdirs', () => {
    const root = mkTree({
      'a.spec.ts': '//',
      'sub/b.test.ts': '//',
      'node_modules/c.spec.ts': '//',
      '.hidden/d.spec.ts': '//',
      'e.md': 'ignored',
    })
    try {
      const files = walkTestFiles(root).map((f) => path.relative(root, f))
      expect(files).toContain('a.spec.ts')
      expect(files).toContain(path.join('sub', 'b.test.ts'))
      expect(files.every((f) => !f.includes('node_modules'))).toBe(true)
      expect(files.every((f) => !f.includes('.hidden'))).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('T-C4 indexTaggedFiles', () => {
  it('extracts tags per file; sorts output deterministically', () => {
    const root = mkTree({
      'tests/auth.spec.ts': '// @tags auth\ndescribe("auth")',
      'tests/billing.spec.ts': '// @tags billing checkout\ndescribe("bill")',
      'tests/untagged.spec.ts': 'describe("no tags")',
    })
    try {
      const idx = indexTaggedFiles(path.join(root, 'tests'))
      expect(idx).toHaveLength(3)
      const auth = idx.find((f) => f.file.endsWith('auth.spec.ts'))!
      expect(auth.tags).toEqual(['auth'])
      const untagged = idx.find((f) => f.file.endsWith('untagged.spec.ts'))!
      expect(untagged.tags).toEqual([])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('T-C4 findAffectedFiles', () => {
  it('returns only files whose tags intersect the --tags set', () => {
    const root = mkTree({
      'tests/auth.spec.ts': '// @tags auth\n',
      'tests/bill.spec.ts': '// @tags billing\n',
      'tests/mix.spec.ts': '// @tags auth billing\n',
      'tests/untagged.spec.ts': '',
    })
    try {
      const r = findAffectedFiles(root, { tags: ['auth'] })
      const files = r.matched.map((m) => path.basename(m.file))
      expect(files.sort()).toEqual(['auth.spec.ts', 'mix.spec.ts'])
      expect(r.skipped_untagged).toHaveLength(1)
      expect(r.total_files).toBe(4)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('includes untagged when --include-untagged is set', () => {
    const root = mkTree({
      'tests/a.spec.ts': '// @tags auth\n',
      'tests/u.spec.ts': '',
    })
    try {
      const r = findAffectedFiles(root, { tags: ['auth'], includeUntagged: true })
      const files = r.matched.map((m) => path.basename(m.file))
      expect(files.sort()).toEqual(['a.spec.ts', 'u.spec.ts'])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('sanitizes incoming tags (case + junk chars)', () => {
    const root = mkTree({
      'tests/a.spec.ts': '// @tags auth\n',
    })
    try {
      const r = findAffectedFiles(root, { tags: ['AUTH!!!', 'billing'] })
      expect(r.matched).toHaveLength(1)
      expect(r.tags).toEqual(['auth', 'billing'])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('handles missing dir gracefully', () => {
    const r = findAffectedFiles('/tmp/__never_exists_aff__', { tags: ['x'] })
    expect(r.matched).toEqual([])
    expect(r.total_files).toBe(0)
  })
})
