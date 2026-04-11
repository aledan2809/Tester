/**
 * Login Handler
 * Detects the CMS platform and logs in using known login plans.
 * Falls back to generic login detection for unknown platforms.
 */

import type { BrowserCore } from '../core/browser'
import type { LoginCredentials, LoginPlan } from '../core/types'
import { LOGIN_PLANS } from '../core/types'

type Page = import('puppeteer').Page

export interface LoginResult {
  success: boolean
  error?: string
  platform?: string
  usedGenericDetection?: boolean
  redirectUrl?: string
}

/**
 * Auto-detect platform and login.
 * 1. Try known CMS login plans (WordPress, Shopify, etc.)
 * 2. Fall back to generic login form detection
 */
export async function autoLogin(
  browser: BrowserCore,
  credentials: LoginCredentials,
): Promise<LoginResult> {
  const loginUrl = credentials.loginUrl || ''

  // Try known platform login plans
  const platformPlan = detectPlatformLoginPlan(loginUrl)
  if (platformPlan) {
    const result = await browser.login(credentials, platformPlan.plan)
    return {
      ...result,
      platform: platformPlan.name,
      usedGenericDetection: false,
    }
  }

  // Fall back to generic login detection
  return genericLogin(browser, credentials)
}

/**
 * Detect which CMS login plan to use based on URL patterns.
 */
function detectPlatformLoginPlan(url: string): { name: string; plan: LoginPlan } | null {
  const u = url.toLowerCase()

  if (u.includes('wp-admin') || u.includes('wp-login') || u.includes('/wp/')) {
    return { name: 'wordpress', plan: LOGIN_PLANS.wordpress }
  }
  if (u.includes('shopify') || u.includes('myshopify.com')) {
    return { name: 'shopify', plan: LOGIN_PLANS.shopify }
  }
  if (u.includes('wix') || u.includes('editor.wix')) {
    return { name: 'wix', plan: LOGIN_PLANS.wix }
  }
  if (u.includes('squarespace')) {
    return { name: 'squarespace', plan: LOGIN_PLANS.squarespace }
  }
  if (u.includes(':2083') || u.includes('cpanel')) {
    return { name: 'cpanel', plan: LOGIN_PLANS.cpanel }
  }

  return null
}

/**
 * Generic login — detect username/password/submit fields automatically.
 * Works on any site with a standard login form.
 */
async function genericLogin(
  browser: BrowserCore,
  credentials: LoginCredentials,
): Promise<LoginResult> {
  const page = browser.getPage()
  if (!page) return { success: false, error: 'Browser not launched' }

  const loginUrl = credentials.loginUrl
  if (!loginUrl) {
    return { success: false, error: 'No login URL provided and platform not detected' }
  }

  try {
    await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30_000 })

    // Find login form fields generically
    const fields = await detectLoginFields(page)
    if (!fields) {
      return { success: false, error: 'Could not detect login form fields', usedGenericDetection: true }
    }

    // Fill username/email
    const usernameEl = await page.$(fields.usernameSelector)
    if (!usernameEl) return { success: false, error: 'Username field not found', usedGenericDetection: true }
    await usernameEl.click({ clickCount: 3 })
    await usernameEl.type(credentials.username, { delay: 30 })

    // Fill password
    const passwordEl = await page.$(fields.passwordSelector)
    if (!passwordEl) return { success: false, error: 'Password field not found', usedGenericDetection: true }
    await passwordEl.click({ clickCount: 3 })
    await passwordEl.type(credentials.password, { delay: 30 })

    // Click submit
    const submitEl = await page.$(fields.submitSelector)
    if (!submitEl) return { success: false, error: 'Submit button not found', usedGenericDetection: true }
    await submitEl.click()

    // Wait for navigation
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15_000 }).catch(() => {})

    // Check if we're still on the login page (login failed) or moved elsewhere (success)
    const currentUrl = page.url()
    const stillOnLogin = currentUrl.includes('login') || currentUrl.includes('signin') || currentUrl.includes('sign-in')

    // Check for error messages
    const errorText = await page.evaluate(() => {
      const errorEls = document.querySelectorAll(
        '.error, .alert-danger, .alert-error, [role="alert"], .login-error, ' +
        '.form-error, .field-error, .message-error, .text-red-500, .text-danger'
      )
      return Array.from(errorEls).map(el => el.textContent?.trim()).filter(Boolean).join('; ')
    })

    if (errorText) {
      return { success: false, error: errorText, usedGenericDetection: true }
    }

    if (stillOnLogin) {
      return { success: false, error: 'Login appears to have failed — still on login page', usedGenericDetection: true }
    }

    return { success: true, platform: 'generic', usedGenericDetection: true }
  } catch (err) {
    return {
      success: false,
      error: `Generic login error: ${err instanceof Error ? err.message : err}`,
      usedGenericDetection: true,
    }
  }
}

/**
 * Detect login form fields on the current page.
 * Looks for common patterns: email/username input, password input, submit button.
 */
async function detectLoginFields(page: Page): Promise<{
  usernameSelector: string
  passwordSelector: string
  submitSelector: string
} | null> {
  return page.evaluate(() => {
    // Find password field
    const passwordInput = document.querySelector<HTMLInputElement>(
      'input[type="password"]'
    )
    if (!passwordInput) return null

    const passwordSelector = passwordInput.id
      ? `#${passwordInput.id}`
      : passwordInput.name
        ? `input[name="${passwordInput.name}"]`
        : 'input[type="password"]'

    // Find username/email field — look for inputs near the password field
    const form = passwordInput.closest('form')
    const container = form || document.body

    const usernameInput = container.querySelector<HTMLInputElement>(
      'input[type="email"], input[name*="email"], input[name*="user"], ' +
      'input[name*="login"], input[name*="account"], input[type="text"]'
    )
    if (!usernameInput) return null

    const usernameSelector = usernameInput.id
      ? `#${usernameInput.id}`
      : usernameInput.name
        ? `input[name="${usernameInput.name}"]`
        : 'input[type="email"], input[type="text"]'

    // Find submit button
    const submitBtn = container.querySelector<HTMLElement>(
      'button[type="submit"], input[type="submit"], ' +
      'button:not([type]), button[class*="login"], button[class*="signin"]'
    )

    const submitSelector = submitBtn
      ? (submitBtn.id
          ? `#${submitBtn.id}`
          : submitBtn.getAttribute('type') === 'submit'
            ? (form ? 'form button[type="submit"], form input[type="submit"]' : 'button[type="submit"]')
            : 'button:not([type])')
      : 'button[type="submit"]'

    return { usernameSelector, passwordSelector, submitSelector }
  })
}
