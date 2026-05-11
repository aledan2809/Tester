/**
 * T-004 — FailureContext: data shape captured at the point of test failure.
 *
 * Consumers populate as much as available; fields not provided are left
 * as empty defaults so the classifier can still run on partial context.
 */

export interface NetworkEntry {
  url: string
  method: string
  status: number
  /** Duration in milliseconds */
  duration?: number
}

export interface FailureContext {
  /** The failing assertion text, e.g. "Expected 200, got 404" */
  assertion: string
  /** URL of the page where the failure occurred */
  pageUrl: string
  /** Test or scenario name */
  testName: string
  /** HTML of the failing element's container + siblings (truncated at 4KB) */
  domSnapshot: string
  /** Browser console messages at the time of failure */
  consoleLogs: string[]
  /** Last N network requests before failure (default: last 20) */
  networkTail: NetworkEntry[]
  /** CSS/Tailwind class list of the matched element */
  cssClasses: string[]
  /** Milliseconds from navigation start to assertion failure */
  timeToEventMs?: number
  /** Path to screenshot taken at failure moment */
  screenshotPath?: string
  /** Rule ID from T-003 linter, if the failure was linter-surfaced */
  linterRuleId?: string
}

/** Build a FailureContext with safe defaults for optional fields. */
export function buildFailureContext(
  partial: Pick<FailureContext, 'assertion' | 'pageUrl' | 'testName'> &
    Partial<Omit<FailureContext, 'assertion' | 'pageUrl' | 'testName'>>,
): FailureContext {
  const raw = partial.domSnapshot ?? ''
  const domSnapshot =
    raw.length > 4096 ? raw.slice(0, 4096) + '\n…[truncated]' : raw
  return {
    consoleLogs: [],
    networkTail: [],
    cssClasses: [],
    ...partial,
    domSnapshot,
  }
}
