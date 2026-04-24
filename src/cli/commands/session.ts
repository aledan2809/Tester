/**
 * T-A3 — `tester session <action>` CLI handler.
 *
 * Actions:
 *   start <description>   create a new session, set it as latest
 *   log <event>           append a free-form note (--kind tool_call|test_run|commit|note)
 *   end                   close the latest session with optional summary
 *   last                  print the latest session JSON
 *   show <id>             print a specific session by id
 *   list                  summary table of all sessions
 */

import {
  startSession,
  appendEvent,
  endSession,
  loadLatestSession,
  loadSession,
  listSessions,
  type SessionEventKind,
  type SessionSummary,
} from '../../session/recorder'

export interface SessionCliOptions {
  project?: string
  description?: string
  kind?: string
  note?: string
  id?: string
  testsPassed?: number
  testsFailed?: number
  commits?: string
  summaryNote?: string
  json?: boolean
}

const VALID_KINDS: SessionEventKind[] = ['tool_call', 'commit', 'test_run', 'note']

function resolveProject(opts: SessionCliOptions): string {
  return opts.project || process.cwd()
}

export async function sessionStartCmd(description: string, opts: SessionCliOptions): Promise<void> {
  const s = startSession(resolveProject(opts), description || '')
  if (opts.json) {
    process.stdout.write(JSON.stringify(s, null, 2) + '\n')
    return
  }
  process.stdout.write(`Started session ${s.id}\n  desc: ${s.description}\n  started: ${s.startedAt}\n`)
}

export async function sessionLogCmd(opts: SessionCliOptions): Promise<void> {
  const kind = (opts.kind || 'note') as SessionEventKind
  if (!VALID_KINDS.includes(kind)) {
    process.stderr.write(`[session] ERROR: --kind must be one of ${VALID_KINDS.join('|')}\n`)
    process.exit(2)
  }
  const root = resolveProject(opts)
  const latest = loadLatestSession(root)
  if (!latest) {
    process.stderr.write(`[session] ERROR: no active session. Run \`tester session start "<desc>"\` first.\n`)
    process.exit(2)
  }
  const payload = opts.note ? { message: opts.note } : {}
  const s = appendEvent(root, latest!.id, kind, payload)
  if (opts.json) {
    process.stdout.write(JSON.stringify({ id: s.id, events: s.events.length }, null, 2) + '\n')
    return
  }
  process.stdout.write(`Logged ${kind} event on ${s.id} (${s.events.length} total events)\n`)
}

export async function sessionEndCmd(opts: SessionCliOptions): Promise<void> {
  const root = resolveProject(opts)
  const latest = loadLatestSession(root)
  if (!latest) {
    process.stderr.write(`[session] ERROR: no session to end\n`)
    process.exit(2)
  }
  const summary: SessionSummary = {}
  if (typeof opts.testsPassed === 'number') summary.tests_passed = opts.testsPassed
  if (typeof opts.testsFailed === 'number') summary.tests_failed = opts.testsFailed
  if (opts.commits) summary.commits = opts.commits.split(',').map((s) => s.trim()).filter(Boolean)
  if (opts.summaryNote) summary.notes = opts.summaryNote
  const s = endSession(root, latest!.id, summary)
  if (opts.json) {
    process.stdout.write(JSON.stringify(s, null, 2) + '\n')
    return
  }
  process.stdout.write(`Ended session ${s.id}\n  endedAt: ${s.endedAt}\n  events:  ${s.events.length}\n`)
}

export async function sessionLastCmd(opts: SessionCliOptions): Promise<void> {
  const s = loadLatestSession(resolveProject(opts))
  if (!s) {
    process.stderr.write(`[session] no session found\n`)
    process.exit(2)
  }
  process.stdout.write(JSON.stringify(s, null, 2) + '\n')
}

export async function sessionShowCmd(id: string, opts: SessionCliOptions): Promise<void> {
  const s = loadSession(resolveProject(opts), id)
  if (!s) {
    process.stderr.write(`[session] not found: ${id}\n`)
    process.exit(2)
  }
  process.stdout.write(JSON.stringify(s, null, 2) + '\n')
}

export async function sessionListCmd(opts: SessionCliOptions): Promise<void> {
  const rows = listSessions(resolveProject(opts))
  if (opts.json) {
    process.stdout.write(JSON.stringify({ count: rows.length, sessions: rows }, null, 2) + '\n')
    return
  }
  process.stdout.write(`Sessions: ${rows.length}\n`)
  for (const r of rows) {
    const tag = r.endedAt ? 'done' : 'open'
    process.stdout.write(`  [${tag}] ${r.id.padEnd(24)} ${r.startedAt}  ${r.description}\n`)
  }
}
