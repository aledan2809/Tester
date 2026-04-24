/**
 * T-002 — Coverage matrix loader + stats.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import type {
  CoverageMatrix,
  CoverageScenario,
  CoverageStats,
  CoverageStatus,
  FeatureCoverageReport,
} from './schema'

const VALID_SEVERITIES = new Set(['info', 'low', 'medium', 'high', 'critical'])
const VALID_STATUSES: Set<CoverageStatus> = new Set(['covered', 'missing', 'skipped', 'unknown'])

export interface LoaderError {
  file: string
  message: string
}

export function parseCoverageYaml(content: string, file = '<inline>'): CoverageMatrix | LoaderError {
  let parsed: unknown
  try {
    parsed = yaml.load(content)
  } catch (e) {
    return { file, message: `YAML parse error: ${(e as Error).message}` }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { file, message: 'YAML root is not an object' }
  }
  const obj = parsed as Record<string, unknown>
  if (typeof obj.feature !== 'string' || !obj.feature.trim()) {
    return { file, message: 'missing required field: feature (non-empty string)' }
  }
  if (typeof obj.owner !== 'string' || !obj.owner.trim()) {
    return { file, message: 'missing required field: owner (non-empty string)' }
  }
  if (!Array.isArray(obj.scenarios)) {
    return { file, message: 'scenarios must be an array' }
  }
  const scenarios: CoverageScenario[] = []
  for (const [i, raw] of (obj.scenarios as unknown[]).entries()) {
    if (!raw || typeof raw !== 'object') {
      return { file, message: `scenarios[${i}] is not an object` }
    }
    const s = raw as Record<string, unknown>
    if (typeof s.id !== 'string' || !s.id.trim()) {
      return { file, message: `scenarios[${i}].id must be a non-empty string` }
    }
    if (typeof s.name !== 'string' || !s.name.trim()) {
      return { file, message: `scenarios[${i}].name must be a non-empty string` }
    }
    if (typeof s.severity !== 'string' || !VALID_SEVERITIES.has(s.severity)) {
      return { file, message: `scenarios[${i}].severity must be one of ${[...VALID_SEVERITIES].join('|')}` }
    }
    if (typeof s.status !== 'string' || !VALID_STATUSES.has(s.status as CoverageStatus)) {
      return { file, message: `scenarios[${i}].status must be one of ${[...VALID_STATUSES].join('|')}` }
    }
    scenarios.push({
      id: s.id,
      name: s.name,
      category: typeof s.category === 'string' ? s.category : undefined,
      severity: s.severity as CoverageScenario['severity'],
      covered_by: s.covered_by == null ? null : String(s.covered_by),
      status: s.status as CoverageStatus,
      notes: typeof s.notes === 'string' ? s.notes : undefined,
      lesson: typeof s.lesson === 'string' ? s.lesson : undefined,
    })
  }
  const matrix: CoverageMatrix = {
    feature: obj.feature,
    owner: obj.owner,
    scenarios,
    references: Array.isArray(obj.references) ? (obj.references as string[]) : undefined,
  }
  return matrix
}

export function loadCoverageMatrix(file: string): CoverageMatrix | LoaderError {
  if (!fs.existsSync(file)) {
    return { file, message: `coverage file not found: ${file}` }
  }
  const content = fs.readFileSync(file, 'utf8')
  return parseCoverageYaml(content, file)
}

export function loadCoverageForProject(projectRoot: string): Array<{ file: string; result: CoverageMatrix | LoaderError }> {
  const dir = path.join(projectRoot, 'coverage')
  if (!fs.existsSync(dir)) return []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const out: Array<{ file: string; result: CoverageMatrix | LoaderError }> = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!/\.ya?ml$/i.test(entry.name)) continue
    const file = path.join(dir, entry.name)
    out.push({ file, result: loadCoverageMatrix(file) })
  }
  return out
}

export function computeStats(matrix: CoverageMatrix): CoverageStats {
  let covered = 0,
    missing = 0,
    skipped = 0,
    unknown = 0
  let critical_missing = 0,
    high_missing = 0,
    medium_missing = 0,
    low_or_info_missing = 0
  for (const s of matrix.scenarios) {
    if (s.status === 'covered') covered++
    else if (s.status === 'missing') {
      missing++
      if (s.severity === 'critical') critical_missing++
      else if (s.severity === 'high') high_missing++
      else if (s.severity === 'medium') medium_missing++
      else low_or_info_missing++
    } else if (s.status === 'skipped') skipped++
    else unknown++
  }
  const total = matrix.scenarios.length
  const denom = total - skipped
  const coverage_ratio = denom > 0 ? covered / denom : 1
  return {
    total,
    covered,
    missing,
    skipped,
    unknown,
    coverage_ratio,
    critical_missing,
    high_missing,
    medium_missing,
    low_or_info_missing,
  }
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
}

export function buildReport(matrix: CoverageMatrix, file: string): FeatureCoverageReport {
  const stats = computeStats(matrix)
  const ordered = [...matrix.scenarios].sort((a, b) => {
    const aMissing = a.status === 'missing' ? 1 : 0
    const bMissing = b.status === 'missing' ? 1 : 0
    if (aMissing !== bMissing) return bMissing - aMissing
    return (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0)
  })
  return {
    feature: matrix.feature,
    owner: matrix.owner,
    file,
    stats,
    ordered_scenarios: ordered,
  }
}
