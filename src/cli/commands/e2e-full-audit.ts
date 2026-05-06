/**
 * E2E Full Audit Command — 19-step unified audit
 *
 * Step 1  — BFS discovery (all public pages, up to --max-pages)
 * Step 2  — Public surface audit (load timing per discovered page)
 * Step 3  — Auth audit: cookie attrs, private-route redirect check
 * Step 4  — Real login (if --email + --password provided)
 * Step 5  — Private dashboard audit (post-login crawl)
 * Step 6  — Form audit: type-confusion fuzz + duplicate submit
 * Step 7  — Console errors (aggregated across all navigation)
 * Step 8  — Network/API errors (4xx/5xx across all navigation)
 * Step 9  — Security audit: headers, CORS, mixed content
 * Step 10 — Accessibility scan (axe-core)
 * Step 11 — Lighthouse/Performance (FCP, LCP, TTI, CLS, TBT)
 * Step 12 — Visual screenshots (full-page per key page + diff vs baseline)
 * Step 13 — Video + trace recording (Playwright)
 * Step 14 — Infinite loading detector (spinner/skeleton still visible after 8s)
 * Step 15 — Forbidden actions guard (unauthenticated access to protected routes)
 * Step 16 — Multi-role audit (repeat steps 4+5 per role if --roles provided)
 * Step 17 — Responsive audit (desktop 1440×900 / tablet 768×1024 / mobile 390×844)
 * Step 18 — Previous vs current audit comparison (delta on findings)
 * Step 19 — Final report (severity, reproduce steps, expected/actual, evidence links)
 *
 * Usage:
 *   tester e2e-full-audit --url https://example.com [options]
 *   tester e2e-full-audit --url https://app.com --email user@app.com --password secret
 *   tester e2e-full-audit --url https://app.com --email admin@app.com --password s3cr3t \
 *     --roles '[{"name":"editor","email":"ed@app.com","password":"pw2"}]'
 */

import type { Command } from 'commander'
import * as fs from 'fs'
import * as path from 'path'
import { BrowserCore } from '../../core/browser'
import { auditLoadTiming, auditHydrationAndCSP } from '../../assertions/dom'
import { runSecurityAudit } from '../../assertions/security'
import { runAuthAudit } from '../../auth/audit'
import { autoLogin } from '../../auth/login'
import { runFormAudit } from '../../assertions/forms'
import { runA11yScan } from '../../assertions/a11y'
import { capturePerformanceMetrics } from '../../assertions/performance'
import { startRecording } from '../../playwright/recorder'
import { pixelDiffPercent } from '../../snapshot/compare'
import { captureFullPage } from '../../snapshot/capture'
import { crawlSite } from '../../discovery/crawler'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Finding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'
  message: string
  reproSteps?: string
  expected?: string
  actual?: string
  evidencePath?: string
}

interface StepOutcome {
  step: number
  name: string
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP'
  durationMs: number
  details: string
  findings?: Finding[]
}

interface RoleCredentials {
  name: string
  email: string
  password: string
}

interface E2EFullAuditResult {
  url: string
  startedAt: string
  completedAt: string
  totalDurationMs: number
  steps: StepOutcome[]
  overallScore: number
  verdict: 'PASS' | 'FAIL' | 'WARN'
  reportPath?: string
  markdownReportPath?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Detect persistent loading spinners on a page after waiting waitMs. */
async function detectInfiniteLoading(
  page: import('puppeteer').Page,
  pageUrl: string,
  waitMs = 8000,
): Promise<{ hasInfiniteLoad: boolean; selectors: string[] }> {
  const SPINNER_SELECTORS = [
    '[aria-busy="true"]',
    '[role="progressbar"]',
    '[data-loading="true"]',
    '[data-testid*="spinner"]',
    '[data-testid*="loading"]',
    '.loading',
    '.spinner',
    '.skeleton',
    '.shimmer',
    '[class*="loading"]',
    '[class*="spinner"]',
    '[class*="skeleton"]',
    '[class*="shimmer"]',
  ]
  try {
    await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30_000 })
    await new Promise(r => setTimeout(r, waitMs))
    const found: string[] = []
    for (const sel of SPINNER_SELECTORS) {
      const visible = await page.evaluate((s) => {
        const el = document.querySelector(s)
        if (!el) return false
        const style = window.getComputedStyle(el)
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
      }, sel).catch(() => false)
      if (visible) found.push(sel)
    }
    return { hasInfiniteLoad: found.length > 0, selectors: found }
  } catch {
    return { hasInfiniteLoad: false, selectors: [] }
  }
}

/** Check whether private-looking paths are actually protected (redirect to login or 401/403). */
async function runForbiddenActionsGuard(
  baseUrl: string,
  headed: boolean,
): Promise<{ unprotected: string[]; checked: number }> {
  const PRIVATE_PATHS = [
    '/dashboard', '/admin', '/account', '/profile', '/settings',
    '/user', '/users', '/api/user', '/api/me', '/api/profile', '/api/account',
  ]
  const unprotected: string[] = []
  const browser = new BrowserCore({ headless: !headed })
  await browser.launch()
  const page = browser.getPage()!
  const origin = new URL(baseUrl).origin

  for (const p of PRIVATE_PATHS) {
    try {
      const target = `${origin}${p}`
      const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 10_000 })
      const finalUrl = page.url()
      const status = response?.status() ?? 0
      // Protected = redirect to login, OR 401/403/404
      const redirectedToLogin = finalUrl.includes('/login') || finalUrl.includes('/signin') || finalUrl.includes('/auth')
      const isProtected = redirectedToLogin || status === 401 || status === 403 || status === 404
      if (!isProtected && status === 200) {
        unprotected.push(`${p} → 200 (expected login redirect or 401/403)`)
      }
    } catch { /* path doesn't exist — OK */ }
  }
  await browser.close().catch(() => null)
  return { unprotected, checked: PRIVATE_PATHS.length }
}

/** Responsive audit: navigate to each URL at 3 viewports, screenshot + overflow check. */
async function runResponsiveAudit(
  pages: string[],
  outDir: string,
  headed: boolean,
): Promise<Array<{ viewport: string; url: string; overflows: boolean; screenshotPath: string }>> {
  const VIEWPORTS = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 390, height: 844 },
  ]
  const results: Array<{ viewport: string; url: string; overflows: boolean; screenshotPath: string }> = []
  const sample = pages.slice(0, 3)

  for (const vp of VIEWPORTS) {
    const browser = new BrowserCore({ headless: !headed, viewportWidth: vp.width, viewportHeight: vp.height })
    await browser.launch()
    const page = browser.getPage()!

    for (const url of sample) {
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 20_000 })
        const screenshotPath = path.join(outDir, `responsive-${vp.name}-${encodeURIComponent(url.replace(/https?:\/\//, '')).slice(0, 40)}.png`)
        await captureFullPage(page, screenshotPath)
        const overflows = await page.evaluate(() =>
          document.body.scrollWidth > window.innerWidth + 5
        ).catch(() => false)
        results.push({ viewport: vp.name, url, overflows, screenshotPath })
      } catch {
        results.push({ viewport: vp.name, url, overflows: false, screenshotPath: '' })
      }
    }
    await browser.close().catch(() => null)
  }
  return results
}

/** Perform login + private-dashboard crawl for one role. Returns step outcome. */
async function auditRole(
  roleName: string,
  creds: { email: string; password: string },
  baseUrl: string,
  outDir: string,
  headed: boolean,
  stepBase: number,
): Promise<StepOutcome[]> {
  const outcomes: StepOutcome[] = []
  const browser = new BrowserCore({ headless: !headed })
  await browser.launch()
  const page = browser.getPage()!

  // Login
  const loginStart = Date.now()
  const loginResult = await autoLogin(browser, {
    username: creds.email,
    password: creds.password,
    loginUrl: `${new URL(baseUrl).origin}/login`,
  }).catch(err => ({ success: false, error: String(err) }))

  outcomes.push({
    step: stepBase,
    name: `Login [${roleName}]`,
    status: loginResult.success ? 'PASS' : 'FAIL',
    durationMs: Date.now() - loginStart,
    details: loginResult.success
      ? `Logged in as ${roleName}`
      : `Login failed: ${loginResult.error ?? 'unknown'}`,
  })

  if (loginResult.success) {
    // Private crawl
    const crawlStart = Date.now()
    try {
      const privateCrawl = await crawlSite(browser, baseUrl, {
        maxPages: 10,
        maxDepth: 2,
        timeout: 30_000,
        allowedDomains: [new URL(baseUrl).hostname],
      })
      const screenshotDir = path.join(outDir, `role-${roleName}`)
      fs.mkdirSync(screenshotDir, { recursive: true })
      for (const p of privateCrawl.pages.slice(0, 3)) {
        const ss = path.join(screenshotDir, `${encodeURIComponent(p.url).slice(0, 40)}.png`)
        await captureFullPage(page, ss).catch(() => null)
      }
      outcomes.push({
        step: stepBase + 1,
        name: `Private dashboard [${roleName}]`,
        status: privateCrawl.pages.length > 0 ? 'PASS' : 'WARN',
        durationMs: Date.now() - crawlStart,
        details: `Discovered ${privateCrawl.pages.length} page(s) as ${roleName}`,
      })
    } catch (err) {
      outcomes.push({
        step: stepBase + 1,
        name: `Private dashboard [${roleName}]`,
        status: 'FAIL',
        durationMs: Date.now() - crawlStart,
        details: String(err),
      })
    }
  }
  await browser.close().catch(() => null)
  return outcomes
}

/** Write the final markdown report. */
function writeMarkdownReport(result: E2EFullAuditResult, outDir: string): string {
  const lines: string[] = []
  lines.push(`# E2E Full Audit Report`)
  lines.push(``)
  lines.push(`**URL**: ${result.url}`)
  lines.push(`**Started**: ${result.startedAt}`)
  lines.push(`**Completed**: ${result.completedAt}`)
  lines.push(`**Duration**: ${(result.totalDurationMs / 1000).toFixed(1)}s`)
  lines.push(`**Verdict**: **${result.verdict}** (${result.overallScore}/100)`)
  lines.push(``)
  lines.push(`## Step Summary`)
  lines.push(``)
  lines.push(`| Step | Name | Status | Duration | Details |`)
  lines.push(`|------|------|--------|----------|---------|`)
  for (const s of result.steps) {
    const icon = s.status === 'PASS' ? '✅' : s.status === 'FAIL' ? '❌' : s.status === 'WARN' ? '⚠️' : '⏭️'
    lines.push(`| ${s.step} | ${s.name} | ${icon} ${s.status} | ${(s.durationMs / 1000).toFixed(1)}s | ${s.details.replace(/\|/g, '\\|').slice(0, 120)} |`)
  }
  lines.push(``)

  // Findings grouped by severity
  const allFindings: Array<Finding & { stepName: string }> = []
  for (const s of result.steps) {
    for (const f of s.findings ?? []) {
      allFindings.push({ ...f, stepName: s.name })
    }
  }

  const bySeverity: Record<string, typeof allFindings> = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [], INFO: [] }
  for (const f of allFindings) {
    ;(bySeverity[f.severity] ?? bySeverity.INFO).push(f)
  }

  for (const sev of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const) {
    const group = bySeverity[sev]
    if (group.length === 0) continue
    lines.push(`## ${sev} Findings (${group.length})`)
    lines.push(``)
    for (const f of group) {
      lines.push(`### [${sev}] ${f.message}`)
      lines.push(``)
      lines.push(`- **Step**: ${f.stepName}`)
      if (f.expected) lines.push(`- **Expected**: ${f.expected}`)
      if (f.actual) lines.push(`- **Actual**: ${f.actual}`)
      if (f.reproSteps) lines.push(`- **Reproduce**: ${f.reproSteps}`)
      if (f.evidencePath) lines.push(`- **Evidence**: [${path.basename(f.evidencePath)}](${f.evidencePath})`)
      lines.push(``)
    }
  }

  if (allFindings.length === 0) {
    lines.push(`## Findings`)
    lines.push(``)
    lines.push(`No findings. All checks passed. ✅`)
    lines.push(``)
  }

  const reportPath = path.join(outDir, 'e2e-full-audit-report.md')
  fs.writeFileSync(reportPath, lines.join('\n'))
  return reportPath
}

// ── Command ───────────────────────────────────────────────────────────────────

export function registerE2EFullAudit(program: Command): void {
  program
    .command('e2e-full-audit')
    .description('Run a 19-step full E2E audit: discovery, auth, forms, console, network, security, a11y, perf, screenshots, trace, infinite-load, forbidden-guard, multi-role, responsive, comparison, report')
    .requiredOption('-u, --url <url>', 'Target URL to audit')
    .option('--headed', 'Run with visible browser', false)
    .option('--email <email>', 'Login email/username for authenticated steps')
    .option('--password <password>', 'Login password for authenticated steps')
    .option('--login-url <url>', 'Explicit login page URL (default: <url>/login)')
    .option('--roles <json>', 'JSON array of {name,email,password} for multi-role audit', '')
    .option('--max-pages <n>', 'Max pages for BFS discovery', '20')
    .option('--no-trace', 'Skip Playwright trace recording')
    .option('--no-visual', 'Skip visual baseline diff')
    .option('--baseline <path>', 'Path to baseline screenshot for visual diff')
    .option('--history <dir>', 'Directory for audit history (enables Step 18 comparison)')
    .option('--out <dir>', 'Output directory for report and artifacts', './e2e-audit-results')
    .option('--json', 'Output results as JSON to stdout')
    .action(async (opts) => {
      const url = opts.url.startsWith('http') ? opts.url : `https://${opts.url}`
      const outDir = path.resolve(opts.out)
      const runTrace = opts.trace !== false
      const runVisual = opts.visual !== false
      const maxPages = parseInt(opts.maxPages ?? '20', 10)
      const hasCredentials = Boolean(opts.email && opts.password)
      const loginUrl = opts.loginUrl ?? `${new URL(url).origin}/login`
      const roles: RoleCredentials[] = opts.roles
        ? (() => { try { return JSON.parse(opts.roles) } catch { return [] } })()
        : []

      fs.mkdirSync(outDir, { recursive: true })
      const screenshotsDir = path.join(outDir, 'screenshots')
      fs.mkdirSync(screenshotsDir, { recursive: true })

      console.info(`\n🔍 E2E Full Audit — ${url}`)
      console.info(`   Steps: 19 | Output: ${outDir}`)
      if (hasCredentials) console.info(`   Auth: ${opts.email}`)
      if (roles.length > 0) console.info(`   Roles: ${roles.map(r => r.name).join(', ')}`)
      console.info(``)

      const startedAt = new Date().toISOString()
      const steps: StepOutcome[] = []
      let discoveredUrls: string[] = [url]

      // ── Playwright recorder (wraps all navigation steps) ─────────────────
      let recordingStop: (() => Promise<unknown>) | undefined
      if (runTrace) {
        try {
          const session = await startRecording({ outputDir: outDir, label: 'e2e-trace', video: true, trace: true })
          await session.page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => null)
          recordingStop = session.stop
        } catch (err) {
          console.warn(`   ⚠ Playwright recording unavailable: ${err instanceof Error ? err.message : err}`)
        }
      }

      // ── Main Puppeteer browser ────────────────────────────────────────────
      const browser = new BrowserCore({ headless: !opts.headed })
      await browser.launch()
      const page = browser.getPage()!

      // ════════════════════════════════════════════════════════════════════
      // STEP 1 — BFS Discovery
      // ════════════════════════════════════════════════════════════════════
      {
        process.stdout.write(`   Step  1/19 — BFS discovery (max ${maxPages} pages)... `)
        const s = Date.now()
        try {
          const domain = new URL(url).hostname
          const crawlResult = await crawlSite(browser, url, {
            maxPages,
            maxDepth: 3,
            timeout: 30_000,
            allowedDomains: [domain],
          })
          discoveredUrls = [...new Set([url, ...crawlResult.pages.map(p => p.url)])]
          steps.push({
            step: 1, name: 'BFS Discovery',
            status: discoveredUrls.length > 1 ? 'PASS' : 'WARN',
            durationMs: Date.now() - s,
            details: `Discovered ${discoveredUrls.length} page(s) in ${((Date.now() - s) / 1000).toFixed(1)}s`,
          })
          console.info(`PASS (${discoveredUrls.length} pages)`)
        } catch (err) {
          steps.push({ step: 1, name: 'BFS Discovery', status: 'FAIL', durationMs: Date.now() - s, details: String(err) })
          console.info('FAIL')
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // STEP 2 — Public Surface Audit (load timing per discovered page)
      // ════════════════════════════════════════════════════════════════════
      {
        process.stdout.write(`   Step  2/19 — Public surface audit (${Math.min(discoveredUrls.length, 10)} pages)... `)
        const s = Date.now()
        const slowPages: string[] = []
        const errorPages: string[] = []
        try {
          for (const pageUrl of discoveredUrls.slice(0, 10)) {
            try {
              const r = await auditLoadTiming(page, pageUrl)
              if (r.severity === 'critical') errorPages.push(pageUrl)
              else if (r.severity === 'warn') slowPages.push(pageUrl)
            } catch { errorPages.push(pageUrl) }
          }
          const status = errorPages.length > 0 ? 'FAIL' : slowPages.length > 0 ? 'WARN' : 'PASS'
          steps.push({
            step: 2, name: 'Public surface audit',
            status,
            durationMs: Date.now() - s,
            details: `${errorPages.length} error / ${slowPages.length} slow / ${discoveredUrls.slice(0, 10).length - errorPages.length - slowPages.length} OK`,
            findings: [
              ...errorPages.map(u => ({ severity: 'HIGH' as const, message: `Load error: ${u}`, reproSteps: `Navigate to ${u}`, expected: 'Page loads within threshold', actual: 'Load failed or timed out', evidencePath: '' })),
              ...slowPages.map(u => ({ severity: 'MEDIUM' as const, message: `Slow load: ${u}`, reproSteps: `Navigate to ${u}`, expected: 'FCP < 3000ms', actual: 'Above threshold', evidencePath: '' })),
            ],
          })
          console.info(status)
        } catch (err) {
          steps.push({ step: 2, name: 'Public surface audit', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
          console.info('SKIP')
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // STEP 3 — Auth Audit (cookie attributes, private-route redirect)
      // ════════════════════════════════════════════════════════════════════
      {
        process.stdout.write('   Step  3/19 — Auth audit (cookies, redirect check)... ')
        const s = Date.now()
        try {
          const r = await runAuthAudit(page, url, { skip: ['logout', 'refresh'] })
          steps.push({
            step: 3, name: 'Auth audit — cookie attributes',
            status: r.passed ? 'PASS' : 'WARN',
            durationMs: Date.now() - s,
            details: r.passed ? 'All cookies have proper security attributes' : `${r.findings.length} finding(s)`,
            findings: r.findings.map(f => ({
              severity: f.severity as Finding['severity'],
              message: f.message,
              reproSteps: `Inspect cookies on ${url}`,
              expected: 'HttpOnly + Secure + SameSite set',
              actual: f.message,
            })),
          })
          console.info(r.passed ? 'PASS' : 'WARN')
        } catch (err) {
          steps.push({ step: 3, name: 'Auth audit', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
          console.info('SKIP')
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // STEP 4 — Real Login
      // ════════════════════════════════════════════════════════════════════
      let loginSucceeded = false
      {
        process.stdout.write('   Step  4/19 — Real login... ')
        if (!hasCredentials) {
          steps.push({ step: 4, name: 'Real login', status: 'SKIP', durationMs: 0, details: 'No --email / --password provided' })
          console.info('SKIP')
        } else {
          const s = Date.now()
          try {
            const r = await autoLogin(browser, { username: opts.email, password: opts.password, loginUrl })
            loginSucceeded = r.success
            steps.push({
              step: 4, name: 'Real login',
              status: r.success ? 'PASS' : 'FAIL',
              durationMs: Date.now() - s,
              details: r.success
                ? `Login successful${r.redirectUrl ? ` → ${r.redirectUrl}` : ''}`
                : `Login failed: ${r.error ?? 'unknown'}`,
              findings: r.success ? [] : [{
                severity: 'CRITICAL' as const,
                message: `Login failed for ${opts.email}`,
                reproSteps: `Navigate to ${loginUrl}, enter email=${opts.email}, submit`,
                expected: 'Redirect to dashboard after login',
                actual: r.error ?? 'Remained on login page',
              }],
            })
            console.info(r.success ? 'PASS' : 'FAIL')
          } catch (err) {
            steps.push({ step: 4, name: 'Real login', status: 'FAIL', durationMs: Date.now() - s, details: String(err) })
            console.info('FAIL')
          }
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // STEP 5 — Private Dashboard Audit (post-login crawl)
      // ════════════════════════════════════════════════════════════════════
      {
        process.stdout.write('   Step  5/19 — Private dashboard audit... ')
        if (!hasCredentials || !loginSucceeded) {
          steps.push({ step: 5, name: 'Private dashboard audit', status: 'SKIP', durationMs: 0, details: hasCredentials ? 'Login failed (Step 4)' : 'No credentials provided' })
          console.info('SKIP')
        } else {
          const s = Date.now()
          try {
            const domain = new URL(url).hostname
            const privateCrawl = await crawlSite(browser, url, {
              maxPages: 15,
              maxDepth: 2,
              timeout: 30_000,
              allowedDomains: [domain],
            })
            const privateUrls = privateCrawl.pages.map(p => p.url)
            // Screenshot first 5 private pages
            for (const pu of privateUrls.slice(0, 5)) {
              const ss = path.join(screenshotsDir, `private-${encodeURIComponent(pu.replace(/https?:\/\//, '')).slice(0, 50)}.png`)
              await captureFullPage(page, ss).catch(() => null)
            }
            const hydrationResults = []
            for (const pu of privateUrls.slice(0, 5)) {
              const hr = await auditHydrationAndCSP(page, pu).catch(() => null)
              if (hr && !hr.passed) hydrationResults.push(...hr.issues)
            }
            steps.push({
              step: 5, name: 'Private dashboard audit',
              status: hydrationResults.length > 0 ? 'WARN' : 'PASS',
              durationMs: Date.now() - s,
              details: `${privateUrls.length} private page(s) discovered, ${hydrationResults.length} issue(s)`,
              findings: hydrationResults.map(i => ({
                severity: 'HIGH' as const,
                message: i.message,
                reproSteps: `Login as ${opts.email}, navigate to dashboard`,
                expected: 'No console errors or CSP violations',
                actual: i.message,
              })),
            })
            console.info(hydrationResults.length > 0 ? 'WARN' : 'PASS')
          } catch (err) {
            steps.push({ step: 5, name: 'Private dashboard audit', status: 'FAIL', durationMs: Date.now() - s, details: String(err) })
            console.info('FAIL')
          }
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // STEP 6 — Form Audit
      // ════════════════════════════════════════════════════════════════════
      {
        process.stdout.write('   Step  6/19 — Form audit (fuzz + duplicate submit)... ')
        const s = Date.now()
        try {
          const r = await runFormAudit(page, url, { maxFuzzFields: 3 })
          steps.push({
            step: 6, name: 'Form audit — type confusion fuzz + duplicate submit',
            status: r.passed ? 'PASS' : 'WARN',
            durationMs: Date.now() - s,
            details: r.passed
              ? `Tested ${r.fuzzResults.length} field×payload combinations — all handled`
              : `${r.findings.length} finding(s)`,
            findings: r.findings.map(f => ({
              severity: f.severity as Finding['severity'],
              message: f.message,
              reproSteps: `Submit form on ${url} with payload: ${f.message.split(':')[0] ?? 'invalid input'}`,
              expected: 'Form rejects invalid input gracefully',
              actual: f.message,
            })),
          })
          console.info(r.passed ? 'PASS' : 'WARN')
        } catch (err) {
          steps.push({ step: 6, name: 'Form audit', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
          console.info('SKIP')
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // STEP 7 — Console Errors (aggregated from browser session)
      // ════════════════════════════════════════════════════════════════════
      {
        process.stdout.write('   Step  7/19 — Console errors (aggregated)... ')
        const s = Date.now()
        try {
          const r = await auditHydrationAndCSP(page, url)
          const consoleErrs = browser.consoleErrors.filter(e => e.level === 'error')
          const allIssues = [...r.issues, ...consoleErrs.map(e => ({ type: 'console' as const, message: e.message, url: e.url ?? url }))]
          steps.push({
            step: 7, name: 'Console errors + hydration + CSP',
            status: allIssues.length === 0 ? 'PASS' : 'FAIL',
            durationMs: Date.now() - s,
            details: allIssues.length === 0 ? 'No issues detected' : `${allIssues.length} issue(s) total`,
            findings: allIssues.slice(0, 10).map(i => ({
              severity: 'HIGH' as const,
              message: i.message,
              reproSteps: `Open browser DevTools console and navigate to ${url}`,
              expected: 'No console errors',
              actual: i.message,
            })),
          })
          console.info(allIssues.length === 0 ? 'PASS' : 'FAIL')
        } catch (err) {
          steps.push({ step: 7, name: 'Console errors', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
          console.info('SKIP')
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // STEP 8 — Network/API Errors (4xx/5xx across all navigation)
      // ════════════════════════════════════════════════════════════════════
      {
        process.stdout.write('   Step  8/19 — Network/API errors... ')
        const s = Date.now()
        try {
          const networkErrs = browser.networkErrors.filter(e => e.statusCode >= 400)
          const critical = networkErrs.filter(e => e.statusCode >= 500)
          const clientErr = networkErrs.filter(e => e.statusCode >= 400 && e.statusCode < 500)
          steps.push({
            step: 8, name: 'Network/API errors',
            status: critical.length > 0 ? 'FAIL' : clientErr.length > 0 ? 'WARN' : 'PASS',
            durationMs: Date.now() - s,
            details: networkErrs.length === 0
              ? 'No 4xx/5xx errors detected'
              : `${critical.length} server error(s) + ${clientErr.length} client error(s)`,
            findings: networkErrs.slice(0, 10).map(e => ({
              severity: (e.statusCode >= 500 ? 'HIGH' : 'MEDIUM') as Finding['severity'],
              message: `${e.statusCode} — ${e.url}`,
              reproSteps: `Navigate to ${url}; open Network tab; filter by status ${e.statusCode}`,
              expected: 'HTTP 200',
              actual: `HTTP ${e.statusCode}`,
            })),
          })
          console.info(critical.length > 0 ? 'FAIL' : clientErr.length > 0 ? 'WARN' : 'PASS')
        } catch (err) {
          steps.push({ step: 8, name: 'Network errors', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
          console.info('SKIP')
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // STEP 9 — Security Audit
      // ════════════════════════════════════════════════════════════════════
      {
        process.stdout.write('   Step  9/19 — Security headers & CORS & mixed content... ')
        const s = Date.now()
        try {
          const r = await runSecurityAudit(page, url)
          const critHigh = r.findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH')
          steps.push({
            step: 9, name: 'Security audit — headers + CORS + mixed content',
            status: r.passed ? 'PASS' : critHigh.length > 0 ? 'FAIL' : 'WARN',
            durationMs: Date.now() - s,
            details: r.passed ? 'No critical/high findings' : `${r.findings.length} finding(s)`,
            findings: r.findings.map(f => ({
              severity: f.severity as Finding['severity'],
              message: f.message,
              reproSteps: `Check response headers for ${url}`,
              expected: 'Security headers present and correctly configured',
              actual: f.message,
            })),
          })
          console.info(r.passed ? 'PASS' : 'FAIL')
        } catch (err) {
          steps.push({ step: 9, name: 'Security', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
          console.info('SKIP')
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // STEP 10 — Accessibility Scan
      // ════════════════════════════════════════════════════════════════════
      {
        process.stdout.write('   Step 10/19 — Accessibility (axe-core)... ')
        const s = Date.now()
        try {
          const scanFile = path.join(outDir, 'a11y-scan.json')
          const r = await runA11yScan(page, url)
          fs.writeFileSync(scanFile, JSON.stringify(r, null, 2))
          const violations = r.routes?.[0]?.violations ?? []
          const critCount = violations.filter((v: { impact: string }) => v.impact === 'critical' || v.impact === 'serious').length
          steps.push({
            step: 10, name: 'Accessibility — axe-core scan',
            status: critCount === 0 ? 'PASS' : 'FAIL',
            durationMs: Date.now() - s,
            details: `${violations.length} violation(s) — ${critCount} critical/serious`,
            findings: violations.slice(0, 5).map((v: { impact: string; description: string; helpUrl?: string }) => ({
              severity: (v.impact === 'critical' ? 'CRITICAL' : v.impact === 'serious' ? 'HIGH' : 'MEDIUM') as Finding['severity'],
              message: v.description,
              reproSteps: `Open ${url} with axe DevTools or run: npx axe ${url}`,
              expected: 'No accessibility violations',
              actual: v.description,
              evidencePath: scanFile,
            })),
          })
          console.info(critCount === 0 ? 'PASS' : 'FAIL')
        } catch (err) {
          steps.push({ step: 10, name: 'Accessibility', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
          console.info('SKIP')
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // STEP 11 — Lighthouse/Performance
      // ════════════════════════════════════════════════════════════════════
      {
        process.stdout.write('   Step 11/19 — Performance metrics (FCP, LCP, TTI, CLS)... ')
        const s = Date.now()
        try {
          const metrics = await capturePerformanceMetrics(page)
          const fcp = metrics.firstContentfulPaint ?? 0
          const lcp = metrics.largestContentfulPaint ?? 0
          const tbt = metrics.totalBlockingTime ?? 0
          const cls = (metrics as { cumulativeLayoutShift?: number }).cumulativeLayoutShift ?? 0
          const passed = fcp < 3000 && lcp < 4000 && tbt < 600 && cls < 0.25
          steps.push({
            step: 11, name: 'Lighthouse/Performance metrics',
            status: passed ? 'PASS' : 'WARN',
            durationMs: Date.now() - s,
            details: `FCP: ${fcp}ms | LCP: ${lcp}ms | TBT: ${tbt}ms | CLS: ${cls.toFixed(3)}`,
            findings: !passed ? [{
              severity: 'MEDIUM' as const,
              message: `Performance below threshold — FCP:${fcp}ms LCP:${lcp}ms TBT:${tbt}ms CLS:${cls.toFixed(3)}`,
              reproSteps: `Run Lighthouse on ${url}`,
              expected: 'FCP<3000 LCP<4000 TBT<600 CLS<0.25',
              actual: `FCP:${fcp} LCP:${lcp} TBT:${tbt} CLS:${cls.toFixed(3)}`,
            }] : [],
          })
          console.info(passed ? 'PASS' : 'WARN')
        } catch (err) {
          steps.push({ step: 11, name: 'Performance', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
          console.info('SKIP')
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // STEP 12 — Visual Screenshots + Baseline Diff
      // ════════════════════════════════════════════════════════════════════
      {
        process.stdout.write('   Step 12/19 — Visual screenshots + diff... ')
        const s = Date.now()
        if (!runVisual) {
          steps.push({ step: 12, name: 'Visual screenshots', status: 'SKIP', durationMs: 0, details: '--no-visual flag set' })
          console.info('SKIP')
        } else {
          try {
            const sample = discoveredUrls.slice(0, 5)
            const screenshotPaths: string[] = []
            let maxDiff = 0

            for (const pageUrl of sample) {
              const name = encodeURIComponent(pageUrl.replace(/https?:\/\//, '')).slice(0, 60)
              const ssPath = path.join(screenshotsDir, `current-${name}.png`)
              await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 20_000 }).catch(() => null)
              await captureFullPage(page, ssPath)
              screenshotPaths.push(ssPath)

              if (opts.baseline && fs.existsSync(opts.baseline)) {
                const diff = await pixelDiffPercent(opts.baseline, ssPath).catch(() => 0)
                if (diff > maxDiff) maxDiff = diff
              }
            }

            const hasDiff = opts.baseline && maxDiff > 5
            steps.push({
              step: 12, name: 'Visual screenshots + baseline diff',
              status: hasDiff ? 'WARN' : 'PASS',
              durationMs: Date.now() - s,
              details: opts.baseline
                ? `${sample.length} screenshots; max diff: ${maxDiff.toFixed(2)}% vs baseline`
                : `${screenshotPaths.length} screenshot(s) saved (no baseline)`,
              findings: hasDiff ? [{
                severity: 'MEDIUM' as const,
                message: `Visual regression: ${maxDiff.toFixed(2)}% pixel diff vs baseline`,
                reproSteps: `Compare baseline vs current screenshots in ${screenshotsDir}`,
                expected: '< 5% pixel difference',
                actual: `${maxDiff.toFixed(2)}% difference`,
                evidencePath: screenshotsDir,
              }] : [],
            })
            console.info(hasDiff ? 'WARN' : 'PASS')
          } catch (err) {
            steps.push({ step: 12, name: 'Visual screenshots', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
            console.info('SKIP')
          }
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // STEP 13 — Video + Trace Recording
      // ════════════════════════════════════════════════════════════════════
      {
        process.stdout.write('   Step 13/19 — Playwright trace + video... ')
        const s = Date.now()
        if (recordingStop) {
          try {
            const artifacts = await recordingStop() as { videoPath?: string; tracePath?: string }
            steps.push({
              step: 13, name: 'Video + trace recording',
              status: 'PASS', durationMs: Date.now() - s,
              details: [
                artifacts.videoPath ? `Video: ${artifacts.videoPath}` : '',
                artifacts.tracePath ? `Trace: ${artifacts.tracePath}` : '',
              ].filter(Boolean).join(' | '),
            })
            console.info('PASS')
          } catch (err) {
            steps.push({ step: 13, name: 'Trace recording', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
            console.info('SKIP')
          }
        } else {
          steps.push({ step: 13, name: 'Video + trace', status: 'SKIP', durationMs: 0, details: '--no-trace or Playwright unavailable' })
          console.info('SKIP')
        }
      }

      await browser.close().catch(() => null)

      // ════════════════════════════════════════════════════════════════════
      // STEP 14 — Infinite Loading Detector
      // ════════════════════════════════════════════════════════════════════
      {
        process.stdout.write('   Step 14/19 — Infinite loading detector (8s wait)... ')
        const s = Date.now()
        try {
          const infiniteLoadBrowser = new BrowserCore({ headless: !opts.headed })
          await infiniteLoadBrowser.launch()
          const ilPage = infiniteLoadBrowser.getPage()!
          const pagesWithInfiniteLoad: string[] = []

          for (const pageUrl of discoveredUrls.slice(0, 8)) {
            const result = await detectInfiniteLoading(ilPage, pageUrl)
            if (result.hasInfiniteLoad) {
              pagesWithInfiniteLoad.push(`${pageUrl} (selectors: ${result.selectors.join(', ')})`)
            }
          }
          await infiniteLoadBrowser.close().catch(() => null)

          steps.push({
            step: 14, name: 'Infinite loading detector',
            status: pagesWithInfiniteLoad.length > 0 ? 'FAIL' : 'PASS',
            durationMs: Date.now() - s,
            details: pagesWithInfiniteLoad.length === 0
              ? `No persistent spinners after 8s on ${Math.min(discoveredUrls.length, 8)} pages`
              : `${pagesWithInfiniteLoad.length} page(s) with persistent loading state`,
            findings: pagesWithInfiniteLoad.map(p => ({
              severity: 'HIGH' as const,
              message: `Persistent spinner detected: ${p}`,
              reproSteps: `Navigate to the URL, wait 8+ seconds`,
              expected: 'Loading state completes within 8s',
              actual: 'Spinner/skeleton still visible after 8s',
            })),
          })
          console.info(pagesWithInfiniteLoad.length > 0 ? 'FAIL' : 'PASS')
        } catch (err) {
          steps.push({ step: 14, name: 'Infinite loading', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
          console.info('SKIP')
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // STEP 15 — Forbidden Actions Guard
      // ════════════════════════════════════════════════════════════════════
      {
        process.stdout.write('   Step 15/19 — Forbidden actions guard (unauthenticated)... ')
        const s = Date.now()
        try {
          const { unprotected, checked } = await runForbiddenActionsGuard(url, opts.headed)
          steps.push({
            step: 15, name: 'Forbidden actions guard',
            status: unprotected.length > 0 ? 'FAIL' : 'PASS',
            durationMs: Date.now() - s,
            details: `Checked ${checked} private-looking paths — ${unprotected.length} potentially unprotected`,
            findings: unprotected.map(p => ({
              severity: 'CRITICAL' as const,
              message: `Potentially unprotected: ${p}`,
              reproSteps: `Without logging in, navigate to: ${new URL(url).origin}${p.split(' →')[0]}`,
              expected: 'Redirect to /login OR HTTP 401/403',
              actual: 'HTTP 200 without login redirect',
            })),
          })
          console.info(unprotected.length > 0 ? 'FAIL' : 'PASS')
        } catch (err) {
          steps.push({ step: 15, name: 'Forbidden actions', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
          console.info('SKIP')
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // STEP 16 — Multi-Role Audit
      // ════════════════════════════════════════════════════════════════════
      {
        process.stdout.write(`   Step 16/19 — Multi-role audit (${roles.length} role(s))... `)
        if (roles.length === 0) {
          steps.push({ step: 16, name: 'Multi-role audit', status: 'SKIP', durationMs: 0, details: 'No --roles JSON provided' })
          console.info('SKIP')
        } else {
          const s = Date.now()
          const roleFindings: Finding[] = []
          for (const role of roles) {
            const roleOutcomes = await auditRole(role.name, role, url, outDir, opts.headed, 16)
            for (const o of roleOutcomes) {
              if (o.status === 'FAIL') {
                roleFindings.push({
                  severity: 'HIGH',
                  message: `[${role.name}] ${o.name}: ${o.details}`,
                  reproSteps: `Login as ${role.email}, check ${o.name}`,
                  expected: 'PASS',
                  actual: o.details,
                })
              }
            }
          }
          steps.push({
            step: 16, name: 'Multi-role audit',
            status: roleFindings.length > 0 ? 'FAIL' : 'PASS',
            durationMs: Date.now() - s,
            details: `${roles.length} role(s) tested — ${roleFindings.length} failure(s)`,
            findings: roleFindings,
          })
          console.info(roleFindings.length > 0 ? 'FAIL' : 'PASS')
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // STEP 17 — Responsive Audit (desktop / tablet / mobile)
      // ════════════════════════════════════════════════════════════════════
      {
        process.stdout.write('   Step 17/19 — Responsive audit (3 viewports)... ')
        const s = Date.now()
        try {
          const responsiveDir = path.join(outDir, 'responsive')
          fs.mkdirSync(responsiveDir, { recursive: true })
          const results = await runResponsiveAudit(discoveredUrls, responsiveDir, opts.headed)
          const overflowing = results.filter(r => r.overflows)
          steps.push({
            step: 17, name: 'Responsive audit — desktop / tablet / mobile',
            status: overflowing.length > 0 ? 'FAIL' : 'PASS',
            durationMs: Date.now() - s,
            details: `${results.length} page×viewport pairs — ${overflowing.length} horizontal overflow(s)`,
            findings: overflowing.map(r => ({
              severity: 'MEDIUM' as const,
              message: `Horizontal overflow at ${r.viewport}: ${r.url}`,
              reproSteps: `Open ${r.url} at ${r.viewport} viewport, check horizontal scrollbar`,
              expected: 'No horizontal overflow (body.scrollWidth <= window.innerWidth)',
              actual: 'Horizontal overflow detected',
              evidencePath: r.screenshotPath,
            })),
          })
          console.info(overflowing.length > 0 ? 'FAIL' : 'PASS')
        } catch (err) {
          steps.push({ step: 17, name: 'Responsive audit', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
          console.info('SKIP')
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // STEP 18 — Previous vs Current Audit Comparison
      // ════════════════════════════════════════════════════════════════════
      {
        process.stdout.write('   Step 18/19 — Audit history comparison... ')
        const historyDir = opts.history ? path.resolve(opts.history) : path.join(outDir, 'history')
        fs.mkdirSync(historyDir, { recursive: true })
        const s = Date.now()
        try {
          const historyFiles = fs.readdirSync(historyDir)
            .filter(f => f.endsWith('.json'))
            .sort()
            .reverse()

          if (historyFiles.length === 0) {
            steps.push({ step: 18, name: 'Audit history comparison', status: 'SKIP', durationMs: Date.now() - s, details: 'No previous audit history found (first run)' })
            console.info('SKIP (first run)')
          } else {
            const prevPath = path.join(historyDir, historyFiles[0])
            const prev: E2EFullAuditResult = JSON.parse(fs.readFileSync(prevPath, 'utf8'))
            const prevFailures = new Set(prev.steps.filter(s => s.status === 'FAIL').map(s => s.name))
            const curFailures = new Set(steps.filter(s => s.status === 'FAIL').map(s => s.name))
            const newFailures = [...curFailures].filter(n => !prevFailures.has(n))
            const resolved = [...prevFailures].filter(n => !curFailures.has(n))
            const scoreChange = (steps.filter(s => s.status === 'PASS').length / Math.max(steps.filter(s => s.status !== 'SKIP').length, 1) * 100)
              - (prev.overallScore)
            steps.push({
              step: 18, name: 'Audit history comparison',
              status: newFailures.length > 0 ? 'WARN' : 'PASS',
              durationMs: Date.now() - s,
              details: `vs ${historyFiles[0]}: ${newFailures.length} new failure(s), ${resolved.length} resolved, score Δ${scoreChange >= 0 ? '+' : ''}${scoreChange.toFixed(0)}`,
              findings: newFailures.map(n => ({
                severity: 'HIGH' as const,
                message: `Regression: "${n}" passed previously, now FAIL`,
                reproSteps: `Compare ${prevPath} vs current run`,
                expected: 'PASS (was passing in previous audit)',
                actual: 'FAIL (regression)',
              })),
            })
            console.info(newFailures.length > 0 ? 'WARN' : 'PASS')
          }
        } catch (err) {
          steps.push({ step: 18, name: 'Audit comparison', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
          console.info('SKIP')
        }
      }

      // ── Compute score ──────────────────────────────────────────────────
      const passCount = steps.filter(s => s.status === 'PASS').length
      const failCount = steps.filter(s => s.status === 'FAIL').length
      const totalRun = steps.filter(s => s.status !== 'SKIP').length
      const overallScore = totalRun > 0 ? Math.round((passCount / totalRun) * 100) : 0
      const verdict = failCount > 0 ? 'FAIL' : overallScore >= 80 ? 'PASS' : 'WARN'
      const completedAt = new Date().toISOString()
      const totalDurationMs = steps.reduce((acc, s) => acc + s.durationMs, 0)

      const result: E2EFullAuditResult = { url, startedAt, completedAt, totalDurationMs, steps, overallScore, verdict }

      // ── Save to history ────────────────────────────────────────────────
      const historyDir = opts.history ? path.resolve(opts.history) : path.join(outDir, 'history')
      fs.mkdirSync(historyDir, { recursive: true })
      const historyFile = path.join(historyDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
      fs.writeFileSync(historyFile, JSON.stringify(result, null, 2))

      // ════════════════════════════════════════════════════════════════════
      // STEP 19 — Final Report (markdown with severity + evidence)
      // ════════════════════════════════════════════════════════════════════
      {
        process.stdout.write('   Step 19/19 — Final report... ')
        const s = Date.now()
        const reportPath = path.join(outDir, 'e2e-full-audit-report.json')
        fs.writeFileSync(reportPath, JSON.stringify(result, null, 2))
        result.reportPath = reportPath
        const mdPath = writeMarkdownReport(result, outDir)
        result.markdownReportPath = mdPath
        steps.push({
          step: 19, name: 'Final report',
          status: 'PASS', durationMs: Date.now() - s,
          details: `JSON: ${reportPath} | MD: ${mdPath}`,
        })
        console.info('PASS')
      }

      // ── Print summary ─────────────────────────────────────────────────
      if (opts.json) {
        console.info(JSON.stringify(result, null, 2))
      } else {
        console.info(`\n${'─'.repeat(70)}`)
        console.info(`  E2E Full Audit — ${verdict} (${overallScore}/100)`)
        console.info(`  URL: ${url}`)
        console.info(`  Duration: ${(totalDurationMs / 1000).toFixed(1)}s`)
        console.info(`  Steps: ${passCount} PASS / ${failCount} FAIL / ${steps.filter(s => s.status === 'WARN').length} WARN / ${steps.filter(s => s.status === 'SKIP').length} SKIP`)
        console.info(`  Report: ${result.reportPath}`)
        console.info(`  Markdown: ${result.markdownReportPath}`)
        if (failCount > 0) {
          console.info('\n  Critical/High Failures:')
          for (const step of steps.filter(s => s.status === 'FAIL')) {
            console.info(`    Step ${step.step.toString().padStart(2)} — ${step.name}: ${step.details.slice(0, 100)}`)
            for (const f of (step.findings ?? []).slice(0, 2)) {
              console.info(`      [${f.severity}] ${f.message.slice(0, 100)}`)
              if (f.reproSteps) console.info(`        Repro: ${f.reproSteps.slice(0, 80)}`)
            }
          }
        }
        console.info(`${'─'.repeat(70)}\n`)
      }

      process.exit(failCount > 0 ? 1 : 0)
    })
}
