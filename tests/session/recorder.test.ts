// lessons:skip-all
/**
 * T-A3 — Session recorder regression tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  startSession,
  appendEvent,
  endSession,
  loadSession,
  loadLatestSession,
  listSessions,
  generateSessionId,
} from '../../src/session/recorder'

function mkProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sess-'))
}

describe('T-A3 generateSessionId', () => {
  it('produces unique, prefixed ids', () => {
    const a = generateSessionId()
    const b = generateSessionId()
    expect(a).toMatch(/^sess_[a-z0-9]+_[0-9a-f]+$/)
    expect(a).not.toBe(b)
  })
})

describe('T-A3 startSession + loadLatestSession', () => {
  it('creates .tester/sessions/<id>.json + latest pointer', () => {
    const root = mkProject()
    try {
      const s = startSession(root, 'wave 2 kickoff')
      expect(s.id).toMatch(/^sess_/)
      expect(s.events).toHaveLength(1)
      expect(s.events[0].kind).toBe('start')
      const file = path.join(root, '.tester', 'sessions', `${s.id}.json`)
      expect(fs.existsSync(file)).toBe(true)
      const pointer = path.join(root, '.tester', 'sessions', 'latest.json')
      expect(fs.existsSync(pointer)).toBe(true)
      const latest = loadLatestSession(root)
      expect(latest?.id).toBe(s.id)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('second start shifts latest pointer forward', () => {
    const root = mkProject()
    try {
      const a = startSession(root, 'first')
      const b = startSession(root, 'second')
      expect(a.id).not.toBe(b.id)
      expect(loadLatestSession(root)?.id).toBe(b.id)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns null when no session exists', () => {
    const root = mkProject()
    try {
      expect(loadLatestSession(root)).toBeNull()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('T-A3 appendEvent', () => {
  it('pushes a structured event to the session file', () => {
    const root = mkProject()
    try {
      const s = startSession(root, 'demo')
      const updated = appendEvent(root, s.id, 'commit', { hash: 'abc123', subject: 'feat: x' })
      expect(updated.events).toHaveLength(2)
      expect(updated.events[1].kind).toBe('commit')
      expect(updated.events[1].payload.hash).toBe('abc123')
      // Persisted to disk
      const reloaded = loadSession(root, s.id)
      expect(reloaded?.events).toHaveLength(2)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('throws when session id is unknown', () => {
    const root = mkProject()
    try {
      expect(() => appendEvent(root, 'sess_missing', 'note', {})).toThrow(/not found/i)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('T-A3 endSession', () => {
  it('stamps endedAt + writes summary + final event', () => {
    const root = mkProject()
    try {
      const s = startSession(root, 'demo')
      const ended = endSession(root, s.id, {
        tests_passed: 10,
        tests_failed: 0,
        commits: ['abc123'],
        notes: 'clean',
      })
      expect(ended.endedAt).not.toBeNull()
      expect(ended.summary?.tests_passed).toBe(10)
      expect(ended.events[ended.events.length - 1].kind).toBe('end')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('throws when session id is unknown', () => {
    const root = mkProject()
    try {
      expect(() => endSession(root, 'sess_nope', {})).toThrow(/not found/i)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('T-A3 listSessions', () => {
  it('returns empty when dir is absent', () => {
    const root = mkProject()
    try {
      expect(listSessions(root)).toEqual([])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns sessions sorted by startedAt desc', async () => {
    const root = mkProject()
    try {
      const a = startSession(root, 'first')
      // Force a later startedAt by sleeping 5ms + overwriting
      await new Promise((r) => setTimeout(r, 5))
      const b = startSession(root, 'second')
      const rows = listSessions(root)
      expect(rows).toHaveLength(2)
      // Latest first
      expect(rows[0].id).toBe(b.id)
      expect(rows[1].id).toBe(a.id)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('skips corrupt files without throwing', () => {
    const root = mkProject()
    try {
      const s = startSession(root, 'demo')
      const corrupt = path.join(root, '.tester', 'sessions', 'sess_bogus_00.json')
      fs.writeFileSync(corrupt, '{ not json', 'utf8')
      const rows = listSessions(root)
      expect(rows.some((r) => r.id === s.id)).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
