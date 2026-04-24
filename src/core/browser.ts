/**
 * Browser Core for AI Tester
 * Puppeteer automation engine adapted from Website Guru's browser-agent.
 * Extended with console error capture, network monitoring, and test-oriented API.
 */

import type {
  TesterConfig,
  TestStep,
  StepResult,
  LoginCredentials,
  LoginPlan,
  ConsoleError,
  NetworkError,
  ElementLocation,
} from './types'
import { LOGIN_PLANS } from './types'
import { validateStep, createTimeoutGuard } from './safety'
import { findElementByVision } from './element-finder'

type Browser = import('puppeteer').Browser
type Page = import('puppeteer').Page

const DEFAULT_CONFIG: Required<Omit<TesterConfig, 'credentials' | 'mfaHandler' | 'sessionPath' | 'anthropicApiKey' | 'aiModel' | 'allowedDomains' | 'excludePatterns' | 'outputDir' | 'reportFormats'>> = {
  headless: true,
  viewportWidth: 1280,
  viewportHeight: 800,
  maxPages: 50,
  maxDepth: 3,
  crawlTimeout: 120_000,
  screenshotOnError: true,
  screenshotEveryStep: false,
  stepTimeout: 10_000,
  concurrency: 1,
  videoDir: '',
  visualRegression: true,
  accessibility: true,
  performance: true,
  retryBudget: 2,
  retryInitialSettleMs: 1000,
  retryBackoffMultiplier: 1.5,
  retrySettleCapMs: 8000,
  noRetry: false,
  a11yScanOutputPath: '',
  a11yScanMaxPages: 0,
}

export class BrowserCore {
  private browser: Browser | null = null
  private page: Page | null = null
  private config: TesterConfig
  private currentUrl = ''
  private isLoggedIn = false

  /** Console errors captured during browsing */
  public consoleErrors: ConsoleError[] = []
  /** Network errors captured during browsing */
  public networkErrors: NetworkError[] = []

  constructor(config: TesterConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // ─── Lifecycle ────────────────────────────────────────────

  async launch(): Promise<void> {
    const puppeteer = await import('puppeteer')
    this.browser = await puppeteer.default.launch({
      headless: this.config.headless !== false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        `--window-size=${this.config.viewportWidth || 1280},${this.config.viewportHeight || 800}`,
      ],
    })

    this.page = await this.browser.newPage()
    await this.page.setViewport({
      width: this.config.viewportWidth || 1280,
      height: this.config.viewportHeight || 800,
    })

    // Block fonts and large media for speed
    await this.page.setRequestInterception(true)
    this.page.on('request', (req) => {
      const resourceType = req.resourceType()
      if (['font', 'media'].includes(resourceType)) {
        req.abort()
      } else {
        req.continue()
      }
    })

    // Capture console errors
    this.page.on('console', (msg) => {
      const type = msg.type()
      if (type === 'error' || type === 'warn') {
        this.consoleErrors.push({
          message: msg.text(),
          level: type === 'error' ? 'error' : 'warning' as const,
          url: this.page?.url() || this.currentUrl,
        })
      }
    })

    this.page.on('pageerror', (err: unknown) => {
      this.consoleErrors.push({
        message: err instanceof Error ? err.message : String(err),
        level: 'error',
        url: this.page?.url() || this.currentUrl,
      })
    })

    // Capture network errors (non-2xx responses)
    this.page.on('response', (response) => {
      const status = response.status()
      if (status >= 400) {
        this.networkErrors.push({
          url: response.url(),
          statusCode: status,
          resource: response.request().resourceType(),
        })
      }
    })
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.page = null
      this.isLoggedIn = false
    }
  }

  /** Take a viewport screenshot as base64 PNG */
  async screenshot(): Promise<string> {
    if (!this.page) throw new Error('Browser not launched')
    const buffer = await this.page.screenshot({ encoding: 'base64', fullPage: false })
    return typeof buffer === 'string' ? buffer : Buffer.from(buffer).toString('base64')
  }

  /** Take a full-page screenshot as base64 PNG */
  async fullPageScreenshot(): Promise<string> {
    if (!this.page) throw new Error('Browser not launched')
    const buffer = await this.page.screenshot({ encoding: 'base64', fullPage: true })
    return typeof buffer === 'string' ? buffer : Buffer.from(buffer).toString('base64')
  }

  getUrl(): string {
    return this.page?.url() || this.currentUrl
  }

  getPage(): Page | null {
    return this.page
  }

  getIsLoggedIn(): boolean {
    return this.isLoggedIn
  }

  /** Clear captured errors (useful between pages) */
  clearErrors(): void {
    this.consoleErrors = []
    this.networkErrors = []
  }

  /** Get page title */
  async getTitle(): Promise<string> {
    if (!this.page) return ''
    return this.page.title()
  }

  // ─── Navigation ─────────────────────────────────────────

  async goto(url: string, timeout = 30_000): Promise<number> {
    if (!this.page) throw new Error('Browser not launched')
    const response = await this.page.goto(url, { waitUntil: 'networkidle2', timeout })
    this.currentUrl = this.page.url()
    return response?.status() || 0
  }

  // ─── Login ──────────────────────────────────────────────

  async login(
    credentials: LoginCredentials,
    loginPlan?: LoginPlan,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.page) throw new Error('Browser not launched')

    const plan = loginPlan || this.detectLoginPlan(credentials.loginUrl || '')
    if (!plan) {
      return { success: false, error: 'No login plan available for this URL' }
    }

    try {
      const loginUrl = (credentials.loginUrl || '').replace(/\/$/, '') +
        (plan.loginUrl.startsWith('/') ? plan.loginUrl : `/${plan.loginUrl}`)

      await this.page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30_000 })
      this.currentUrl = this.page.url()

      await this.waitForSelector(plan.usernameSelector, plan.fallbackSelectors?.username)

      const usernameEl = await this.findElement(plan.usernameSelector, plan.fallbackSelectors?.username)
      if (!usernameEl) return { success: false, error: 'Username field not found' }
      await usernameEl.click({ clickCount: 3 })
      await usernameEl.type(credentials.username, { delay: 30 })

      const passwordEl = await this.findElement(plan.passwordSelector, plan.fallbackSelectors?.password)
      if (!passwordEl) return { success: false, error: 'Password field not found' }
      await passwordEl.click({ clickCount: 3 })
      await passwordEl.type(credentials.password, { delay: 30 })

      const submitEl = await this.findElement(plan.submitSelector, plan.fallbackSelectors?.submit)
      if (!submitEl) return { success: false, error: 'Submit button not found' }
      await submitEl.click()

      await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15_000 }).catch(() => {})

      const isSuccess = await this.waitForSelector(
        plan.successSelector,
        plan.fallbackSelectors?.success,
        10_000,
      )

      if (isSuccess) {
        this.isLoggedIn = true
        this.currentUrl = this.page.url()
        return { success: true }
      }

      const errorText = await this.page.evaluate(() => {
        const errorEls = document.querySelectorAll('.error, .alert-danger, [role="alert"], .login-error, #login_error')
        return Array.from(errorEls).map(el => el.textContent?.trim()).filter(Boolean).join('; ')
      })

      return { success: false, error: errorText || 'Login did not redirect to admin panel' }
    } catch (err) {
      return { success: false, error: `Login error: ${err instanceof Error ? err.message : err}` }
    }
  }

  private detectLoginPlan(url: string): LoginPlan | null {
    const u = url.toLowerCase()
    if (u.includes('wp-admin') || u.includes('wp-login')) return LOGIN_PLANS.wordpress
    if (u.includes('shopify') || u.includes('/admin')) return LOGIN_PLANS.shopify
    if (u.includes('wix') || u.includes('editor.wix')) return LOGIN_PLANS.wix
    if (u.includes('squarespace')) return LOGIN_PLANS.squarespace
    if (u.includes(':2083') || u.includes('cpanel')) return LOGIN_PLANS.cpanel
    return null
  }

  // ─── Step Execution ─────────────────────────────────────

  async executeStep(step: TestStep, index: number): Promise<StepResult> {
    if (!this.page) throw new Error('Browser not launched')
    const start = Date.now()
    let usedAiFallback = false

    const safety = validateStep(step, this.config, this.currentUrl)
    if (!safety.ok) {
      return {
        stepIndex: index,
        action: step.action,
        description: step.description,
        success: false,
        error: safety.reason,
        durationMs: Date.now() - start,
      }
    }

    const timeout = step.timeout || this.config.stepTimeout || 10_000

    try {
      switch (step.action) {
        case 'navigate': {
          const url = step.value!.startsWith('http')
            ? step.value!
            : new URL(step.value!, this.currentUrl).href
          await this.page.goto(url, { waitUntil: 'networkidle2', timeout })
          this.currentUrl = this.page.url()
          break
        }

        case 'click': {
          const el = await this.resolveElement(step, timeout)
          if (!el.element) { usedAiFallback = el.usedAi; throw new Error(el.error || 'Element not found') }
          usedAiFallback = el.usedAi
          await el.element.click()
          if (step.waitAfter) await this.applyWait(step.waitAfter)
          break
        }

        case 'fill': {
          const el = await this.resolveElement(step, timeout)
          if (!el.element) { usedAiFallback = el.usedAi; throw new Error(el.error || 'Element not found') }
          usedAiFallback = el.usedAi
          await el.element.click({ clickCount: 3 })
          await el.element.type(step.value || '', { delay: 20 })
          break
        }

        case 'clear': {
          const el = await this.resolveElement(step, timeout)
          if (!el.element) throw new Error(el.error || 'Element not found')
          await el.element.click({ clickCount: 3 })
          await this.page.keyboard.press('Backspace')
          break
        }

        case 'select': {
          const el = await this.resolveElement(step, timeout)
          if (!el.element) throw new Error(el.error || 'Element not found')
          await this.page.select(step.target!, step.value!)
          break
        }

        case 'hover': {
          const el = await this.resolveElement(step, timeout)
          if (!el.element) throw new Error(el.error || 'Element not found')
          await el.element.hover()
          break
        }

        case 'doubleClick': {
          const el = await this.resolveElement(step, timeout)
          if (!el.element) throw new Error(el.error || 'Element not found')
          await el.element.click({ clickCount: 2 })
          break
        }

        case 'rightClick': {
          const el = await this.resolveElement(step, timeout)
          if (!el.element) throw new Error(el.error || 'Element not found')
          await el.element.click({ button: 'right' })
          break
        }

        case 'wait': {
          if (step.target) {
            await this.page.waitForSelector(step.target, { timeout })
          } else if (step.value) {
            await new Promise(r => setTimeout(r, parseInt(step.value!, 10)))
          } else {
            await new Promise(r => setTimeout(r, 1000))
          }
          break
        }

        case 'screenshot': break

        case 'scrollTo': {
          if (step.target) {
            await this.page.evaluate((sel) => {
              document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }, step.target)
          }
          break
        }

        case 'pressKey': {
          await this.page.keyboard.press(step.value as import('puppeteer').KeyInput)
          break
        }

        case 'evaluate': {
          await this.page.evaluate(step.value!)
          break
        }

        case 'upload': {
          const el = await this.resolveElement(step, timeout)
          if (!el.element) throw new Error(el.error || 'File input not found')
          const inputEl = el.element as import('puppeteer').ElementHandle<HTMLInputElement>
          await inputEl.uploadFile(step.value!)
          break
        }
      }

      let screenshot: string | undefined
      if (step.action === 'screenshot' || this.config.screenshotEveryStep) {
        screenshot = await this.screenshot()
      }

      return {
        stepIndex: index,
        action: step.action,
        description: step.description,
        success: true,
        screenshot,
        durationMs: Date.now() - start,
        usedAiFallback,
      }
    } catch (err) {
      let screenshot: string | undefined
      if (this.config.screenshotOnError !== false) {
        try { screenshot = await this.screenshot() } catch {}
      }

      return {
        stepIndex: index,
        action: step.action,
        description: step.description,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        screenshot,
        durationMs: Date.now() - start,
        usedAiFallback,
      }
    }
  }

  // ─── Element Resolution (CSS → Fallback → AI Vision) ───

  private async resolveElement(
    step: TestStep,
    timeout: number,
  ): Promise<{ element: import('puppeteer').ElementHandle | null; usedAi: boolean; error?: string }> {
    if (!this.page) return { element: null, usedAi: false, error: 'No page' }

    // 1. Primary CSS selector
    if (step.target) {
      try {
        await this.page.waitForSelector(step.target, { timeout: Math.min(timeout, 5000) })
        const el = await this.page.$(step.target)
        if (el) return { element: el, usedAi: false }
      } catch {}
    }

    // 2. Fallback selectors
    if (step.fallbackSelectors) {
      for (const sel of step.fallbackSelectors) {
        try {
          const el = await this.page.$(sel)
          if (el) return { element: el, usedAi: false }
        } catch {}
      }
    }

    // 3. AI Vision fallback
    if (step.aiDescription && this.config.anthropicApiKey) {
      try {
        const screenshotB64 = await this.screenshot()
        const location = await findElementByVision(
          screenshotB64,
          step.aiDescription,
          this.config.anthropicApiKey,
        )

        if (location && location.confidence >= 0.5) {
          if (location.suggestedSelector) {
            const el = await this.page.$(location.suggestedSelector)
            if (el) return { element: el, usedAi: true }
          }

          const centerX = location.bbox.x + location.bbox.width / 2
          const centerY = location.bbox.y + location.bbox.height / 2

          const elAtPoint = await this.page.evaluateHandle(
            (x, y) => document.elementFromPoint(x, y),
            centerX, centerY,
          )

          if (elAtPoint) {
            return { element: elAtPoint as import('puppeteer').ElementHandle, usedAi: true }
          }
        }
      } catch (err) {
        console.warn('[browser] AI fallback failed:', err instanceof Error ? err.message : err)
      }
    }

    return {
      element: null,
      usedAi: false,
      error: `Element not found: ${step.target || step.aiDescription || 'no target'}`,
    }
  }

  // ─── Helpers ────────────────────────────────────────────

  private async waitForSelector(
    primary: string,
    fallbacks?: string[],
    timeout = 10_000,
  ): Promise<boolean> {
    if (!this.page) return false

    const selectors = [primary, ...(fallbacks || [])]
    const racePromises = selectors.map(sel =>
      this.page!.waitForSelector(sel, { timeout }).then(() => true).catch(() => false)
    )

    const results = await Promise.race([
      Promise.any(racePromises.map((p, i) => p.then(v => v ? i : Promise.reject()))),
      new Promise<number>(r => setTimeout(() => r(-1), timeout)),
    ])

    return results !== -1
  }

  private async findElement(
    primary: string,
    fallbacks?: string[],
  ): Promise<import('puppeteer').ElementHandle | null> {
    if (!this.page) return null

    const el = await this.page.$(primary)
    if (el) return el

    if (fallbacks) {
      for (const sel of fallbacks) {
        const fallbackEl = await this.page.$(sel)
        if (fallbackEl) return fallbackEl
      }
    }

    return null
  }

  private async applyWait(waitAfter: 'networkidle' | 'domcontentloaded' | number): Promise<void> {
    if (!this.page) return

    if (typeof waitAfter === 'number') {
      await new Promise(r => setTimeout(r, waitAfter))
    } else if (waitAfter === 'networkidle') {
      await this.page.waitForNetworkIdle({ timeout: 10_000 }).catch(() => {})
    } else if (waitAfter === 'domcontentloaded') {
      await this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => {})
    }
  }

  // ─── Cookie/Session Persistence ─────────────────────────

  async saveCookies(): Promise<string> {
    if (!this.page) throw new Error('Browser not launched')
    const cookies = await this.page.cookies()
    return JSON.stringify(cookies)
  }

  async loadCookies(cookiesJson: string): Promise<void> {
    if (!this.page) throw new Error('Browser not launched')
    const cookies = JSON.parse(cookiesJson)
    await this.page.setCookie(...cookies)
  }
}
