/**
 * CLI Command: tester login <url>
 * Login to a website and optionally save the session.
 */

import { BrowserCore } from '../../core/browser'
import { autoLogin } from '../../auth/login'
import { detectMfa, handleMfa, createCliMfaHandler } from '../../auth/mfa'
import { saveSession } from '../../auth/session'
import { log, logSuccess, logError, startSpinner, stopSpinner } from '../utils'

interface LoginOptions {
  username: string
  password: string
  headless: boolean
  saveSession?: string
  mfa: boolean
  mfaSecret?: string
}

export async function loginCommand(url: string, options: LoginOptions): Promise<void> {
  const normalizedUrl = url.startsWith('http') ? url : `https://${url}`

  log(`Logging in to ${normalizedUrl}`)

  const browser = new BrowserCore({
    headless: options.headless,
  })

  try {
    startSpinner('Launching browser...')
    await browser.launch()
    stopSpinner('Browser launched')

    startSpinner('Logging in...')
    const result = await autoLogin(browser, {
      username: options.username,
      password: options.password,
      loginUrl: normalizedUrl,
    })

    if (!result.success) {
      stopSpinner()
      logError(`Login failed: ${result.error}`)
      process.exit(1)
    }

    stopSpinner(`Logged in via ${result.platform || 'generic'} detection`)

    // Check for MFA
    if (options.mfa || options.mfaSecret) {
      const page = browser.getPage()
      if (page) {
        const mfaDetection = await detectMfa(page)
        if (mfaDetection.detected) {
          log('MFA screen detected')
          const mfaResult = await handleMfa(
            page,
            mfaDetection,
            options.mfaSecret,
            options.mfa ? createCliMfaHandler() : undefined,
          )
          if (mfaResult.success) {
            logSuccess('MFA code accepted')
          } else {
            logError(`MFA failed: ${mfaResult.error}`)
            process.exit(1)
          }
        }
      }
    }

    // Save session if requested
    if (options.saveSession) {
      await saveSession(browser, options.saveSession)
      logSuccess(`Session saved to ${options.saveSession}`)
    }

    logSuccess('Login complete')
  } catch (err) {
    stopSpinner()
    logError(err instanceof Error ? err.message : String(err))
    process.exit(1)
  } finally {
    await browser.close()
  }
}
