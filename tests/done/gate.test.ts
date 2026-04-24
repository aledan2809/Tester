// lessons:skip-all
/**
 * T-D1 — `tester done` gate regression tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { evaluateDone, markDone, markUndone, readDoneStatus } from '../../src/done/gate'

function mkProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'done-'))
}

function writeCoverage(root: string, feature: string, missing: 'none' | 'critical' | 'lowonly') {
  const dir = path.join(root, 'coverage')
  fs.mkdirSync(dir, { recursive: true })
  const base = [
    'feature: ' + feature,
    'owner: test',
    'scenarios:',
  ]
  const add = (id: string, sev: string, status: string) =>
    base.push(
      `  - id: ${id}`,
      `    name: s ${id}`,
      `    severity: ${sev}`,
      `    covered_by: tests/x.spec.ts`,
      `    status: ${status}`,
    )
  add('A1', 'high', 'covered')
  if (missing === 'none') add('A2', 'low', 'covered')
  if (missing === 'critical') add('A2', 'critical', 'missing')
  if (missing === 'lowonly') add('A2', 'low', 'missing')
  fs.writeFileSync(path.join(dir, `${feature}.yaml`), base.join('\n'), 'utf8')
}

function seedA11yBaseline(root: string) {
  const dir = path.join(root, 'coverage')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'a11y-baseline.json'),
    JSON.stringify({ project: 'x', captured_at: '2026-04-24', routes: {} }),
    'utf8',
  )
}

function seedVisualBaseline(root: string) {
  const base = path.basename(root)
  const dir = path.join(root, '.tester', 'baselines', base)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'root.png'), 'fake-png', 'utf8')
}

describe('T-D1 evaluateDone — happy path', () => {
  it('passes when coverage + tests + baselines all green', () => {
    const root = mkProject()
    try {
      writeCoverage(root, 'demo', 'none')
      seedA11yBaseline(root)
      seedVisualBaseline(root)
      const r = evaluateDone({
        feature: 'demo',
        projectRoot: root,
        testsPassing: 10,
        testsTotal: 10,
      })
      expect(r.passed).toBe(true)
      expect(r.reasons).toEqual([])
      expect(r.coverage_pass).toBe(true)
      expect(r.tests_pass).toBe(true)
      expect(r.a11y_baseline_present).toBe(true)
      expect(r.visual_baseline_present).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('T-D1 evaluateDone — failure cases', () => {
  it('fails when coverage yaml missing', () => {
    const root = mkProject()
    try {
      const r = evaluateDone({
        feature: 'demo',
        projectRoot: root,
        testsPassing: 10,
        testsTotal: 10,
        skipA11y: true,
        skipVisual: true,
      })
      expect(r.passed).toBe(false)
      expect(r.reasons.join(' ')).toMatch(/coverage\/demo\.yaml missing/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails when critical-missing scenarios exist', () => {
    const root = mkProject()
    try {
      writeCoverage(root, 'demo', 'critical')
      seedA11yBaseline(root)
      seedVisualBaseline(root)
      const r = evaluateDone({
        feature: 'demo',
        projectRoot: root,
        testsPassing: 10,
        testsTotal: 10,
      })
      expect(r.passed).toBe(false)
      expect(r.critical_missing).toBe(1)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails when coverage ratio < --fail-under', () => {
    const root = mkProject()
    try {
      writeCoverage(root, 'demo', 'lowonly') // 1/2 = 50%
      seedA11yBaseline(root)
      seedVisualBaseline(root)
      const r = evaluateDone({
        feature: 'demo',
        projectRoot: root,
        testsPassing: 10,
        testsTotal: 10,
        failUnder: 0.9,
      })
      expect(r.passed).toBe(false)
      expect(r.reasons.join(' ')).toMatch(/coverage_ratio/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails when tests pass_rate < 100%', () => {
    const root = mkProject()
    try {
      writeCoverage(root, 'demo', 'none')
      seedA11yBaseline(root)
      seedVisualBaseline(root)
      const r = evaluateDone({
        feature: 'demo',
        projectRoot: root,
        testsPassing: 9,
        testsTotal: 10,
      })
      expect(r.passed).toBe(false)
      expect(r.tests_pass).toBe(false)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails when a11y baseline missing (unless --skip-a11y)', () => {
    const root = mkProject()
    try {
      writeCoverage(root, 'demo', 'none')
      seedVisualBaseline(root)
      const failing = evaluateDone({
        feature: 'demo',
        projectRoot: root,
        testsPassing: 10,
        testsTotal: 10,
      })
      expect(failing.passed).toBe(false)
      expect(failing.a11y_baseline_present).toBe(false)

      const skipped = evaluateDone({
        feature: 'demo',
        projectRoot: root,
        testsPassing: 10,
        testsTotal: 10,
        skipA11y: true,
      })
      expect(skipped.passed).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails when tests counts not provided', () => {
    const root = mkProject()
    try {
      writeCoverage(root, 'demo', 'none')
      seedA11yBaseline(root)
      seedVisualBaseline(root)
      const r = evaluateDone({ feature: 'demo', projectRoot: root })
      expect(r.passed).toBe(false)
      expect(r.reasons.join(' ')).toMatch(/tests_passing/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('T-D1 markDone + markUndone + status', () => {
  it('markDone upserts features.yaml with status=done + done_at + done_commit', () => {
    const root = mkProject()
    try {
      const r = markDone(root, 'demo', 'abc1234')
      expect(fs.existsSync(r.file)).toBe(true)
      const entries = readDoneStatus(root)
      const demo = entries.find((e) => e.feature === 'demo')!
      expect(demo.status).toBe('done')
      expect(demo.done_commit).toBe('abc1234')
      expect(typeof demo.done_at).toBe('string')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('markUndone flips status back to open when entry exists', () => {
    const root = mkProject()
    try {
      markDone(root, 'demo')
      const r = markUndone(root, 'demo')
      expect(r.updated).toBe(true)
      const entries = readDoneStatus(root)
      expect(entries.find((e) => e.feature === 'demo')?.status).toBe('open')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('markUndone is idempotent no-op when feature unknown', () => {
    const root = mkProject()
    try {
      const r = markUndone(root, 'ghost')
      expect(r.updated).toBe(false)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
