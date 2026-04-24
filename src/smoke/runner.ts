/**
 * T-C3 — Post-deploy smoke-test runner.
 *
 * Given a deploy URL + an optional list of regression spec paths,
 * runs a minimal health check (HTTP 200 on root + 200 on any
 * declared health endpoint) + spawns vitest on the regression
 * corpus. Used by Master mesh's "post-deploy-smoke" phase; emits a
 * SmokeResult a caller can consume to decide "revert or keep".
 *
 * Auto-revert itself is Master-mesh responsibility (it has git +
 * deploy credentials; Tester stays read-only here).
 */

import { spawnSync } from 'node:child_process'

export interface SmokeInput {
  url: string
  /** Additional paths to GET + check 200 (e.g. /api/health). */
  healthPaths?: string[]
  /** Optional regressions dir path — if present, vitest runs it. */
  regressionsDir?: string
  /** HTTP request timeout ms (default 10s). */
  timeoutMs?: number
  /** Hook for tests — inject fetch. */
  fetchImpl?: typeof fetch
}

export interface SmokeResult {
  ok: boolean
  failures: string[]
  checks: Array<{ url: string; status: number; ms: number; ok: boolean; error?: string }>
  regressions?: { ok: boolean; output: string }
}

async function hit(f: typeof fetch, url: string, timeoutMs: number) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  const t0 = Date.now()
  try {
    const res = await f(url, { signal: ac.signal })
    return {
      url,
      status: res.status,
      ms: Date.now() - t0,
      ok: res.status >= 200 && res.status < 400,
    }
  } catch (e) {
    return {
      url,
      status: 0,
      ms: Date.now() - t0,
      ok: false,
      error: (e as Error).message,
    }
  } finally {
    clearTimeout(t)
  }
}

export async function runSmoke(input: SmokeInput): Promise<SmokeResult> {
  const f = input.fetchImpl || fetch
  const timeoutMs = input.timeoutMs ?? 10_000
  const urls = [input.url, ...(input.healthPaths || []).map((p) => (p.startsWith('http') ? p : input.url.replace(/\/+$/, '') + p))]
  const checks = await Promise.all(urls.map((u) => hit(f, u, timeoutMs)))
  const failures: string[] = []
  for (const c of checks) {
    if (!c.ok) failures.push(`${c.url} → ${c.error || c.status}`)
  }
  let regressions: { ok: boolean; output: string } | undefined
  if (input.regressionsDir) {
    const res = spawnSync('npx', ['vitest', 'run', input.regressionsDir, '--reporter=dot'], {
      encoding: 'utf8',
    })
    regressions = {
      ok: res.status === 0,
      output: [
        (res.stdout || '').split('\n').slice(-8).join('\n'),
        (res.stderr || '').split('\n').slice(-4).join('\n'),
      ]
        .filter(Boolean)
        .join('\n'),
    }
    if (!regressions.ok) failures.push(`regression suite failed (exit ${res.status})`)
  }
  return {
    ok: failures.length === 0,
    failures,
    checks,
    regressions,
  }
}

export function formatSmokeMarkdown(r: SmokeResult): string {
  const lines: string[] = []
  lines.push(`# Post-deploy smoke — ${r.ok ? '✓ PASS' : '✗ FAIL'}`)
  lines.push('')
  lines.push(`| URL | Status | ms | OK |`)
  lines.push(`|-----|--------|----|----|`)
  for (const c of r.checks) {
    lines.push(
      `| ${c.url} | ${c.status || '-'} | ${c.ms} | ${c.ok ? '✓' : '✗'}${c.error ? ` (${c.error})` : ''} |`,
    )
  }
  if (r.regressions) {
    lines.push('')
    lines.push(`**Regression suite:** ${r.regressions.ok ? '✓ pass' : '✗ fail'}`)
    lines.push('```')
    lines.push(r.regressions.output)
    lines.push('```')
  }
  if (r.failures.length > 0) {
    lines.push('')
    lines.push('**Failures:**')
    for (const f of r.failures) lines.push(`- ${f}`)
  }
  return lines.join('\n')
}
