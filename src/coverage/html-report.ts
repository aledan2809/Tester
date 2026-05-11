/**
 * T-002 — HTML report generator for feature coverage matrix.
 *
 * Produces a self-contained HTML file (CSS inline, zero external deps).
 */

import type { FeatureCoverageReport } from './schema'

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#b91c1c',
  high: '#c2410c',
  medium: '#b45309',
  low: '#4d7c0f',
  info: '#6b7280',
}

const STATUS_BADGE: Record<string, { bg: string; label: string }> = {
  covered: { bg: '#16a34a', label: '✓ covered' },
  missing: { bg: '#dc2626', label: '✗ missing' },
  skipped: { bg: '#9ca3af', label: '· skipped' },
  unknown: { bg: '#d97706', label: '? unknown' },
}

function pct(r: number): string {
  return `${(r * 100).toFixed(1)}%`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function featureSection(rep: FeatureCoverageReport): string {
  const ratio = rep.stats.coverage_ratio
  const barColor = ratio >= 0.9 ? '#16a34a' : ratio >= 0.6 ? '#ca8a04' : '#dc2626'
  const rows = rep.ordered_scenarios
    .map((s) => {
      const badge = STATUS_BADGE[s.status] ?? STATUS_BADGE.unknown
      const sevColor = SEVERITY_COLOR[s.severity] ?? '#6b7280'
      const coveredBy = s.covered_by
        ? `<span style="color:#6b7280;font-size:0.8em">${esc(s.covered_by)}</span>`
        : s.status === 'missing'
          ? `<span style="color:#dc2626;font-size:0.8em">add coverage under ${esc(s.category ?? '(no-category)')}</span>`
          : ''
      return `<tr>
        <td style="padding:4px 8px;font-family:monospace">${esc(s.id)}</td>
        <td style="padding:4px 8px"><span style="background:${badge.bg};color:#fff;padding:2px 6px;border-radius:3px;font-size:0.8em">${badge.label}</span></td>
        <td style="padding:4px 8px;color:${sevColor};font-weight:600;font-size:0.85em">${esc(s.severity.toUpperCase())}</td>
        <td style="padding:4px 8px">${esc(s.name)}</td>
        <td style="padding:4px 8px">${coveredBy}</td>
      </tr>`
    })
    .join('\n')

  return `<section style="margin:24px 0;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
  <div style="background:#f9fafb;padding:12px 16px;border-bottom:1px solid #e5e7eb">
    <span style="font-weight:700;font-size:1.1em">${esc(rep.feature)}</span>
    <span style="color:#6b7280;margin-left:8px;font-size:0.9em">owner: ${esc(rep.owner)}</span>
    <span style="float:right;font-size:0.85em;color:#374151">${rep.stats.covered}/${rep.stats.total} &nbsp;
      <strong style="color:${barColor}">${pct(ratio)}</strong>
    </span>
  </div>
  <div style="padding:8px 16px 4px;background:#fff">
    <div style="height:8px;background:#e5e7eb;border-radius:4px;margin-bottom:8px">
      <div style="height:8px;background:${barColor};border-radius:4px;width:${pct(ratio)}"></div>
    </div>
    <span style="font-size:0.8em;color:#6b7280">
      missing: ${rep.stats.missing}
      (crit=${rep.stats.critical_missing}, high=${rep.stats.high_missing}, med=${rep.stats.medium_missing})
      &nbsp;·&nbsp; skipped=${rep.stats.skipped}
    </span>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:0.9em">
    <thead>
      <tr style="background:#f3f4f6;font-size:0.8em;color:#6b7280">
        <th style="padding:4px 8px;text-align:left">ID</th>
        <th style="padding:4px 8px;text-align:left">Status</th>
        <th style="padding:4px 8px;text-align:left">Severity</th>
        <th style="padding:4px 8px;text-align:left">Scenario</th>
        <th style="padding:4px 8px;text-align:left">Covered by</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</section>`
}

export interface HtmlReportOptions {
  title?: string
  failUnder?: number
}

export function generateHtmlReport(
  reports: FeatureCoverageReport[],
  opts: HtmlReportOptions = {},
): string {
  const title = opts.title ?? 'Feature Coverage Report'
  const aggTotal = reports.reduce((s, r) => s + r.stats.total - r.stats.skipped, 0)
  const aggCovered = reports.reduce((s, r) => s + r.stats.covered, 0)
  const aggRatio = aggTotal > 0 ? aggCovered / aggTotal : 1
  const aggCritMissing = reports.reduce((s, r) => s + r.stats.critical_missing, 0)
  const aggHighMissing = reports.reduce((s, r) => s + r.stats.high_missing, 0)
  const barColor = aggRatio >= 0.9 ? '#16a34a' : aggRatio >= 0.6 ? '#ca8a04' : '#dc2626'

  const thresholdRow =
    opts.failUnder !== undefined && opts.failUnder > 0
      ? `<tr><td>Threshold (--fail-under)</td><td><strong style="color:${aggRatio >= opts.failUnder ? '#16a34a' : '#dc2626'}">${pct(opts.failUnder)} → ${aggRatio >= opts.failUnder ? 'PASS' : 'FAIL'}</strong></td></tr>`
      : ''

  const featureSections = reports.map(featureSection).join('\n')

  const ts = new Date().toISOString()

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
</head>
<body style="font-family:system-ui,sans-serif;max-width:1000px;margin:0 auto;padding:24px;color:#111827">
  <h1 style="font-size:1.5em;margin-bottom:4px">${esc(title)}</h1>
  <p style="color:#6b7280;font-size:0.85em;margin-top:0">Generated ${ts}</p>

  <table style="border-collapse:collapse;font-size:0.9em;margin-bottom:24px">
    <tr><td style="padding:3px 12px 3px 0;color:#6b7280">Features</td><td><strong>${reports.length}</strong></td></tr>
    <tr><td style="padding:3px 12px 3px 0;color:#6b7280">Coverage</td>
      <td>
        <div style="display:inline-block;width:120px;height:8px;background:#e5e7eb;border-radius:4px;vertical-align:middle;margin-right:8px">
          <div style="height:8px;background:${barColor};border-radius:4px;width:${pct(aggRatio)}"></div>
        </div>
        <strong style="color:${barColor}">${pct(aggRatio)}</strong>
        <span style="color:#6b7280"> (${aggCovered}/${aggTotal})</span>
      </td>
    </tr>
    <tr><td style="padding:3px 12px 3px 0;color:#6b7280">Critical missing</td><td style="color:${aggCritMissing > 0 ? '#dc2626' : '#16a34a'}">${aggCritMissing}</td></tr>
    <tr><td style="padding:3px 12px 3px 0;color:#6b7280">High missing</td><td style="color:${aggHighMissing > 0 ? '#c2410c' : '#16a34a'}">${aggHighMissing}</td></tr>
    ${thresholdRow}
  </table>

  ${featureSections}
</body>
</html>`
}
