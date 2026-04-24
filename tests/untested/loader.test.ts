// lessons:skip-all
/**
 * T-006 — `tester untested` loader regression tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  parseAuditGapsMarkdown,
  parseDevStatusTodo,
  loadCoverageUntested,
  loadAuditGapsUntested,
  loadDevStatusUntested,
  loadReportsUntested,
  buildUntestedReport,
  rankItems,
} from '../../src/untested/loader'

function mkProject(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'untested-'))
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content, 'utf8')
  }
  return root
}

describe('untested — parseAuditGapsMarkdown', () => {
  it('surfaces Open rows and ignores Eliminated + placeholder rows', () => {
    const md = `
## Open Gaps

| Gap ID | Severity | Area | Description | Status | Resolution |
|--------|----------|------|-------------|--------|------------|
| G-001  | high     | auth | JWT secret mismatch | Open | — |
| G-002  | medium   | ui   | Dead link on /contact | Eliminated | commit abc |
| —      | —        | —    | —                    | —    | —         |
| G-003  | critical | db   | Missing migration    | Open | — |
`
    const items = parseAuditGapsMarkdown(md, '/tmp/AUDIT_GAPS.md')
    expect(items).toHaveLength(2)
    const ids = items.map((i) => i.id).sort()
    expect(ids).toEqual(['G-001', 'G-003'])
    const crit = items.find((i) => i.id === 'G-003')
    expect(crit?.severity).toBe('critical')
    expect(crit?.source).toBe('audit_gaps')
    expect(crit?.area).toBe('db')
  })

  it('returns empty array when there is no table', () => {
    expect(parseAuditGapsMarkdown('# empty', '/tmp/x.md')).toEqual([])
  })

  it('is resilient when Status column is in a different position', () => {
    const md = `
| Status | Gap ID | Severity | Description |
|--------|--------|----------|-------------|
| Open   | G-7    | low      | cosmetic    |
`
    const items = parseAuditGapsMarkdown(md, '/tmp/x.md')
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('G-7')
    expect(items[0].severity).toBe('low')
  })
})

describe('untested — parseDevStatusTodo', () => {
  it('captures only unchecked items under a TODO heading', () => {
    const md = `
# Status

## Current State
- Something shipped.

## TODO
- [ ] **T-006** build untested CLI
- [x] T-001 already done
- [ ] **G-123** fix Stripe blocker (P0)
- [ ] add docs

## Other Section
- [ ] not in scope
`
    const items = parseDevStatusTodo(md, '/tmp/ds.md')
    const ids = items.map((i) => i.id)
    expect(ids).toContain('T-006')
    expect(ids).toContain('G-123')
    // DS-### synthesized for items without leading **TAG**
    expect(ids.some((id) => id.startsWith('DS-'))).toBe(true)
    // "not in scope" must be excluded (different heading)
    expect(items.find((i) => i.title === 'not in scope')).toBeUndefined()
    // P0 tagged item bumps severity to high
    const p0 = items.find((i) => i.id === 'G-123')
    expect(p0?.severity).toBe('high')
  })

  it('stops parsing TODO when a same-or-shallower heading appears', () => {
    const md = `
### TODO
- [ ] one
### After TODO
- [ ] should-not-appear
`
    const items = parseDevStatusTodo(md, '/tmp/ds.md')
    expect(items.map((i) => i.title)).toEqual(['one'])
  })

  it('returns empty array when there is no TODO heading', () => {
    expect(parseDevStatusTodo('# no todo here', '/tmp/x.md')).toEqual([])
  })
})

describe('untested — loadCoverageUntested', () => {
  it('surfaces coverage scenarios with status=missing', () => {
    const yaml = `feature: sample
owner: test
scenarios:
  - id: A1
    name: covered case
    severity: high
    covered_by: tests/a.spec.ts
    status: covered
  - id: A2
    name: missing critical case
    severity: critical
    covered_by: null
    status: missing
  - id: A3
    name: missing low case
    severity: low
    covered_by: null
    status: missing
`
    const root = mkProject({ 'coverage/sample.yaml': yaml })
    const items = loadCoverageUntested(root)
    expect(items).toHaveLength(2)
    const ids = items.map((i) => i.id)
    expect(ids).toContain('COV:sample:A2')
    expect(ids).toContain('COV:sample:A3')
    const crit = items.find((i) => i.id === 'COV:sample:A2')
    expect(crit?.severity).toBe('critical')
    expect(crit?.source).toBe('coverage')
  })

  it('returns empty array when project has no coverage dir', () => {
    const root = mkProject({ 'README.md': '# no coverage' })
    expect(loadCoverageUntested(root)).toEqual([])
  })
})

describe('untested — loadReportsUntested', () => {
  it('extracts findings with an id + non-resolved status', () => {
    const body = JSON.stringify({
      findings: [
        { id: 'F-1', severity: 'high', title: 'open issue', status: 'open' },
        { id: 'F-2', severity: 'medium', title: 'closed', status: 'resolved' },
        { id: 'F-3', severity: 'low', description: 'no status — kept by default' },
      ],
    })
    const root = mkProject({ 'Reports/audit.json': body })
    const items = loadReportsUntested(root)
    const ids = items.map((i) => i.id)
    expect(ids).toContain('audit.json:F-1')
    expect(ids).toContain('audit.json:F-3')
    expect(ids.some((i) => i.endsWith('F-2'))).toBe(false)
  })

  it('tolerates non-JSON / malformed files', () => {
    const root = mkProject({ 'Reports/notes.json': '{not-json' })
    expect(loadReportsUntested(root)).toEqual([])
  })
})

describe('untested — rankItems', () => {
  it('orders by severity desc then source preference', () => {
    const items = rankItems([
      { id: 'b', title: 'b', source: 'reports', severity: 'high', evidenceFile: '/x' },
      { id: 'a', title: 'a', source: 'coverage', severity: 'high', evidenceFile: '/x' },
      { id: 'c', title: 'c', source: 'audit_gaps', severity: 'critical', evidenceFile: '/x' },
    ])
    expect(items.map((i) => i.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('untested — buildUntestedReport', () => {
  it('aggregates four sources in the canonical fixture layout', () => {
    const root = mkProject({
      'coverage/sample.yaml': `feature: sample
owner: test
scenarios:
  - id: Q1
    name: missing critical
    severity: critical
    covered_by: null
    status: missing
`,
      'AUDIT_GAPS.md': `
| Gap ID | Severity | Area | Description | Status | Resolution |
|--------|----------|------|-------------|--------|------------|
| G-9    | high     | auth | open gap    | Open   | —          |
`,
      'DEVELOPMENT_STATUS.md': `
## TODO
- [ ] **T-006** implement untested CLI
`,
      'Reports/audit.json': JSON.stringify({
        findings: [{ id: 'R-1', severity: 'medium', title: 'open', status: 'open' }],
      }),
    })
    const rep = buildUntestedReport(root)
    expect(rep.counts.total).toBe(4)
    expect(rep.counts.by_source.coverage).toBe(1)
    expect(rep.counts.by_source.audit_gaps).toBe(1)
    expect(rep.counts.by_source.dev_status).toBe(1)
    expect(rep.counts.by_source.reports).toBe(1)
    expect(rep.items[0].severity).toBe('critical')
    expect(rep.items[0].source).toBe('coverage')
  })

  it('filters sources via opts.sources', () => {
    const root = mkProject({
      'AUDIT_GAPS.md': `
| Gap ID | Severity | Area | Description | Status | Resolution |
|--------|----------|------|-------------|--------|------------|
| G-9    | high     | auth | open gap    | Open   | —          |
`,
      'DEVELOPMENT_STATUS.md': `
## TODO
- [ ] todo-only
`,
    })
    const rep = buildUntestedReport(root, { sources: ['audit_gaps'] })
    expect(rep.counts.total).toBe(1)
    expect(rep.counts.by_source.audit_gaps).toBe(1)
    expect(rep.counts.by_source.dev_status).toBe(0)
  })
})

describe('untested — source loaders on empty project', () => {
  it('returns empty arrays rather than throwing', () => {
    const root = mkProject({ 'README.md': '# empty' })
    expect(loadAuditGapsUntested(root)).toEqual([])
    expect(loadDevStatusUntested(root)).toEqual([])
    expect(loadReportsUntested(root)).toEqual([])
  })
})
