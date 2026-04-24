/**
 * T-000 Day-2 — Hit-count persistence.
 *
 * Records scan/diagnose hits per lesson into a local JSON store. Enables:
 *   - `tester lessons stats` (hit count per lesson)
 *   - hit-count-driven severity promotion (Day-4)
 *   - muting lessons with hit=0 for >6mo (Day-4)
 *
 * Store location: `.tester/lessons-stats.json` at the lessons-corpus root.
 * Format: { "<lesson_id>": { hits: N, last_hit: ISO8601, contexts: [...] } }
 *
 * Opt-in: scan+diagnose record only if writable. Read-only envs (e.g. CI on
 * immutable FS) degrade gracefully to no-op.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

export interface LessonStat {
  hits: number
  last_hit: string
  contexts: string[]
}

export type StatsMap = Record<string, LessonStat>

export function statsFilePath(corpusDir: string): string {
  const parent = path.dirname(path.resolve(corpusDir))
  return path.join(parent, '.tester', 'lessons-stats.json')
}

export function loadStats(corpusDir: string): StatsMap {
  const file = statsFilePath(corpusDir)
  if (!fs.existsSync(file)) return {}
  try {
    const raw = fs.readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as StatsMap
  } catch {
    return {}
  }
}

export function recordHits(
  corpusDir: string,
  lessonIds: string[],
  context: string,
): { written: boolean; reason?: string } {
  if (lessonIds.length === 0) return { written: true }
  const file = statsFilePath(corpusDir)
  const dir = path.dirname(file)

  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (e) {
    return { written: false, reason: `mkdir ${dir}: ${(e as Error).message}` }
  }

  const map = loadStats(corpusDir)
  const now = new Date().toISOString()
  for (const id of lessonIds) {
    const existing = map[id] || { hits: 0, last_hit: now, contexts: [] }
    existing.hits += 1
    existing.last_hit = now
    if (!existing.contexts.includes(context)) existing.contexts.push(context)
    map[id] = existing
  }

  try {
    fs.writeFileSync(file, JSON.stringify(map, null, 2), 'utf8')
    return { written: true }
  } catch (e) {
    return { written: false, reason: `write ${file}: ${(e as Error).message}` }
  }
}

export function statsSummary(corpusDir: string): Array<{ lesson_id: string; hits: number; last_hit: string }> {
  const map = loadStats(corpusDir)
  return Object.entries(map)
    .map(([id, s]) => ({ lesson_id: id, hits: s.hits, last_hit: s.last_hit }))
    .sort((a, b) => b.hits - a.hits)
}
