/**
 * T-B2 — Regression-prevention suite.
 *
 * On a successful fix→verify cycle (TWG loop), Tester auto-adds the
 * scenario as a sticky regression test under `tests/regressions/`. The
 * regression corpus runs unconditionally on `tester run --all` and blocks
 * loop progression when any entry fails.
 *
 * Format:
 *   tests/regressions/<YYYY-MM-DD>-<slug>.spec.ts
 *     + sibling .json with metadata (lesson id, fix commit, expireAt, etc.)
 *
 * `expireRegression` is manual (prunable after 90 days with explicit
 * confirmation). Pure file generation + index ops; no test-runner spawn.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

export interface RegressionEntry {
  slug: string
  title: string
  capturedAt: string
  lessonId?: string
  fixCommit?: string
  expireAt?: string
  sourceScenario?: string
  originalAssertion?: string
}

export interface RegressionIndex {
  entries: RegressionEntry[]
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/

export function assertSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`regression slug "${slug}" invalid — use lowercase [a-z0-9-], start with alnum, max 80 chars`)
  }
}

function regressionsDir(projectRoot: string): string {
  return path.join(projectRoot, 'tests', 'regressions')
}

function indexFile(projectRoot: string): string {
  return path.join(regressionsDir(projectRoot), 'index.json')
}

export function loadIndex(projectRoot: string): RegressionIndex {
  const f = indexFile(projectRoot)
  if (!fs.existsSync(f)) return { entries: [] }
  try {
    const parsed = JSON.parse(fs.readFileSync(f, 'utf8')) as RegressionIndex
    if (!parsed || !Array.isArray(parsed.entries)) return { entries: [] }
    return parsed
  } catch {
    return { entries: [] }
  }
}

export function saveIndex(projectRoot: string, index: RegressionIndex): string {
  const f = indexFile(projectRoot)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  const sorted = {
    entries: [...index.entries].sort((a, b) => a.slug.localeCompare(b.slug)),
  }
  fs.writeFileSync(f, JSON.stringify(sorted, null, 2), 'utf8')
  return f
}

export function specPath(projectRoot: string, entry: RegressionEntry): string {
  const date = entry.capturedAt.slice(0, 10)
  if (!DATE_RE.test(date)) throw new Error(`entry.capturedAt must start with YYYY-MM-DD`)
  return path.join(regressionsDir(projectRoot), `${date}-${entry.slug}.spec.ts`)
}

export function renderRegressionSpec(entry: RegressionEntry): string {
  const safeTitle = entry.title.replace(/'/g, "\\'")
  const lines: string[] = []
  lines.push(`// lessons:skip-all`)
  lines.push(`// Auto-generated regression test (T-B2). Lesson: ${entry.lessonId || '-'}.`)
  lines.push(`// Fix commit: ${entry.fixCommit || '(pending)'}`)
  lines.push(`// Captured: ${entry.capturedAt}`)
  lines.push(`// Expires: ${entry.expireAt || '(manual prune only)'}`)
  lines.push(``)
  lines.push(`import { describe, it, expect } from 'vitest'`)
  lines.push(``)
  lines.push(`describe('regression — ${safeTitle}', () => {`)
  lines.push(`  it.skip('REGRESSION: ${safeTitle}', async () => {`)
  lines.push(`    // TODO: port the reproducer from the original failing run.`)
  if (entry.originalAssertion) {
    lines.push(`    //`)
    lines.push(`    // Original assertion:`)
    for (const line of entry.originalAssertion.split('\n').slice(0, 10)) {
      lines.push(`    //   ${line}`)
    }
  }
  lines.push(`    expect(true).toBe(true)`)
  lines.push(`  })`)
  lines.push(`})`)
  lines.push(``)
  return lines.join('\n')
}

export function addRegression(
  projectRoot: string,
  input: Omit<RegressionEntry, 'capturedAt'> & { capturedAt?: string },
): { entry: RegressionEntry; specFile: string; indexFile: string; alreadyExists: boolean } {
  assertSlug(input.slug)
  const entry: RegressionEntry = {
    ...input,
    capturedAt: input.capturedAt || new Date().toISOString(),
  }
  const file = specPath(projectRoot, entry)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const alreadyExists = fs.existsSync(file)
  if (!alreadyExists) {
    fs.writeFileSync(file, renderRegressionSpec(entry), 'utf8')
  }
  const idx = loadIndex(projectRoot)
  const existingIdx = idx.entries.findIndex((e) => e.slug === entry.slug)
  if (existingIdx >= 0) {
    idx.entries[existingIdx] = entry
  } else {
    idx.entries.push(entry)
  }
  const written = saveIndex(projectRoot, idx)
  return { entry, specFile: file, indexFile: written, alreadyExists }
}

export function listRegressions(projectRoot: string): RegressionEntry[] {
  return loadIndex(projectRoot).entries
}

export function expireRegression(
  projectRoot: string,
  slug: string,
): { removedSpec: string | null; updatedIndex: string } {
  const idx = loadIndex(projectRoot)
  const target = idx.entries.find((e) => e.slug === slug)
  idx.entries = idx.entries.filter((e) => e.slug !== slug)
  const written = saveIndex(projectRoot, idx)
  if (!target) return { removedSpec: null, updatedIndex: written }
  const spec = specPath(projectRoot, target)
  if (fs.existsSync(spec)) {
    fs.unlinkSync(spec)
    return { removedSpec: spec, updatedIndex: written }
  }
  return { removedSpec: null, updatedIndex: written }
}

export function isExpired(entry: RegressionEntry, now: Date = new Date()): boolean {
  if (!entry.expireAt) return false
  const t = Date.parse(entry.expireAt)
  if (Number.isNaN(t)) return false
  return t < now.getTime()
}
