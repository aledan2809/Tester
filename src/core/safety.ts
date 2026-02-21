/**
 * Safety Layer for AI Tester
 * Prevents navigation to dangerous URLs and execution of destructive actions.
 * Adapted from Website Guru's browser-agent/safety.ts for testing context.
 */

import type { TestStep, TesterConfig } from './types'

// ─── Domain Lock ──────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function isDomainAllowed(url: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return true
  const target = extractDomain(url)
  if (!target) return false
  return allowedDomains.some(d => {
    const allowed = d.replace(/^www\./, '')
    return target === allowed || target.endsWith(`.${allowed}`)
  })
}

// ─── URL Pattern Filtering ───────────────────────────────────

/** URL patterns that are always skipped during crawling */
const SKIP_CRAWL_PATTERNS = [
  /\/logout/i,
  /\/signout/i,
  /\/sign-out/i,
  /\/log-out/i,
  /\/delete.*account/i,
  /\/cancel.*plan/i,
  /\/unsubscribe/i,
  /mailto:/i,
  /tel:/i,
  /javascript:/i,
  /#$/,
]

/** URL patterns blocked from browser step execution */
const BLOCKED_URL_PATTERNS = [
  /\/wp-admin\/options\.php$/,
  /\/wp-admin\/users\.php\?action=delete/,
  /\/admin\/settings\/account$/,
  /uninstall|deactivate|delete.*account/i,
  /cancel.*plan|close.*account/i,
]

export function shouldSkipUrl(url: string, excludePatterns?: string[]): boolean {
  // Built-in skip patterns
  for (const pattern of SKIP_CRAWL_PATTERNS) {
    if (pattern.test(url)) return true
  }
  // User-defined exclude patterns
  if (excludePatterns) {
    for (const p of excludePatterns) {
      if (url.includes(p)) return true
    }
  }
  return false
}

// ─── Step Validation ──────────────────────────────────────────

export function validateStep(
  step: TestStep,
  config: TesterConfig,
  currentUrl: string,
): { ok: boolean; reason?: string } {
  // Domain lock on navigate actions
  if (step.action === 'navigate' && step.value) {
    const targetUrl = step.value.startsWith('http')
      ? step.value
      : new URL(step.value, currentUrl).href

    if (config.allowedDomains && !isDomainAllowed(targetUrl, config.allowedDomains)) {
      return { ok: false, reason: `Navigation blocked: ${targetUrl} outside allowed domains` }
    }

    for (const pattern of BLOCKED_URL_PATTERNS) {
      if (pattern.test(targetUrl)) {
        return { ok: false, reason: `Navigation blocked: URL matches dangerous pattern` }
      }
    }
  }

  // Block dangerous evaluate scripts
  if (step.action === 'evaluate' && step.value) {
    const dangerousPatterns = [
      /document\.cookie\s*=/i,
      /localStorage\.clear/i,
      /sessionStorage\.clear/i,
      /window\.location\s*=/,
      /eval\s*\(/,
      /Function\s*\(/,
      /\.remove\(\)/,
      /\.delete/,
      /innerHTML\s*=/,
    ]
    for (const p of dangerousPatterns) {
      if (p.test(step.value)) {
        return { ok: false, reason: `Evaluate blocked: script matches dangerous pattern` }
      }
    }
  }

  return { ok: true }
}

// ─── Plan Validation ──────────────────────────────────────────

export function validateSteps(
  steps: TestStep[],
  config: TesterConfig,
  siteUrl: string,
): { ok: boolean; issues: string[] } {
  const issues: string[] = []

  if (steps.length === 0) {
    issues.push('No steps to execute')
  }

  if (steps.length > 100) {
    issues.push(`Too many steps: ${steps.length} (max 100)`)
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]

    if (['click', 'fill', 'select', 'clear', 'scrollTo', 'hover', 'doubleClick', 'rightClick'].includes(step.action)) {
      if (!step.target && !step.aiDescription) {
        issues.push(`Step ${i}: ${step.action} requires target or aiDescription`)
      }
    }

    if (['fill', 'select'].includes(step.action) && !step.value) {
      issues.push(`Step ${i}: ${step.action} requires a value`)
    }

    if (step.action === 'navigate' && !step.value) {
      issues.push(`Step ${i}: navigate requires a URL value`)
    }

    if (step.action === 'navigate' && step.value && config.allowedDomains) {
      try {
        const targetUrl = step.value.startsWith('http')
          ? step.value
          : new URL(step.value, siteUrl).href
        if (!isDomainAllowed(targetUrl, config.allowedDomains)) {
          issues.push(`Step ${i}: navigation to ${step.value} outside allowed domains`)
        }
      } catch {
        issues.push(`Step ${i}: invalid URL ${step.value}`)
      }
    }
  }

  return { ok: issues.length === 0, issues }
}

// ─── Timeout Guard ────────────────────────────────────────────

export function createTimeoutGuard(timeoutMs: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  }
}
