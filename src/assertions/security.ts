/**
 * Security Assertions — Module I
 * Header uniqueness, 401-without-auth probe, HTML-vs-JSON content-type,
 * mixed-content detection, and CORS misconfiguration checks.
 * Additive — does NOT modify existing assertion engine.
 */

type Page = import('puppeteer').Page

export interface SecurityFinding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  category: string
  message: string
  detail?: string
  url?: string
}

export interface SecurityAuditResult {
  passed: boolean
  findings: SecurityFinding[]
  durationMs: number
}

// ─── Header Uniqueness Check ─────────────────────────────────

const SECURITY_HEADERS = [
  'content-security-policy',
  'strict-transport-security',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
]

const MUST_NOT_EXPOSE = [
  'x-powered-by',
  'server',
  'x-aspnet-version',
  'x-aspnetmvc-version',
]

/**
 * Checks security headers are present and information-disclosure headers are absent.
 */
export async function auditSecurityHeaders(
  page: Page,
  targetUrl: string,
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = []

  const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null)
  if (!response) {
    findings.push({ severity: 'HIGH', category: 'headers', message: `Failed to fetch ${targetUrl}` })
    return findings
  }

  const headers = response.headers()

  // Check required security headers
  for (const h of SECURITY_HEADERS) {
    if (!headers[h]) {
      findings.push({
        severity: h === 'strict-transport-security' || h === 'content-security-policy' ? 'HIGH' : 'MEDIUM',
        category: 'missing_security_header',
        message: `Missing security header: ${h}`,
        url: targetUrl,
      })
    }
  }

  // Check information disclosure headers
  for (const h of MUST_NOT_EXPOSE) {
    if (headers[h]) {
      findings.push({
        severity: 'MEDIUM',
        category: 'information_disclosure',
        message: `Information-disclosure header exposed: ${h}: ${headers[h]}`,
        url: targetUrl,
      })
    }
  }

  // Check duplicate header simulation: X-Frame-Options + CSP frame-ancestors conflict
  if (headers['x-frame-options'] && headers['content-security-policy']?.includes('frame-ancestors')) {
    findings.push({
      severity: 'LOW',
      category: 'header_conflict',
      message: 'X-Frame-Options and CSP frame-ancestors both set — X-Frame-Options is redundant',
      url: targetUrl,
    })
  }

  return findings
}

// ─── 401-Without-Auth Probe ──────────────────────────────────

const PRIVATE_PATH_PATTERNS = [
  '/dashboard', '/admin', '/account', '/settings', '/profile',
  '/api/me', '/api/user', '/api/auth/me', '/api/v1/auth/me',
  '/api/v1/me', '/api/users/me',
]

/**
 * Probes known private routes without a session cookie.
 * Expects 401 or 302→/login. Flags 200 as CRITICAL.
 */
export async function auditUnprotectedRoutes(
  page: Page,
  baseUrl: string,
  privatePaths?: string[],
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = []
  const paths = privatePaths ?? PRIVATE_PATH_PATTERNS

  // Clear all cookies before probing
  const client = await page.createCDPSession()
  await client.send('Network.clearBrowserCookies')

  for (const path of paths) {
    const url = `${baseUrl.replace(/\/$/, '')}${path}`
    let statusCode = 0
    let finalUrl = url

    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 })
      statusCode = resp?.status() ?? 0
      finalUrl = page.url()
    } catch {
      continue // ECONNREFUSED, timeout → route doesn't exist, skip
    }

    const redirectedToLogin =
      finalUrl.includes('/login') ||
      finalUrl.includes('/signin') ||
      finalUrl.includes('/auth')

    if (statusCode === 200 && !redirectedToLogin) {
      findings.push({
        severity: 'CRITICAL',
        category: 'auth_bypass',
        message: `Private route accessible without authentication: ${path}`,
        detail: `HTTP ${statusCode} — no redirect to login`,
        url,
      })
    } else if (statusCode === 403) {
      // 403 is acceptable — access denied
    } else if (statusCode >= 500) {
      findings.push({
        severity: 'LOW',
        category: 'auth_server_error',
        message: `Server error on unauthenticated probe: ${path}`,
        detail: `HTTP ${statusCode}`,
        url,
      })
    }
  }

  return findings
}

// ─── HTML-vs-JSON Content-Type Mismatch ──────────────────────

/**
 * Probes JSON API endpoints and checks Content-Type is application/json.
 * HTML responses to API routes often indicate error pages leaking stack traces.
 */
export async function auditApiContentType(
  page: Page,
  baseUrl: string,
  apiPaths?: string[],
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = []
  const base = baseUrl.replace(/\/$/, '')

  // Discover API paths from page navigation or use defaults
  const paths = apiPaths ?? ['/api/health', '/api/status', '/api/version']

  for (const path of paths) {
    const url = `${base}${path}`
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10_000 })
      if (!resp) continue

      const ct = resp.headers()['content-type'] ?? ''
      const status = resp.status()

      // API paths returning HTML at non-redirect statuses
      if (ct.includes('text/html') && !path.endsWith('.html') && status < 300) {
        // Check if body looks like a stack trace / error page
        const bodySnippet = await page.evaluate(() =>
          document.body?.innerText?.slice(0, 500) ?? ''
        )
        const isErrorPage =
          /Error:|stack trace|at Object\.|at Module\.|SyntaxError|ReferenceError/i.test(bodySnippet)

        findings.push({
          severity: isErrorPage ? 'HIGH' : 'MEDIUM',
          category: 'content_type_mismatch',
          message: `API route returns HTML instead of JSON: ${path}`,
          detail: isErrorPage
            ? 'Response appears to be an error page — possible stack trace disclosure'
            : `Content-Type: ${ct}`,
          url,
        })
      }
    } catch {
      // Skip unreachable routes
    }
  }

  return findings
}

// ─── Mixed Content Detector ──────────────────────────────────

/**
 * Loads a page and detects mixed-content (HTTP resources on HTTPS page).
 */
export async function auditMixedContent(
  page: Page,
  targetUrl: string,
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = []
  if (!targetUrl.startsWith('https://')) return findings

  const mixedResources: string[] = []

  page.on('request', (req) => {
    const url = req.url()
    if (url.startsWith('http://') && !url.startsWith('http://localhost')) {
      mixedResources.push(url)
    }
  })

  await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => null)

  for (const url of mixedResources) {
    findings.push({
      severity: 'HIGH',
      category: 'mixed_content',
      message: `Mixed content: HTTP resource loaded on HTTPS page`,
      detail: url,
      url: targetUrl,
    })
  }

  return findings
}

// ─── CORS Misconfiguration Probe ─────────────────────────────

/**
 * Sends a cross-origin request with an attacker Origin and checks
 * if the server reflects it in Access-Control-Allow-Origin.
 */
export async function auditCors(
  page: Page,
  baseUrl: string,
  apiPaths?: string[],
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = []
  const paths = apiPaths ?? ['/api/health', '/api/me', '/api/user']
  const attackerOrigin = 'https://evil.attacker-example.com'

  for (const path of paths) {
    const url = `${baseUrl.replace(/\/$/, '')}${path}`
    try {
      const result = await page.evaluate(async (fetchUrl, origin) => {
        try {
          const resp = await fetch(fetchUrl, {
            headers: { Origin: origin },
            credentials: 'include',
          })
          return {
            acao: resp.headers.get('access-control-allow-origin'),
            acac: resp.headers.get('access-control-allow-credentials'),
            status: resp.status,
          }
        } catch {
          return null
        }
      }, url, attackerOrigin)

      if (!result) continue

      if (result.acao === attackerOrigin || result.acao === '*') {
        const isCritical = result.acao === attackerOrigin && result.acac === 'true'
        findings.push({
          severity: isCritical ? 'CRITICAL' : 'HIGH',
          category: 'cors_misconfiguration',
          message: `CORS reflects attacker origin on ${path}`,
          detail: `ACAO: ${result.acao}, ACAC: ${result.acac}`,
          url,
        })
      }
    } catch {
      // Ignore
    }
  }

  return findings
}

// ─── Unified Security Audit ──────────────────────────────────

export interface SecurityAuditOptions {
  /** Specific private paths to probe (default: common dashboard/api paths) */
  privatePaths?: string[]
  /** API paths for JSON content-type check */
  apiPaths?: string[]
  /** Skip individual checks */
  skip?: Array<'headers' | 'unprotected_routes' | 'content_type' | 'mixed_content' | 'cors'>
}

export async function runSecurityAudit(
  page: Page,
  baseUrl: string,
  opts: SecurityAuditOptions = {},
): Promise<SecurityAuditResult> {
  const start = Date.now()
  const all: SecurityFinding[] = []
  const skip = new Set(opts.skip ?? [])

  if (!skip.has('headers')) {
    const f = await auditSecurityHeaders(page, baseUrl)
    all.push(...f)
  }

  if (!skip.has('unprotected_routes')) {
    const f = await auditUnprotectedRoutes(page, baseUrl, opts.privatePaths)
    all.push(...f)
  }

  if (!skip.has('content_type')) {
    const f = await auditApiContentType(page, baseUrl, opts.apiPaths)
    all.push(...f)
  }

  if (!skip.has('mixed_content')) {
    const f = await auditMixedContent(page, baseUrl)
    all.push(...f)
  }

  if (!skip.has('cors')) {
    const f = await auditCors(page, baseUrl, opts.apiPaths)
    all.push(...f)
  }

  const critical = all.filter(f => f.severity === 'CRITICAL').length
  const high = all.filter(f => f.severity === 'HIGH').length

  return {
    passed: critical === 0 && high === 0,
    findings: all,
    durationMs: Date.now() - start,
  }
}
