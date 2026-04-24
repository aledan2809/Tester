/**
 * T-009 — Runtime a11y scan writer.
 *
 * Iterates a SiteMap, navigates each page, runs axe-core (via the
 * existing runA11yScan helper), aggregates violations into the
 * RouteScan[] shape consumed by `tester a11y --check --from`.
 *
 * Exists as a standalone module so it can be imported from:
 *   - executor.ts (inside `tester run`, optional tail stage)
 *   - Master mesh pipelines
 *   - custom runners that already have a BrowserCore instance
 */

import { runA11yScan } from '../assertions/a11y'
import type { A11yImpact, RouteScan, ViolationFingerprint } from './baseline'

type PuppeteerPage = import('puppeteer').Page

interface PageTarget {
  url: string
  /** Optional alias used as RouteScan.route; defaults to URL pathname. */
  route?: string
}

export interface RunAllA11yOptions {
  /** When set, Stops scanning after this many pages; useful on huge sitemaps. */
  maxPages?: number
  /** Extra settle ms after navigation before axe runs. */
  settleMs?: number
  /** Injection hook called after navigation (e.g. dismiss modals). */
  preCapture?: (page: PuppeteerPage) => Promise<void>
  /** Filter — return false to skip a target. */
  filter?: (target: PageTarget) => boolean
}

interface BrowserCoreLike {
  goto(url: string, timeout?: number): Promise<number>
  getPage(): PuppeteerPage | null
}

function toRoute(url: string, alias?: string): string {
  if (alias) return alias
  try {
    const u = new URL(url)
    return u.pathname + u.search
  } catch {
    return url
  }
}

function impactOf(raw: string | undefined): A11yImpact {
  const s = (raw || '').toLowerCase()
  if (s === 'critical' || s === 'serious' || s === 'moderate' || s === 'minor') return s
  return 'minor'
}

/**
 * Walk the targets, capture axe violations per target, return
 * RouteScan[]. Errors on individual pages are swallowed and surfaced
 * as empty-violation entries so the batch completes.
 */
export async function runAllA11y(
  browser: BrowserCoreLike,
  targets: PageTarget[],
  opts: RunAllA11yOptions = {},
): Promise<RouteScan[]> {
  const limit = opts.maxPages && opts.maxPages > 0 ? Math.min(opts.maxPages, targets.length) : targets.length
  const scans: RouteScan[] = []
  for (let i = 0; i < limit; i++) {
    const t = targets[i]
    if (opts.filter && !opts.filter(t)) continue
    try {
      await browser.goto(t.url)
      const page = browser.getPage()
      if (!page) continue
      if (opts.preCapture) await opts.preCapture(page)
      if (opts.settleMs && opts.settleMs > 0) {
        await new Promise((r) => setTimeout(r, opts.settleMs))
      }
      const summary = await runA11yScan(page)
      // Collapse summary.violations (array) into ViolationFingerprint[] grouped by id+impact.
      const byKey: Record<string, ViolationFingerprint> = {}
      for (const v of summary.violations) {
        const k = `${v.id}::${v.impact}`
        if (!byKey[k]) byKey[k] = { id: v.id, impact: impactOf(v.impact), count: 0 }
        byKey[k].count += v.nodes
      }
      scans.push({ route: toRoute(t.url, t.route), violations: Object.values(byKey) })
    } catch {
      scans.push({ route: toRoute(t.url, t.route), violations: [] })
    }
  }
  return scans
}

/**
 * Shape matching what `tester a11y --check --from <file>` expects.
 */
export interface A11yScanFile {
  project?: string
  scans: RouteScan[]
  generatedAt?: string
}

export async function writeA11yScanFile(
  path: string,
  scans: RouteScan[],
  project?: string,
): Promise<string> {
  const payload: A11yScanFile = {
    project,
    scans,
    generatedAt: new Date().toISOString(),
  }
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const pathMod = await import('node:path')
  mkdirSync(pathMod.dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8')
  return path
}
