/**
 * T-008 — Puppeteer screenshot helpers.
 *
 * Wrap Puppeteer full-page capture for use by:
 *   - `tester run` (ships screenshots of every discovered route)
 *   - `tester snapshot --capture --url <url>` standalone
 *   - journey-audit (already captures; reusing the same fn keeps UX
 *     consistent across entry points)
 *
 * Consumers who already have a Puppeteer Page can call `captureFullPage`
 * directly; consumers that want the full "launch + navigate + capture"
 * flow use `captureUrl` which manages browser lifecycle.
 */

type PuppeteerBrowser = import('puppeteer').Browser
type PuppeteerPage = import('puppeteer').Page

export interface CaptureFullPageOptions {
  /** Max viewport width to use during capture. */
  viewportWidth?: number
  /** Extra settle time (ms) after networkidle, before screenshot. */
  settleMs?: number
  /** Whether to emulate a dark color scheme for the capture. */
  colorScheme?: 'light' | 'dark'
}

export async function captureFullPage(
  page: PuppeteerPage,
  opts: CaptureFullPageOptions = {},
): Promise<Buffer> {
  const w = opts.viewportWidth ?? 1280
  const vp = page.viewport()
  if (!vp || vp.width !== w) {
    await page.setViewport({ width: w, height: vp?.height ?? 800 })
  }
  if (opts.colorScheme) {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: opts.colorScheme }])
  }
  if (opts.settleMs && opts.settleMs > 0) {
    await new Promise((r) => setTimeout(r, opts.settleMs))
  }
  const buf = await page.screenshot({ fullPage: true, type: 'png' })
  return buf as Buffer
}

export interface CaptureUrlOptions extends CaptureFullPageOptions {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'
  timeout?: number
  /** Called after navigation but before screenshot; use to inject auth cookies, dismiss modals, etc. */
  preCapture?: (page: PuppeteerPage) => Promise<void>
}

export async function captureUrl(
  browser: PuppeteerBrowser,
  url: string,
  opts: CaptureUrlOptions = {},
): Promise<Buffer> {
  const page = await browser.newPage()
  try {
    await page.goto(url, {
      waitUntil: opts.waitUntil || 'networkidle2',
      timeout: opts.timeout ?? 30_000,
    })
    if (opts.preCapture) await opts.preCapture(page)
    return await captureFullPage(page, opts)
  } finally {
    await page.close().catch(() => {})
  }
}

/**
 * High-level: launch Puppeteer, capture, close. Use only for standalone
 * one-shot captures; in a test run, share a single browser via
 * `captureUrl(browser, url, opts)` instead.
 */
export async function captureUrlStandalone(
  url: string,
  opts: CaptureUrlOptions = {},
): Promise<Buffer> {
  const puppeteer = (await import('puppeteer')).default
  const launchArgs: string[] = []
  // Mirror the F-004 conditional: only add --no-sandbox on serverless markers.
  if (
    process.env.VERCEL ||
    process.env.NETLIFY ||
    process.env.LAMBDA_TASK_ROOT ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
  ) {
    launchArgs.push('--no-sandbox', '--disable-setuid-sandbox')
  }
  const browser = await puppeteer.launch({ headless: true, args: launchArgs })
  try {
    return await captureUrl(browser, url, opts)
  } finally {
    await browser.close()
  }
}
