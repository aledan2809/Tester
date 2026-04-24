/**
 * @aledan007/tester — AI-powered autonomous web testing engine
 *
 * Library barrel export. Use this to import from other projects:
 *   import { AITester } from '@aledan007/tester'
 *
 * ─── PUBLIC API CONTRACT (T-D2) ───────────────────────────
 * Stability tiers — see docs/API_CONTRACT.md for full matrix:
 *
 *   TIER 1 (stable, semver-locked)
 *     - CLI commands + documented flags
 *     - `AITester`, executor entry points, reporter generators
 *     - Core assertion runners (runAssertion, runDomAssertion, ...)
 *     - All `type` exports below
 *
 *   TIER 2 (public but minor-mutable)
 *     - T-000 lessons engine (scanner, diagnoser, classifier, promotion)
 *     - Wave 1+2 helpers (untested, snapshot store, a11y baseline,
 *       perf budget, scaffolder, session recorder, scoring, regression,
 *       triage, affected mapper, pipeline-stats analyzer, done gate)
 *     - Breaking changes require a minor bump + changelog entry.
 *
 *   TIER 3 (internal, may break any release)
 *     - src/server/** HTTP surface — will move to `@aledan007/tester-
 *       service` in the lib-vs-service split (T-D2 follow-up). Do NOT
 *       import from `@aledan007/tester` for HTTP server usage; spawn
 *       the bundled CLI (`npx tester`) or the HTTP binary instead.
 *     - Anything imported from `src/lessons/scanner.ts` internals.
 *
 * Wave 2 additions are appended at the bottom of this file with their
 * own comment block so the diff stays reviewable.
 */

// Main class
export { AITester } from './tester'

// Core
export { BrowserCore } from './core/browser'
export { findElementByVision } from './core/element-finder'
export { isDomainAllowed, shouldSkipUrl, validateStep, validateSteps, createTimeoutGuard } from './core/safety'

// Discovery
export { crawlSite } from './discovery/crawler'
export { analyzePage } from './discovery/analyzer'
export { buildSiteMap, formatSiteMapSummary } from './discovery/sitemap'

// Auth
export { autoLogin } from './auth/login'
export { detectMfa, handleMfa, createCliMfaHandler } from './auth/mfa'
export { saveSession, loadSession, isSessionValid } from './auth/session'

// Scenarios
export { generateScenarios } from './scenarios/generator'
export { generateTemplateScenarios } from './scenarios/templates'

// Assertions
export { runAssertion } from './assertions/index'
export { runDomAssertion } from './assertions/dom'
export { runNetworkAssertion } from './assertions/network'
export { runVisualAssertion } from './assertions/visual'
export { runA11yAssertion, runA11yScan } from './assertions/a11y'
export { runPerformanceAssertion, capturePerformanceMetrics } from './assertions/performance'

// Executor
export { executeScenarios } from './executor'

// Reporter
export { generateReports, generateJsonReport, generateHtmlReport, generateHtmlString, formatCiSummary } from './reporter/index'
export type { ReportOptions, JsonReportOptions, HtmlReportOptions } from './reporter/index'

// Validator
export { AuditOnlyValidator, auditValidator } from './validator/audit-only'
export type { AuditViolation } from './validator/audit-only'

// Gaps Reporter
export { generateGapsMarkdown, writeGapsReport, writeAuditFailedLog } from './reporter/gaps-generator'
export type { AuditFinding, AuditMetadata, AuditReport, FindingSeverity } from './reporter/gaps-generator'

// Types — re-export everything
export type {
  TesterConfig,
  LoginCredentials,
  MfaHandler,
  TestStepAction,
  TestStep,
  StepResult,
  SiteMap,
  DiscoveredPage,
  DiscoveredForm,
  DiscoveredButton,
  DiscoveredLink,
  DiscoveredInput,
  FormField,
  ConsoleError,
  NetworkError,
  TestCategory,
  TestScenario,
  TestAssertion,
  AssertionType,
  TestRun,
  TestSummary,
  ScenarioResult,
  AssertionResult,
  ElementLocation,
  LoginPlan,
} from './core/types'

// ─── Wave 1 + 2 public surface (TIER 2 — minor-mutable) ───
// These are exported so consumers can run the same logic that the CLI
// uses without shelling out. Breaking changes to this block require a
// minor semver bump per API_CONTRACT.md.

// T-006 untested aggregator + git-since filter
export { buildUntestedReport } from './untested/loader'
export type { UntestedItem, UntestedReport, UntestedSource } from './untested/schema'
export {
  filesChangedSince,
  blameFile,
  attributeByText,
  wasChangedSince,
} from './untested/git'
export type { ChangedFilesResult, BlameEntry, AttributionInfo } from './untested/git'

// T-007 retry
export { retryStepWithBackoff } from './executor'

// T-008 visual baseline
export { LocalFSStore, S3Store, defaultBaselineDir, sanitizeRoute } from './snapshot/store'
export type { BaselineMeta, BaselineStore } from './snapshot/store'
export { compareRoute, pixelDiffPercent } from './snapshot/compare'
export type { CompareResult } from './snapshot/compare'

// T-009 a11y baseline + budget
export {
  storeBaseline as storeA11yBaseline,
  loadBaseline as loadA11yBaseline,
  diffAgainstBaseline as diffA11yAgainstBaseline,
  summarize as summarizeA11yDiff,
} from './a11y/baseline'
export type { RouteScan, BaselineFile as A11yBaselineFile, DiffReport as A11yDiffReport } from './a11y/baseline'
export { loadBudget as loadA11yBudget, checkBudget as checkA11yBudget } from './a11y/budget'

// T-010 perf budget
export {
  loadPerfBudget,
  evaluatePerfBudget,
  computePerfDelta,
  renderCiComment as renderPerfCiComment,
} from './perf/budget'
export type { PerfMetrics, PerfRun, PerfBudgetFile, PerfReport } from './perf/budget'

// T-A1 feature scaffolder
export { initFeature, loadFeaturesIndex } from './init/scaffolder'
export type { InitOptions, InitResult, FeaturesIndex, FeaturesIndexEntry } from './init/scaffolder'

// T-A3 session recorder
export {
  startSession,
  appendEvent,
  endSession,
  loadSession as loadTesterSession,
  loadLatestSession,
  listSessions,
} from './session/recorder'
export type { SessionFile, SessionEvent, SessionEventKind, SessionSummary } from './session/recorder'

// T-B1 TWG scoring
export { computeTwgScore, renderTwgScoreAscii } from './scoring/twg'
export type { TwgScoreInput, TwgScoreResult, TwgScoreOptions } from './scoring/twg'

// T-B2 regressions store
export {
  addRegression,
  listRegressions,
  expireRegression,
  isExpired as isRegressionExpired,
} from './regression/store'
export type { RegressionEntry, RegressionIndex } from './regression/store'

// T-B3 triage
export { triageFailure, accumulateSplit, emptySplit } from './triage/decision'
export type { TriageDecision, TriageRoute, TriageSplit } from './triage/decision'

// T-C4 affected mapper
export { findAffectedFiles, indexTaggedFiles, walkTestFiles, parseTagsFromHeader } from './affected/mapper'
export type { AffectedResult, AffectedOptions, TaggedFile } from './affected/mapper'

// T-C5 pipeline analytics
export {
  analyzePipelines,
  renderStatsMarkdown,
  normalizeSignature as normalizePipelineSignature,
} from './pipeline-stats/analyzer'
export type {
  PipelineRecord,
  StatsReport as PipelineStatsReport,
  PhaseBucket,
  SignatureCluster,
} from './pipeline-stats/analyzer'

// T-D1 done gate
export { evaluateDone, markDone, markUndone, readDoneStatus } from './done/gate'
export type { DoneCheckResult, DoneOptions, DoneEntry } from './done/gate'

// T-D4 inventory aggregator
export { buildInventory, discoverProjectRoots, renderInventoryMarkdown } from './inventory/aggregator'
export type { InventoryReport, ProjectInventoryEntry } from './inventory/aggregator'
