/**
 * T-009 — A11y diff HTML report.
 *
 * Renders a single-file HTML document summarizing a DiffReport + optional
 * BudgetRouteResult[]. Shows per-route tables for new-or-worse, fixed,
 * suppressed, and budget breaches. No image embedding (a11y diffs are
 * structural; the visual diff belongs in T-008's html-report).
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { DiffReport } from './baseline'
import type { BudgetRouteResult } from './budget'

export interface A11yHtmlOptions {
  project?: string
  diff: DiffReport
  budget?: BudgetRouteResult[]
  outputPath: string
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  )
}

export function renderA11yHtml(diff: DiffReport, budget: BudgetRouteResult[] | undefined, project?: string): string {
  const proj = project || diff.project
  const rows: string[] = []
  for (const r of diff.routes) {
    const worse = r.new_or_worse.map(
      (e) => `<li class="sev-${e.impact}"><code>${esc(e.id)}</code> [${e.impact}] ${e.baseline} → ${e.current} (+${e.delta})</li>`,
    )
    const fixed = r.fixed.map((e) => `<li><code>${esc(e.id)}</code> [${e.impact}] ${e.baseline} → 0 ✓</li>`)
    const sup = r.suppressed.map(
      (e) => `<li class="suppressed"><code>${esc(e.id)}</code> [${e.impact}] suppressed until ${esc(e.suppressed_until || '?')}</li>`,
    )
    rows.push(
      `<div class="route">
        <h3>${esc(r.route)}</h3>
        ${r.new_or_worse.length > 0 ? `<section><h4>New / worse</h4><ul>${worse.join('')}</ul></section>` : ''}
        ${r.fixed.length > 0 ? `<section><h4>Fixed</h4><ul>${fixed.join('')}</ul></section>` : ''}
        ${r.suppressed.length > 0 ? `<section><h4>Suppressed (time-boxed)</h4><ul>${sup.join('')}</ul></section>` : ''}
        ${r.new_or_worse.length + r.fixed.length + r.suppressed.length === 0 ? '<p class="nil">No changes.</p>' : ''}
      </div>`,
    )
  }
  const budgetBlock = budget && budget.length > 0
    ? `<h2>Budget</h2>
      <table>
        <thead>
          <tr><th>Route</th><th>Status</th><th>Critical</th><th>Serious</th><th>Moderate</th><th>Minor</th><th>Breaches</th></tr>
        </thead>
        <tbody>
          ${budget.map((b) => `
            <tr class="${b.passed ? 'pass' : 'fail'}">
              <td><code>${esc(b.route)}</code></td>
              <td>${b.passed ? '✓ PASS' : '✗ FAIL'}</td>
              <td>${b.counts.critical} / ${b.budget.critical === Infinity ? '∞' : b.budget.critical}</td>
              <td>${b.counts.serious} / ${b.budget.serious === Infinity ? '∞' : b.budget.serious}</td>
              <td>${b.counts.moderate} / ${b.budget.moderate === Infinity ? '∞' : b.budget.moderate}</td>
              <td>${b.counts.minor} / ${b.budget.minor === Infinity ? '∞' : b.budget.minor}</td>
              <td>${b.breaches.join(', ') || '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>A11y diff — ${esc(proj)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 1100px; margin: 0 auto; padding: 24px; }
  h1 { margin: 0 0 4px 0; }
  .meta { color: #666; margin-bottom: 24px; }
  .route { border: 1px solid #eee; border-radius: 6px; padding: 16px; margin-bottom: 16px; }
  .route h3 { margin-top: 0; font-family: ui-monospace, Menlo, monospace; font-size: 14px; }
  .route h4 { margin: 14px 0 4px 0; font-size: 13px; color: #444; }
  .route ul { margin: 4px 0 0 20px; padding: 0; }
  .route li { margin-bottom: 4px; font-size: 13px; }
  li.sev-critical { color: #7f1d1d; font-weight: 600; }
  li.sev-serious { color: #991b1b; }
  li.sev-moderate { color: #92400e; }
  li.sev-minor { color: #374151; }
  li.suppressed { color: #6b7280; font-style: italic; }
  .nil { color: #999; font-style: italic; margin: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border-bottom: 1px solid #eee; padding: 6px 8px; text-align: left; font-size: 13px; }
  tr.pass { background: #f0fdf4; }
  tr.fail { background: #fef2f2; }
  .regression-banner { background: #fee2e2; color: #991b1b; padding: 12px; border-radius: 6px; font-weight: 600; margin-bottom: 20px; }
  .ok-banner { background: #d1fae5; color: #065f46; padding: 12px; border-radius: 6px; font-weight: 600; margin-bottom: 20px; }
</style>
</head>
<body>
  <h1>A11y diff — ${esc(proj)}</h1>
  <div class="meta">Generated ${new Date().toISOString()} · ${diff.routes.length} route(s)</div>
  ${diff.regression ? '<div class="regression-banner">✗ Regression: new critical or serious violations</div>' : '<div class="ok-banner">✓ No a11y regression detected</div>'}
  <h2>Per-route changes</h2>
  ${rows.join('\n')}
  ${budgetBlock}
</body>
</html>
`
}

export async function writeA11yHtmlReport(opts: A11yHtmlOptions): Promise<string> {
  const html = renderA11yHtml(opts.diff, opts.budget, opts.project)
  fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true })
  fs.writeFileSync(opts.outputPath, html, 'utf8')
  return opts.outputPath
}
