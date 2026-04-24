// lessons:skip-all
/**
 * T-000 Day-3 — prose importer regression tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import { parseMarkdownForLessons, importFromFile } from '../../src/lessons/importer'

describe('importer — markdown parsing', () => {
  it('extracts lesson-like headers in various formats', () => {
    const md = `
# Master lessons-learned

### L40 — Dev agent ignores FILE MODIFICATION DISCIPLINE

Happened 2026-04-22 on Tutor when pipeline modified 75 files.

## L41. Shared libs: AIRouter rsync broke eCabinet

Severity: CRITICAL. Fixed 2026-04-23.

#### L-24: Pipeline zombie cleanup

Status: RECURRING.
`
    const imported = parseMarkdownForLessons(md, '/fake/path.md')
    expect(imported.length).toBe(3)
    const ids = imported.map((i) => i.proposed_id)
    // Normalizer canonicalizes to L-<digits> for numeric ids (matches seed format L-F2, L-05 etc.)
    expect(ids).toContain('L-40')
    expect(ids).toContain('L-41')
    expect(ids).toContain('L-24')
  })

  it('emits valid YAML for each candidate (parseable by js-yaml)', () => {
    const md = `### L42 — Require domain admin\n2026-04-20 incident in Tutor.`
    const imported = parseMarkdownForLessons(md, '/x.md')
    expect(imported.length).toBe(1)
    const parsed = yaml.load(imported[0].yaml) as Record<string, unknown>
    expect(parsed.id).toBe('L-42')
    expect(parsed.title).toBe('Require domain admin')
    expect(parsed.first_observed).toBe('2026-04-20')
    expect(parsed.status).toBe('active')
  })

  it('extracts severity from body text', () => {
    const md = `### L50 — Some issue\n\nSeverity: CRITICAL. Big deal.`
    const imported = parseMarkdownForLessons(md, '/x.md')
    const parsed = yaml.load(imported[0].yaml) as Record<string, unknown>
    expect(parsed.severity).toBe('critical')
  })

  it('extracts known project names from body', () => {
    const md = `### L51 — X\n\nAffects eCabinet and PRO and Tutor.`
    const imported = parseMarkdownForLessons(md, '/x.md')
    const parsed = yaml.load(imported[0].yaml) as Record<string, unknown>
    const hits = parsed.projects_hit as string[]
    expect(hits).toContain('eCabinet')
    expect(hits).toContain('PRO')
    expect(hits).toContain('Tutor')
  })

  it('flags needs_review items for each stub', () => {
    const md = `### L99 — No date, no project mentions\n\nJust text.`
    const imported = parseMarkdownForLessons(md, '/x.md')
    expect(imported[0].needs_review.length).toBeGreaterThanOrEqual(3)
    expect(imported[0].needs_review.some((r) => /detection\.pattern/i.test(r))).toBe(true)
    expect(imported[0].needs_review.some((r) => /first_observed/i.test(r))).toBe(true)
  })

  it('returns empty array on non-lesson markdown', () => {
    const md = `# Regular doc\n\nNo lesson sections here.\n\n## Overview\n\nTotally unrelated content.`
    const imported = parseMarkdownForLessons(md, '/x.md')
    expect(imported).toEqual([])
  })

  it('importFromFile reads + parses real file', () => {
    const tmp = path.join(os.tmpdir(), `import-${Date.now()}.md`)
    fs.writeFileSync(tmp, `## L01 — Test\n2026-04-24\n`, 'utf8')
    try {
      const imported = importFromFile(tmp)
      expect(imported.length).toBe(1)
      expect(imported[0].proposed_id).toBe('L-01')
    } finally {
      fs.unlinkSync(tmp)
    }
  })
})
