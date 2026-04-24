/**
 * T-A3 — Session-state recorder.
 *
 * Produces a structured log per session under `.tester/sessions/<id>.json`
 * so the next session (Claude, TWG orchestrator, CI reviewer) can consume
 * `tester session last` / `tester session show <id>` instead of re-reading
 * scattered TODO / memory / gap files.
 *
 * Shape:
 *   {
 *     "id": "sess_mo2t74ur_u1xwbw",
 *     "description": "T-A3 wave 2 kickoff",
 *     "startedAt": "ISO",
 *     "endedAt": "ISO | null",
 *     "events": [
 *       { "t": "ISO", "kind": "tool_call|commit|test_run|note", "payload": {...} }
 *     ],
 *     "summary": null | { tests_passed: N, commits: [hash], notes: string }
 *   }
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'

export type SessionEventKind = 'tool_call' | 'commit' | 'test_run' | 'note' | 'start' | 'end'

export interface SessionEvent {
  t: string
  kind: SessionEventKind
  payload: Record<string, unknown>
}

export interface SessionSummary {
  tests_passed?: number
  tests_failed?: number
  commits?: string[]
  notes?: string
}

export interface SessionFile {
  id: string
  description: string
  startedAt: string
  endedAt: string | null
  events: SessionEvent[]
  summary: SessionSummary | null
}

const LATEST_POINTER = 'latest.json'

function sessionsDir(projectRoot: string): string {
  return path.join(projectRoot, '.tester', 'sessions')
}

function sessionFilePath(projectRoot: string, id: string): string {
  return path.join(sessionsDir(projectRoot), `${id}.json`)
}

export function generateSessionId(): string {
  const ts = Date.now().toString(36)
  const rand = crypto.randomBytes(3).toString('hex')
  return `sess_${ts}_${rand}`
}

export function startSession(projectRoot: string, description: string): SessionFile {
  const dir = sessionsDir(projectRoot)
  fs.mkdirSync(dir, { recursive: true })
  const id = generateSessionId()
  const now = new Date().toISOString()
  const session: SessionFile = {
    id,
    description: description || '(no description)',
    startedAt: now,
    endedAt: null,
    events: [{ t: now, kind: 'start', payload: { description } }],
    summary: null,
  }
  fs.writeFileSync(sessionFilePath(projectRoot, id), JSON.stringify(session, null, 2), 'utf8')
  // Update latest pointer
  fs.writeFileSync(
    path.join(dir, LATEST_POINTER),
    JSON.stringify({ id, startedAt: now }, null, 2),
    'utf8',
  )
  return session
}

export function loadSession(projectRoot: string, id: string): SessionFile | null {
  const file = sessionFilePath(projectRoot, id)
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as SessionFile
  } catch {
    return null
  }
}

export function loadLatestSession(projectRoot: string): SessionFile | null {
  const pointer = path.join(sessionsDir(projectRoot), LATEST_POINTER)
  if (!fs.existsSync(pointer)) return null
  try {
    const { id } = JSON.parse(fs.readFileSync(pointer, 'utf8')) as { id: string }
    return loadSession(projectRoot, id)
  } catch {
    return null
  }
}

export function appendEvent(
  projectRoot: string,
  id: string,
  kind: SessionEventKind,
  payload: Record<string, unknown>,
): SessionFile {
  const session = loadSession(projectRoot, id)
  if (!session) throw new Error(`session not found: ${id}`)
  session.events.push({ t: new Date().toISOString(), kind, payload })
  fs.writeFileSync(sessionFilePath(projectRoot, id), JSON.stringify(session, null, 2), 'utf8')
  return session
}

export function endSession(
  projectRoot: string,
  id: string,
  summary: SessionSummary = {},
): SessionFile {
  const session = loadSession(projectRoot, id)
  if (!session) throw new Error(`session not found: ${id}`)
  const now = new Date().toISOString()
  session.endedAt = now
  session.events.push({ t: now, kind: 'end', payload: { summary } })
  session.summary = summary
  fs.writeFileSync(sessionFilePath(projectRoot, id), JSON.stringify(session, null, 2), 'utf8')
  return session
}

export function listSessions(projectRoot: string): Array<{ id: string; startedAt: string; endedAt: string | null; description: string }> {
  const dir = sessionsDir(projectRoot)
  if (!fs.existsSync(dir)) return []
  const out: Array<{ id: string; startedAt: string; endedAt: string | null; description: string }> = []
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith('sess_') || !f.endsWith('.json')) continue
    try {
      const s = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as SessionFile
      out.push({ id: s.id, startedAt: s.startedAt, endedAt: s.endedAt, description: s.description })
    } catch {
      // skip corrupt
    }
  }
  out.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
  return out
}
