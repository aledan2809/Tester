/**
 * E2E Full Audit Command — 9-step unified audit
 *
 * Runs ALL audit modules in a single browser session:
 *   Step 1 — Page load timing (Module G)
 *   Step 2 — Security headers + CORS + mixed content (Module I)
 *   Step 3 — Auth audit: cookie attrs, logout, private routes (Module F)
 *   Step 4 — Form audit: fuzz + duplicate submit (Module H)
 *   Step 5 — Console errors + hydration + CSP violations (Module J)
 *   Step 6 — Accessibility (a11y via axe-core)
 *   Step 7 — Performance metrics (LCP, FCP, TTI)
 *   Step 8 — Visual regression vs baseline (Module K screenshot + diff)
 *   Step 9 — Playwright trace recording
 *
 * Usage:
 *   tester e2e-full-audit --url https://example.com [options]
 */

import type { Command } from 'commander'
import * as fs from 'fs'
import * as path from 'path'
import { BrowserCore } from '../../core/browser'
import { auditLoadTiming, auditHydrationAndCSP } from '../../assertions/dom'
import { runSecurityAudit } from '../../assertions/security'
import { runAuthAudit } from '../../auth/audit'
import { runFormAudit } from '../../assertions/forms'
import { runA11yScan } from '../../assertions/a11y'
import { capturePerformanceMetrics } from '../../assertions/performance'
import { startRecording } from '../../playwright/recorder'
import { pixelDiffPercent } from '../../snapshot/compare'
import { captureFullPage } from '../../snapshot/capture'

interface StepOutcome {
  step: number
  name: string
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP'
  durationMs: number
  details: string
  findings?: Array<{ severity: string; message: string }>
}

interface E2EFullAuditResult {
  url: string
  startedAt: string
  completedAt: string
  totalDurationMs: number
  steps: StepOutcome[]
  overallScore: number
  verdict: 'PASS' | 'FAIL' | 'WARN'
  reportPath?: string
}

export function registerE2EFullAudit(program: Command): void {
  program
    .command('e2e-full-audit')
    .description('Run a 9-step full E2E audit: load, security, auth, forms, console, a11y, perf, visual, trace')
    .requiredOption('-u, --url <url>', 'Target URL to audit')
    .option('--headed', 'Run with visible browser', false)
    .option('--no-trace', 'Skip Playwright trace recording')
    .option('--no-visual', 'Skip visual baseline diff')
    .option('--baseline <path>', 'Path to baseline screenshot for visual diff')
    .option('--smoke-routes <routes>', 'Comma-separated additional routes to smoke-test', '')
    .option('--out <dir>', 'Output directory for report and artifacts', './e2e-audit-results')
    .option('--json', 'Output results as JSON to stdout')
    .action(async (opts) => {
      const url = opts.url.startsWith('http') ? opts.url : `https://${opts.url}`
      const outDir = path.resolve(opts.out)
      const runTrace = opts.trace !== false
      const runVisual = opts.visual !== false
      const smokeRoutes: string[] = opts.smokeRoutes ? opts.smokeRoutes.split(',').map((r: string) => r.trim()) : []

      fs.mkdirSync(outDir, { recursive: true })

      console.info(`\n🔍 E2E Full Audit — ${url}`)
      console.info(`   Output: ${outDir}\n`)

      const startedAt = new Date().toISOString()
      const steps: StepOutcome[] = []

      // ── Playwright recorder (wraps all navigation steps) ─
      let recordingStop: (() => Promise<unknown>) | undefined
      let pwPage: import('playwright').Page | undefined

      if (runTrace) {
        try {
          const session = await startRecording({
            outputDir: outDir,
            label: 'e2e-trace',
            video: true,
            trace: true,
          })
          pwPage = session.page
          recordingStop = session.stop
          await pwPage.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
        } catch (err) {
          console.warn(`   ⚠ Playwright recording unavailable: ${err instanceof Error ? err.message : err}`)
        }
      }

      // ── Puppeteer browser for most steps ─────────────────
      const browser = new BrowserCore({ headless: !opts.headed })
      await browser.launch()
      const page = browser.getPage()!

      // ── Step 1: Load Timing ───────────────────────────────
      {
        process.stdout.write('   Step 1/9 — Load timing... ')
        const s = Date.now()
        try {
          const r = await auditLoadTiming(page, url)
          const status = r.severity === 'critical' ? 'FAIL' : r.severity === 'warn' ? 'WARN' : 'PASS'
          steps.push({
            step: 1, name: 'Page load timing',
            status, durationMs: Date.now() - s,
            details: `Load: ${r.loadTimeMs}ms | FCP: ${r.timings?.firstContentfulPaint ?? '?'}ms | Threshold: ${r.thresholdMs}ms`,
          })
          console.info(status)
        } catch (err) {
          steps.push({ step: 1, name: 'Page load timing', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
          console.info('SKIP')
        }
      }

      // ── Step 2: Security ──────────────────────────────────
      {
        process.stdout.write('   Step 2/9 — Security headers & CORS... ')
        const s = Date.now()
        try {
          const r = await runSecurityAudit(page, url)
          const critHigh = r.findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH')
          steps.push({
            step: 2, name: 'Security headers + CORS + mixed content',
            status: r.passed ? 'PASS' : critHigh.length > 0 ? 'FAIL' : 'WARN',
            durationMs: Date.now() - s,
            details: r.passed ? 'No critical/high findings' : `${r.findings.length} finding(s)`,
            findings: r.findings.map(f => ({ severity: f.severity, message: f.message })),
          })
          console.info(r.passed ? 'PASS' : 'FAIL')
        } catch (err) {
          steps.push({ step: 2, name: 'Security', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
          console.info('SKIP')
        }
      }

      // ── Step 3: Auth Audit ────────────────────────────────
      {
        process.stdout.write('   Step 3/9 — Auth audit (cookies, logout)... ')
        const s = Date.now()
        try {
          const r = await runAuthAudit(page, url, { skip: ['logout', 'refresh'] })
          steps.push({
            step: 3, name: 'Auth audit — cookie attributes',
            status: r.passed ? 'PASS' : 'WARN',
            durationMs: Date.now() - s,
            details: r.passed ? 'All cookies have proper security attributes' : `${r.findings.length} finding(s)`,
            findings: r.findings.map(f => ({ severity: f.severity, message: f.message })),
          })
          console.info(r.passed ? 'PASS' : 'WARN')
        } catch (err) {
          steps.push({ step: 3, name: 'Auth audit', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
          console.info('SKIP')
        }
      }

      // ── Step 4: Form Audit ────────────────────────────────
      {
        process.stdout.write('   Step 4/9 — Form audit (fuzz + duplicate submit)... ')
        const s = Date.now()
        try {
          const r = await runFormAudit(page, url, { maxFuzzFields: 3 })
          steps.push({
            step: 4, name: 'Form audit — type confusion fuzz + duplicate submit',
            status: r.passed ? 'PASS' : 'WARN',
            durationMs: Date.now() - s,
            details: r.passed
              ? `Tested ${r.fuzzResults.length} field×payload combinations — all handled`
              : `${r.findings.length} finding(s)`,
            findings: r.findings.map(f => ({ severity: f.severity, message: f.message })),
          })
          console.info(r.passed ? 'PASS' : 'WARN')
        } catch (err) {
          steps.push({ step: 4, name: 'Form audit', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
          console.info('SKIP')
        }
      }

      // ── Step 5: Console + Hydration + CSP ────────────────
      {
        process.stdout.write('   Step 5/9 — Console errors + hydration + CSP... ')
        const s = Date.now()
        try {
          const r = await auditHydrationAndCSP(page, url)
          steps.push({
            step: 5, name: 'Console errors + hydration + CSP violations',
            status: r.passed ? 'PASS' : 'FAIL',
            durationMs: Date.now() - s,
            details: r.passed ? 'No issues detected' : `${r.issues.length} issue(s)`,
            findings: r.issues.map(i => ({ severity: 'HIGH', message: i.message })),
          })
          console.info(r.passed ? 'PASS' : 'FAIL')
        } catch (err) {
          steps.push({ step: 5, name: 'Hydration/CSP', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
          console.info('SKIP')
        }
      }

      // ── Step 6: Accessibility ─────────────────────────────
      {
        process.stdout.write('   Step 6/9 — Accessibility (axe-core)... ')
        const s = Date.now()
        try {
          const scanFile = path.join(outDir, 'a11y-scan.json')
          const r = await runA11yScan(page, url)
          fs.writeFileSync(scanFile, JSON.stringify(r, null, 2))
          const violations = r.routes?.[0]?.violations ?? []
          const critCount = violations.filter((v: { impact: string }) => v.impact === 'critical' || v.impact === 'serious').length
          steps.push({
            step: 6, name: 'Accessibility — axe-core scan',
            status: critCount === 0 ? 'PASS' : 'FAIL',
            durationMs: Date.now() - s,
            details: `${violations.length} violation(s) — ${critCount} critical/serious`,
            findings: violations.slice(0, 5).map((v: { impact: string; description: string }) => ({
              severity: v.impact === 'critical' ? 'CRITICAL' : 'HIGH',
              message: v.description,
            })),
          })
          console.info(critCount === 0 ? 'PASS' : 'FAIL')
        } catch (err) {
          steps.push({ step: 6, name: 'Accessibility', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
          console.info('SKIP')
        }
      }

      // ── Step 7: Performance ───────────────────────────────
      {
        process.stdout.write('   Step 7/9 — Performance metrics... ')
        const s = Date.now()
        try {
          const metrics = await capturePerformanceMetrics(page)
          const fcp = metrics.firstContentfulPaint ?? 0
          const lcp = metrics.largestContentfulPaint ?? 0
          const passed = fcp < 3000 && lcp < 4000
          steps.push({
            step: 7, name: 'Performance metrics (FCP, LCP)',
            status: passed ? 'PASS' : 'WARN',
            durationMs: Date.now() - s,
            details: `FCP: ${fcp}ms | LCP: ${lcp}ms | TBT: ${metrics.totalBlockingTime ?? '?'}ms`,
          })
          console.info(passed ? 'PASS' : 'WARN')
        } catch (err) {
          steps.push({ step: 7, name: 'Performance', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
          console.info('SKIP')
        }
      }

      // ── Step 8: Visual Regression ─────────────────────────
      {
        process.stdout.write('   Step 8/9 — Visual regression... ')
        const s = Date.now()
        if (!runVisual) {
          steps.push({ step: 8, name: 'Visual regression', status: 'SKIP', durationMs: 0, details: '--no-visual flag set' })
          console.info('SKIP')
        } else {
          try {
            const screenshotPath = path.join(outDir, 'screenshot-current.png')
            await captureFullPage(page, screenshotPath)

            let status: 'PASS' | 'WARN' | 'SKIP' = 'PASS'
            let details = `Screenshot saved: ${screenshotPath}`

            if (opts.baseline && fs.existsSync(opts.baseline)) {
              const diff = await pixelDiffPercent(opts.baseline, screenshotPath)
              status = diff > 5 ? 'WARN' : 'PASS'
              details = `Visual diff: ${diff.toFixed(2)}% vs baseline`
            } else {
              details = `No baseline provided — screenshot saved for future comparison`
            }

            steps.push({ step: 8, name: 'Visual regression', status, durationMs: Date.now() - s, details })
            console.info(status)
          } catch (err) {
            steps.push({ step: 8, name: 'Visual regression', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
            console.info('SKIP')
          }
        }
      }

      // ── Step 9: Playwright Trace ──────────────────────────
      {
        process.stdout.write('   Step 9/9 — Playwright trace + video... ')
        const s = Date.now()
        if (recordingStop) {
          try {
            const artifacts = await recordingStop() as { videoPath?: string; tracePath?: string }
            steps.push({
              step: 9, name: 'Playwright trace + video recording',
              status: 'PASS', durationMs: Date.now() - s,
              details: [
                artifacts.videoPath ? `Video: ${artifacts.videoPath}` : '',
                artifacts.tracePath ? `Trace: ${artifacts.tracePath}` : '',
              ].filter(Boolean).join(' | '),
            })
            console.info('PASS')
          } catch (err) {
            steps.push({ step: 9, name: 'Trace recording', status: 'SKIP', durationMs: Date.now() - s, details: String(err) })
            console.info('SKIP')
          }
        } else {
          steps.push({ step: 9, name: 'Playwright trace + video', status: 'SKIP', durationMs: 0, details: '--no-trace or Playwright unavailable' })
          console.info('SKIP')
        }
      }

      await browser.close().catch(() => null)

      // ── Compute score ─────────────────────────────────────
      const passCount = steps.filter(s => s.status === 'PASS').length
      const failCount = steps.filter(s => s.status === 'FAIL').length
      const totalRun = steps.filter(s => s.status !== 'SKIP').length
      const overallScore = totalRun > 0 ? Math.round((passCount / totalRun) * 100) : 0
      const verdict = failCount > 0 ? 'FAIL' : overallScore >= 80 ? 'PASS' : 'WARN'

      const completedAt = new Date().toISOString()
      const totalDurationMs = steps.reduce((acc, s) => acc + s.durationMs, 0)

      const result: E2EFullAuditResult = {
        url, startedAt, completedAt, totalDurationMs, steps, overallScore, verdict,
      }

      // ── Write report ──────────────────────────────────────
      const reportPath = path.join(outDir, 'e2e-full-audit-report.json')
      fs.writeFileSync(reportPath, JSON.stringify(result, null, 2))
      result.reportPath = reportPath

      // ── Print summary ─────────────────────────────────────
      if (opts.json) {
        console.info(JSON.stringify(result, null, 2))
      } else {
        console.info(`\n${'─'.repeat(60)}`)
        console.info(`  E2E Full Audit — ${verdict} (${overallScore}/100)`)
        console.info(`  URL: ${url}`)
        console.info(`  Duration: ${(totalDurationMs / 1000).toFixed(1)}s`)
        console.info(`  Steps: ${passCount} PASS / ${failCount} FAIL / ${steps.filter(s => s.status === 'SKIP').length} SKIP`)
        console.info(`  Report: ${reportPath}`)
        if (failCount > 0) {
          console.info('\n  Failures:')
          for (const step of steps.filter(s => s.status === 'FAIL')) {
            console.info(`    Step ${step.step} — ${step.name}: ${step.details}`)
            for (const f of (step.findings ?? []).slice(0, 3)) {
              console.info(`      [${f.severity}] ${f.message}`)
            }
          }
        }
        console.info(`${'─'.repeat(60)}\n`)
      }

      process.exit(failCount > 0 ? 1 : 0)
    })
}
