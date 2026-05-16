/**
 * `tester journey-audit` — User-Journey audit with real browser.
 *
 * Runs a Puppeteer-driven walk through every nav link of a web app using
 * real login. Catches UX regressions (hidden pages, gated content, empty
 * bodies, dead links) that code-level or API-shape audits miss.
 *
 * Config resolution (first match wins):
 *   1. --config <path>            — explicit file
 *   2. ./.journey-audit.json      — project-local (decentralized, preferred)
 *   3. packaged configs/<name>.json — central registry shipped with Tester
 *
 * Usage:
 *   # In a project directory with .journey-audit.json:
 *   npx @aledan007/tester journey-audit \
 *     --email $MY_EMAIL --password $MY_PW
 *
 *   # Explicit project name → reads packaged config:
 *   npx @aledan007/tester journey-audit --project tradeinvest \
 *     --email $MY_EMAIL --password $MY_PW
 *
 *   # Explicit config path:
 *   npx @aledan007/tester journey-audit --config ./path/to/cfg.json \
 *     --email ... --password ...
 */

import * as fs from 'fs'
import * as path from 'path'
import puppeteer, { type Page } from 'puppeteer'
import {
  classifyPage,
  type JourneyClassifierConfig,
  type NavLink,
  type PerPageOverride,
} from './journey-audit-classifier.js'

interface JourneyConfig extends JourneyClassifierConfig {
  name: string
  baseUrl: string
  login?: {
    path: string
    emailSelector: string
    passwordSelector: string
    submitSelector: string
    successUrlPattern: string
    // API-direct login: POST credentials via fetch from page context (same-origin).
    // Browser stores Set-Cookie automatically — bypasses React hydration race.
    apiPath?: string          // e.g. "/api/auth/login"
    apiEmailField?: string    // POST body field name for email (default: "email")
    apiPasswordField?: string // POST body field name for password (default: "password")
    apiUseCsrf?: boolean      // GET /api/auth/csrf first and include csrfToken (NextAuth)
  }
  credentials?: {
    emailEnv: string
    passwordEnv: string
  }
  navLinks: NavLink[]
  onboardingMarkers?: string
  emptyStateMarkers?: string
  errorMarkers?: string
  viewport?: { width: number; height: number }
  pageTimeout?: number
  settleDelay?: number
}

// Re-export config knob types so consumers' tooling can type
// `.journey-audit.json` without reaching into internals.
export type { JourneyClassifierConfig, NavLink, PerPageOverride }

const DEFAULT_VIEWPORT = { width: 1280, height: 800 } as const

export interface JourneyAuditOptions {
  project?: string
  config?: string
  email?: string
  password?: string
  headed?: boolean
  outputDir?: string
}

function readConfigFile(p: string): JourneyConfig {
  const raw = fs.readFileSync(p, 'utf-8')
  const cfg = JSON.parse(raw) as JourneyConfig
  if (!cfg.name || !cfg.baseUrl || !cfg.navLinks) {
    throw new Error(`Config at ${p} is missing required fields (name, baseUrl, navLinks)`)
  }
  // viewport is optional; warn (not throw) if missing so legacy configs keep working.
  if (!cfg.viewport || typeof cfg.viewport.width !== 'number' || typeof cfg.viewport.height !== 'number') {
    console.warn(
      `[journey-audit] config "${cfg.name}" missing or invalid viewport — falling back to ${DEFAULT_VIEWPORT.width}x${DEFAULT_VIEWPORT.height}`
    )
  }
  return cfg
}

function resolveConfig(opts: JourneyAuditOptions): { cfg: JourneyConfig; source: string } {
  if (opts.config) {
    const abs = path.resolve(opts.config)
    if (!fs.existsSync(abs)) throw new Error(`Config file not found: ${abs}`)
    return { cfg: readConfigFile(abs), source: abs }
  }

  const localPath = path.resolve(process.cwd(), '.journey-audit.json')
  if (fs.existsSync(localPath)) {
    return { cfg: readConfigFile(localPath), source: localPath }
  }

  if (opts.project) {
    const candidates = [
      path.resolve(__dirname, '..', '..', '..', 'journey-audit', 'configs', `${opts.project}.json`),
      path.resolve(__dirname, '..', '..', 'journey-audit', 'configs', `${opts.project}.json`),
      path.resolve(process.cwd(), 'journey-audit', 'configs', `${opts.project}.json`),
    ]
    for (const c of candidates) {
      if (fs.existsSync(c)) return { cfg: readConfigFile(c), source: c }
    }
    throw new Error(
      `No config found for project "${opts.project}". Looked in:\n  ${candidates.join('\n  ')}\nCreate one or pass --config <path>.`
    )
  }

  throw new Error(
    'No config source resolved. Provide one of:\n' +
      '  --config <path>\n' +
      '  ./.journey-audit.json in cwd\n' +
      '  --project <name> (reads packaged config)'
  )
}

/**
 * Count DOM matches of a regex by evaluating in page context.
 * Puppeteer has no native `locator('text=/regex/i')`, so we roll our own.
 */
async function countRegexMatchesInBody(page: Page, regexSource: string): Promise<number> {
  return page.evaluate((src: string) => {
    try {
      const text = (document.body && (document.body as HTMLElement).innerText) || ''
      const matches = text.match(new RegExp(src, 'gi'))
      return matches ? matches.length : 0
    } catch {
      return 0
    }
  }, regexSource)
}

/**
 * Perform login using either API-direct (preferred, bypasses React hydration race)
 * or UI path with requestSubmit() + click() fallback.
 *
 * Exported for unit testing with stubbed page objects.
 */
export async function performLogin(
  page: Page,
  login: NonNullable<JourneyConfig['login']>,
  baseUrl: string,
  email: string,
  password: string,
): Promise<void> {
  if (login.apiPath) {
    // API-direct: call fetch() from the already-loaded page (same-origin).
    // The browser stores the Set-Cookie response automatically — no manual
    // cookie parsing needed. Works for any custom JWT auth endpoint.
    const emailField = login.apiEmailField ?? 'email'
    const passwordField = login.apiPasswordField ?? 'password'

    let csrfToken: string | undefined
    if (login.apiUseCsrf) {
      csrfToken = await page.evaluate(async (csrfUrl: string) => {
        const r = await fetch(csrfUrl)
        const data = (await r.json()) as { csrfToken?: string }
        return data.csrfToken
      }, baseUrl + '/api/auth/csrf')
    }

    const ok = await page.evaluate(
      async (
        apiPath: string,
        ef: string,
        pf: string,
        em: string,
        pw: string,
        csrf: string | undefined,
      ) => {
        const body: Record<string, string> = { [ef]: em, [pf]: pw }
        if (csrf) body.csrfToken = csrf
        const r = await fetch(apiPath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          credentials: 'include',
        })
        return r.ok
      },
      login.apiPath,
      emailField,
      passwordField,
      email,
      password,
      csrfToken,
    )

    if (!ok) {
      throw new Error(
        `API-direct login failed (POST ${login.apiPath} returned non-2xx). ` +
          `Verify apiPath, apiEmailField, apiPasswordField in config.`,
      )
    }

    // Navigate to root to trigger client-side session pickup after API login.
    await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded' })
  } else {
    // UI path: fill form fields, then use requestSubmit() which dispatches the
    // submit event through React's synthetic event system.
    // Unlike click(), requestSubmit() fires AFTER hydration completes and prevents
    // the native GET fallback that exposes credentials in the URL.
    await page.waitForSelector(login.emailSelector, { timeout: 10_000 })

    const fillInput = async (selector: string, value: string) => {
      await page.click(selector, { clickCount: 3 })
      await page.keyboard.press('Backspace')
      await page.type(selector, value, { delay: 10 })
    }
    await fillInput(login.emailSelector, email)
    await fillInput(login.passwordSelector, password)

    const loginStartUrl = page.url()

    const formFound = await page.evaluate(() => {
      const form = document.querySelector('form')
      if (form) {
        form.requestSubmit()
        return true
      }
      return false
    })

    if (!formFound) {
      // No <form> element — direct click as last resort
      await Promise.all([
        page.waitForNavigation({ timeout: 15_000 }).catch(() => {}),
        page.click(login.submitSelector),
      ])
    } else {
      await Promise.race([
        page.waitForNavigation({ timeout: 12_000 }).catch(() => {}),
        new Promise((r) => setTimeout(r, 3_000)),
      ])
    }

    // Enter key fallback if still on login page after requestSubmit/click
    if (page.url() === loginStartUrl) {
      await page.focus(login.passwordSelector)
      await page.keyboard.press('Enter')
      await page.waitForNavigation({ timeout: 8_000 }).catch(() => {})
    }
  }

  // Verify redirect matches the configured success pattern
  await page
    .waitForFunction(
      (src: string) => new RegExp(src).test(window.location.href),
      { timeout: 10_000 },
      login.successUrlPattern,
    )
    .catch(() => {
      throw new Error(
        `Login did not redirect to a URL matching ${login.successUrlPattern}. ` +
          `Current URL: ${page.url()}`,
      )
    })
}

export async function journeyAuditCommand(opts: JourneyAuditOptions): Promise<void> {
  const { cfg, source } = resolveConfig(opts)
  const bar = '═'.repeat(63)
  console.log(`\n${bar}`)
  console.log(`  JOURNEY AUDIT — ${cfg.name} (${cfg.baseUrl})`)
  console.log(`  config: ${source}`)
  console.log(`${bar}\n`)

  const needsAuth = !!cfg.login
  // cfg.credentials is optional in the interface — read defensively, fall back to
  // CLI flags only. Avoids `cfg.credentials!.emailEnv` non-null-assertion crash
  // when a config sets `login` but omits `credentials` (caller passes --email/--password).
  const credEmailEnv = cfg.credentials?.emailEnv ?? ''
  const credPasswordEnv = cfg.credentials?.passwordEnv ?? ''
  const email = needsAuth ? (opts.email || (credEmailEnv ? process.env[credEmailEnv] : '') || '') : ''
  const password = needsAuth ? (opts.password || (credPasswordEnv ? process.env[credPasswordEnv] : '') || '') : ''
  if (needsAuth && (!email || !password)) {
    const envHint = credEmailEnv && credPasswordEnv
      ? ` or set env vars ${credEmailEnv} and ${credPasswordEnv}`
      : ''
    throw new Error(`Missing credentials. Provide --email/--password${envHint}`)
  }

  const outputDir = path.resolve(
    opts.outputDir || path.join(process.cwd(), 'journey-audit-results'),
    cfg.name.toLowerCase().replace(/\s+/g, '-')
  )
  const screenshotsDir = path.join(outputDir, 'screenshots')
  fs.mkdirSync(screenshotsDir, { recursive: true })

  const viewport = cfg.viewport ?? DEFAULT_VIEWPORT
  const browser = await puppeteer.launch({
    headless: opts.headed !== true,
    defaultViewport: { width: viewport.width, height: viewport.height },
  })
  const page = await browser.newPage()

  try {
    if (cfg.login) {
      await page.goto(cfg.baseUrl + cfg.login.path, { waitUntil: 'domcontentloaded' })
      await performLogin(page, cfg.login, cfg.baseUrl, email, password)
    }

    const findings: Array<{
      page: string
      href: string
      status: string
      httpStatus: number
      h1: string
      notes: string[]
      screenshot: string
    }> = []

    for (const link of cfg.navLinks) {
      let notes: string[] = []
      let status = 'OK'
      let httpStatus = 0
      let h1 = ''
      const safeName = link.href.replace(/\//g, '_').replace(/^_/, '') || 'root'
      const screenshot = path.join(screenshotsDir, `${safeName}.png`)

      try {
        const res = await page.goto(cfg.baseUrl + link.href, {
          waitUntil: 'domcontentloaded',
          timeout: cfg.pageTimeout || 20_000,
        })
        await new Promise((r) => setTimeout(r, cfg.settleDelay || 2_000))
        httpStatus = res?.status() || 0

        h1 = (
          await page.evaluate(() => document.querySelector('h1')?.textContent || '')
        )
          .trim()
          .slice(0, 60)

        const tableCount = await page.evaluate(() => document.querySelectorAll('table').length)
        const buttonCount = await page.evaluate(() => document.querySelectorAll('button').length)

        const bodyLen = await page.evaluate(
          () => ((document.body && (document.body as HTMLElement).innerText) || '').trim().length
        )

        const emptyCount = cfg.emptyStateMarkers
          ? await countRegexMatchesInBody(page, cfg.emptyStateMarkers)
          : 0
        const errorCount = cfg.errorMarkers
          ? await countRegexMatchesInBody(page, cfg.errorMarkers)
          : 0
        const gatedCount = cfg.onboardingMarkers
          ? await countRegexMatchesInBody(page, cfg.onboardingMarkers)
          : 0
        const validContentCount = cfg.validContentMarkers
          ? await countRegexMatchesInBody(page, cfg.validContentMarkers)
          : 0

        const result = classifyPage({
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
        })
        status = result.status
        notes = result.notes

        await page.screenshot({ path: screenshot, fullPage: true })
      } catch (err) {
        status = 'CRASHED'
        notes.push(`error: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`)
        try {
          await page.screenshot({ path: screenshot, fullPage: false })
        } catch {
          // ignore
        }
      }

      findings.push({
        page: link.name,
        href: link.href,
        status,
        httpStatus,
        h1,
        notes,
        screenshot,
      })

      console.log(
        `[${status.padEnd(14)}] ${link.name.padEnd(28)} ${link.href}${h1 ? ` — h1="${h1}"` : ''}`
      )
      for (const n of notes) console.log(`    └─ ${n}`)
    }

    console.log(`\n${bar}`)
    console.log(`  SUMMARY`)
    console.log(`${bar}\n`)
    const byStatus: Record<string, number> = {}
    for (const f of findings) byStatus[f.status] = (byStatus[f.status] || 0) + 1
    for (const [s, n] of Object.entries(byStatus)) {
      console.log(`  ${s.padEnd(14)} ${n} page(s)`)
    }

    const reportPath = path.join(outputDir, 'report.json')
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          project: cfg.name,
          baseUrl: cfg.baseUrl,
          configSource: source,
          timestamp: new Date().toISOString(),
          totals: byStatus,
          findings,
        },
        null,
        2
      )
    )
    console.log(`\n  JSON report: ${reportPath}`)
    console.log(`  Screenshots: ${screenshotsDir}/\n`)
  } finally {
    await browser.close()
  }
}

export async function journeyAuditCliAction(opts: Record<string, unknown>): Promise<void> {
  const typed: JourneyAuditOptions = {
    project: typeof opts.project === 'string' ? opts.project : undefined,
    config: typeof opts.config === 'string' ? opts.config : undefined,
    email: typeof opts.email === 'string' ? opts.email : undefined,
    password: typeof opts.password === 'string' ? opts.password : undefined,
    headed: Boolean(opts.headed),
    outputDir: typeof opts.output === 'string' ? opts.output : undefined,
  }
  try {
    await journeyAuditCommand(typed)
    process.exit(0)
  } catch (err) {
    console.error(
      `\n[journey-audit] FAILED: ${err instanceof Error ? err.message : String(err)}`
    )
    process.exit(1)
  }
}
