/**
 * T-006 — `tester untested` session-awareness query.
 *
 * Aggregates untested / open work items from four sources across a target
 * project and returns a ranked list so the next session (or pipeline phase)
 * has a single, machine-readable answer to "what's still untested?".
 *
 * Sources:
 *   - COVERAGE   — `<project>/coverage/*.yaml` scenarios with status=missing
 *   - AUDIT_GAPS — `<project>/AUDIT_GAPS.md` table rows with Status=Open
 *   - DEV_STATUS — `<project>/DEVELOPMENT_STATUS.md` TODO section unchecked items
 *   - REPORTS    — best-effort scrape of `<project>/Reports/*.json` audit result
 *                  rows marked failed/open (tolerant of missing/bad files)
 *
 * Ranking primary:   severity (critical > high > medium > low > info)
 * Ranking secondary: source (coverage > audit_gaps > dev_status > reports)
 * Ranking tertiary:  id / index to keep output deterministic.
 */

export type UntestedSource = 'coverage' | 'audit_gaps' | 'dev_status' | 'reports'
export type UntestedSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'

export interface UntestedItem {
  /** Stable identifier (gap id, scenario id, or synthesized `DS-001` etc.) */
  id: string
  /** Short human-readable label. */
  title: string
  /** Which source surfaced this item. */
  source: UntestedSource
  /** Normalized severity used for ranking (info if unknown). */
  severity: UntestedSeverity
  /** Free-form area / category (feature name, audit area tag, etc.) */
  area?: string
  /** Absolute path pointing at the evidence file for this item. */
  evidenceFile: string
  /** Optional free-form extra fields keyed per-source (unparsed leftover). */
  extra?: Record<string, string>
}

export interface UntestedReport {
  project: string
  projectRoot: string
  counts: {
    total: number
    by_source: Record<UntestedSource, number>
    by_severity: Record<UntestedSeverity, number>
  }
  /** Items sorted by severity desc, then source preference, then id. */
  items: UntestedItem[]
  /** Echo of the --since sha applied to this run. */
  since?: string
  /** Populated when the --since flag was used but git invocation failed. */
  since_error?: string
  /** True when git blame was invoked to attribute individual rows. */
  blame_used?: boolean
}
