/**
 * Tester HTTP Server
 * Wraps AITester in an Express API for remote invocation.
 * Run with: tsx src/server/index.ts  (dev)
 *           node dist/server/index.js (prod)
 */

import express from 'express'
import cors from 'cors'
import { v4 as uuidv4 } from 'uuid'
import { AITester } from '../tester'
import { generateHtmlString } from '../reporter/html'
import type { TesterConfig, TestRun } from '../core/types'
import { authMiddleware, requestLogger } from './middleware'

// ─── Types ──────────────────────────────────────────────

interface Job {
  id: string
  url: string
  config: Partial<TesterConfig>
  status: 'queued' | 'running' | 'completed' | 'failed'
  progress?: string
  startedAt: Date
  completedAt?: Date
  result?: TestRun
  error?: string
}

// ─── State ──────────────────────────────────────────────

const jobs = new Map<string, Job>()
let activeJobId: string | null = null

// Auto-purge jobs older than 1 hour
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000
  for (const [id, job] of jobs) {
    if (job.startedAt.getTime() < cutoff && job.status !== 'running') {
      jobs.delete(id)
    }
  }
}, 5 * 60 * 1000)

// ─── Server ─────────────────────────────────────────────

const app = express()
const PORT = parseInt(process.env.TESTER_PORT || '3012', 10)

app.use(cors())
app.use(express.json())
app.use(requestLogger)
app.use(authMiddleware)

// ─── Routes ─────────────────────────────────────────────

/** Health check (public) */
app.get('/api/health', (_req, res) => {
  const activeJobs = [...jobs.values()].filter(j => j.status === 'running').length
  const completedJobs = [...jobs.values()].filter(j => j.status === 'completed').length
  res.json({
    ok: true,
    version: '0.1.0',
    activeJobs,
    completedJobs,
    totalJobs: jobs.size,
  })
})

/** Start a new test */
app.post('/api/test/start', (req, res) => {
  const { url, config } = req.body as { url?: string; config?: Partial<TesterConfig> }

  if (!url) {
    res.status(400).json({ error: 'url is required' })
    return
  }

  // Validate URL
  try {
    new URL(url.startsWith('http') ? url : `https://${url}`)
  } catch {
    res.status(400).json({ error: 'Invalid URL' })
    return
  }

  // Only one test at a time
  if (activeJobId) {
    const active = jobs.get(activeJobId)
    if (active && active.status === 'running') {
      res.status(429).json({ error: 'Server busy — a test is already running', retryAfter: 30 })
      return
    }
  }

  const normalizedUrl = url.startsWith('http') ? url : `https://${url}`
  const jobId = uuidv4()

  const job: Job = {
    id: jobId,
    url: normalizedUrl,
    config: config || {},
    status: 'queued',
    startedAt: new Date(),
  }

  jobs.set(jobId, job)
  activeJobId = jobId

  // Run test in background
  runTest(job).catch(err => {
    console.error(`[${jobId}] Unhandled error:`, err)
  })

  res.status(202).json({ testId: jobId, status: 'queued' })
})

/** Get test status */
app.get('/api/test/:id/status', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) {
    res.status(404).json({ error: 'Test not found' })
    return
  }

  res.json({
    status: job.status,
    progress: job.progress,
    startedAt: job.startedAt.toISOString(),
    completedAt: job.completedAt?.toISOString(),
    durationMs: job.completedAt
      ? job.completedAt.getTime() - job.startedAt.getTime()
      : Date.now() - job.startedAt.getTime(),
    error: job.error,
    // Include summary when completed
    ...(job.status === 'completed' && job.result ? {
      summary: {
        overallScore: job.result.summary.overallScore,
        totalScenarios: job.result.summary.totalScenarios,
        passed: job.result.summary.passed,
        failed: job.result.summary.failed,
      },
    } : {}),
  })
})

/** Get full test results */
app.get('/api/test/:id/results', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) {
    res.status(404).json({ error: 'Test not found' })
    return
  }

  if (job.status === 'running' || job.status === 'queued') {
    res.status(409).json({ error: 'Test still running', status: job.status })
    return
  }

  if (job.status === 'failed') {
    res.status(500).json({ error: job.error || 'Test failed', status: 'failed' })
    return
  }

  // Strip base64 screenshot data to reduce response size
  const result = stripScreenshotData(job.result!)
  res.json(result)
})

/** Get HTML report */
app.get('/api/test/:id/report', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) {
    res.status(404).json({ error: 'Test not found' })
    return
  }

  if (job.status !== 'completed' || !job.result) {
    res.status(409).json({ error: 'Test not completed yet', status: job.status })
    return
  }

  const html = generateHtmlString(job.result, `Test Report — ${job.url}`, false)
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(html)
})

// ─── Test Runner ────────────────────────────────────────

async function runTest(job: Job): Promise<void> {
  job.status = 'running'
  job.progress = 'Launching browser...'

  const testerConfig: TesterConfig = {
    headless: true,
    maxPages: job.config.maxPages || 30,
    maxDepth: job.config.maxDepth || 2,
    crawlTimeout: job.config.crawlTimeout || 90_000,
    anthropicApiKey: job.config.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
    screenshotOnError: true,
    screenshotEveryStep: false,
    visualRegression: job.config.visualRegression ?? true,
    accessibility: job.config.accessibility ?? true,
    performance: job.config.performance ?? true,
  }

  const tester = new AITester(testerConfig)

  try {
    await tester.launch()
    job.progress = 'Discovering pages...'

    const siteMap = await tester.discover(job.url)
    job.progress = `Discovered ${siteMap.totalPages} pages, generating scenarios...`

    const scenarios = await tester.generateScenarios(siteMap)
    job.progress = `Executing ${scenarios.length} test scenarios...`

    const result = await tester.execute(scenarios)

    job.result = result
    job.status = 'completed'
    job.completedAt = new Date()
    job.progress = undefined

    console.log(`[${job.id}] Test completed: ${result.summary.passed}/${result.summary.totalScenarios} passed (score: ${result.summary.overallScore})`)
  } catch (err) {
    job.status = 'failed'
    job.error = err instanceof Error ? err.message : String(err)
    job.completedAt = new Date()
    job.progress = undefined
    console.error(`[${job.id}] Test failed:`, job.error)
  } finally {
    await tester.close().catch(() => {})
    if (activeJobId === job.id) activeJobId = null
  }
}

// ─── Helpers ────────────────────────────────────────────

function stripScreenshotData(testRun: TestRun): TestRun {
  return {
    ...testRun,
    scenarios: testRun.scenarios.map(s => ({
      ...s,
      screenshots: s.screenshots.map(ss => ({
        label: ss.label,
        data: `[stripped]`,
      })),
    })),
  }
}

// ─── Start ──────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  AI Tester Server running on http://localhost:${PORT}`)
  console.log(`  Health: http://localhost:${PORT}/api/health`)
  console.log(`  Auth: ${process.env.TESTER_API_SECRET ? 'Bearer token required' : 'No auth (dev mode)'}`)
  console.log('')
})

export default app
