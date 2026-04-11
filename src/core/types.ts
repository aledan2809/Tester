/**
 * Core Types for AI Tester
 * All shared TypeScript types for the autonomous web testing engine.
 */

// ─── Tester Config ──────────────────────────────────────────

export interface TesterConfig {
  /** Run browser in headless mode (default: true) */
  headless?: boolean
  /** Viewport width (default: 1280) */
  viewportWidth?: number
  /** Viewport height (default: 800) */
  viewportHeight?: number

  // Discovery
  /** Maximum pages to crawl (default: 50) */
  maxPages?: number
  /** Maximum crawl depth from seed URL (default: 3) */
  maxDepth?: number
  /** Crawl timeout in ms (default: 120_000) */
  crawlTimeout?: number

  // Auth
  /** Login credentials */
  credentials?: LoginCredentials
  /** Callback invoked when MFA screen is detected */
  mfaHandler?: MfaHandler
  /** File path to save/load session cookies */
  sessionPath?: string

  // AI
  /** Anthropic API key for scenario generation + element finder */
  anthropicApiKey?: string
  /** AI model to use (default: claude-sonnet-4-5-20250929) */
  aiModel?: string

  // Testing
  /** Take screenshot on test errors (default: true) */
  screenshotOnError?: boolean
  /** Take screenshot on every step (default: false) */
  screenshotEveryStep?: boolean
  /** Per-step timeout in ms (default: 10_000) */
  stepTimeout?: number

  // Scoping
  /** Domain lock — only navigate to these domains */
  allowedDomains?: string[]
  /** URL patterns to skip during crawl (e.g., /logout, /delete) */
  excludePatterns?: string[]

  // Features
  /** Enable visual regression testing (default: true) */
  visualRegression?: boolean
  /** Enable accessibility testing (default: true) */
  accessibility?: boolean
  /** Enable performance testing (default: true) */
  performance?: boolean

  // Execution
  /** Number of scenarios to run concurrently (default: 1 = sequential) */
  concurrency?: number
  /** Directory to save video recordings (default: disabled) */
  videoDir?: string

  // Output
  /** Directory for reports (default: ./reports) */
  outputDir?: string
  /** Report formats to generate (default: ['html', 'json']) */
  reportFormats?: ('html' | 'json')[]
}

export interface LoginCredentials {
  username: string
  password: string
  /** Login page URL — auto-detected if not provided */
  loginUrl?: string
  /** TOTP secret for auto-generating MFA codes */
  mfaSecret?: string
}

/** Called when MFA screen is detected; returns the MFA code */
export type MfaHandler = (prompt: string) => Promise<string>

// ─── Browser Step Actions ───────────────────────────────────

export type TestStepAction =
  | 'navigate'     // Go to a URL
  | 'click'        // Click an element
  | 'fill'         // Fill a text field
  | 'select'       // Select from dropdown
  | 'clear'        // Clear field content
  | 'wait'         // Wait for selector or ms
  | 'screenshot'   // Take a screenshot
  | 'scrollTo'     // Scroll to element
  | 'pressKey'     // Press keyboard key
  | 'evaluate'     // Run JS in page context
  | 'upload'       // Upload a file to input
  | 'hover'        // Hover over an element
  | 'doubleClick'  // Double click an element
  | 'rightClick'   // Right click an element

export interface TestStep {
  action: TestStepAction
  /** CSS selector (preferred) */
  target?: string
  /** Fallback CSS selectors if primary fails */
  fallbackSelectors?: string[]
  /** AI description for vision-based fallback */
  aiDescription?: string
  /** Value for fill/select/navigate/pressKey/evaluate */
  value?: string
  /** Human-readable description for logging */
  description: string
  /** Timeout in ms for this step (default: 10000) */
  timeout?: number
  /** If true, step failure doesn't abort the scenario */
  optional?: boolean
  /** Wait condition after action */
  waitAfter?: 'networkidle' | 'domcontentloaded' | number
}

export interface StepResult {
  stepIndex: number
  action: TestStepAction
  description: string
  success: boolean
  error?: string
  screenshot?: string
  durationMs: number
  usedAiFallback?: boolean
}

// ─── Discovery ──────────────────────────────────────────────

export interface SiteMap {
  baseUrl: string
  pages: DiscoveredPage[]
  totalPages: number
  crawlDurationMs: number
}

export interface DiscoveredPage {
  url: string
  title: string
  depth: number
  statusCode: number

  forms: DiscoveredForm[]
  buttons: DiscoveredButton[]
  links: DiscoveredLink[]
  inputs: DiscoveredInput[]
  modals: string[]

  isLoginPage: boolean
  isMfaPage: boolean
  requiresAuth: boolean

  hasConsoleErrors: boolean
  consoleErrors: ConsoleError[]
  networkErrors: NetworkError[]
  loadTimeMs: number
  resourceCount: number
}

export interface DiscoveredForm {
  selector: string
  action: string
  method: string
  fields: FormField[]
  submitSelector: string
}

export interface FormField {
  name: string
  type: string
  selector: string
  required: boolean
  placeholder?: string
  label?: string
  validationPattern?: string
}

export interface DiscoveredButton {
  selector: string
  text: string
  type: string
  isSubmit: boolean
}

export interface DiscoveredLink {
  href: string
  text: string
  isExternal: boolean
  isNavigation: boolean
}

export interface DiscoveredInput {
  selector: string
  name: string
  type: string
  label?: string
  required: boolean
}

// ─── Errors & Monitoring ────────────────────────────────────

export interface ConsoleError {
  message: string
  level: 'error' | 'warning'
  url: string
}

export interface NetworkError {
  url: string
  statusCode: number
  resource: string
}

// ─── Test Scenarios ─────────────────────────────────────────

export type TestCategory =
  | 'auth'
  | 'navigation'
  | 'forms'
  | 'functionality'
  | 'error_handling'
  | 'visual'
  | 'a11y'
  | 'performance'

export interface TestScenario {
  id: string
  name: string
  description: string
  category: TestCategory
  priority: 'critical' | 'high' | 'medium' | 'low'
  steps: TestStep[]
  assertions: TestAssertion[]
  tags: string[]
}

export interface TestAssertion {
  type: AssertionType
  target?: string
  expected?: string | number | boolean
  operator?: 'equals' | 'contains' | 'matches' | 'gt' | 'lt'
  description: string
}

export type AssertionType =
  | 'element_exists' | 'element_visible' | 'element_hidden'
  | 'text_equals' | 'text_contains' | 'text_matches'
  | 'attribute_equals' | 'attribute_contains'
  | 'url_equals' | 'url_contains' | 'url_matches'
  | 'title_equals' | 'title_contains'
  | 'status_code' | 'no_console_errors' | 'no_network_errors'
  | 'cookie_exists' | 'cookie_value'
  | 'visual_no_regression'
  | 'a11y_no_violations' | 'a11y_max_violations'
  | 'performance_fcp' | 'performance_lcp' | 'performance_tti'

// ─── Test Results ───────────────────────────────────────────

export interface TestRun {
  id: string
  url: string
  startedAt: Date
  completedAt: Date
  durationMs: number
  config: TesterConfig

  siteMap: SiteMap
  scenarios: ScenarioResult[]
  summary: TestSummary
}

export interface TestSummary {
  totalScenarios: number
  passed: number
  failed: number
  skipped: number
  errors: number

  byCategory: Record<TestCategory, { passed: number; failed: number }>

  visualRegressions: number

  a11yViolations: { critical: number; serious: number; moderate: number; minor: number }

  avgLoadTimeMs: number
  slowestPages: { url: string; loadTimeMs: number }[]

  consoleErrors: ConsoleError[]
  networkErrors: NetworkError[]
  brokenLinks: { url: string; linkedFrom: string; statusCode: number }[]

  overallScore: number
}

export interface ScenarioResult {
  scenario: TestScenario
  status: 'passed' | 'failed' | 'skipped' | 'error'
  steps: StepResult[]
  assertions: AssertionResult[]
  durationMs: number
  error?: string
  screenshots: { label: string; data: string }[]
}

export interface AssertionResult {
  assertion: TestAssertion
  passed: boolean
  actual?: string | number | boolean
  error?: string
}

// ─── AI Element Finder ──────────────────────────────────────

export interface ElementLocation {
  bbox: { x: number; y: number; width: number; height: number }
  confidence: number
  suggestedSelector?: string
  description: string
}

// ─── Login Plans ────────────────────────────────────────────

export interface LoginPlan {
  usernameSelector: string
  passwordSelector: string
  submitSelector: string
  loginUrl: string
  successSelector: string
  fallbackSelectors?: {
    username?: string[]
    password?: string[]
    submit?: string[]
    success?: string[]
  }
}

export const LOGIN_PLANS: Record<string, LoginPlan> = {
  wordpress: {
    loginUrl: '/wp-login.php',
    usernameSelector: '#user_login',
    passwordSelector: '#user_pass',
    submitSelector: '#wp-submit',
    successSelector: '#wpadminbar, #wpbody, .wrap',
    fallbackSelectors: {
      username: ['input[name="log"]', 'input[type="text"]'],
      password: ['input[name="pwd"]', 'input[type="password"]'],
      submit: ['input[type="submit"]', 'button[type="submit"]'],
      success: ['.dashboard', '#dashboard-widgets', '#wp-admin-bar-my-account'],
    },
  },
  shopify: {
    loginUrl: '/admin',
    usernameSelector: '#account_email',
    passwordSelector: '#account_password',
    submitSelector: 'button[type="submit"]',
    successSelector: '.Polaris-Frame, [data-polaris-layer]',
    fallbackSelectors: {
      username: ['input[name="account[email]"]', 'input[type="email"]'],
      password: ['input[name="account[password]"]', 'input[type="password"]'],
      submit: ['button[name="commit"]', '.login-button'],
      success: ['.admin-nav', '[class*="Frame"]'],
    },
  },
  wix: {
    loginUrl: '/account/login',
    usernameSelector: '#input_0',
    passwordSelector: '#input_1',
    submitSelector: 'button[data-testid="submit"]',
    successSelector: '.dashboard-header, [data-hook="dashboard"]',
    fallbackSelectors: {
      username: ['input[name="email"]', 'input[type="email"]'],
      password: ['input[name="password"]', 'input[type="password"]'],
      submit: ['button[type="submit"]'],
      success: ['[data-hook="home"]', '.wix-dashboard'],
    },
  },
  squarespace: {
    loginUrl: '/config',
    usernameSelector: '#email',
    passwordSelector: '#password',
    submitSelector: 'button.login-button',
    successSelector: '.App, .squarespace-managed-ui',
    fallbackSelectors: {
      username: ['input[name="email"]', 'input[type="email"]'],
      password: ['input[name="password"]', 'input[type="password"]'],
      submit: ['button[type="submit"]'],
      success: ['.sidebar', '.page-section'],
    },
  },
  cpanel: {
    loginUrl: ':2083',
    usernameSelector: '#user',
    passwordSelector: '#pass',
    submitSelector: '#login_submit',
    successSelector: '#mainFrame, .yui-main, .main-content',
    fallbackSelectors: {
      username: ['input[name="user"]', 'input[type="text"]'],
      password: ['input[name="pass"]', 'input[type="password"]'],
      submit: ['button[type="submit"]', 'input[type="submit"]'],
      success: ['#topFrame', '.cpanel-content'],
    },
  },
}
