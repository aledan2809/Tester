// lessons:skip-all
/**
 * T-D4 — Inventory aggregator tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  buildInventory,
  discoverProjectRoots,
  renderInventoryMarkdown,
} from '../../src/inventory/aggregator'

function mkParent(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'inv-'))
}

function mkProject(parent: string, name: string, files: Record<string, string>): string {
  const root = path.join(parent, name)
  fs.mkdirSync(root, { recursive: true })
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content, 'utf8')
  }
  return root
}

const COVERAGE_FULL = `feature: demo
owner: x
scenarios:
  - id: A
    name: ok
    severity: low
    covered_by: t.spec.ts
    status: covered
`

const COVERAGE_GAPS = `feature: auth
owner: x
scenarios:
  - id: A
    name: covered
    severity: low
    covered_by: t.spec.ts
    status: covered
  - id: B
    name: critical gap
    severity: critical
    covered_by: null
    status: missing
`

const FEATURES_IDX_DONE = `features:
  - feature: demo
    owner: x
    coverage_file: coverage/demo.yaml
    spec_file: tests/demo/index.spec.ts
    added_at: 2026-04-24T00:00:00Z
    status: done
    done_at: 2026-04-24T00:00:00Z
`

describe('T-D4 buildInventory', () => {
  it('aggregates scenarios + features + gaps across projects', () => {
    const parent = mkParent()
    try {
      const p1 = mkProject(parent, 'alpha', {
        'coverage/demo.yaml': COVERAGE_FULL,
        'coverage/features.yaml': FEATURES_IDX_DONE,
      })
      const p2 = mkProject(parent, 'beta', {
        'coverage/auth.yaml': COVERAGE_GAPS,
        'AUDIT_GAPS.md': `| Gap ID | Severity | Area | Description | Status | Resolution |
|--|--|--|--|--|--|
| G-1 | high | x | gap | Open | - |
`,
      })
      const r = buildInventory([p1, p2])
      expect(r.projects).toHaveLength(2)
      expect(r.projects.map((p) => p.project).sort()).toEqual(['alpha', 'beta'])

      const alpha = r.projects.find((p) => p.project === 'alpha')!
      expect(alpha.features.total).toBe(1)
      expect(alpha.features.done).toBe(1)
      expect(alpha.scenarios.coverage_ratio).toBe(1)

      const beta = r.projects.find((p) => p.project === 'beta')!
      expect(beta.scenarios.critical_missing).toBe(1)
      expect(beta.audit_gaps_open).toBe(1)
      expect(beta.features.total).toBe(0)

      expect(r.aggregate.project_count).toBe(2)
      expect(r.aggregate.features_done).toBe(1)
      expect(r.aggregate.critical_missing).toBe(1)
      expect(r.aggregate.audit_gaps_open).toBe(1)
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })

  it('skips non-existent / non-directory roots without throwing', () => {
    const r = buildInventory(['/tmp/__never_exists_inv__'])
    expect(r.projects).toEqual([])
    expect(r.aggregate.project_count).toBe(0)
  })

  it('detects a11y + visual baselines presence', () => {
    const parent = mkParent()
    try {
      const root = mkProject(parent, 'gamma', {
        'coverage/a11y-baseline.json': '{"project":"x","captured_at":"2026-04-24","routes":{}}',
        '.tester/baselines/gamma/root.png': 'fake-png',
      })
      const r = buildInventory([root])
      expect(r.projects[0].has_a11y_baseline).toBe(true)
      expect(r.projects[0].has_visual_baselines).toBe(true)
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})

describe('T-D4 discoverProjectRoots', () => {
  it('lists direct children sorted, skipping dot-dirs + node_modules', () => {
    const parent = mkParent()
    try {
      mkProject(parent, 'alpha', { 'README.md': '#' })
      mkProject(parent, 'beta', { 'README.md': '#' })
      mkProject(parent, '.hidden', { 'README.md': '#' })
      mkProject(parent, 'node_modules', { 'README.md': '#' })
      const roots = discoverProjectRoots(parent)
      const names = roots.map((r) => path.basename(r))
      expect(names).toEqual(['alpha', 'beta'])
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })

  it('filters by regex when provided', () => {
    const parent = mkParent()
    try {
      mkProject(parent, 'keeper-1', { 'README.md': '#' })
      mkProject(parent, 'skip-me', { 'README.md': '#' })
      const roots = discoverProjectRoots(parent, /^keeper-/)
      expect(roots.map((r) => path.basename(r))).toEqual(['keeper-1'])
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})

describe('T-D4 renderInventoryMarkdown', () => {
  it('contains Projects scanned header + per-project table rows', () => {
    const parent = mkParent()
    try {
      const p = mkProject(parent, 'alpha', { 'coverage/demo.yaml': COVERAGE_FULL })
      const md = renderInventoryMarkdown(buildInventory([p]))
      expect(md).toMatch(/# Cross-project test inventory/)
      expect(md).toMatch(/alpha/)
      expect(md).toMatch(/Projects scanned/)
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})
