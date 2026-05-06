/**
 * Auth Audit — Module F
 * Logout verification, private route protection, session refresh,
 * and cookie attribute checks.
 * Additive — does NOT modify existing auth/login.ts.
 */

type Page = import('puppeteer').Page

export interface AuthFinding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  category: string
  message: string
  detail?: string
}

export interface AuthAuditResult {
  passed: boolean
  findings: AuthFinding[]
  durationMs: number
}

// ─── Cookie Attribute Audit ──────────────────────────────────

export interface CookieAuditResult {
  findings: AuthFinding[]
}

/**
 * Inspects all cookies set after login and flags missing
 * security attributes: HttpOnly, Secure, SameSite.
 */
export async function auditCookieAttributes(page: Page): Promise<CookieAuditResult> {
  const findings: AuthFinding[] = []
  const cookies = await page.cookies()

  for (const cookie of cookies) {
    const isSessionLike =
      /session|auth|token|sid|jwt|access|refresh/i.test(cookie.name)

    if (!cookie.httpOnly && isSessionLike) {
      findings.push({
        severity: 'HIGH',
        category: 'cookie_no_httponly',
        message: `Session cookie missing HttpOnly: ${cookie.name}`,
        detail: `Cookie accessible via document.cookie — vulnerable to XSS theft`,
      })
    }

    if (!cookie.secure && cookie.domain && !cookie.domain.includes('localhost')) {
      findings.push({
        severity: isSessionLike ? 'HIGH' : 'MEDIUM',
        category: 'cookie_no_secure',
        message: `Cookie missing Secure flag: ${cookie.name}`,
        detail: `Will be sent over plain HTTP — vulnerable to network interception`,
      })
    }

    if (!cookie.sameSite || cookie.sameSite === 'None') {
      const severity = cookie.sameSite === 'None' && !cookie.secure ? 'HIGH' : 'MEDIUM'
      findings.push({
        severity,
        category: 'cookie_samesite',
        message: `Cookie SameSite=${cookie.sameSite ?? 'not set'}: ${cookie.name}`,
        detail:
          cookie.sameSite === 'None'
            ? 'SameSite=None requires Secure; CSRF risk on cross-origin'
            : 'Missing SameSite — defaults to browser behavior (Lax in modern browsers)',
      })
    }

    // Expiry check — session cookie with very long max-age
    if (cookie.expires && cookie.expires > 0) {
      const daysRemaining = (cookie.expires - Date.now() / 1000) / 86400
      if (daysRemaining > 30 && isSessionLike) {
        findings.push({
          severity: 'LOW',
          category: 'cookie_long_lived',
          message: `Session cookie valid for ${Math.round(daysRemaining)} days: ${cookie.name}`,
          detail: 'Long-lived session tokens increase exposure window on device compromise',
        })
      }
    }
  }

  return { findings }
}

// ─── Logout Verification ─────────────────────────────────────

/**
 * Performs logout and verifies:
 * 1. Redirect to login/home
 * 2. Session cookies are cleared
 * 3. Protected route is no longer accessible (401/redirect)
 */
export async function auditLogout(
  page: Page,
  options: {
    logoutSelector?: string
    logoutUrl?: string
    privateRoute?: string
    loginIndicator?: string
  } = {},
): Promise<AuthFinding[]> {
  const findings: AuthFinding[] = []

  const cookiesBefore = await page.cookies()
  const sessionCookiesBefore = cookiesBefore.filter(c =>
    /session|auth|token|sid|jwt|access|refresh/i.test(c.name)
  )

  // Trigger logout
  if (options.logoutUrl) {
    await page.goto(options.logoutUrl, { waitUntil: 'networkidle2', timeout: 15_000 }).catch(() => null)
  } else if (options.logoutSelector) {
    await page.click(options.logoutSelector).catch(() => null)
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10_000 }).catch(() => null)
  } else {
    // Try common logout patterns
    const found = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button'))
      const logoutEl = links.find(el =>
        /logout|sign.?out|log.?out/i.test(el.textContent ?? '')
      )
      if (logoutEl) { (logoutEl as HTMLElement).click(); return true }
      return false
    })
    if (found) {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10_000 }).catch(() => null)
    }
  }

  // Check session cookies cleared
  const cookiesAfter = await page.cookies()
  const sessionCookiesAfter = cookiesAfter.filter(c =>
    /session|auth|token|sid|jwt|access|refresh/i.test(c.name)
  )

  if (sessionCookiesBefore.length > 0 && sessionCookiesAfter.length >= sessionCookiesBefore.length) {
    findings.push({
      severity: 'HIGH',
      category: 'logout_session_not_cleared',
      message: 'Session cookies not cleared after logout',
      detail: `Before: ${sessionCookiesBefore.map(c => c.name).join(', ')} — After: ${sessionCookiesAfter.map(c => c.name).join(', ')}`,
    })
  }

  // Check redirect to login/home
  const postLogoutUrl = page.url()
  const onLoginPage =
    postLogoutUrl.includes('/login') ||
    postLogoutUrl.includes('/signin') ||
    postLogoutUrl.includes('/auth') ||
    (options.loginIndicator && await page.$(options.loginIndicator).then(Boolean))

  if (!onLoginPage && postLogoutUrl.includes('dashboard')) {
    findings.push({
      severity: 'HIGH',
      category: 'logout_no_redirect',
      message: 'After logout still on authenticated page',
      detail: `Current URL: ${postLogoutUrl}`,
    })
  }

  // Probe private route post-logout
  if (options.privateRoute) {
    const resp = await page.goto(options.privateRoute, { waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => null)
    const statusCode = resp?.status() ?? 0
    const currentUrl = page.url()
    const redirectedToLogin =
      currentUrl.includes('/login') ||
      currentUrl.includes('/signin') ||
      currentUrl.includes('/auth')

    if (statusCode === 200 && !redirectedToLogin) {
      findings.push({
        severity: 'CRITICAL',
        category: 'logout_session_replay',
        message: 'Private route accessible after logout (session replay)',
        detail: `${options.privateRoute} returned HTTP ${statusCode} without redirect to login`,
      })
    }
  }

  return findings
}

// ─── Session Refresh Audit ────────────────────────────────────

/**
 * Checks that the refresh-token endpoint:
 * - Requires a valid refresh token (401 on missing/invalid)
 * - Returns a new access token
 * - Does not expose sensitive data in error responses
 */
export async function auditSessionRefresh(
  page: Page,
  refreshEndpoint: string,
): Promise<AuthFinding[]> {
  const findings: AuthFinding[] = []

  // Probe without any token
  const result = await page.evaluate(async (url) => {
    try {
      const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const text = await resp.text()
      return { status: resp.status, body: text.slice(0, 500) }
    } catch { return null }
  }, refreshEndpoint)

  if (!result) return findings

  if (result.status === 200) {
    findings.push({
      severity: 'CRITICAL',
      category: 'session_refresh_bypass',
      message: 'Refresh endpoint accepts empty body and returns 200',
      detail: `POST ${refreshEndpoint} returned HTTP 200 without a valid refresh token`,
    })
  }

  // Check for stack trace in error body
  if (/at Object\.|at Module\.|stack:|Error:/.test(result.body)) {
    findings.push({
      severity: 'HIGH',
      category: 'error_disclosure',
      message: 'Refresh endpoint error response contains stack trace',
      detail: result.body.slice(0, 200),
    })
  }

  return findings
}

// ─── Unified Auth Audit ───────────────────────────────────────

export interface AuthAuditOptions {
  logoutSelector?: string
  logoutUrl?: string
  privateRoute?: string
  loginIndicator?: string
  refreshEndpoint?: string
  skip?: Array<'cookies' | 'logout' | 'refresh'>
}

export async function runAuthAudit(
  page: Page,
  baseUrl: string,
  opts: AuthAuditOptions = {},
): Promise<AuthAuditResult> {
  const start = Date.now()
  const all: AuthFinding[] = []
  const skip = new Set(opts.skip ?? [])

  if (!skip.has('cookies')) {
    const { findings } = await auditCookieAttributes(page)
    all.push(...findings)
  }

  if (!skip.has('logout')) {
    const findings = await auditLogout(page, {
      logoutSelector: opts.logoutSelector,
      logoutUrl: opts.logoutUrl,
      privateRoute: opts.privateRoute,
      loginIndicator: opts.loginIndicator,
    })
    all.push(...findings)
  }

  if (!skip.has('refresh') && opts.refreshEndpoint) {
    const findings = await auditSessionRefresh(page, opts.refreshEndpoint)
    all.push(...findings)
  }

  const critical = all.filter(f => f.severity === 'CRITICAL').length
  const high = all.filter(f => f.severity === 'HIGH').length

  return {
    passed: critical === 0 && high === 0,
    findings: all,
    durationMs: Date.now() - start,
  }
}
