/**
 * DOM Assertions
 * Verify element existence, visibility, text content, attributes, URL, title.
 */

import type { TestAssertion, AssertionResult } from '../core/types'

type Page = import('puppeteer').Page

export async function runDomAssertion(
  page: Page,
  assertion: TestAssertion,
): Promise<AssertionResult> {
  try {
    switch (assertion.type) {
      case 'element_exists': {
        const exists = await page.$(assertion.target!) !== null
        return { assertion, passed: exists, actual: exists, error: exists ? undefined : `Element "${assertion.target}" not found` }
      }

      case 'element_visible': {
        const visible = await page.evaluate((sel) => {
          const el = document.querySelector(sel)
          if (!el) return false
          const style = window.getComputedStyle(el)
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
        }, assertion.target!)
        return { assertion, passed: visible, actual: visible, error: visible ? undefined : `Element "${assertion.target}" not visible` }
      }

      case 'element_hidden': {
        const hidden = await page.evaluate((sel) => {
          const el = document.querySelector(sel)
          if (!el) return true
          const style = window.getComputedStyle(el)
          return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0'
        }, assertion.target!)
        return { assertion, passed: hidden, actual: hidden, error: hidden ? undefined : `Element "${assertion.target}" is visible` }
      }

      case 'text_equals': {
        const text = await page.evaluate((sel) => document.querySelector(sel)?.textContent?.trim() || '', assertion.target!)
        const passed = text === assertion.expected
        return { assertion, passed, actual: text, error: passed ? undefined : `Expected "${assertion.expected}", got "${text}"` }
      }

      case 'text_contains': {
        const text = await page.evaluate((sel) => document.querySelector(sel)?.textContent?.trim() || '', assertion.target!)
        const passed = text.includes(String(assertion.expected || ''))
        return { assertion, passed, actual: text, error: passed ? undefined : `"${text}" does not contain "${assertion.expected}"` }
      }

      case 'text_matches': {
        const text = await page.evaluate((sel) => document.querySelector(sel)?.textContent?.trim() || '', assertion.target!)
        const regex = new RegExp(String(assertion.expected || ''))
        const passed = regex.test(text)
        return { assertion, passed, actual: text, error: passed ? undefined : `"${text}" does not match /${assertion.expected}/` }
      }

      case 'attribute_equals': {
        const [selector, attrName] = (assertion.target || '').split('|')
        const value = await page.evaluate((sel, attr) => document.querySelector(sel)?.getAttribute(attr) || '', selector, attrName || 'class')
        const passed = value === assertion.expected
        return { assertion, passed, actual: value, error: passed ? undefined : `Attribute ${attrName}="${value}", expected "${assertion.expected}"` }
      }

      case 'attribute_contains': {
        const [selector, attrName] = (assertion.target || '').split('|')
        const value = await page.evaluate((sel, attr) => document.querySelector(sel)?.getAttribute(attr) || '', selector, attrName || 'class')
        const passed = value.includes(String(assertion.expected || ''))
        return { assertion, passed, actual: value, error: passed ? undefined : `Attribute ${attrName}="${value}" doesn't contain "${assertion.expected}"` }
      }

      case 'url_equals': {
        const url = page.url()
        const passed = url === assertion.expected
        return { assertion, passed, actual: url, error: passed ? undefined : `URL "${url}" !== "${assertion.expected}"` }
      }

      case 'url_contains': {
        const url = page.url()
        const passed = url.includes(String(assertion.expected || ''))
        return { assertion, passed, actual: url, error: passed ? undefined : `URL "${url}" doesn't contain "${assertion.expected}"` }
      }

      case 'url_matches': {
        const url = page.url()
        const regex = new RegExp(String(assertion.expected || ''))
        const passed = regex.test(url)
        return { assertion, passed, actual: url, error: passed ? undefined : `URL "${url}" doesn't match /${assertion.expected}/` }
      }

      case 'title_equals': {
        const title = await page.title()
        const passed = title === assertion.expected
        return { assertion, passed, actual: title, error: passed ? undefined : `Title "${title}" !== "${assertion.expected}"` }
      }

      case 'title_contains': {
        const title = await page.title()
        const passed = title.includes(String(assertion.expected || ''))
        return { assertion, passed, actual: title, error: passed ? undefined : `Title "${title}" doesn't contain "${assertion.expected}"` }
      }

      case 'cookie_exists': {
        const cookies = await page.cookies()
        const exists = cookies.some(c => c.name === assertion.expected)
        return { assertion, passed: exists, actual: exists, error: exists ? undefined : `Cookie "${assertion.expected}" not found` }
      }

      case 'cookie_value': {
        const cookies = await page.cookies()
        const cookie = cookies.find(c => c.name === assertion.target)
        const passed = cookie?.value === assertion.expected
        return { assertion, passed, actual: cookie?.value, error: passed ? undefined : `Cookie "${assertion.target}" = "${cookie?.value}", expected "${assertion.expected}"` }
      }

      default:
        return { assertion, passed: false, error: `Unknown DOM assertion type: ${assertion.type}` }
    }
  } catch (err) {
    return { assertion, passed: false, error: `DOM assertion error: ${err instanceof Error ? err.message : err}` }
  }
}
