/**
 * @aledan/tester — AI-powered autonomous web testing engine
 *
 * Library barrel export. Use this to import from other projects:
 *   import { AITester } from '@aledan/tester'
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
