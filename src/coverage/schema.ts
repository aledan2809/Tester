/**
 * T-002 — Coverage matrix schema.
 *
 * Per-feature YAML file lives at `<project>/coverage/<feature>.yaml` with:
 *
 *   feature: four-way-match
 *   owner: procuchaingo2
 *   scenarios:
 *     - id: Q1
 *       name: invoice qty > received (over-invoicing)
 *       category: quantity
 *       severity: high                 # info | low | medium | high | critical
 *       covered_by: tests/matching/over-invoice.spec.ts::test_over_invoice
 *       status: covered                # covered | missing | skipped | unknown
 *     - id: Q2
 *       ...
 *
 * `covered_by` is a path to the test, optionally with `::` selector.
 * `status=missing` with severity=critical/high MUST block feature as "done".
 */

export type CoverageSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'
export type CoverageStatus = 'covered' | 'missing' | 'skipped' | 'unknown'

export interface CoverageScenario {
  id: string
  name: string
  category?: string
  severity: CoverageSeverity
  covered_by: string | null
  status: CoverageStatus
  /** Optional free-form notes (e.g. why skipped). */
  notes?: string
  /** Optional T-000 lesson id this scenario guards. */
  lesson?: string
}

export interface CoverageMatrix {
  feature: string
  owner: string
  scenarios: CoverageScenario[]
  /** Optional doc links referenced by handlers. */
  references?: string[]
}

export interface CoverageStats {
  total: number
  covered: number
  missing: number
  skipped: number
  unknown: number
  coverage_ratio: number // covered / (total - skipped)
  critical_missing: number
  high_missing: number
  medium_missing: number
  low_or_info_missing: number
}

export interface FeatureCoverageReport {
  feature: string
  owner: string
  file: string
  stats: CoverageStats
  /** Scenarios sorted by (status=missing first, severity desc). */
  ordered_scenarios: CoverageScenario[]
}
