// lessons:skip-all
/**
 * T-C6 — zombie-scan CLI + scanner regression tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { scanForZombies } from '../../src/cli/commands/zombie-scan'

function writeState(pipelines: Array<Record<string, unknown>>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zombie-state-'))
  const stateDir = path.join(dir, 'mesh', 'state')
  fs.mkdirSync(stateDir, { recursive: true })
  const file = path.join(stateDir, 'pipelines.json')
  fs.writeFileSync(file, JSON.stringify({ pipelines }, null, 2), 'utf8')
  return file
}

const MIN = 60_000

describe('zombie-scan — CLI integration (spawn)', () => {
  const REPO = path.resolve(__dirname, '../..')
  const CLI = path.join(REPO, 'dist/cli/index.js')

  it('errors with exit 2 when --master-path missing', () => {
    const { spawnSync } = require('node:child_process') as typeof import('node:child_process')
    const r = spawnSync('node', [CLI, 'zombie-scan', '--master-path', '/tmp/abs-nonexist-xyz-abc'], { encoding: 'utf8' })
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/cannot locate/i)
  })
})

describe('zombie-scan — at-risk detection', () => {
  it('returns zero candidates on empty corpus', () => {
    const f = writeState([])
    try {
      expect(scanForZombies(f, 15)).toEqual([])
    } finally {
      fs.rmSync(path.dirname(path.dirname(path.dirname(f))), { recursive: true, force: true })
    }
  })

  it('flags pipeline idle > threshold in "dev" state', () => {
    const now = Date.now()
    const f = writeState([
      {
        id: 'pipe_test1',
        project: 'X',
        state: 'dev',
        pid: 999999, // unlikely to be alive
        updatedAt: new Date(now - 20 * MIN).toISOString(),
      },
    ])
    try {
      const result = scanForZombies(f, 15)
      expect(result.length).toBe(1)
      expect(result[0].idle_minutes).toBeGreaterThanOrEqual(20)
      expect(['warning', 'critical']).toContain(result[0].severity)
    } finally {
      fs.rmSync(path.dirname(path.dirname(path.dirname(f))), { recursive: true, force: true })
    }
  })

  it('does NOT flag pipeline idle < threshold', () => {
    const now = Date.now()
    const f = writeState([
      {
        id: 'pipe_fresh',
        project: 'Y',
        state: 'dev',
        pid: 1,
        updatedAt: new Date(now - 2 * MIN).toISOString(),
      },
    ])
    try {
      expect(scanForZombies(f, 15)).toEqual([])
    } finally {
      fs.rmSync(path.dirname(path.dirname(path.dirname(f))), { recursive: true, force: true })
    }
  })

  it('does NOT flag pipelines in terminal states (done/failed/idle)', () => {
    const now = Date.now()
    const f = writeState([
      { id: 'pipe_done', project: 'Z', state: 'done', updatedAt: new Date(now - 60 * MIN).toISOString() },
      { id: 'pipe_failed', project: 'Z', state: 'failed', updatedAt: new Date(now - 60 * MIN).toISOString() },
      { id: 'pipe_idle', project: 'Z', state: 'idle', updatedAt: new Date(now - 60 * MIN).toISOString() },
    ])
    try {
      expect(scanForZombies(f, 15)).toEqual([])
    } finally {
      fs.rmSync(path.dirname(path.dirname(path.dirname(f))), { recursive: true, force: true })
    }
  })

  it('ranks critical severity above warning', () => {
    const now = Date.now()
    const f = writeState([
      { id: 'pipe_warn', project: 'P', state: 'dev', pid: 999999, updatedAt: new Date(now - 20 * MIN).toISOString() },
      { id: 'pipe_crit', project: 'P', state: 'dev', pid: 999999, updatedAt: new Date(now - 40 * MIN).toISOString() },
    ])
    try {
      const res = scanForZombies(f, 15)
      expect(res.length).toBe(2)
      expect(res[0].severity).toBe('critical')
      expect(res[0].id).toBe('pipe_crit')
    } finally {
      fs.rmSync(path.dirname(path.dirname(path.dirname(f))), { recursive: true, force: true })
    }
  })

  it('handles pipelines without pid (no process check)', () => {
    const now = Date.now()
    const f = writeState([
      { id: 'pipe_nopid', project: 'Q', state: 'qa', updatedAt: new Date(now - 25 * MIN).toISOString() },
    ])
    try {
      const res = scanForZombies(f, 15)
      expect(res.length).toBe(1)
      expect(res[0].process_alive).toBeUndefined()
    } finally {
      fs.rmSync(path.dirname(path.dirname(path.dirname(f))), { recursive: true, force: true })
    }
  })

  it('scanBlocked-states coverage', () => {
    const now = Date.now()
    const f = writeState([
      { id: 'p-dev', project: 'P', state: 'dev', updatedAt: new Date(now - 30 * MIN).toISOString() },
      { id: 'p-plan', project: 'P', state: 'planning', updatedAt: new Date(now - 30 * MIN).toISOString() },
      { id: 'p-qa', project: 'P', state: 'qa', updatedAt: new Date(now - 30 * MIN).toISOString() },
      { id: 'p-dep', project: 'P', state: 'deploy', updatedAt: new Date(now - 30 * MIN).toISOString() },
      { id: 'p-mon', project: 'P', state: 'monitor', updatedAt: new Date(now - 30 * MIN).toISOString() },
      { id: 'p-ci', project: 'P', state: 'ci', updatedAt: new Date(now - 30 * MIN).toISOString() },
    ])
    try {
      const res = scanForZombies(f, 15)
      expect(res.length).toBe(6)
    } finally {
      fs.rmSync(path.dirname(path.dirname(path.dirname(f))), { recursive: true, force: true })
    }
  })
})

describe('zombie-scan — T-C6 watchdog-warnings integration', () => {
  function writeStateWithWarnings(
    pipelines: Array<Record<string, unknown>>,
    warnings: Record<string, Record<string, unknown>>,
  ): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zombie-wd-'))
    const stateDir = path.join(dir, 'mesh', 'state')
    fs.mkdirSync(stateDir, { recursive: true })
    fs.writeFileSync(path.join(stateDir, 'pipelines.json'), JSON.stringify({ pipelines }, null, 2), 'utf8')
    fs.writeFileSync(path.join(stateDir, 'watchdog-warnings.json'), JSON.stringify(warnings, null, 2), 'utf8')
    return path.join(stateDir, 'pipelines.json')
  }

  it('surfaces watchdog_warned=true for pipelines in warnings file', () => {
    const now = Date.now()
    const f = writeStateWithWarnings(
      [{ id: 'pipe_w1', project: 'X', state: 'dev', updatedAt: new Date(now - 20 * MIN).toISOString() }],
      { pipe_w1: { warned_at: new Date(now - 5 * MIN).toISOString(), project: 'X', state: 'dev', idle_min: 15 } },
    )
    try {
      const res = scanForZombies(f, 15)
      expect(res.length).toBe(1)
      expect(res[0].watchdog_warned).toBe(true)
      expect(res[0].watchdog_warned_at).toBeDefined()
    } finally {
      fs.rmSync(path.dirname(path.dirname(path.dirname(f))), { recursive: true, force: true })
    }
  })

  it('handles absent watchdog-warnings.json gracefully (default: watchdog_warned=false)', () => {
    const now = Date.now()
    const f = writeState([
      { id: 'pipe_no_wd', project: 'X', state: 'dev', updatedAt: new Date(now - 20 * MIN).toISOString() },
    ])
    try {
      const res = scanForZombies(f, 15)
      expect(res[0].watchdog_warned).toBe(false)
      expect(res[0].watchdog_warned_at).toBeUndefined()
    } finally {
      fs.rmSync(path.dirname(path.dirname(path.dirname(f))), { recursive: true, force: true })
    }
  })

  it('handles corrupted watchdog-warnings.json gracefully', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zombie-corrupt-'))
    const stateDir = path.join(dir, 'mesh', 'state')
    fs.mkdirSync(stateDir, { recursive: true })
    const now = Date.now()
    fs.writeFileSync(
      path.join(stateDir, 'pipelines.json'),
      JSON.stringify({
        pipelines: [
          { id: 'pipe_corrupt', project: 'X', state: 'dev', updatedAt: new Date(now - 20 * MIN).toISOString() },
        ],
      }),
      'utf8',
    )
    fs.writeFileSync(path.join(stateDir, 'watchdog-warnings.json'), 'not-json{{{', 'utf8')
    try {
      const res = scanForZombies(path.join(stateDir, 'pipelines.json'), 15)
      expect(res.length).toBe(1)
      expect(res[0].watchdog_warned).toBe(false) // graceful degrade
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
