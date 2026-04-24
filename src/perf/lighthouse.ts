/**
 * T-010 — Lighthouse runner.
 *
 * Spawns `npx lighthouse <url> --output=json --output-path=stdout` per
 * target URL, parses the JSON report, maps to PerfRun shape. No hard
 * `lighthouse` npm dep — consumers invoke via npx, same pattern
 * `tester journey-audit` uses.
 *
 * For CI usage: set LIGHTHOUSE_FLAGS="--preset=desktop" (or similar)
 * via env; the flag list is forwarded verbatim on the CLI.
 *
 * Fallback: when Lighthouse is not available (ENOENT on npx) the
 * runner throws with a descriptive error so the caller can switch
 * to browser-CDP metrics (tester run already captures FCP/LCP/TTI).
 */

import { spawn } from 'node:child_process'
import type { PerfRun } from './budget'

export interface LighthouseOptions {
  /** Extra CLI flags forwarded to lighthouse (default: []). */
  flags?: string[]
  /** Per-URL timeout, ms (default 120_000). */
  timeoutMs?: number
  /** Optional route alias used as PerfRun.route (else URL pathname). */
  routeAlias?: string
}

export interface LighthouseReport {
  // Subset of the lighthouse JSON report we care about.
  lhr?: {
    audits?: {
      'first-contentful-paint'?: { numericValue?: number }
      'largest-contentful-paint'?: { numericValue?: number }
      'interactive'?: { numericValue?: number }
      'cumulative-layout-shift'?: { numericValue?: number }
      'total-byte-weight'?: { numericValue?: number }
    }
  }
  // Lighthouse 10+ put metrics on the root when --output=json
  audits?: LighthouseReport['lhr'] extends { audits: infer A } ? A : never
}

function routeOf(url: string, alias?: string): string {
  if (alias) return alias
  try {
    const u = new URL(url)
    return u.pathname + u.search
  } catch {
    return url
  }
}

function extractMetrics(raw: unknown): PerfRun['metrics'] {
  const r = raw as {
    audits?: Record<string, { numericValue?: number }>
    lhr?: { audits?: Record<string, { numericValue?: number }> }
  }
  const audits = r.audits || r.lhr?.audits || {}
  const n = (k: string): number | undefined => {
    const v = audits[k]?.numericValue
    return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : undefined
  }
  return {
    fcp_ms: n('first-contentful-paint'),
    lcp_ms: n('largest-contentful-paint'),
    tti_ms: n('interactive'),
    cls: (() => {
      const v = audits['cumulative-layout-shift']?.numericValue
      return typeof v === 'number' && Number.isFinite(v)
        ? Math.round(v * 1000) / 1000
        : undefined
    })(),
    transfer_bytes: n('total-byte-weight'),
  }
}

export async function runLighthouse(url: string, opts: LighthouseOptions = {}): Promise<PerfRun> {
  const flags = opts.flags || ['--output=json', '--output-path=stdout', '--chrome-flags=--headless=new']
  // Ensure --output=json + --output-path=stdout are present.
  if (!flags.some((f) => f.startsWith('--output=json'))) flags.push('--output=json')
  if (!flags.some((f) => f.startsWith('--output-path'))) flags.push('--output-path=stdout')
  const args = ['lighthouse', url, ...flags]
  const timeoutMs = opts.timeoutMs ?? 120_000

  return new Promise((resolve, reject) => {
    const child = spawn('npx', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`lighthouse timeout after ${timeoutMs}ms on ${url}`))
    }, timeoutMs)
    child.stdout.on('data', (d: Buffer) => chunks.push(d))
    child.stderr.on('data', (d: Buffer) => errChunks.push(d))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(new Error(`lighthouse spawn failed: ${e.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(
          new Error(
            `lighthouse exited with code ${code}: ${Buffer.concat(errChunks).toString('utf8').slice(0, 400)}`,
          ),
        )
        return
      }
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        const parsed = JSON.parse(text)
        resolve({ route: routeOf(url, opts.routeAlias), metrics: extractMetrics(parsed) })
      } catch (e) {
        reject(new Error(`lighthouse output parse error: ${(e as Error).message}`))
      }
    })
  })
}

export async function runLighthouseMulti(
  urls: Array<string | { url: string; alias?: string }>,
  opts: LighthouseOptions = {},
): Promise<PerfRun[]> {
  const runs: PerfRun[] = []
  for (const target of urls) {
    const url = typeof target === 'string' ? target : target.url
    const alias = typeof target === 'string' ? undefined : target.alias
    try {
      runs.push(await runLighthouse(url, { ...opts, routeAlias: alias }))
    } catch (e) {
      // Keep going on a per-URL failure — mark as empty-metrics entry so
      // downstream budget evaluation still enumerates the route.
      runs.push({ route: routeOf(url, alias), metrics: {} })
      // Surface the error in process.stderr so CI picks it up.
      process.stderr.write(`[lighthouse] ${url} failed: ${(e as Error).message}\n`)
    }
  }
  return runs
}
