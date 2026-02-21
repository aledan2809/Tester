/**
 * Session Persistence
 * Save and load browser cookies to/from a file for session reuse.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { BrowserCore } from '../core/browser'

/**
 * Save current browser cookies to a JSON file.
 */
export async function saveSession(browser: BrowserCore, filePath: string): Promise<void> {
  const cookiesJson = await browser.saveCookies()
  writeFileSync(filePath, cookiesJson, 'utf8')
}

/**
 * Load cookies from a JSON file into the browser.
 */
export async function loadSession(browser: BrowserCore, filePath: string): Promise<boolean> {
  if (!existsSync(filePath)) return false

  try {
    const cookiesJson = readFileSync(filePath, 'utf8')
    await browser.loadCookies(cookiesJson)
    return true
  } catch {
    return false
  }
}

/**
 * Check if a session file exists and is not expired.
 * Sessions older than maxAge (default: 24h) are considered expired.
 */
export function isSessionValid(filePath: string, maxAgeMs = 24 * 60 * 60 * 1000): boolean {
  if (!existsSync(filePath)) return false

  try {
    const { statSync } = require('fs') as typeof import('fs')
    const stat = statSync(filePath)
    const age = Date.now() - stat.mtimeMs
    return age < maxAgeMs
  } catch {
    return false
  }
}
