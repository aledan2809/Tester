/**
 * T-000 — Lesson corpus loader.
 *
 * Reads YAML files from a lessons/ directory, parses with js-yaml, validates
 * required fields, returns Lesson[] + collected errors. Skips files that
 * fail validation rather than aborting (one bad lesson shouldn't break scan).
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import type { Lesson, LoaderError, LoaderResult } from './schema'

const REQUIRED_FIELDS = [
  'id',
  'slug',
  'title',
  'first_observed',
  'projects_hit',
  'contexts_hit',
  'hit_count',
  'severity',
  'tags',
  'detection',
  'status',
] as const

const VALID_SEVERITIES = new Set(['info', 'low', 'medium', 'high', 'critical'])
const VALID_STATUSES = new Set(['active', 'muted', 'deprecated'])

function validateLesson(raw: unknown, file: string): Lesson | LoaderError {
  if (!raw || typeof raw !== 'object') {
    return { file, message: 'YAML root is not an object' }
  }
  const obj = raw as Record<string, unknown>

  for (const field of REQUIRED_FIELDS) {
    if (!(field in obj) || obj[field] === null || obj[field] === undefined) {
      return { file, message: `missing required field: ${field}` }
    }
  }

  if (typeof obj.id !== 'string' || !/^L[-_A-Za-z0-9]+$/.test(obj.id as string)) {
    return { file, message: `id must match /^L[-_A-Za-z0-9]+$/, got: ${String(obj.id)}` }
  }

  if (!VALID_SEVERITIES.has(obj.severity as string)) {
    return { file, message: `severity must be one of info|low|medium|high|critical, got: ${String(obj.severity)}` }
  }

  if (!VALID_STATUSES.has(obj.status as string)) {
    return { file, message: `status must be one of active|muted|deprecated, got: ${String(obj.status)}` }
  }

  if (!Array.isArray(obj.detection) || obj.detection.length === 0) {
    return { file, message: 'detection must be a non-empty array' }
  }

  for (const [i, rule] of (obj.detection as unknown[]).entries()) {
    if (!rule || typeof rule !== 'object') {
      return { file, message: `detection[${i}] is not an object` }
    }
    const r = rule as Record<string, unknown>
    if (typeof r.type !== 'string' || typeof r.pattern !== 'string' || typeof r.message !== 'string') {
      return { file, message: `detection[${i}] must have string fields: type, pattern, message` }
    }
    try {
      new RegExp(r.pattern)
    } catch (e) {
      return { file, message: `detection[${i}].pattern is not valid regex: ${(e as Error).message}` }
    }
  }

  return obj as unknown as Lesson
}

export function parseYamlLesson(content: string, file = '<inline>'): Lesson | LoaderError {
  let parsed: unknown
  try {
    parsed = yaml.load(content)
  } catch (e) {
    return { file, message: `YAML parse error: ${(e as Error).message}` }
  }
  return validateLesson(parsed, file)
}

export function loadLessons(dir: string): LoaderResult {
  const lessons: Lesson[] = []
  const errors: LoaderError[] = []

  if (!fs.existsSync(dir)) {
    return { lessons, errors: [{ file: dir, message: 'lessons directory does not exist' }] }
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!/\.(ya?ml)$/i.test(entry.name)) continue
    const file = path.join(dir, entry.name)
    const content = fs.readFileSync(file, 'utf8')
    const result = parseYamlLesson(content, file)
    if ('message' in result && !('id' in result)) {
      errors.push(result)
    } else {
      lessons.push(result as Lesson)
    }
  }

  const seen = new Set<string>()
  for (const l of lessons) {
    if (seen.has(l.id)) {
      errors.push({ file: 'corpus', message: `duplicate lesson id: ${l.id}` })
    }
    seen.add(l.id)
  }

  return { lessons, errors }
}

export function findLessonsDir(cwd = process.cwd()): string {
  let current = path.resolve(cwd)
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(current, 'lessons')
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return path.join(cwd, 'lessons')
}
