/**
 * Pure classification logic for `tester journey-audit` page status.
 *
 * Extracted from `journey-audit.ts` so it can be unit-tested without a real
 * browser. The runner pre-computes all DOM-derived signals (h1 text, body
 * length, table/button counts, marker regex counts) and passes them here;
 * this function returns `{ status, notes }` based on config-driven rules.
 *
 * Config knobs (added in 0.3.0):
 *   - `bodyLenThreshold` — override the default 200-char "suspiciously empty"
 *     threshold. Useful when a project's hero/form pages render with even
 *     less text than 200 chars.
 *   - `validContentMarkers` — regex (string). When this regex matches at
 *     least once in body innerText, the EMPTY heuristic is bypassed for
 *     that page even if `bodyLen < bodyLenThreshold`.
 *   - `perPageOverrides` — record keyed by `link.href`. Each entry can
 *     opt a specific page out of the empty-check (`skipEmptyCheck: true`)
 *     or pin a known H1 (informational).
 *   - `formHeroException` — boolean (default `true` in 0.3.0+). When true,
 *     pages with a non-empty `h1` AND at least one `<button>` are treated
 *     as legitimate even if `bodyLen < bodyLenThreshold`. Backward-compat
 *     escape hatch: set to `false` to restore 0.2.x always-flag behavior.
 */

export interface NavLink {
  name: string
  href: string
}

export interface PerPageOverride {
  /** Skip the bodyLen<threshold EMPTY check entirely for this page. */
  skipEmptyCheck?: boolean
  /** Optional documentation hint; not enforced by classifier. */
  expectedH1?: string
}

export interface JourneyClassifierConfig {
  bodyLenThreshold?: number
  validContentMarkers?: string
  perPageOverrides?: Record<string, PerPageOverride>
  formHeroException?: boolean
}

export interface ClassifierInput {
  link: NavLink
  httpStatus: number
  h1: string
  bodyLen: number
  tableCount: number
  buttonCount: number
  /** Pre-computed regex counts at the runner; pure function never hits the page. */
  emptyCount: number
  errorCount: number
  gatedCount: number
  /** Pre-computed count of validContentMarkers hits in body innerText (0 if not configured). */
  validContentCount: number
  cfg: JourneyClassifierConfig
}

export interface ClassifierOutput {
  status: string
  notes: string[]
}

export const DEFAULT_BODY_LEN_THRESHOLD = 200

/**
 * Classify a page's status from pre-computed signals. Pure function — no IO.
 * Order matters: HTTP error wins over everything; gated/error/empty applied
 * in increasing severity within the 2xx-3xx range so the most informative
 * label survives.
 */
export function classifyPage(input: ClassifierInput): ClassifierOutput {
  const {
    link,
    httpStatus,
    h1,
    bodyLen,
    tableCount,
    buttonCount,
    emptyCount,
    errorCount,
    gatedCount,
    validContentCount,
    cfg,
  } = input

  const notes: string[] = [`tables=${tableCount} buttons=${buttonCount} bodyLen=${bodyLen}`]
  let status = 'OK'

  if (emptyCount > 0) notes.push(`emptyMarkers=${emptyCount}`)

  if (errorCount > 0) {
    notes.push(`errorMarkers=${errorCount}`)
    status = 'HAS_ERRORS'
  }

  if (gatedCount > 0) {
    notes.push('ONBOARDING_WALL')
    status = 'GATED'
  }

  // Empty-page heuristic with config-driven exemptions
  const threshold = cfg.bodyLenThreshold ?? DEFAULT_BODY_LEN_THRESHOLD
  if (bodyLen < threshold) {
    const override = cfg.perPageOverrides?.[link.href]
    const overrideSkip = override?.skipEmptyCheck === true

    // Default-on form/hero exception: page has h1 + buttons looks intentional
    // (login form, register, hero landing).
    const formHeroEnabled = cfg.formHeroException !== false
    const isFormOrHero = formHeroEnabled && h1.trim() !== '' && buttonCount >= 1

    const validHit = validContentCount > 0

    if (overrideSkip) {
      notes.push(`empty_check_skipped (override:${link.href})`)
    } else if (isFormOrHero) {
      notes.push(`empty_check_skipped (form_hero h1+buttons=${buttonCount})`)
    } else if (validHit) {
      notes.push(`empty_check_skipped (validContentMarkers=${validContentCount})`)
    } else {
      notes.push('suspiciously_empty')
      status = 'EMPTY'
    }
  }

  if (httpStatus >= 400) status = `HTTP_${httpStatus}`

  return { status, notes }
}
