/**
 * Playwright Recorder — Module K
 * Video recording and trace capture for test sessions.
 * Uses Playwright (devDep) alongside the existing Puppeteer engine.
 *
 * This module is ONLY for recording — all navigation/interaction
 * is delegated to the caller. Import is dynamic so builds without
 * Playwright installed still compile (it's a devDep).
 */

import * as fs from 'fs'
import * as path from 'path'

export interface RecordingOptions {
  /** Directory to save recordings */
  outputDir?: string
  /** Record video (default: true) */
  video?: boolean
  /** Record trace zip with screenshots + network (default: true) */
  trace?: boolean
  /** Viewport for the recording */
  viewport?: { width: number; height: number }
  /** Label used in filenames (e.g. scenario name) */
  label?: string
}

export interface RecordingSession {
  /** Start navigating / interacting through the returned page */
  page: import('playwright').Page
  /** Call when done — stops recording and returns artifact paths */
  stop: () => Promise<RecordingArtifacts>
}

export interface RecordingArtifacts {
  videoPath?: string
  tracePath?: string
  screenshotPath?: string
  durationMs: number
  label: string
}

/**
 * Opens a Playwright browser, starts video + trace recording,
 * and returns the page + a stop() function.
 *
 * Usage:
 * ```ts
 * const { page, stop } = await startRecording({ label: 'login-flow' })
 * await page.goto('https://example.com')
 * await page.click('#btn')
 * const { videoPath, tracePath } = await stop()
 * ```
 */
export async function startRecording(opts: RecordingOptions = {}): Promise<RecordingSession> {
  // Dynamic import — avoids hard dependency on Playwright at module load time
  let chromium: typeof import('playwright').chromium
  try {
    const pw = await import('playwright')
    chromium = pw.chromium
  } catch {
    throw new Error(
      'Playwright is not installed. Install it with: npm install --save-dev playwright @playwright/test'
    )
  }

  const label = opts.label ?? `recording-${Date.now()}`
  const outDir = path.resolve(opts.outputDir ?? path.join(process.cwd(), 'recordings'), label)
  fs.mkdirSync(outDir, { recursive: true })

  const viewport = opts.viewport ?? { width: 1280, height: 800 }
  const recordVideo = opts.video !== false
  const recordTrace = opts.trace !== false

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport,
    recordVideo: recordVideo ? { dir: outDir, size: viewport } : undefined,
  })

  if (recordTrace) {
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: false,
    })
  }

  const page = await context.newPage()
  const startTime = Date.now()

  const stop = async (): Promise<RecordingArtifacts> => {
    const durationMs = Date.now() - startTime
    const artifacts: RecordingArtifacts = { durationMs, label }

    // Screenshot before closing
    const screenshotPath = path.join(outDir, 'final.png')
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => null)
    if (fs.existsSync(screenshotPath)) {
      artifacts.screenshotPath = screenshotPath
    }

    // Stop trace
    if (recordTrace) {
      const tracePath = path.join(outDir, 'trace.zip')
      await context.tracing.stop({ path: tracePath }).catch(() => null)
      if (fs.existsSync(tracePath)) {
        artifacts.tracePath = tracePath
      }
    }

    // Close context (triggers video save)
    await context.close()
    await browser.close()

    // Find video file
    if (recordVideo) {
      const files = fs.readdirSync(outDir)
      const videoFile = files.find(f => f.endsWith('.webm'))
      if (videoFile) {
        artifacts.videoPath = path.join(outDir, videoFile)
      }
    }

    return artifacts
  }

  return { page, stop }
}

/**
 * Records a complete navigation to a URL, waits for idle, stops.
 * Convenience wrapper for simple recording scenarios.
 */
export async function recordUrl(
  url: string,
  opts: RecordingOptions = {},
): Promise<RecordingArtifacts> {
  const session = await startRecording({ ...opts, label: opts.label ?? `url-${Date.now()}` })
  try {
    await session.page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
    await session.page.waitForTimeout(2_000)
  } catch {
    // Best-effort — still stop and return whatever we have
  }
  return session.stop()
}

/**
 * Returns the Playwright trace viewer URL for a recorded trace.
 * Useful for including in reports.
 */
export function traceViewerUrl(tracePath: string): string {
  const abs = path.resolve(tracePath)
  return `https://trace.playwright.dev/?trace=${encodeURIComponent(abs)}`
}
