/**
 * T-003 — Half A linter rules for test files.
 *
 * Each rule inspects a CallExpression / string literal node and returns a
 * LintViolation if the pattern is detected.
 */

export type LintSeverity = 'warn' | 'error'

export interface LintViolation {
  ruleId: string
  severity: LintSeverity
  message: string
  file: string
  line: number
  col: number
  snippet?: string
}

export interface RuleContext {
  file: string
  /** Full source text (used for snippet extraction). */
  source: string
}

// ─── Rule definitions ────────────────────────────────────────────────────────

/**
 * Rule 1 — Fragile querySelector selector.
 * Flags querySelector / querySelectorAll calls where the argument contains
 * regex-like characters outside a stable attribute selector pattern
 * ([data-testid=...], [name=...], [aria-label=...]).
 */
export const RULE_FRAGILE_QUERY_SELECTOR = 'fragile-query-selector'

/**
 * Rule 2 — textContent / innerText as primary matcher.
 * Flags `element.textContent` / `element.innerText` used as the sole
 * match criterion (i.e. NOT inside a compound check that also uses a
 * stable attribute).
 */
export const RULE_TEXT_CONTENT_PRIMARY = 'text-content-primary'

/**
 * Rule 3 — Short setTimeout in auth/navigation context.
 * Flags `await new Promise(r => setTimeout(r, N))` where N < 500 inside a
 * function whose name suggests auth or navigation (login, navigate, goto, etc.)
 */
export const RULE_SHORT_TIMEOUT_AUTH = 'short-timeout-auth'

/**
 * Rule 4 — Invalid CSS selector characters.
 * Flags CSS selector strings containing `!=` or unescaped `$` / `^` outside
 * attribute brackets — these cause silent failures in Puppeteer.
 */
export const RULE_INVALID_CSS_CHARS = 'invalid-css-chars'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STABLE_ATTR_RE = /\[(data-testid|name|aria-label|id|role|type)=/

/** True when selector looks like a stable attribute selector. */
export function isStableSelector(selector: string): boolean {
  return STABLE_ATTR_RE.test(selector)
}

/** True when selector contains suspicious regex-like chars outside attribute brackets. */
export function hasFragileChars(selector: string): boolean {
  // Remove balanced [...] attribute brackets, then check for regex chars
  const withoutBrackets = selector.replace(/\[[^\]]*\]/g, '')
  return /[#~|^$*+?()]/.test(withoutBrackets)
}

/** True when string contains `!=` or unescaped `$`, `^` outside attribute brackets. */
export function hasInvalidCssChars(selector: string): boolean {
  const withoutBrackets = selector.replace(/\[[^\]]*\]/g, '')
  return /!=/.test(selector) || /[$^]/.test(withoutBrackets)
}

export function snippetAt(source: string, pos: number, len = 80): string {
  const start = Math.max(0, pos - 20)
  const raw = source.slice(start, start + len).replace(/\s+/g, ' ').trim()
  return raw.length > 60 ? raw.slice(0, 57) + '...' : raw
}
