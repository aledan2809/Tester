/**
 * Site Map Builder
 * Transforms crawl results into a structured SiteMap.
 */

import type { SiteMap, DiscoveredPage } from '../core/types'

export function buildSiteMap(
  baseUrl: string,
  pages: DiscoveredPage[],
  crawlDurationMs: number,
): SiteMap {
  return {
    baseUrl,
    pages,
    totalPages: pages.length,
    crawlDurationMs,
  }
}

/** Print a human-readable summary of the site map */
export function formatSiteMapSummary(siteMap: SiteMap): string {
  const lines: string[] = []

  lines.push(`Site Map: ${siteMap.baseUrl}`)
  lines.push(`Pages: ${siteMap.totalPages} | Crawl time: ${(siteMap.crawlDurationMs / 1000).toFixed(1)}s`)
  lines.push('')

  // Stats
  const totalForms = siteMap.pages.reduce((s, p) => s + p.forms.length, 0)
  const totalButtons = siteMap.pages.reduce((s, p) => s + p.buttons.length, 0)
  const totalLinks = siteMap.pages.reduce((s, p) => s + p.links.length, 0)
  const totalInputs = siteMap.pages.reduce((s, p) => s + p.inputs.length, 0)
  const loginPages = siteMap.pages.filter(p => p.isLoginPage).length
  const mfaPages = siteMap.pages.filter(p => p.isMfaPage).length
  const authPages = siteMap.pages.filter(p => p.requiresAuth).length
  const errorPages = siteMap.pages.filter(p => p.hasConsoleErrors).length
  const avgLoadTime = siteMap.pages.length > 0
    ? (siteMap.pages.reduce((s, p) => s + p.loadTimeMs, 0) / siteMap.pages.length)
    : 0

  lines.push(`Interactive elements:`)
  lines.push(`  Forms: ${totalForms} | Buttons: ${totalButtons} | Links: ${totalLinks} | Inputs: ${totalInputs}`)
  lines.push(``)
  lines.push(`Auth detection:`)
  lines.push(`  Login pages: ${loginPages} | MFA pages: ${mfaPages} | Auth-required: ${authPages}`)
  lines.push(``)
  lines.push(`Health:`)
  lines.push(`  Console errors on: ${errorPages} pages | Avg load: ${avgLoadTime.toFixed(0)}ms`)
  lines.push(``)

  // Page list
  lines.push(`Pages:`)
  for (const page of siteMap.pages) {
    const flags: string[] = []
    if (page.isLoginPage) flags.push('LOGIN')
    if (page.isMfaPage) flags.push('MFA')
    if (page.requiresAuth) flags.push('AUTH')
    if (page.hasConsoleErrors) flags.push('ERRORS')
    if (page.statusCode >= 400) flags.push(`HTTP ${page.statusCode}`)

    const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : ''
    const formStr = page.forms.length > 0 ? ` (${page.forms.length} forms)` : ''
    lines.push(`  [${page.depth}] ${page.url} — ${page.title || '(no title)'}${formStr}${flagStr}`)
  }

  return lines.join('\n')
}
