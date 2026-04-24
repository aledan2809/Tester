/**
 * T-C4 — Phase-aware affected-test mapper.
 *
 * Tests declare tags via a comment header in the first N (default 20)
 * lines of the file. Mapper walks a test dir, extracts tag sets, and
 * returns which files are affected by a given tag list so `tester run
 * --affected --tags auth,billing` can run only the relevant subset.
 *
 * Tag header conventions (any of these, first-match wins):
 *   // @tags auth billing
 *   // tester-tags: auth,billing
 *   /* @tags auth billing *\/
 *
 * Tags are lowercase alphanumeric + `.`/`-`; duplicates deduped.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

const TAG_SANITIZER = /[^a-z0-9./-]/g
const TAG_RE_LINE = /^\s*(?:\/\/|\*)\s*(?:@tags|tester-tags:)\s+(.+?)\s*$/i
const HEADER_LINES = 20
const TEST_EXTENSIONS = /\.(?:spec|test)\.(?:ts|tsx|js|mjs|cjs)$/

export interface AffectedOptions {
  tags: string[]
  /** Directory to scan recursively (default <root>/tests). */
  dir?: string
  /** How many lines of head to consider for tag headers. */
  headerLines?: number
  /** Include files with NO tags (default false — untagged tests skipped). */
  includeUntagged?: boolean
}

export interface TaggedFile {
  file: string
  tags: string[]
}

function sanitizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(TAG_SANITIZER, '')
    .replace(/^[-.]+|[-.]+$/g, '')
}

export function parseTagsFromHeader(content: string, headerLines = HEADER_LINES): string[] {
  const lines = content.split(/\r?\n/).slice(0, headerLines)
  const seen = new Set<string>()
  for (const line of lines) {
    const m = line.match(TAG_RE_LINE)
    if (!m) continue
    const rawTags = m[1].split(/[\s,]+/)
    for (const t of rawTags) {
      const clean = sanitizeTag(t)
      if (clean) seen.add(clean)
    }
  }
  return [...seen].sort()
}

export function walkTestFiles(root: string): string[] {
  if (!fs.existsSync(root)) return []
  const out: string[] = []
  const stack: string[] = [root]
  while (stack.length > 0) {
    const dir = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue
        stack.push(full)
      } else if (e.isFile() && TEST_EXTENSIONS.test(e.name)) {
        out.push(full)
      }
    }
  }
  return out.sort()
}

export function indexTaggedFiles(root: string, headerLines = HEADER_LINES): TaggedFile[] {
  const files = walkTestFiles(root)
  const out: TaggedFile[] = []
  for (const f of files) {
    let content: string
    try {
      content = fs.readFileSync(f, 'utf8')
    } catch {
      continue
    }
    out.push({ file: f, tags: parseTagsFromHeader(content, headerLines) })
  }
  return out
}

export interface AffectedResult {
  tags: string[]
  matched: TaggedFile[]
  skipped_untagged: TaggedFile[]
  total_files: number
}

export function findAffectedFiles(
  root: string,
  opts: AffectedOptions,
): AffectedResult {
  const searchDir = opts.dir ? path.resolve(opts.dir) : path.join(root, 'tests')
  const index = indexTaggedFiles(searchDir, opts.headerLines)
  const wanted = new Set(opts.tags.map(sanitizeTag).filter(Boolean))
  const matched: TaggedFile[] = []
  const untagged: TaggedFile[] = []
  for (const tf of index) {
    if (tf.tags.length === 0) {
      untagged.push(tf)
      if (opts.includeUntagged) matched.push(tf)
      continue
    }
    if (tf.tags.some((t) => wanted.has(t))) {
      matched.push(tf)
    }
  }
  return {
    tags: [...wanted].sort(),
    matched,
    skipped_untagged: untagged,
    total_files: index.length,
  }
}
