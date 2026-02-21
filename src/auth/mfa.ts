/**
 * MFA Handler
 * Detects MFA/2FA screens and handles code entry.
 * Supports: TOTP auto-generation, CLI prompt, library callback.
 */

import type { MfaHandler } from '../core/types'

type Page = import('puppeteer').Page

/** MFA selectors and text patterns for detection */
const MFA_INPUT_SELECTORS = [
  'input[name*="otp"]',
  'input[name*="code"]',
  'input[name*="mfa"]',
  'input[name*="totp"]',
  'input[name*="verify"]',
  'input[name*="token"]',
  'input[name*="2fa"]',
  'input[autocomplete="one-time-code"]',
  'input[inputmode="numeric"][maxlength="6"]',
]

const MFA_TEXT_PATTERNS = [
  /verification\s*code/i,
  /two[\s-]*factor/i,
  /2fa/i,
  /authenticator/i,
  /enter\s*(the|your)?\s*code/i,
  /security\s*code/i,
  /one[\s-]*time\s*password/i,
  /otp/i,
]

export interface MfaDetection {
  detected: boolean
  inputSelector?: string
  submitSelector?: string
}

/**
 * Detect if the current page is an MFA screen.
 */
export async function detectMfa(page: Page): Promise<MfaDetection> {
  return page.evaluate((selectors, patterns) => {
    // Check for MFA input fields
    for (const sel of selectors) {
      const el = document.querySelector(sel)
      if (el) {
        // Find the nearest submit button
        const form = el.closest('form')
        const container = form || document.body
        const submitBtn = container.querySelector(
          'button[type="submit"], input[type="submit"], button:not([type])'
        )
        const submitSelector = submitBtn
          ? (submitBtn.id ? `#${submitBtn.id}` : 'button[type="submit"], button:not([type])')
          : 'button[type="submit"]'

        return {
          detected: true,
          inputSelector: sel,
          submitSelector,
        }
      }
    }

    // Check for MFA text patterns in page body
    const bodyText = document.body?.textContent || ''
    for (const pattern of patterns) {
      if (new RegExp(pattern).test(bodyText)) {
        // Found text pattern — look for a numeric input
        const numericInput = document.querySelector<HTMLInputElement>(
          'input[inputmode="numeric"], input[type="tel"], input[type="number"], input[maxlength="6"]'
        )
        if (numericInput) {
          const sel = numericInput.id
            ? `#${numericInput.id}`
            : numericInput.name
              ? `input[name="${numericInput.name}"]`
              : 'input[inputmode="numeric"], input[type="tel"]'

          return {
            detected: true,
            inputSelector: sel,
            submitSelector: 'button[type="submit"], button:not([type])',
          }
        }

        // No numeric input found but text matches — still flagged
        return { detected: true }
      }
    }

    return { detected: false }
  }, MFA_INPUT_SELECTORS, MFA_TEXT_PATTERNS.map(p => p.source))
}

/**
 * Handle MFA code entry.
 * Uses TOTP auto-generation if secret is available, otherwise calls the handler.
 */
export async function handleMfa(
  page: Page,
  detection: MfaDetection,
  mfaSecret?: string,
  mfaHandler?: MfaHandler,
): Promise<{ success: boolean; error?: string }> {
  if (!detection.detected || !detection.inputSelector) {
    return { success: false, error: 'MFA detected but no input field found' }
  }

  let code: string

  if (mfaSecret) {
    // Auto-generate TOTP code
    code = await generateTotp(mfaSecret)
  } else if (mfaHandler) {
    // Call user-provided handler (CLI prompt or library callback)
    code = await mfaHandler('Enter the MFA/2FA verification code:')
  } else {
    return { success: false, error: 'MFA detected but no secret or handler provided' }
  }

  if (!code || code.trim() === '') {
    return { success: false, error: 'Empty MFA code' }
  }

  try {
    // Enter the code
    const inputEl = await page.$(detection.inputSelector)
    if (!inputEl) return { success: false, error: 'MFA input field not found' }

    await inputEl.click({ clickCount: 3 })
    await inputEl.type(code.trim(), { delay: 50 })

    // Submit
    if (detection.submitSelector) {
      const submitEl = await page.$(detection.submitSelector)
      if (submitEl) {
        await submitEl.click()
      } else {
        // Try pressing Enter
        await page.keyboard.press('Enter')
      }
    } else {
      await page.keyboard.press('Enter')
    }

    // Wait for navigation
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15_000 }).catch(() => {})

    // Check if still on MFA page
    const stillOnMfa = await detectMfa(page)
    if (stillOnMfa.detected) {
      return { success: false, error: 'MFA code rejected — still on verification page' }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: `MFA error: ${err instanceof Error ? err.message : err}` }
  }
}

/**
 * Generate a TOTP code from a secret.
 * Uses the otpauth library.
 */
async function generateTotp(secret: string): Promise<string> {
  const { TOTP } = await import('otpauth')
  const totp = new TOTP({
    secret,
    digits: 6,
    period: 30,
    algorithm: 'SHA1',
  })
  return totp.generate()
}

/**
 * Create a CLI-based MFA handler that prompts the user in the terminal.
 */
export function createCliMfaHandler(): MfaHandler {
  return async (prompt: string): Promise<string> => {
    const readline = await import('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    return new Promise((resolve) => {
      rl.question(`[tester] ${prompt} `, (answer) => {
        rl.close()
        resolve(answer)
      })
    })
  }
}
