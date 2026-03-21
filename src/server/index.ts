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
import type { TesterConfig, TestRun, LoginCredentials } from '../core/types'
import { authMiddleware, requestLogger, createSession } from './middleware'
import { autoLogin } from '../auth/login'
import { BrowserCore } from '../core/browser'
import { JobStorage, type Job as StoredJob } from './storage'

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

const storage = new JobStorage()
let activeJobId: string | null = null

// Resume any previously running jobs as failed (on restart)
const runningJobs = storage.getRunning()
for (const job of runningJobs) {
  storage.save({
    ...job,
    status: 'failed',
    error: 'Server restarted',
    completedAt: new Date().toISOString()
  })
}

// ─── Server ─────────────────────────────────────────────

const app = express()
const PORT = parseInt(process.env.TESTER_PORT || '3012', 10)

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:8080',
    `http://localhost:${PORT}`
  ],
  credentials: true
}))
app.use(express.json())
app.use(requestLogger)
app.use(authMiddleware)

// ─── Routes ─────────────────────────────────────────────

/** Health check (public) */
app.get('/api/health', (_req, res) => {
  const allJobs = storage.getAll()
  const activeJobs = allJobs.filter(j => j.status === 'running').length
  const completedJobs = allJobs.filter(j => j.status === 'completed').length
  res.json({
    ok: true,
    version: '0.1.0',
    activeJobs,
    completedJobs,
    totalJobs: allJobs.length,
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
    const active = storage.get(activeJobId)
    if (active && active.status === 'running') {
      res.status(429).json({ error: 'Server busy — a test is already running', retryAfter: 30 })
      return
    }
  }

  const normalizedUrl = url.startsWith('http') ? url : `https://${url}`
  const jobId = uuidv4()
  const now = new Date()

  const job: Job = {
    id: jobId,
    url: normalizedUrl,
    config: config || {},
    status: 'queued',
    startedAt: now,
  }

  // Save to SQLite
  storage.save({
    id: jobId,
    url: normalizedUrl,
    config: JSON.stringify(config || {}),
    status: 'queued',
    startedAt: now.toISOString(),
  })
  activeJobId = jobId

  // Run test in background
  runTest(job).catch(err => {
    console.error(`[${jobId}] Unhandled error:`, err)
  })

  res.status(202).json({ testId: jobId, status: 'queued' })
})

/** Get test status */
app.get('/api/test/:id/status', (req, res) => {
  const storedJob = storage.get(req.params.id)
  if (!storedJob) {
    res.status(404).json({ error: 'Test not found' })
    return
  }

  const startedAt = new Date(storedJob.startedAt)
  const completedAt = storedJob.completedAt ? new Date(storedJob.completedAt) : undefined

  let result: TestRun | undefined
  try {
    result = storedJob.result ? JSON.parse(storedJob.result) : undefined
  } catch (err) {
    console.error('Failed to parse job result:', err)
  }

  res.json({
    status: storedJob.status,
    progress: storedJob.progress,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt?.toISOString(),
    durationMs: completedAt
      ? completedAt.getTime() - startedAt.getTime()
      : Date.now() - startedAt.getTime(),
    error: storedJob.error,
    // Include summary when completed
    ...(storedJob.status === 'completed' && result ? {
      summary: {
        overallScore: result.summary.overallScore,
        totalScenarios: result.summary.totalScenarios,
        passed: result.summary.passed,
        failed: result.summary.failed,
      },
    } : {}),
  })
})

/** Get full test results */
app.get('/api/test/:id/results', (req, res) => {
  const storedJob = storage.get(req.params.id)
  if (!storedJob) {
    res.status(404).json({ error: 'Test not found' })
    return
  }

  if (storedJob.status === 'running' || storedJob.status === 'queued') {
    res.status(409).json({ error: 'Test still running', status: storedJob.status })
    return
  }

  if (storedJob.status === 'failed') {
    res.status(500).json({ error: storedJob.error || 'Test failed', status: 'failed' })
    return
  }

  let result: TestRun
  try {
    result = JSON.parse(storedJob.result!)
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse test results', status: 'failed' })
    return
  }

  // Strip base64 screenshot data to reduce response size
  const strippedResult = stripScreenshotData(result)
  res.json(strippedResult)
})

/** Get HTML report */
app.get('/api/test/:id/report', (req, res) => {
  const storedJob = storage.get(req.params.id)
  if (!storedJob) {
    res.status(404).json({ error: 'Test not found' })
    return
  }

  if (storedJob.status !== 'completed' || !storedJob.result) {
    res.status(409).json({ error: 'Test not completed yet', status: storedJob.status })
    return
  }

  let result: TestRun
  try {
    result = JSON.parse(storedJob.result)
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse test results', status: 'failed' })
    return
  }

  const html = generateHtmlString(result, `Test Report — ${storedJob.url}`, false)
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(html)
})

/** Login endpoint - authenticates with target site and returns session token */
app.post('/api/auth/login', async (req, res) => {
  const { url, username, password, loginUrl } = req.body as {
    url?: string
    username?: string
    password?: string
    loginUrl?: string
  }

  if (!url || !username || !password) {
    res.status(400).json({ error: 'url, username, and password are required' })
    return
  }

  try {
    new URL(url.startsWith('http') ? url : `https://${url}`)
  } catch {
    res.status(400).json({ error: 'Invalid URL' })
    return
  }

  const browser = new BrowserCore({ headless: true })

  try {
    await browser.launch()

    const credentials: LoginCredentials = {
      username,
      password,
      loginUrl: loginUrl || url,
    }

    const loginResult = await autoLogin(browser, credentials)

    if (loginResult.success) {
      const cookiesJson = await browser.saveCookies()
      const sessionToken = createSession({
        url,
        username,
        platform: loginResult.platform,
        cookies: cookiesJson,
      })

      res.json({
        success: true,
        sessionToken,
        platform: loginResult.platform,
        redirectUrl: loginResult.redirectUrl,
        usedGenericDetection: loginResult.usedGenericDetection,
      })
    } else {
      res.status(401).json({
        success: false,
        error: loginResult.error || 'Login failed',
        platform: loginResult.platform,
      })
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Login error',
    })
  } finally {
    await browser.close().catch(() => {})
  }
})

/** Validate session endpoint */
app.get('/api/auth/validate', (_req, res) => {
  res.json({ valid: true, message: 'Session is valid' })
})

// ─── Test Runner ────────────────────────────────────────

async function runTest(job: Job): Promise<void> {
  // Update to running status in SQLite
  storage.save({
    id: job.id,
    url: job.url,
    config: JSON.stringify(job.config),
    status: 'running',
    progress: 'Launching browser...',
    startedAt: job.startedAt.toISOString(),
  })

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
    storage.save({
      id: job.id,
      url: job.url,
      config: JSON.stringify(job.config),
      status: 'running',
      progress: 'Discovering pages...',
      startedAt: job.startedAt.toISOString(),
    })

    const siteMap = await tester.discover(job.url)
    storage.save({
      id: job.id,
      url: job.url,
      config: JSON.stringify(job.config),
      status: 'running',
      progress: `Discovered ${siteMap.totalPages} pages, generating scenarios...`,
      startedAt: job.startedAt.toISOString(),
    })

    const scenarios = await tester.generateScenarios(siteMap)
    storage.save({
      id: job.id,
      url: job.url,
      config: JSON.stringify(job.config),
      status: 'running',
      progress: `Executing ${scenarios.length} test scenarios...`,
      startedAt: job.startedAt.toISOString(),
    })

    const result = await tester.execute(scenarios)

    const completedAt = new Date()
    storage.save({
      id: job.id,
      url: job.url,
      config: JSON.stringify(job.config),
      status: 'completed',
      startedAt: job.startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      result: JSON.stringify(result),
    })

    console.info(`[${job.id}] Test completed: ${result.summary.passed}/${result.summary.totalScenarios} passed (score: ${result.summary.overallScore})`)
  } catch (err) {
    const completedAt = new Date()
    const error = err instanceof Error ? err.message : String(err)
    storage.save({
      id: job.id,
      url: job.url,
      config: JSON.stringify(job.config),
      status: 'failed',
      startedAt: job.startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      error,
    })
    console.error(`[${job.id}] Test failed:`, error)
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
  console.info(`\n  AI Tester Server running on http://localhost:${PORT}`)
  console.info(`  Health: http://localhost:${PORT}/api/health`)
  console.info(`  Auth: ${process.env.TESTER_API_SECRET ? 'Bearer token required' : 'No auth (dev mode)'}`)
  console.info(`  Storage: SQLite database with persistent jobs`)
  console.info('')
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.info('\nShutting down server...')
  storage.close()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.info('\nServer terminated')
  storage.close()
  process.exit(0)
})

export default app
