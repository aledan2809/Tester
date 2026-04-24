/**
 * T-C6 — `tester zombie-scan` CLI (L-24 preventive tooling).
 *
 * Reports Master pipelines at risk of zombie cleanup BEFORE the 30min
 * auto-failure fires. Non-destructive: lists candidates, never kills.
 *
 * Resolution order for Master state path:
 *   1. --master-path <path> flag
 *   2. MASTER_ROOT env var
 *   3. Walk up from cwd looking for `mesh/state/pipelines.json`
 *   4. Fallback: `~/Projects/Master/mesh/state/pipelines.json` (macOS) or
 *      `$EXTRA_PROJECT_ROOTS/Master/...` (Windows-friendly via env)
 *
 * Design aligns with Phase 0.3 finding (44% of failures = zombie cleanup)
 * and L-24 lesson. Spec in Tester/TODO_PERSISTENT.md → T-C6.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

interface ZombieScanOptions {
  masterPath?: string
  thresholdMin?: number
  json?: boolean
}

interface PipelineRecord {
  id: string
  state: string
  project?: string
  phase?: string
  pid?: number
  updatedAt?: string
  createdAt?: string
  errors?: string[]
}

interface ZombieCandidate {
  id: string
  project: string
  state: string
  phase?: string
  pid?: number
  idle_minutes: number
  updatedAt: string
  process_alive?: boolean
  severity: 'info' | 'warning' | 'critical'
}

const BLOCKED_STATES = new Set(['dev', 'planning', 'qa', 'deploy', 'monitor', 'ci', 'running'])
const WATCHDOG_WARN_MIN = 15 // half of zombie-cleanup threshold
const ZOMBIE_CLEANUP_MIN = 30 // what Master mesh applies

function findMasterStateFile(override?: string): string | null {
  if (override) {
    const resolved = path.resolve(override)
    // Explicit flag is AUTHORITATIVE — no fallback on miss. Return the exact
    // candidate path so the caller can surface a clear "not found" error.
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved
    const asRepoRoot = path.join(resolved, 'mesh', 'state', 'pipelines.json')
    return fs.existsSync(asRepoRoot) ? asRepoRoot : null
  }

  if (process.env.MASTER_ROOT) {
    const candidate = path.join(process.env.MASTER_ROOT, 'mesh', 'state', 'pipelines.json')
    if (fs.existsSync(candidate)) return candidate
  }

  let cur = process.cwd()
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(cur, 'mesh', 'state', 'pipelines.json')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }

  const homeGuess = path.join(os.homedir(), 'Projects', 'Master', 'mesh', 'state', 'pipelines.json')
  if (fs.existsSync(homeGuess)) return homeGuess

  return null
}

function isProcessAlive(pid?: number): boolean | undefined {
  if (!pid) return undefined
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ESRCH') return false
    if (code === 'EPERM') return true // exists but not owned
    return false
  }
}

function classify(idleMinutes: number, processAlive: boolean | undefined): ZombieCandidate['severity'] {
  if (idleMinutes >= ZOMBIE_CLEANUP_MIN) return 'critical'
  if (processAlive === false) return 'critical'
  if (idleMinutes >= WATCHDOG_WARN_MIN) return 'warning'
  return 'info'
}

export function scanForZombies(stateFile: string, thresholdMin: number): ZombieCandidate[] {
  const raw = fs.readFileSync(stateFile, 'utf8')
  const parsed = JSON.parse(raw) as { pipelines?: PipelineRecord[] }
  const pipelines = parsed.pipelines || []
  const candidates: ZombieCandidate[] = []
  const now = Date.now()

  for (const p of pipelines) {
    if (!BLOCKED_STATES.has(p.state)) continue
    const updatedAt = p.updatedAt || p.createdAt
    if (!updatedAt) continue
    const idleMs = now - new Date(updatedAt).getTime()
    const idleMinutes = idleMs / 60000
    if (idleMinutes < thresholdMin) continue

    const processAlive = isProcessAlive(p.pid)
    candidates.push({
      id: p.id,
      project: p.project || '(unknown)',
      state: p.state,
      phase: p.phase,
      pid: p.pid,
      idle_minutes: Math.round(idleMinutes),
      updatedAt,
      process_alive: processAlive,
      severity: classify(idleMinutes, processAlive),
    })
  }

  const sevOrder: Record<ZombieCandidate['severity'], number> = { critical: 2, warning: 1, info: 0 }
  candidates.sort((a, b) => sevOrder[b.severity] - sevOrder[a.severity] || b.idle_minutes - a.idle_minutes)
  return candidates
}

export async function zombieScanCmd(opts: ZombieScanOptions): Promise<void> {
  const stateFile = findMasterStateFile(opts.masterPath)
  if (!stateFile) {
    process.stderr.write(
      `[zombie-scan] ERROR: cannot locate mesh/state/pipelines.json. Pass --master-path <path-to-Master-repo>.\n`,
    )
    process.exit(2)
  }

  const threshold = opts.thresholdMin && opts.thresholdMin > 0 ? opts.thresholdMin : WATCHDOG_WARN_MIN

  let candidates: ZombieCandidate[]
  try {
    candidates = scanForZombies(stateFile, threshold)
  } catch (e) {
    process.stderr.write(`[zombie-scan] ERROR: failed to parse ${stateFile}: ${(e as Error).message}\n`)
    process.exit(2)
    return
  }

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          state_file: stateFile,
          threshold_min: threshold,
          watchdog_warn_min: WATCHDOG_WARN_MIN,
          zombie_cleanup_min: ZOMBIE_CLEANUP_MIN,
          count: candidates.length,
          candidates,
        },
        null,
        2,
      ) + '\n',
    )
  } else {
    process.stdout.write(`Master state:  ${stateFile}\n`)
    process.stdout.write(`Threshold:     ${threshold} min idle (watchdog warn=${WATCHDOG_WARN_MIN}, cleanup=${ZOMBIE_CLEANUP_MIN})\n\n`)
    if (candidates.length === 0) {
      process.stdout.write('✓ No at-risk pipelines. All active pipelines updated within threshold.\n')
      return
    }
    process.stdout.write(`${candidates.length} at-risk pipeline(s):\n\n`)
    for (const c of candidates) {
      const badge = c.severity === 'critical' ? '✗ CRIT' : c.severity === 'warning' ? '⚠ WARN' : 'ℹ INFO'
      const procTag =
        c.process_alive === false ? 'proc=dead' : c.process_alive === true ? 'proc=alive' : 'proc=unknown'
      process.stdout.write(
        `  ${badge}  ${c.id.padEnd(24)} ${c.project.padEnd(20)} ${c.state.padEnd(10)} idle=${String(c.idle_minutes).padStart(4)}min ${procTag}${c.pid ? ` pid=${c.pid}` : ''}\n`,
      )
    }
    process.stdout.write(`\nNon-destructive report. Use \`session-bridge --action recover\` or kill PID manually to clean up.\n`)
  }

  // Exit 1 if any critical candidates found (useful for CI)
  if (candidates.some((c) => c.severity === 'critical')) {
    process.exit(1)
  }
}
