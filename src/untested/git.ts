/**
 * T-006 — Git-since attribution for `tester untested --since <sha>`.
 *
 * Given a commit sha and a project root, returns the set of files
 * changed since that sha (inclusive → HEAD). Pure, synchronous, uses
 * `git` on PATH. Missing git / bad repo / bad sha all return an empty
 * set with a descriptive error — callers decide how to handle (our CLI
 * surfaces it as a warning and falls back to "no filter").
 *
 * We also expose a blame helper that attributes individual lines of a
 * specific file to commits, so `tester untested --since <sha>` can say
 * "AUDIT_GAPS.md row G-123 was added in commit <x>".
 */

import { execFileSync } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'

export interface ChangedFilesResult {
  ok: boolean
  error?: string
  changed: Set<string>
  /** Absolute versions of the above, for easy matching against evidenceFile. */
  changedAbs: Set<string>
}

function isGitRepo(root: string): boolean {
  return fs.existsSync(path.join(root, '.git')) || fs.existsSync(path.join(root, '.git', 'HEAD'))
}

export function filesChangedSince(projectRoot: string, sha: string): ChangedFilesResult {
  const empty: ChangedFilesResult = { ok: false, changed: new Set(), changedAbs: new Set() }
  if (!sha || typeof sha !== 'string') {
    return { ...empty, error: 'sha required' }
  }
  if (!isGitRepo(projectRoot)) {
    return { ...empty, error: `not a git repository: ${projectRoot}` }
  }
  let stdout: string
  try {
    stdout = execFileSync(
      'git',
      ['-C', projectRoot, 'diff', '--name-only', `${sha}..HEAD`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: Buffer | string }
    const stderr = err.stderr ? err.stderr.toString() : err.message
    return { ...empty, error: `git diff failed: ${stderr.trim().split('\n')[0]}` }
  }
  const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean)
  const changed = new Set<string>(lines)
  const changedAbs = new Set<string>(lines.map((rel) => path.resolve(projectRoot, rel)))
  return { ok: true, changed, changedAbs }
}

export interface BlameEntry {
  line: number
  sha: string
  author: string
  date: string
  text: string
}

/**
 * Run `git blame --line-porcelain` on a file path and return per-line
 * attribution. Only called when the caller needs row-level granularity
 * (AUDIT_GAPS rows, DEVELOPMENT_STATUS TODO items); expensive so guarded
 * behind `--since`.
 */
export function blameFile(projectRoot: string, filePath: string): BlameEntry[] {
  if (!isGitRepo(projectRoot)) return []
  const rel = path.isAbsolute(filePath) ? path.relative(projectRoot, filePath) : filePath
  let stdout: string
  try {
    stdout = execFileSync(
      'git',
      ['-C', projectRoot, 'blame', '--line-porcelain', '--', rel],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
  } catch {
    return []
  }
  const entries: BlameEntry[] = []
  const lines = stdout.split('\n')
  let current: Partial<BlameEntry> = {}
  let lineNum = 0
  for (const line of lines) {
    if (/^[0-9a-f]{40}/.test(line)) {
      const parts = line.split(/\s+/)
      current = { sha: parts[0] }
      lineNum = parseInt(parts[2], 10) || 0
    } else if (line.startsWith('author ')) {
      current.author = line.slice(7).trim()
    } else if (line.startsWith('author-time ')) {
      const ts = parseInt(line.slice(12).trim(), 10)
      current.date = Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : ''
    } else if (line.startsWith('\t')) {
      entries.push({
        line: lineNum,
        sha: current.sha || '',
        author: current.author || '',
        date: current.date || '',
        text: line.slice(1),
      })
    }
  }
  return entries
}

export interface AttributionInfo {
  sha: string
  author: string
  date: string
  line: number
}

/**
 * Given blame entries + a text fragment (e.g. a gap id or TODO bullet),
 * find the first line whose content includes the fragment and return
 * the commit that introduced it.
 */
export function attributeByText(
  blame: BlameEntry[],
  fragment: string,
): AttributionInfo | null {
  if (!fragment) return null
  const needle = fragment.trim()
  for (const b of blame) {
    if (b.text.includes(needle)) {
      return { sha: b.sha, author: b.author, date: b.date, line: b.line }
    }
  }
  return null
}

/**
 * Check whether a given absolute file path was changed since `sha`.
 * Uses the pre-computed set from filesChangedSince so callers avoid
 * re-invoking git per-item.
 */
export function wasChangedSince(
  result: ChangedFilesResult,
  absPath: string,
): boolean {
  if (!result.ok) return false
  return result.changedAbs.has(absPath)
}
