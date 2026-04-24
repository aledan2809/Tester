/**
 * T-008 — HTML diff report generator.
 *
 * Given a list of CompareResult entries (each with diffPngBase64 when
 * opts.returnDiffPng was set), emit a single-file HTML report with
 * side-by-side baseline / current / diff images per route. Used by
 * `tester snapshot --compare --html <out.html>`.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { CompareResult } from './compare'
import type { BaselineStore } from './store'

export interface HtmlReportOptions {
  project: string
  baselineStore: BaselineStore
  results: CompareResult[]
  /** Absolute path where the HTML file should be written. */
  outputPath: string
  /** Include full-size base64 images inline? Default true. */
  inlineImages?: boolean
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  )
}

function statusBadge(r: CompareResult): string {
  if (r.noBaseline) return '<span class="badge none">NO BASELINE</span>'
  if (r.error) return '<span class="badge error">ERROR</span>'
  if (r.passed) return '<span class="badge pass">PASS</span>'
  return '<span class="badge fail">FAIL</span>'
}

export async function writeHtmlReport(opts: HtmlReportOptions): Promise<string> {
  const { project, baselineStore, results, outputPath } = opts
  const inline = opts.inlineImages !== false
  const rows: string[] = []
  for (const r of results) {
    let baselineImg = ''
    if (inline && !r.noBaseline) {
      const baselineBuf = await baselineStore.get(project, r.route)
      if (baselineBuf) {
        baselineImg = `data:image/png;base64,${baselineBuf.toString('base64')}`
      }
    }
    const diffImg = r.diffPngBase64 ? `data:image/png;base64,${r.diffPngBase64}` : ''
    rows.push(
      `<tr>
        <td class="route">${escapeHtml(r.route)}</td>
        <td class="status">${statusBadge(r)}</td>
        <td class="diff-pct">${r.diffPercent !== undefined ? `${r.diffPercent.toFixed(2)}%` : '—'}</td>
        <td class="masks">${r.masksApplied ?? 0}</td>
        <td class="img">${baselineImg ? `<a href="${baselineImg}" target="_blank"><img src="${baselineImg}" alt="baseline"/></a>` : '<em>no baseline</em>'}</td>
        <td class="img">${diffImg ? `<a href="${diffImg}" target="_blank"><img src="${diffImg}" alt="diff"/></a>` : '—'}</td>
        <td class="error">${r.error ? escapeHtml(r.error) : ''}</td>
      </tr>`,
    )
  }
  const totalsPass = results.filter((r) => r.passed).length
  const totalsFail = results.filter((r) => !r.passed && !r.noBaseline).length
  const totalsNone = results.filter((r) => r.noBaseline).length
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Visual diff — ${escapeHtml(project)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 1400px; margin: 0 auto; padding: 24px; }
  h1 { margin: 0 0 8px 0; }
  .meta { color: #666; margin-bottom: 20px; }
  .totals { display: flex; gap: 12px; margin-bottom: 20px; }
  .totals > div { padding: 8px 16px; border-radius: 6px; background: #f5f5f5; }
  .totals .n { font-weight: 600; margin-left: 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #eee; padding: 8px; text-align: left; vertical-align: top; }
  th { background: #fafafa; font-weight: 600; position: sticky; top: 0; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .badge.pass { background: #d1fae5; color: #065f46; }
  .badge.fail { background: #fee2e2; color: #991b1b; }
  .badge.error { background: #fde68a; color: #92400e; }
  .badge.none { background: #e5e7eb; color: #374151; }
  .img img { max-width: 360px; max-height: 240px; border: 1px solid #eee; }
  .route { font-family: ui-monospace, Menlo, monospace; font-size: 13px; }
  .diff-pct { font-family: ui-monospace; text-align: right; }
  .error { color: #991b1b; font-size: 12px; max-width: 240px; white-space: pre-wrap; }
</style>
</head>
<body>
  <h1>Visual diff — ${escapeHtml(project)}</h1>
  <div class="meta">Generated ${new Date().toISOString()} · ${results.length} route(s)</div>
  <div class="totals">
    <div>PASS <span class="n">${totalsPass}</span></div>
    <div>FAIL <span class="n">${totalsFail}</span></div>
    <div>NO BASELINE <span class="n">${totalsNone}</span></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Route</th>
        <th>Status</th>
        <th>Diff%</th>
        <th>Masks</th>
        <th>Baseline</th>
        <th>Diff</th>
        <th>Error</th>
      </tr>
    </thead>
    <tbody>
      ${rows.join('\n')}
    </tbody>
  </table>
</body>
</html>
`
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, html, 'utf8')
  return outputPath
}
