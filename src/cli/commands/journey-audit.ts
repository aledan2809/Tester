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
 *   npx @aledan/tester journey-audit \
 *     --email $MY_EMAIL --password $MY_PW
 *
 *   # Explicit project name → reads packaged config:
 *   npx @aledan/tester journey-audit --project tradeinvest \
 *     --email $MY_EMAIL --password $MY_PW
 *
 *   # Explicit config path:
 *   npx @aledan/tester journey-audit --config ./path/to/cfg.json \
 *     --email ... --password ...
 */

import * as fs from 'fs'
import * as path from 'path'
import puppeteer, { type Page } from 'puppeteer'

interface NavLink {
  name: string
  href: string
}

interface JourneyConfig {
  name: string
  baseUrl: string
  login: {
    path: string
    emailSelector: string
    passwordSelector: string
    submitSelector: string
    successUrlPattern: string
  }
  credentials: {
    emailEnv: string
    passwordEnv: string
  }
  navLinks: NavLink[]
  onboardingMarkers?: string
  emptyStateMarkers?: string
  errorMarkers?: string
  viewport: { width: number; height: number }
  pageTimeout?: number
  settleDelay?: number
}

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
  if (!cfg.name || !cfg.baseUrl || !cfg.navLinks || !cfg.login) {
    throw new Error(`Config at ${p} is missing required fields (name, baseUrl, navLinks, login)`)
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

export async function journeyAuditCommand(opts: JourneyAuditOptions): Promise<void> {
  const { cfg, source } = resolveConfig(opts)
  const bar = '═'.repeat(63)
  console.log(`\n${bar}`)
  console.log(`  JOURNEY AUDIT — ${cfg.name} (${cfg.baseUrl})`)
  console.log(`  config: ${source}`)
  console.log(`${bar}\n`)

  const email = opts.email || process.env[cfg.credentials.emailEnv]
  const password = opts.password || process.env[cfg.credentials.passwordEnv]
  if (!email || !password) {
    throw new Error(
      `Missing credentials. Provide --email/--password or set env vars ${cfg.credentials.emailEnv} and ${cfg.credentials.passwordEnv}`
    )
  }

  const outputDir = path.resolve(
    opts.outputDir || path.join(process.cwd(), 'journey-audit-results'),
    cfg.name.toLowerCase().replace(/\s+/g, '-')
  )
  const screenshotsDir = path.join(outputDir, 'screenshots')
  fs.mkdirSync(screenshotsDir, { recursive: true })

  const browser = await puppeteer.launch({
    headless: opts.headed !== true,
    defaultViewport: { width: cfg.viewport.width, height: cfg.viewport.height },
  })
  const page = await browser.newPage()

  try {
    await page.goto(cfg.baseUrl + cfg.login.path, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector(cfg.login.emailSelector, { timeout: 10_000 })

    // React-friendly fill: focus first, clear existing value, then type.
    // Puppeteer's page.type alone can miss React's synthetic events; clicking
    // focuses the input and triggering native input events ensures React
    // state syncs.
    const fillInput = async (selector: string, value: string) => {
      await page.click(selector, { clickCount: 3 }) // triple-click to select all
      await page.keyboard.press('Backspace') // clear
      await page.type(selector, value, { delay: 10 })
    }
    await fillInput(cfg.login.emailSelector, email)
    await fillInput(cfg.login.passwordSelector, password)

    // Some apps submit via Enter, others only via button click. Do the click
    // then fall back to Enter if URL hasn't changed after 2s.
    const loginStartUrl = page.url()
    await Promise.all([
      page.waitForNavigation({ timeout: 15_000 }).catch(() => {
        // client-side redirect or SPA transition — fall through to URL check
      }),
      page.click(cfg.login.submitSelector),
    ])

    // If still on the login page after the click, try submitting with Enter
    if (page.url() === loginStartUrl) {
      await page.focus(cfg.login.passwordSelector)
      await page.keyboard.press('Enter')
      await page
        .waitForNavigation({ timeout: 8_000 })
        .catch(() => {
          // fall through; the next assertion reports clear diagnostic
        })
    }

    // Confirm login redirect matches the configured pattern
    await page
      .waitForFunction(
        (src: string) => new RegExp(src).test(window.location.href),
        { timeout: 10_000 },
        cfg.login.successUrlPattern
      )
      .catch(() => {
        throw new Error(
          `Login did not redirect to a URL matching ${cfg.login.successUrlPattern}. Current URL: ${page.url()} (started: ${loginStartUrl})`
        )
      })

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
      const notes: string[] = []
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

        notes.push(`tables=${tableCount} buttons=${buttonCount} bodyLen=${bodyLen}`)
        if (emptyCount > 0) notes.push(`emptyMarkers=${emptyCount}`)
        if (errorCount > 0) {
          notes.push(`errorMarkers=${errorCount}`)
          status = 'HAS_ERRORS'
        }
        if (gatedCount > 0) {
          notes.push('ONBOARDING_WALL')
          status = 'GATED'
        }
        if (bodyLen < 200) {
          notes.push('suspiciously_empty')
          status = 'EMPTY'
        }
        if (httpStatus >= 400) status = `HTTP_${httpStatus}`

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
