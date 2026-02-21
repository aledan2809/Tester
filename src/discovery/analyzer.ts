/**
 * Page Analyzer
 * Runs on each crawled page to extract interactive elements:
 * forms, buttons, links, inputs, modals.
 * Also detects login/MFA pages.
 */

import type {
  DiscoveredForm,
  DiscoveredButton,
  DiscoveredLink,
  DiscoveredInput,
  FormField,
} from '../core/types'

type Page = import('puppeteer').Page

export interface PageAnalysis {
  forms: DiscoveredForm[]
  buttons: DiscoveredButton[]
  links: DiscoveredLink[]
  inputs: DiscoveredInput[]
  modals: string[]
  isLoginPage: boolean
  isMfaPage: boolean
  requiresAuth: boolean
}

/**
 * Analyze a page for all interactive elements.
 * Must be called while the page is loaded and rendered.
 */
export async function analyzePage(page: Page, baseUrl: string): Promise<PageAnalysis> {
  return page.evaluate((base) => {
    const baseHost = new URL(base).hostname

    // ── Forms ──────────────────────────────────────────────
    const forms: DiscoveredForm[] = []
    document.querySelectorAll('form').forEach((form, fi) => {
      const fields: FormField[] = []
      form.querySelectorAll('input, select, textarea').forEach((input, ii) => {
        const el = input as HTMLInputElement
        const type = el.type || el.tagName.toLowerCase()
        if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) return

        const labelEl = el.id ? document.querySelector(`label[for="${el.id}"]`) : null
        const closestLabel = el.closest('label')

        fields.push({
          name: el.name || el.id || `field_${ii}`,
          type,
          selector: el.id ? `#${el.id}` :
                    el.name ? `[name="${el.name}"]` :
                    `form:nth-of-type(${fi + 1}) ${el.tagName.toLowerCase()}:nth-of-type(${ii + 1})`,
          required: el.required || el.getAttribute('aria-required') === 'true',
          placeholder: el.placeholder || undefined,
          label: labelEl?.textContent?.trim() || closestLabel?.textContent?.trim() || undefined,
          validationPattern: el.pattern || undefined,
        })
      })

      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])') as HTMLElement | null
      const submitSelector = submitBtn
        ? (submitBtn.id ? `#${submitBtn.id}` : `form:nth-of-type(${fi + 1}) button[type="submit"], form:nth-of-type(${fi + 1}) input[type="submit"]`)
        : ''

      forms.push({
        selector: form.id ? `#${form.id}` : `form:nth-of-type(${fi + 1})`,
        action: form.action || '',
        method: (form.method || 'GET').toUpperCase(),
        fields,
        submitSelector,
      })
    })

    // ── Buttons (outside forms) ────────────────────────────
    const buttons: DiscoveredButton[] = []
    document.querySelectorAll('button, [role="button"], input[type="button"]').forEach((btn, bi) => {
      const el = btn as HTMLElement
      // Skip buttons already captured in forms
      if (el.closest('form')) return

      buttons.push({
        selector: el.id ? `#${el.id}` :
                  el.className ? `.${el.className.split(/\s+/).filter(Boolean).join('.')}` :
                  `button:nth-of-type(${bi + 1})`,
        text: el.textContent?.trim()?.slice(0, 100) || '',
        type: (el as HTMLButtonElement).type || 'button',
        isSubmit: (el as HTMLButtonElement).type === 'submit',
      })
    })

    // ── Links ──────────────────────────────────────────────
    const links: DiscoveredLink[] = []
    const seen = new Set<string>()
    document.querySelectorAll('a[href]').forEach((a) => {
      const el = a as HTMLAnchorElement
      const href = el.href
      if (!href || seen.has(href)) return
      if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      seen.add(href)

      let isExternal = false
      try {
        isExternal = new URL(href).hostname !== baseHost
      } catch {}

      const isNav = !!el.closest('nav, header, .nav, .navbar, .menu, .sidebar, [role="navigation"]')

      links.push({
        href,
        text: el.textContent?.trim()?.slice(0, 100) || '',
        isExternal,
        isNavigation: isNav,
      })
    })

    // ── Standalone Inputs ──────────────────────────────────
    const inputs: DiscoveredInput[] = []
    document.querySelectorAll('input:not(form input), textarea:not(form textarea), select:not(form select)').forEach((input, ii) => {
      const el = input as HTMLInputElement
      const type = el.type || el.tagName.toLowerCase()
      if (['hidden', 'submit', 'button', 'reset'].includes(type)) return

      const labelEl = el.id ? document.querySelector(`label[for="${el.id}"]`) : null

      inputs.push({
        selector: el.id ? `#${el.id}` :
                  el.name ? `[name="${el.name}"]` :
                  `input:nth-of-type(${ii + 1})`,
        name: el.name || el.id || `input_${ii}`,
        type,
        label: labelEl?.textContent?.trim() || undefined,
        required: el.required,
      })
    })

    // ── Modal Triggers ─────────────────────────────────────
    const modals: string[] = []
    document.querySelectorAll('[data-toggle="modal"], [data-bs-toggle="modal"], [aria-haspopup="dialog"]').forEach((el) => {
      const htmlEl = el as HTMLElement
      const selector = htmlEl.id ? `#${htmlEl.id}` : (htmlEl.getAttribute('data-target') || htmlEl.getAttribute('data-bs-target') || '')
      if (selector) modals.push(selector)
    })

    // ── Auth Detection ─────────────────────────────────────
    const bodyText = document.body?.textContent?.toLowerCase() || ''
    const hasPasswordField = !!document.querySelector('input[type="password"]')
    const hasUsernameField = !!document.querySelector('input[name*="user"], input[name*="email"], input[name*="login"], input[type="email"]')

    const isLoginPage = hasPasswordField && hasUsernameField
    const isMfaPage = !!(
      document.querySelector('input[name*="otp"], input[name*="code"], input[name*="mfa"], input[name*="totp"], input[name*="verify"]') ||
      /verification code|two-factor|2fa|authenticator|enter.*code/i.test(bodyText)
    )
    const requiresAuth = !!(
      /sign.?in|log.?in|please.?login|authentication.?required|unauthorized|403/i.test(bodyText) &&
      !isLoginPage
    )

    return {
      forms,
      buttons,
      links,
      inputs,
      modals,
      isLoginPage,
      isMfaPage,
      requiresAuth,
    }
  }, baseUrl)
}
