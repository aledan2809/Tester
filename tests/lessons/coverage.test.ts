// lessons:skip-all
/**
 * T-002 — Coverage matrix regression tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  parseCoverageYaml,
  loadCoverageMatrix,
  loadCoverageForProject,
  computeStats,
  buildReport,
} from '../../src/coverage/loader'
import type { CoverageMatrix } from '../../src/coverage/schema'

function writeYaml(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-'))
  const file = path.join(dir, 'feature.yaml')
  fs.writeFileSync(file, content, 'utf8')
  return file
}

function writeProjectWithCoverage(features: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-proj-'))
  fs.mkdirSync(path.join(root, 'coverage'))
  for (const [name, content] of Object.entries(features)) {
    fs.writeFileSync(path.join(root, 'coverage', `${name}.yaml`), content, 'utf8')
  }
  return root
}

describe('coverage — parseCoverageYaml', () => {
  it('parses a minimal valid matrix', () => {
    const result = parseCoverageYaml(`
feature: sample
owner: test
scenarios:
  - id: A1
    name: test one
    severity: high
    covered_by: tests/a.spec.ts
    status: covered
`)
    expect('feature' in result).toBe(true)
    const m = result as CoverageMatrix
    expect(m.feature).toBe('sample')
    expect(m.scenarios).toHaveLength(1)
    expect(m.scenarios[0].id).toBe('A1')
  })

  it('rejects missing feature', () => {
    const r = parseCoverageYaml('owner: x\nscenarios: []')
    expect('message' in r && !('feature' in r)).toBe(true)
  })

  it('rejects invalid severity', () => {
    const r = parseCoverageYaml(`
feature: x
owner: y
scenarios:
  - id: A
    name: n
    severity: emergency
    covered_by: t
    status: covered
`)
    expect('message' in r && !('feature' in r)).toBe(true)
  })

  it('rejects invalid status', () => {
    const r = parseCoverageYaml(`
feature: x
owner: y
scenarios:
  - id: A
    name: n
    severity: high
    covered_by: t
    status: maybe
`)
    expect('message' in r && !('feature' in r)).toBe(true)
  })

  it('loads optional fields (category, notes, lesson)', () => {
    const result = parseCoverageYaml(`
feature: x
owner: y
scenarios:
  - id: A
    name: n
    category: auth
    severity: high
    covered_by: t
    status: covered
    notes: ok
    lesson: L-05
`)
    const m = result as CoverageMatrix
    expect(m.scenarios[0].category).toBe('auth')
    expect(m.scenarios[0].notes).toBe('ok')
    expect(m.scenarios[0].lesson).toBe('L-05')
  })
})

describe('coverage — computeStats', () => {
  it('computes ratios correctly', () => {
    const m: CoverageMatrix = {
      feature: 'x',
      owner: 'y',
      scenarios: [
        { id: 'A', name: 'a', severity: 'high', covered_by: 't', status: 'covered' },
        { id: 'B', name: 'b', severity: 'medium', covered_by: null, status: 'missing' },
        { id: 'C', name: 'c', severity: 'low', covered_by: null, status: 'skipped' },
        { id: 'D', name: 'd', severity: 'critical', covered_by: null, status: 'missing' },
      ],
    }
    const s = computeStats(m)
    expect(s.total).toBe(4)
    expect(s.covered).toBe(1)
    expect(s.missing).toBe(2)
    expect(s.skipped).toBe(1)
    // coverage ratio = covered / (total - skipped) = 1 / 3
    expect(s.coverage_ratio).toBeCloseTo(1 / 3)
    expect(s.critical_missing).toBe(1)
    expect(s.medium_missing).toBe(1)
  })

  it('treats zero scenarios as 100% coverage', () => {
    const m: CoverageMatrix = { feature: 'empty', owner: 'y', scenarios: [] }
    expect(computeStats(m).coverage_ratio).toBe(1)
  })
})

describe('coverage — buildReport orders scenarios (missing + severity desc)', () => {
  it('puts missing first, then by severity descending', () => {
    const m: CoverageMatrix = {
      feature: 'x',
      owner: 'y',
      scenarios: [
        { id: 'A', name: 'a-covered-low', severity: 'low', covered_by: 't', status: 'covered' },
        { id: 'B', name: 'b-missing-med', severity: 'medium', covered_by: null, status: 'missing' },
        { id: 'C', name: 'c-missing-crit', severity: 'critical', covered_by: null, status: 'missing' },
        { id: 'D', name: 'd-covered-high', severity: 'high', covered_by: 't', status: 'covered' },
      ],
    }
    const r = buildReport(m, '/tmp/x')
    expect(r.ordered_scenarios[0].id).toBe('C') // missing + critical first
    expect(r.ordered_scenarios[1].id).toBe('B') // missing + medium next
    // Then the two covered scenarios by severity desc
    expect(r.ordered_scenarios[2].severity).toBe('high')
  })
})

describe('coverage — project-level loader', () => {
  it('loads all coverage/*.yaml from a project dir', () => {
    const root = writeProjectWithCoverage({
      'auth': `feature: auth\nowner: me\nscenarios:\n  - {id: A, name: a, severity: high, covered_by: t, status: covered}\n`,
      'billing': `feature: billing\nowner: me\nscenarios:\n  - {id: B, name: b, severity: medium, covered_by: null, status: missing}\n`,
    })
    try {
      const loaded = loadCoverageForProject(root)
      expect(loaded).toHaveLength(2)
      expect(loaded.every((l) => 'feature' in l.result)).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns empty array when no coverage/ dir exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'no-cov-'))
    try {
      expect(loadCoverageForProject(root)).toEqual([])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('surfaces per-file errors without aborting', () => {
    const root = writeProjectWithCoverage({
      'good': `feature: good\nowner: me\nscenarios:\n  - {id: A, name: a, severity: high, covered_by: t, status: covered}\n`,
      'bad': `not-yaml{{{`,
    })
    try {
      const loaded = loadCoverageForProject(root)
      expect(loaded).toHaveLength(2)
      const good = loaded.find((l) => l.file.endsWith('good.yaml'))
      const bad = loaded.find((l) => l.file.endsWith('bad.yaml'))
      expect(good && 'feature' in good.result).toBe(true)
      expect(bad && 'message' in bad.result && !('feature' in bad.result)).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('coverage — loadCoverageMatrix errors', () => {
  it('returns error when file does not exist', () => {
    const r = loadCoverageMatrix('/tmp/definitely-nowhere-xyz-abc.yaml')
    expect('message' in r).toBe(true)
  })

  it('loads a valid yaml file', () => {
    const file = writeYaml(`feature: x\nowner: y\nscenarios:\n  - {id: A, name: a, severity: low, covered_by: t, status: covered}\n`)
    try {
      const r = loadCoverageMatrix(file)
      expect('feature' in r).toBe(true)
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true })
    }
  })
})
