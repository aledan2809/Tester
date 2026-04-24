// lessons:skip-all
/**
 * T-009 — A11y baseline + budget regression tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  storeBaseline,
  loadBaseline,
  diffAgainstBaseline,
  summarize,
  defaultBaselinePath,
  type RouteScan,
  type BaselineFile,
} from '../../src/a11y/baseline'
import { loadBudget, checkBudget, summarizeBudgetResults } from '../../src/a11y/budget'

function mkProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-'))
}

const SAMPLE_SCANS: RouteScan[] = [
  {
    route: '/home',
    violations: [
      { id: 'color-contrast', impact: 'serious', count: 3 },
      { id: 'label', impact: 'critical', count: 1 },
    ],
  },
  {
    route: '/admin',
    violations: [{ id: 'aria-valid-attr', impact: 'moderate', count: 2 }],
  },
]

describe('T-009 baseline — store + load roundtrip', () => {
  it('writes coverage/a11y-baseline.json and round-trips', () => {
    const root = mkProject()
    try {
      const { file, baseline } = storeBaseline(root, 'demo', SAMPLE_SCANS)
      expect(fs.existsSync(file)).toBe(true)
      expect(file).toBe(defaultBaselinePath(root))
      expect(baseline.project).toBe('demo')
      expect(baseline.routes['/home'].violations).toHaveLength(2)
      const loaded = loadBaseline(root)
      expect(loaded).not.toBeNull()
      expect(loaded!.routes['/home'].violations).toHaveLength(2)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('loadBaseline returns null when file is missing', () => {
    const root = mkProject()
    try {
      expect(loadBaseline(root)).toBeNull()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('loadBaseline returns null on corrupt JSON', () => {
    const root = mkProject()
    try {
      const file = defaultBaselinePath(root)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, '{not-json', 'utf8')
      expect(loadBaseline(root)).toBeNull()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('T-009 diffAgainstBaseline — regression detection', () => {
  const BASELINE: BaselineFile = {
    project: 'demo',
    captured_at: '2026-04-20T00:00:00Z',
    routes: {
      '/home': {
        violations: [
          { id: 'color-contrast', impact: 'serious', count: 3 },
          { id: 'label', impact: 'critical', count: 1 },
        ],
      },
      '/admin': {
        violations: [{ id: 'aria-valid-attr', impact: 'moderate', count: 2 }],
      },
    },
  }

  it('no changes → regression=false + all unchanged', () => {
    const scans: RouteScan[] = [
      {
        route: '/home',
        violations: [
          { id: 'color-contrast', impact: 'serious', count: 3 },
          { id: 'label', impact: 'critical', count: 1 },
        ],
      },
      { route: '/admin', violations: [{ id: 'aria-valid-attr', impact: 'moderate', count: 2 }] },
    ]
    const diff = diffAgainstBaseline(BASELINE, scans)
    expect(diff.regression).toBe(false)
    const home = diff.routes.find((r) => r.route === '/home')!
    expect(home.new_or_worse).toHaveLength(0)
    expect(home.unchanged.length).toBeGreaterThan(0)
  })

  it('new serious violation → regression=true + entry in new_or_worse', () => {
    const scans: RouteScan[] = [
      {
        route: '/home',
        violations: [
          { id: 'color-contrast', impact: 'serious', count: 3 },
          { id: 'label', impact: 'critical', count: 1 },
          { id: 'heading-order', impact: 'serious', count: 1 }, // NEW
        ],
      },
    ]
    const diff = diffAgainstBaseline(BASELINE, scans)
    expect(diff.regression).toBe(true)
    const home = diff.routes.find((r) => r.route === '/home')!
    expect(home.new_or_worse.some((e) => e.id === 'heading-order')).toBe(true)
  })

  it('new moderate violation → regression=false (only crit/serious fire)', () => {
    const scans: RouteScan[] = [
      {
        route: '/admin',
        violations: [
          { id: 'aria-valid-attr', impact: 'moderate', count: 2 },
          { id: 'region', impact: 'moderate', count: 1 }, // NEW but moderate
        ],
      },
    ]
    const diff = diffAgainstBaseline(BASELINE, scans)
    expect(diff.regression).toBe(false)
    const admin = diff.routes.find((r) => r.route === '/admin')!
    expect(admin.new_or_worse).toHaveLength(1)
  })

  it('baseline violation count decreased to 0 → fixed', () => {
    const scans: RouteScan[] = [
      { route: '/home', violations: [{ id: 'color-contrast', impact: 'serious', count: 3 }] },
    ]
    const diff = diffAgainstBaseline(BASELINE, scans)
    const home = diff.routes.find((r) => r.route === '/home')!
    expect(home.fixed.some((e) => e.id === 'label')).toBe(true)
  })

  it('baseline violation count increased → new_or_worse + regression=true on serious+', () => {
    const scans: RouteScan[] = [
      {
        route: '/home',
        violations: [
          { id: 'color-contrast', impact: 'serious', count: 10 }, // worsened
          { id: 'label', impact: 'critical', count: 1 },
        ],
      },
    ]
    const diff = diffAgainstBaseline(BASELINE, scans)
    const home = diff.routes.find((r) => r.route === '/home')!
    const cc = home.new_or_worse.find((e) => e.id === 'color-contrast')
    expect(cc?.delta).toBe(7)
    expect(diff.regression).toBe(true)
  })

  it('summarize aggregates correctly', () => {
    const scans: RouteScan[] = [
      {
        route: '/home',
        violations: [
          { id: 'color-contrast', impact: 'serious', count: 3 },
          { id: 'label', impact: 'critical', count: 2 }, // worsened from 1 → 2
          { id: 'focus', impact: 'critical', count: 1 }, // NEW
        ],
      },
    ]
    const diff = diffAgainstBaseline(BASELINE, scans)
    const s = summarize(diff)
    expect(s.critical_new).toBe(2)
    expect(s.serious_new).toBe(0)
    expect(s.new_or_worse_total).toBe(2)
  })
})

describe('T-009 budget — YAML load + per-route enforcement', () => {
  function writeBudget(root: string, content: string) {
    const dir = path.join(root, 'coverage')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'a11y-budget.yaml'), content, 'utf8')
  }

  it('loads budget YAML with defaults + per-route overrides', () => {
    const root = mkProject()
    try {
      writeBudget(
        root,
        `project: demo
defaults:
  critical: 0
  serious: 5
routes:
  /admin:
    critical: 0
    serious: 0
`,
      )
      const b = loadBudget(root)
      expect(b?.project).toBe('demo')
      expect(b?.defaults?.serious).toBe(5)
      expect(b?.routes?.['/admin']?.serious).toBe(0)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('checkBudget uses route override; falls back to defaults when absent', () => {
    const budget = {
      project: 'demo',
      defaults: { serious: 5, critical: 0 },
      routes: { '/admin': { serious: 0, critical: 0 } },
    }
    const results = checkBudget(budget, [
      { route: '/home', violations: [{ id: 'x', impact: 'serious', count: 4 }] },
      { route: '/admin', violations: [{ id: 'y', impact: 'serious', count: 1 }] },
    ])
    const home = results.find((r) => r.route === '/home')!
    const admin = results.find((r) => r.route === '/admin')!
    expect(home.passed).toBe(true) // 4 <= 5 default
    expect(admin.passed).toBe(false) // 1 > 0 override
    expect(admin.breaches).toContain('serious')
  })

  it('returns passed=true when no budget file (nothing to enforce)', () => {
    const results = checkBudget(null, [
      { route: '/x', violations: [{ id: 'a', impact: 'critical', count: 999 }] },
    ])
    expect(results[0].passed).toBe(true)
  })

  it('summarizeBudgetResults aggregates pass/fail/breach counts', () => {
    const budget = { defaults: { critical: 0 } }
    const results = checkBudget(budget, [
      { route: '/a', violations: [{ id: 'x', impact: 'critical', count: 1 }] },
      { route: '/b', violations: [{ id: 'y', impact: 'moderate', count: 100 }] },
    ])
    const sum = summarizeBudgetResults(results)
    expect(sum.total_routes).toBe(2)
    expect(sum.failed).toBe(1)
    expect(sum.passed).toBe(1)
  })
})
