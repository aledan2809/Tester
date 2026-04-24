// lessons:skip-all
/**
 * T-B2 — Regression store tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  addRegression,
  listRegressions,
  expireRegression,
  assertSlug,
  isExpired,
  renderRegressionSpec,
} from '../../src/regression/store'

function mkProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'reg-'))
}

describe('T-B2 assertSlug', () => {
  it('accepts valid slugs', () => {
    expect(() => assertSlug('four-way-match-over-invoice')).not.toThrow()
    expect(() => assertSlug('l-f8-tailwind-uppercase')).not.toThrow()
  })
  it('rejects invalid', () => {
    expect(() => assertSlug('Invalid')).toThrow()
    expect(() => assertSlug('space in it')).toThrow()
    expect(() => assertSlug('a'.repeat(100))).toThrow()
  })
})

describe('T-B2 renderRegressionSpec', () => {
  it('contains vitest imports, TODO note, lesson metadata', () => {
    const spec = renderRegressionSpec({
      slug: 'foo',
      title: 'vendor list dedup bug',
      capturedAt: '2026-04-24T00:00:00Z',
      lessonId: 'L-F10',
      fixCommit: 'abc123',
      expireAt: '2026-07-24',
    })
    expect(spec).toMatch(/lessons:skip-all/)
    expect(spec).toMatch(/L-F10/)
    expect(spec).toMatch(/abc123/)
    expect(spec).toMatch(/it\.skip\(/)
    expect(spec).toMatch(/vendor list dedup bug/)
  })

  it('inlines first 10 lines of original assertion as comments', () => {
    const spec = renderRegressionSpec({
      slug: 'foo',
      title: 'bar',
      capturedAt: '2026-04-24T00:00:00Z',
      originalAssertion: 'expected 200 got 500\nat /api/x',
    })
    expect(spec).toMatch(/Original assertion:/)
    expect(spec).toMatch(/expected 200 got 500/)
  })
})

describe('T-B2 addRegression + listRegressions', () => {
  it('writes spec + index + returns alreadyExists=false on first add', () => {
    const root = mkProject()
    try {
      const r = addRegression(root, {
        slug: 'demo-bug',
        title: 'demo bug',
        lessonId: 'L-F2',
      })
      expect(r.alreadyExists).toBe(false)
      expect(fs.existsSync(r.specFile)).toBe(true)
      expect(fs.existsSync(r.indexFile)).toBe(true)
      const list = listRegressions(root)
      expect(list.some((e) => e.slug === 'demo-bug')).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('second add with same slug updates index without re-writing spec', () => {
    const root = mkProject()
    try {
      addRegression(root, { slug: 'demo', title: 'first' })
      const r2 = addRegression(root, { slug: 'demo', title: 'updated', lessonId: 'L-F8' })
      expect(r2.alreadyExists).toBe(true)
      const list = listRegressions(root)
      expect(list).toHaveLength(1)
      expect(list[0].title).toBe('updated')
      expect(list[0].lessonId).toBe('L-F8')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('sorts index alphabetically', () => {
    const root = mkProject()
    try {
      addRegression(root, { slug: 'zeta', title: 'z' })
      addRegression(root, { slug: 'alpha', title: 'a' })
      const list = listRegressions(root)
      expect(list.map((e) => e.slug)).toEqual(['alpha', 'zeta'])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects invalid slug at add-time', () => {
    const root = mkProject()
    try {
      expect(() => addRegression(root, { slug: 'Bad Slug', title: 'x' })).toThrow()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('T-B2 expireRegression', () => {
  it('removes spec + index entry', () => {
    const root = mkProject()
    try {
      const added = addRegression(root, { slug: 'demo', title: 'to-go' })
      expect(fs.existsSync(added.specFile)).toBe(true)
      const r = expireRegression(root, 'demo')
      expect(r.removedSpec).toBe(added.specFile)
      expect(fs.existsSync(added.specFile)).toBe(false)
      expect(listRegressions(root).find((e) => e.slug === 'demo')).toBeUndefined()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('is a no-op (no throw) when slug does not exist', () => {
    const root = mkProject()
    try {
      const r = expireRegression(root, 'nope')
      expect(r.removedSpec).toBeNull()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('T-B2 isExpired', () => {
  it('returns true when expireAt is in the past', () => {
    expect(isExpired({ slug: 'x', title: 'x', capturedAt: '2026-01-01', expireAt: '2020-01-01' })).toBe(true)
  })
  it('returns false when expireAt is in the future', () => {
    expect(
      isExpired({ slug: 'x', title: 'x', capturedAt: '2026-01-01', expireAt: '2999-01-01' }),
    ).toBe(false)
  })
  it('returns false when expireAt is missing', () => {
    expect(isExpired({ slug: 'x', title: 'x', capturedAt: '2026-01-01' })).toBe(false)
  })
})
