/**
 * T-000 Day-1 — loader regression tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { loadLessons, parseYamlLesson } from '../../src/lessons/loader'

const LESSONS_DIR = path.resolve(__dirname, '../../lessons')

describe('lessons loader — corpus', () => {
  it('loads the 3 Day-1 seed lessons without errors', () => {
    const { lessons, errors } = loadLessons(LESSONS_DIR)
    expect(errors).toEqual([])
    expect(lessons.length).toBeGreaterThanOrEqual(3)
    const ids = lessons.map((l) => l.id).sort()
    expect(ids).toContain('L-F2')
    expect(ids).toContain('L-F8')
    expect(ids).toContain('L-F10')
  })

  it('seed lessons all have non-empty detection arrays', () => {
    const { lessons } = loadLessons(LESSONS_DIR)
    for (const l of lessons) {
      expect(l.detection.length).toBeGreaterThan(0)
      for (const rule of l.detection) {
        expect(rule.type).toBeTruthy()
        expect(rule.pattern).toBeTruthy()
        expect(rule.message).toBeTruthy()
        expect(() => new RegExp(rule.pattern)).not.toThrow()
      }
    }
  })

  it('all seed lessons are status=active', () => {
    const { lessons } = loadLessons(LESSONS_DIR)
    for (const l of lessons) {
      expect(l.status).toBe('active')
    }
  })
})

describe('lessons loader — validation', () => {
  it('rejects YAML missing id field', () => {
    const bad = `slug: test\ntitle: missing id\nfirst_observed: 2026-04-24\nprojects_hit: []\ncontexts_hit: [cc-session]\nhit_count: 0\nseverity: low\ntags: []\ndetection: [{type: regex_in_test_file, pattern: "foo", message: "m"}]\nstatus: active`
    const result = parseYamlLesson(bad, 'test.yaml')
    expect('message' in result && !('id' in result)).toBe(true)
  })

  it('rejects lesson with invalid severity', () => {
    const bad = `id: L-TEST\nslug: test\ntitle: bad severity\nfirst_observed: 2026-04-24\nprojects_hit: []\ncontexts_hit: [cc-session]\nhit_count: 0\nseverity: emergency\ntags: []\ndetection: [{type: regex_in_test_file, pattern: "foo", message: "m"}]\nstatus: active`
    const result = parseYamlLesson(bad, 'test.yaml')
    expect('message' in result && !('id' in result)).toBe(true)
  })

  it('rejects lesson with invalid regex pattern', () => {
    const bad = `id: L-TEST\nslug: test\ntitle: bad regex\nfirst_observed: 2026-04-24\nprojects_hit: []\ncontexts_hit: [cc-session]\nhit_count: 0\nseverity: low\ntags: []\ndetection: [{type: regex_in_test_file, pattern: "(", message: "m"}]\nstatus: active`
    const result = parseYamlLesson(bad, 'test.yaml')
    expect('message' in result && !('id' in result)).toBe(true)
  })

  it('accepts a minimal valid lesson', () => {
    const good = `id: L-TEST
slug: test
title: minimal valid lesson
first_observed: 2026-04-24
projects_hit: []
contexts_hit: [cc-session]
hit_count: 0
severity: low
tags: []
detection:
  - type: regex_in_test_file
    pattern: 'TODO'
    message: 'has TODO'
status: active`
    const result = parseYamlLesson(good, 'test.yaml')
    expect('id' in result && result.id === 'L-TEST').toBe(true)
  })

  it('reports duplicate ids as corpus errors', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-test-'))
    try {
      const yaml = `id: L-DUP\nslug: a\ntitle: one\nfirst_observed: 2026-04-24\nprojects_hit: []\ncontexts_hit: [cc-session]\nhit_count: 0\nseverity: low\ntags: []\ndetection: [{type: regex_in_test_file, pattern: "x", message: "m"}]\nstatus: active\n`
      fs.writeFileSync(path.join(tmpDir, 'a.yaml'), yaml)
      fs.writeFileSync(path.join(tmpDir, 'b.yaml'), yaml)
      const { lessons, errors } = loadLessons(tmpDir)
      expect(lessons.length).toBe(2)
      expect(errors.some((e) => /duplicate lesson id/i.test(e.message))).toBe(true)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('returns error when lessons dir does not exist', () => {
    const { lessons, errors } = loadLessons('/nonexistent/path/to/lessons')
    expect(lessons).toEqual([])
    expect(errors.length).toBe(1)
  })
})
