/**
 * Built-in Scenario Templates
 * Pre-built test scenarios for common web patterns.
 * Used as fallback when AI generation is unavailable.
 */

import type { TestScenario, DiscoveredPage, DiscoveredForm, SiteMap } from '../core/types'

let scenarioCounter = 0
function nextId(): string {
  return `TPL-${String(++scenarioCounter).padStart(3, '0')}`
}

/**
 * Generate built-in scenarios from a site map.
 * These don't require AI — they're based on discovered elements.
 */
export function generateTemplateScenarios(siteMap: SiteMap): TestScenario[] {
  const scenarios: TestScenario[] = []
  scenarioCounter = 0

  for (const page of siteMap.pages) {
    // Navigation scenarios
    scenarios.push(createNavigationScenario(page))

    // Form scenarios
    for (const form of page.forms) {
      scenarios.push(...createFormScenarios(page, form))
    }

    // Login page scenarios
    if (page.isLoginPage) {
      scenarios.push(...createLoginScenarios(page))
    }

    // Error handling
    if (page.statusCode >= 400) {
      scenarios.push(createErrorPageScenario(page))
    }
  }

  // Broken links across all pages
  scenarios.push(createBrokenLinksScenario(siteMap))

  // Console errors across all pages
  scenarios.push(createConsoleErrorsScenario(siteMap))

  return scenarios
}

// ─── Navigation ─────────────────────────────────────────

function createNavigationScenario(page: DiscoveredPage): TestScenario {
  return {
    id: nextId(),
    name: `Navigate to ${page.title || page.url}`,
    description: `Verify page loads successfully with correct status code`,
    category: 'navigation',
    priority: page.depth === 0 ? 'critical' : 'medium',
    steps: [
      {
        action: 'navigate',
        value: page.url,
        description: `Navigate to ${page.url}`,
      },
    ],
    assertions: [
      {
        type: 'status_code',
        expected: 200,
        operator: 'equals',
        description: `Page returns HTTP 200`,
      },
      {
        type: 'title_contains',
        expected: page.title || '',
        description: `Page title is present`,
      },
      {
        type: 'no_console_errors',
        description: `No console errors on page`,
      },
    ],
    tags: ['navigation', `depth-${page.depth}`],
  }
}

// ─── Forms ──────────────────────────────────────────────

function createFormScenarios(page: DiscoveredPage, form: DiscoveredForm): TestScenario[] {
  const scenarios: TestScenario[] = []

  // Positive: submit form with valid data
  if (form.fields.length > 0 && form.submitSelector) {
    const fillSteps = form.fields.map(field => ({
      action: 'fill' as const,
      target: field.selector,
      value: getTestValue(field.type, field.name),
      description: `Fill ${field.label || field.name} (${field.type})`,
    }))

    scenarios.push({
      id: nextId(),
      name: `Submit form on ${page.title || page.url}`,
      description: `Fill and submit the form with valid test data`,
      category: 'forms',
      priority: 'high',
      steps: [
        { action: 'navigate', value: page.url, description: `Go to ${page.url}` },
        ...fillSteps,
        { action: 'click', target: form.submitSelector, description: 'Click submit' },
        { action: 'wait', value: '2000', description: 'Wait for response' },
      ],
      assertions: [
        { type: 'no_console_errors', description: 'No JS errors after submit' },
        { type: 'no_network_errors', description: 'No network errors after submit' },
      ],
      tags: ['forms', 'positive'],
    })
  }

  // Negative: submit empty required fields
  const requiredFields = form.fields.filter(f => f.required)
  if (requiredFields.length > 0 && form.submitSelector) {
    scenarios.push({
      id: nextId(),
      name: `Submit empty form on ${page.title || page.url}`,
      description: `Submit form without filling required fields — should show validation`,
      category: 'forms',
      priority: 'medium',
      steps: [
        { action: 'navigate', value: page.url, description: `Go to ${page.url}` },
        { action: 'click', target: form.submitSelector, description: 'Click submit without filling' },
        { action: 'wait', value: '1000', description: 'Wait for validation' },
      ],
      assertions: [
        { type: 'url_contains', expected: page.url, description: 'Stay on same page (not submitted)' },
      ],
      tags: ['forms', 'negative', 'validation'],
    })
  }

  return scenarios
}

// ─── Login ──────────────────────────────────────────────

function createLoginScenarios(page: DiscoveredPage): TestScenario[] {
  return [
    {
      id: nextId(),
      name: `Invalid login on ${page.title || page.url}`,
      description: `Attempt login with invalid credentials — should show error`,
      category: 'auth',
      priority: 'high',
      steps: [
        { action: 'navigate', value: page.url, description: `Go to login page` },
        {
          action: 'fill',
          target: 'input[type="email"], input[name*="user"], input[name*="email"], input[type="text"]',
          value: 'invalid@test.invalid',
          description: 'Fill invalid email',
        },
        {
          action: 'fill',
          target: 'input[type="password"]',
          value: 'wrongpassword123',
          description: 'Fill wrong password',
        },
        {
          action: 'click',
          target: 'button[type="submit"], input[type="submit"]',
          description: 'Click sign in',
        },
        { action: 'wait', value: '3000', description: 'Wait for response' },
      ],
      assertions: [
        { type: 'element_visible', target: '.error, .alert-danger, [role="alert"], .text-red-500', description: 'Error message is displayed' },
        { type: 'no_console_errors', description: 'No unhandled JS errors' },
      ],
      tags: ['auth', 'negative'],
    },
  ]
}

// ─── Error Pages ────────────────────────────────────────

function createErrorPageScenario(page: DiscoveredPage): TestScenario {
  return {
    id: nextId(),
    name: `Error page: ${page.url} (HTTP ${page.statusCode})`,
    description: `Page returns error status ${page.statusCode}`,
    category: 'error_handling',
    priority: page.statusCode >= 500 ? 'critical' : 'high',
    steps: [
      { action: 'navigate', value: page.url, description: `Navigate to ${page.url}` },
    ],
    assertions: [
      { type: 'status_code', expected: page.statusCode, operator: 'equals', description: `Returns HTTP ${page.statusCode}` },
    ],
    tags: ['error', `http-${page.statusCode}`],
  }
}

// ─── Cross-page checks ─────────────────────────────────

function createBrokenLinksScenario(siteMap: SiteMap): TestScenario {
  const brokenPages = siteMap.pages.filter(p => p.statusCode >= 400)
  return {
    id: nextId(),
    name: `Broken links check (${brokenPages.length} found)`,
    description: `Check all discovered pages for HTTP error status codes`,
    category: 'navigation',
    priority: brokenPages.length > 0 ? 'critical' : 'low',
    steps: [
      { action: 'evaluate', value: 'true', description: 'Aggregated from crawl data' },
    ],
    assertions: brokenPages.map(p => ({
      type: 'status_code' as const,
      expected: p.statusCode,
      description: `${p.url} returns HTTP ${p.statusCode}`,
    })),
    tags: ['navigation', 'broken-links'],
  }
}

function createConsoleErrorsScenario(siteMap: SiteMap): TestScenario {
  const pagesWithErrors = siteMap.pages.filter(p => p.hasConsoleErrors)
  return {
    id: nextId(),
    name: `Console errors check (${pagesWithErrors.length} pages)`,
    description: `Check all pages for JavaScript console errors`,
    category: 'error_handling',
    priority: pagesWithErrors.length > 0 ? 'high' : 'low',
    steps: [
      { action: 'evaluate', value: 'true', description: 'Aggregated from crawl data' },
    ],
    assertions: pagesWithErrors.map(p => ({
      type: 'no_console_errors' as const,
      description: `${p.url} has ${p.consoleErrors.length} console error(s)`,
    })),
    tags: ['errors', 'console'],
  }
}

// ─── Test Value Generator ───────────────────────────────

function getTestValue(fieldType: string, fieldName: string): string {
  const name = fieldName.toLowerCase()

  // Email fields
  if (fieldType === 'email' || name.includes('email')) return 'test@example.com'

  // Phone fields
  if (fieldType === 'tel' || name.includes('phone') || name.includes('tel')) return '+1234567890'

  // URL fields
  if (fieldType === 'url' || name.includes('url') || name.includes('website')) return 'https://example.com'

  // Number fields
  if (fieldType === 'number' || name.includes('amount') || name.includes('qty')) return '42'

  // Name fields
  if (name.includes('name') || name.includes('first') || name.includes('last')) return 'Test User'

  // Search
  if (fieldType === 'search' || name.includes('search') || name.includes('query')) return 'test search query'

  // Password
  if (fieldType === 'password') return 'TestPassword123!'

  // Text area / message
  if (name.includes('message') || name.includes('comment') || name.includes('description')) {
    return 'This is a test message for automated testing purposes.'
  }

  // Default
  return 'test input'
}
