/**
 * Browser Core Tests — unit tests for non-Puppeteer logic
 * (Puppeteer integration tests would require a running browser)
 */
import { describe, it, expect } from 'vitest'
import { BrowserCore } from '../../src/core/browser'

describe('BrowserCore', () => {
  it('can be instantiated with default config', () => {
    const browser = new BrowserCore()
    expect(browser).toBeInstanceOf(BrowserCore)
  })

  it('can be instantiated with custom config', () => {
    const browser = new BrowserCore({
      headless: false,
      viewportWidth: 1920,
      viewportHeight: 1080,
      stepTimeout: 5000,
    })
    expect(browser).toBeInstanceOf(BrowserCore)
  })

  it('initializes with empty errors', () => {
    const browser = new BrowserCore()
    expect(browser.consoleErrors).toEqual([])
    expect(browser.networkErrors).toEqual([])
  })

  it('clearErrors resets arrays', () => {
    const browser = new BrowserCore()
    browser.consoleErrors.push({ message: 'test', level: 'error', url: 'https://test.com' })
    browser.networkErrors.push({ url: 'https://test.com/api', statusCode: 500, resource: 'fetch' })

    browser.clearErrors()

    expect(browser.consoleErrors).toEqual([])
    expect(browser.networkErrors).toEqual([])
  })

  it('getUrl returns empty string before launch', () => {
    const browser = new BrowserCore()
    expect(browser.getUrl()).toBe('')
  })

  it('getIsLoggedIn returns false initially', () => {
    const browser = new BrowserCore()
    expect(browser.getIsLoggedIn()).toBe(false)
  })

  it('getPage returns null before launch', () => {
    const browser = new BrowserCore()
    expect(browser.getPage()).toBeNull()
  })

  it('screenshot throws before launch', async () => {
    const browser = new BrowserCore()
    await expect(browser.screenshot()).rejects.toThrow('Browser not launched')
  })

  it('close is safe to call without launch', async () => {
    const browser = new BrowserCore()
    await browser.close() // should not throw
  })
})
