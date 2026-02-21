/**
 * Scenario Templates Tests
 */
import { describe, it, expect } from 'vitest'
import { generateTemplateScenarios } from '../../src/scenarios/templates'
import type { SiteMap, DiscoveredPage } from '../../src/core/types'

function makePage(overrides: Partial<DiscoveredPage> = {}): DiscoveredPage {
  return {
    url: 'https://example.com',
    title: 'Example',
    depth: 0,
    statusCode: 200,
    forms: [],
    buttons: [],
    links: [],
    inputs: [],
    modals: [],
    isLoginPage: false,
    isMfaPage: false,
    requiresAuth: false,
    hasConsoleErrors: false,
    consoleErrors: [],
    networkErrors: [],
    loadTimeMs: 500,
    resourceCount: 10,
    ...overrides,
  }
}

function makeSiteMap(pages: DiscoveredPage[]): SiteMap {
  return { baseUrl: 'https://example.com', pages, totalPages: pages.length, crawlDurationMs: 1000 }
}

describe('generateTemplateScenarios', () => {
  it('generates navigation scenarios for each page', () => {
    const siteMap = makeSiteMap([
      makePage({ url: 'https://example.com' }),
      makePage({ url: 'https://example.com/about', depth: 1 }),
    ])

    const scenarios = generateTemplateScenarios(siteMap)
    const navScenarios = scenarios.filter(s => s.category === 'navigation' && s.name.startsWith('Navigate'))
    expect(navScenarios).toHaveLength(2)
  })

  it('generates form scenarios when forms are present', () => {
    const siteMap = makeSiteMap([
      makePage({
        url: 'https://example.com/contact',
        forms: [{
          selector: '#contact-form',
          action: '/submit',
          method: 'POST',
          fields: [
            { name: 'email', type: 'email', selector: '#email', required: true },
            { name: 'message', type: 'textarea', selector: '#message', required: true },
          ],
          submitSelector: '#submit-btn',
        }],
      }),
    ])

    const scenarios = generateTemplateScenarios(siteMap)
    const formScenarios = scenarios.filter(s => s.category === 'forms')
    expect(formScenarios.length).toBeGreaterThanOrEqual(2) // positive + negative
  })

  it('generates login scenarios for login pages', () => {
    const siteMap = makeSiteMap([
      makePage({ url: 'https://example.com/login', isLoginPage: true }),
    ])

    const scenarios = generateTemplateScenarios(siteMap)
    const authScenarios = scenarios.filter(s => s.category === 'auth')
    expect(authScenarios.length).toBeGreaterThanOrEqual(1)
  })

  it('generates error page scenarios for 4xx/5xx', () => {
    const siteMap = makeSiteMap([
      makePage({ url: 'https://example.com/broken', statusCode: 404 }),
      makePage({ url: 'https://example.com/error', statusCode: 500 }),
    ])

    const scenarios = generateTemplateScenarios(siteMap)
    const errorScenarios = scenarios.filter(s => s.category === 'error_handling' && s.name.startsWith('Error page'))
    expect(errorScenarios).toHaveLength(2)
  })

  it('generates broken links and console errors aggregate scenarios', () => {
    const siteMap = makeSiteMap([
      makePage({ url: 'https://example.com' }),
    ])

    const scenarios = generateTemplateScenarios(siteMap)
    expect(scenarios.some(s => s.name.includes('Broken links'))).toBe(true)
    expect(scenarios.some(s => s.name.includes('Console errors'))).toBe(true)
  })

  it('all scenarios have valid structure', () => {
    const siteMap = makeSiteMap([
      makePage({
        url: 'https://example.com',
        isLoginPage: true,
        hasConsoleErrors: true,
        consoleErrors: [{ message: 'test', level: 'error', url: 'https://example.com' }],
        forms: [{
          selector: 'form',
          action: '/',
          method: 'POST',
          fields: [{ name: 'email', type: 'email', selector: '#email', required: true }],
          submitSelector: 'button',
        }],
      }),
    ])

    const scenarios = generateTemplateScenarios(siteMap)
    for (const s of scenarios) {
      expect(s.id).toBeTruthy()
      expect(s.name).toBeTruthy()
      expect(s.category).toBeTruthy()
      expect(s.priority).toBeTruthy()
      expect(s.steps.length).toBeGreaterThanOrEqual(1)
      expect(s.tags).toBeInstanceOf(Array)
    }
  })
})
