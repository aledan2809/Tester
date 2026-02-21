/**
 * HTML Reporter
 * Generates a self-contained HTML test report with dashboard, screenshots, and details.
 */

import type { TestRun, ScenarioResult, TestCategory } from '../core/types'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'

export interface HtmlReportOptions {
  outputPath: string
  /** Include inline screenshots. Default: true */
  includeScreenshots?: boolean
  /** Report title. Default: "AI Tester Report" */
  title?: string
}

/**
 * Generate a self-contained HTML report from a TestRun and save to file.
 */
export function generateHtmlReport(testRun: TestRun, options: HtmlReportOptions): string {
  const title = options.title || 'AI Tester Report'
  const includeScreenshots = options.includeScreenshots !== false

  const html = buildHtml(testRun, title, includeScreenshots)

  const outputPath = resolve(options.outputPath)
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, html, 'utf-8')

  return outputPath
}

function buildHtml(run: TestRun, title: string, includeScreenshots: boolean): string {
  const s = run.summary
  const passRate = s.totalScenarios > 0 ? Math.round((s.passed / s.totalScenarios) * 100) : 100
  const scoreColor = s.overallScore >= 80 ? '#22c55e' : s.overallScore >= 50 ? '#f59e0b' : '#ef4444'
  const passColor = passRate >= 80 ? '#22c55e' : passRate >= 50 ? '#f59e0b' : '#ef4444'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — ${esc(run.url)}</title>
<style>
${CSS}
</style>
</head>
<body>
<div class="container">

<!-- Header -->
<header>
  <h1>${esc(title)}</h1>
  <p class="url">${esc(run.url)}</p>
  <p class="meta">
    ${new Date(run.startedAt).toLocaleString()} &middot;
    Duration: ${formatMs(run.durationMs)} &middot;
    ${s.totalScenarios} scenarios
  </p>
</header>

<!-- Score Cards -->
<div class="cards">
  <div class="card">
    <div class="card-value" style="color:${scoreColor}">${s.overallScore}</div>
    <div class="card-label">Score</div>
  </div>
  <div class="card">
    <div class="card-value" style="color:${passColor}">${passRate}%</div>
    <div class="card-label">Pass Rate</div>
  </div>
  <div class="card">
    <div class="card-value pass">${s.passed}</div>
    <div class="card-label">Passed</div>
  </div>
  <div class="card">
    <div class="card-value fail">${s.failed}</div>
    <div class="card-label">Failed</div>
  </div>
  <div class="card">
    <div class="card-value error">${s.errors}</div>
    <div class="card-label">Errors</div>
  </div>
  <div class="card">
    <div class="card-value">${s.skipped}</div>
    <div class="card-label">Skipped</div>
  </div>
</div>

<!-- Category Breakdown -->
<section>
  <h2>By Category</h2>
  <table>
    <thead><tr><th>Category</th><th>Passed</th><th>Failed</th><th>Total</th></tr></thead>
    <tbody>
${renderCategoryRows(s.byCategory)}
    </tbody>
  </table>
</section>

<!-- A11Y Summary -->
${s.a11yViolations.critical + s.a11yViolations.serious + s.a11yViolations.moderate + s.a11yViolations.minor > 0 ? `
<section>
  <h2>Accessibility Violations</h2>
  <div class="cards">
    <div class="card"><div class="card-value fail">${s.a11yViolations.critical}</div><div class="card-label">Critical</div></div>
    <div class="card"><div class="card-value" style="color:#f59e0b">${s.a11yViolations.serious}</div><div class="card-label">Serious</div></div>
    <div class="card"><div class="card-value">${s.a11yViolations.moderate}</div><div class="card-label">Moderate</div></div>
    <div class="card"><div class="card-value">${s.a11yViolations.minor}</div><div class="card-label">Minor</div></div>
  </div>
</section>` : ''}

<!-- Performance -->
${s.avgLoadTimeMs > 0 ? `
<section>
  <h2>Performance</h2>
  <p>Average load time: <strong>${formatMs(s.avgLoadTimeMs)}</strong></p>
  ${s.slowestPages.length > 0 ? `
  <table>
    <thead><tr><th>Page</th><th>Load Time</th></tr></thead>
    <tbody>
${s.slowestPages.map(p => `      <tr><td>${esc(p.url)}</td><td>${formatMs(p.loadTimeMs)}</td></tr>`).join('\n')}
    </tbody>
  </table>` : ''}
</section>` : ''}

<!-- Broken Links -->
${s.brokenLinks.length > 0 ? `
<section>
  <h2>Broken Links (${s.brokenLinks.length})</h2>
  <table>
    <thead><tr><th>URL</th><th>Status</th><th>Linked From</th></tr></thead>
    <tbody>
${s.brokenLinks.map(l => `      <tr><td>${esc(l.url)}</td><td class="fail">${l.statusCode}</td><td>${esc(l.linkedFrom)}</td></tr>`).join('\n')}
    </tbody>
  </table>
</section>` : ''}

<!-- Console Errors -->
${s.consoleErrors.filter(e => e.level === 'error').length > 0 ? `
<section>
  <h2>Console Errors (${s.consoleErrors.filter(e => e.level === 'error').length})</h2>
  <table>
    <thead><tr><th>Page</th><th>Message</th></tr></thead>
    <tbody>
${s.consoleErrors.filter(e => e.level === 'error').slice(0, 20).map(e => `      <tr><td>${esc(e.url)}</td><td><code>${esc(e.message)}</code></td></tr>`).join('\n')}
    </tbody>
  </table>
</section>` : ''}

<!-- Scenario Results -->
<section>
  <h2>Scenario Results</h2>
${run.scenarios.map(r => renderScenario(r, includeScreenshots)).join('\n')}
</section>

<footer>
  Generated by <strong>@aledan/tester</strong> on ${new Date().toISOString()}
</footer>

</div>
</body>
</html>`
}

function renderCategoryRows(byCategory: Record<TestCategory, { passed: number; failed: number }>): string {
  return Object.entries(byCategory)
    .filter(([, v]) => v.passed + v.failed > 0)
    .map(([cat, v]) => {
      const total = v.passed + v.failed
      return `      <tr><td>${cat}</td><td class="pass">${v.passed}</td><td class="fail">${v.failed}</td><td>${total}</td></tr>`
    })
    .join('\n')
}

function renderScenario(result: ScenarioResult, includeScreenshots: boolean): string {
  const statusClass = result.status === 'passed' ? 'pass' : result.status === 'failed' ? 'fail' : 'error'
  const statusIcon = result.status === 'passed' ? '&#10004;' : result.status === 'failed' ? '&#10008;' : '&#9888;'

  return `
  <details class="scenario ${statusClass}">
    <summary>
      <span class="status-icon ${statusClass}">${statusIcon}</span>
      <span class="scenario-name">${esc(result.scenario.name)}</span>
      <span class="badge ${statusClass}">${result.status}</span>
      <span class="duration">${formatMs(result.durationMs)}</span>
    </summary>
    <div class="scenario-body">
      <p><em>${esc(result.scenario.description)}</em></p>
      <p>Category: <strong>${result.scenario.category}</strong> | Priority: <strong>${result.scenario.priority}</strong></p>

      ${result.error ? `<div class="error-box">${esc(result.error)}</div>` : ''}

      ${result.steps.length > 0 ? `
      <h4>Steps</h4>
      <table>
        <thead><tr><th>#</th><th>Action</th><th>Description</th><th>Result</th><th>Time</th></tr></thead>
        <tbody>
${result.steps.map(step => {
  const sc = step.success ? 'pass' : 'fail'
  return `          <tr><td>${step.stepIndex}</td><td><code>${step.action}</code></td><td>${esc(step.description)}</td><td class="${sc}">${step.success ? 'OK' : esc(step.error || 'Failed')}</td><td>${formatMs(step.durationMs)}</td></tr>`
}).join('\n')}
        </tbody>
      </table>` : ''}

      ${result.assertions.length > 0 ? `
      <h4>Assertions</h4>
      <table>
        <thead><tr><th>Type</th><th>Description</th><th>Result</th><th>Actual</th></tr></thead>
        <tbody>
${result.assertions.map(a => {
  const sc = a.passed ? 'pass' : 'fail'
  return `          <tr><td><code>${a.assertion.type}</code></td><td>${esc(a.assertion.description)}</td><td class="${sc}">${a.passed ? 'PASS' : 'FAIL'}</td><td>${a.actual !== undefined ? esc(String(a.actual)) : '-'}</td></tr>`
}).join('\n')}
        </tbody>
      </table>` : ''}

      ${includeScreenshots && result.screenshots.length > 0 ? `
      <h4>Screenshots</h4>
      <div class="screenshots">
${result.screenshots.map(ss => `        <div class="screenshot"><p>${esc(ss.label)}</p><img src="data:image/png;base64,${ss.data}" alt="${esc(ss.label)}" loading="lazy" /></div>`).join('\n')}
      </div>` : ''}
    </div>
  </details>`
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.6; }
.container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
header { text-align: center; margin-bottom: 2rem; }
header h1 { font-size: 2rem; color: #f8fafc; }
header .url { color: #94a3b8; font-size: 1.1rem; margin-top: 0.25rem; }
header .meta { color: #64748b; font-size: 0.9rem; margin-top: 0.5rem; }

.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin: 1.5rem 0; }
.card { background: #1e293b; border-radius: 12px; padding: 1.25rem; text-align: center; }
.card-value { font-size: 2rem; font-weight: 700; }
.card-label { color: #94a3b8; font-size: 0.85rem; margin-top: 0.25rem; }

section { margin: 2rem 0; }
section h2 { font-size: 1.3rem; color: #f8fafc; margin-bottom: 1rem; border-bottom: 1px solid #334155; padding-bottom: 0.5rem; }

table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; }
th, td { padding: 0.6rem 0.8rem; text-align: left; border-bottom: 1px solid #1e293b; }
th { background: #1e293b; color: #94a3b8; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
td { font-size: 0.9rem; }
td code { background: #334155; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.85em; }

.pass { color: #22c55e; }
.fail { color: #ef4444; }
.error { color: #f59e0b; }

.scenario { background: #1e293b; border-radius: 8px; margin: 0.75rem 0; border-left: 4px solid #334155; }
.scenario.pass { border-left-color: #22c55e; }
.scenario.fail { border-left-color: #ef4444; }
.scenario.error { border-left-color: #f59e0b; }

.scenario summary { padding: 0.8rem 1rem; cursor: pointer; display: flex; align-items: center; gap: 0.75rem; list-style: none; }
.scenario summary::-webkit-details-marker { display: none; }
.status-icon { font-size: 1.1rem; }
.scenario-name { flex: 1; font-weight: 500; }
.badge { font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 12px; text-transform: uppercase; font-weight: 600; }
.badge.pass { background: rgba(34,197,94,0.15); color: #22c55e; }
.badge.fail { background: rgba(239,68,68,0.15); color: #ef4444; }
.badge.error { background: rgba(245,158,11,0.15); color: #f59e0b; }
.duration { color: #64748b; font-size: 0.85rem; }

.scenario-body { padding: 0.5rem 1rem 1rem; }
.scenario-body h4 { color: #cbd5e1; margin: 1rem 0 0.5rem; font-size: 0.95rem; }
.error-box { background: rgba(239,68,68,0.1); border: 1px solid #ef4444; border-radius: 6px; padding: 0.75rem; color: #fca5a5; margin: 0.5rem 0; font-family: monospace; font-size: 0.85rem; }

.screenshots { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; }
.screenshot { background: #0f172a; border-radius: 8px; overflow: hidden; }
.screenshot p { padding: 0.5rem; font-size: 0.85rem; color: #94a3b8; }
.screenshot img { width: 100%; display: block; }

footer { text-align: center; color: #475569; font-size: 0.8rem; margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #1e293b; }
`
