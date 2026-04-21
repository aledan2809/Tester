/**
 * @aledan007/tester — AI-powered autonomous web testing engine
 *
 * Library barrel export. Use this to import from other projects:
 *   import { AITester } from '@aledan007/tester'
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
