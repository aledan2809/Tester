/**
 * T-002 — Coverage matrix public API.
 */

export type {
  CoverageSeverity,
  CoverageStatus,
  CoverageScenario,
  CoverageMatrix,
  CoverageStats,
  FeatureCoverageReport,
} from './schema'

export {
  parseCoverageYaml,
  loadCoverageMatrix,
  loadCoverageForProject,
  computeStats,
  buildReport,
} from './loader'
