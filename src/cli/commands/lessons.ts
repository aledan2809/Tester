/**
 * T-000 — `tester lessons <action>` CLI handler.
 *
 * Day-1 actions:
 *   - list            enumerate corpus (filter by severity/tags)
 *   - scan <path>     run detection regexes, report matches (auto-records hits)
 * Day-2 actions:
 *   - diagnose <log>  post-failure symptom lookup, top-N remediation matches
 *   - stats           hit counts per lesson (for promotion/pruning in Day-4)
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadLessons, findLessonsDir } from '../../lessons/loader'
import { scan } from '../../lessons/scanner'
import { diagnoseFile } from '../../lessons/diagnoser'
import { recordHits, statsSummary, loadStats } from '../../lessons/stats'
import { validateLessonFiles } from '../../lessons/validator'
import { installHooks, uninstallHooks } from '../../lessons/hooks'
import { importFromFile } from '../../lessons/importer'
import { computePromotionPlan } from '../../lessons/promotion'
import { refineMatches, buildAstChecksFromLessons } from '../../lessons/ast-linter'
import { classify as classifyFailure } from '../../lessons/classifier'
import type { FailureContext } from '../../lessons/classifier'
import type { Lesson, LessonSeverity, ScanMatch } from '../../lessons/schema'

const fsExistsSync = fs.existsSync

interface ListOptions {
  severity?: string
  tags?: string
  json?: boolean
  dir?: string
}

interface ScanOptions {
  json?: boolean
  dir?: string
  failOnMatch?: boolean
  recordStats?: boolean
  context?: string
}

interface DiagnoseOptions {
  json?: boolean
  dir?: string
  topN?: number
}

interface StatsOptions {
  json?: boolean
  dir?: string
}

interface ValidateOptions {
  json?: boolean
  dir?: string
  repoRoot?: string
  run?: boolean
}

interface InstallHooksOptions {
  dir?: string
  uninstall?: boolean
  project?: string
  targets?: string
}

interface ImportOptions {
  out?: string
  json?: boolean
}

interface PromoteOptions {
  dir?: string
  json?: boolean
  promoteThreshold?: number
  muteMonths?: number
}

const SEVERITY_ORDER: Record<LessonSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

const VALID_SEVERITIES = new Set<string>(['info', 'low', 'medium', 'high', 'critical'])

function validateSeverityFlag(severity: string | undefined): void {
  if (severity && !VALID_SEVERITIES.has(severity)) {
    process.stderr.write(
      `[lessons] ERROR: --severity must be one of info|low|medium|high|critical, got: ${severity}\n`,
    )
    process.exit(2)
  }
}

function resolveCorpus(override?: string): { lessons: Lesson[]; dir: string; errors: number } {
  const dir = override ? path.resolve(override) : findLessonsDir()
  const result = loadLessons(dir)
  if (result.errors.length) {
    for (const err of result.errors) {
      process.stderr.write(`[lessons] WARN: ${err.file}: ${err.message}\n`)
    }
  }
  return { lessons: result.lessons, dir, errors: result.errors.length }
}

export async function lessonsList(opts: ListOptions): Promise<void> {
  validateSeverityFlag(opts.severity)
  const { lessons, dir } = resolveCorpus(opts.dir)

  const filterTags = opts.tags
    ? new Set(opts.tags.split(',').map((t) => t.trim()).filter(Boolean))
    : null

  const filtered = lessons.filter((l) => {
    if (opts.severity && l.severity !== opts.severity) return false
    if (filterTags) {
      if (!l.tags.some((t) => filterTags.has(t))) return false
    }
    return true
  })

  filtered.sort((a, b) => {
    const ord = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]
    if (ord !== 0) return ord
    return a.id.localeCompare(b.id)
  })

  if (opts.json) {
    process.stdout.write(JSON.stringify({ corpus: dir, count: filtered.length, lessons: filtered }, null, 2) + '\n')
    return
  }

  process.stdout.write(`Corpus: ${dir}\n`)
  process.stdout.write(`Total: ${filtered.length} active lesson(s)\n\n`)

  for (const l of filtered) {
    const badge = `[${l.severity.toUpperCase()}]`
    process.stdout.write(`${l.id.padEnd(8)} ${badge.padEnd(12)} ${l.title}\n`)
    process.stdout.write(`         tags: ${l.tags.join(', ') || '(none)'}\n`)
    process.stdout.write(`         projects: ${l.projects_hit.join(', ') || '(none)'} | hit_count: ${l.hit_count} | status: ${l.status}\n`)
    process.stdout.write(`         detection rules: ${l.detection.length}\n`)
    if (l.regression_test) {
      process.stdout.write(`         regression: ${l.regression_test}\n`)
    }
    process.stdout.write('\n')
  }
}

export async function lessonsScan(target: string, opts: ScanOptions): Promise<void> {
  const { lessons, dir } = resolveCorpus(opts.dir)

  if (lessons.length === 0) {
    process.stderr.write(`[lessons] no lessons loaded from ${dir}\n`)
    process.exit(2)
  }

  const resolvedTarget = path.resolve(target)
  if (!fsExistsSync(resolvedTarget)) {
    process.stderr.write(`[lessons] ERROR: scan target does not exist: ${resolvedTarget}\n`)
    process.exit(2)
  }
  let matches = scan(resolvedTarget, lessons)

  // T-003 (roadmap) — AST refinement pass. Lessons with `ast_check:` on a
  // detection rule get their matches post-filtered via ts-morph. Closes L-42
  // regex false-positive when file contains BOTH requireAdmin + requireDomainAdmin.
  try {
    const astMap = buildAstChecksFromLessons(lessons as Array<{ id: string; detection: Array<{ ast_check?: string }> }>)
    if (Object.keys(astMap).length > 0) {
      matches = refineMatches(matches, { astChecksPerLesson: astMap })
    }
  } catch (e) {
    process.stderr.write(`[lessons] AST refinement failed (non-blocking): ${(e as Error).message}\n`)
  }

  if (opts.recordStats !== false && matches.length > 0) {
    const uniqueIds = Array.from(new Set(matches.map((m) => m.lesson_id)))
    const ctx = opts.context || 'cli-scan'
    recordHits(dir, uniqueIds, ctx)
  }

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          corpus: dir,
          target: resolvedTarget,
          lessons_loaded: lessons.length,
          matches_count: matches.length,
          matches,
        },
        null,
        2,
      ) + '\n',
    )
  } else {
    process.stdout.write(`Corpus: ${dir} (${lessons.length} lessons)\n`)
    process.stdout.write(`Target: ${resolvedTarget}\n\n`)

    if (matches.length === 0) {
      process.stdout.write('No matches. ✓\n')
    } else {
      process.stdout.write(`${matches.length} match(es):\n\n`)
      const byFile = new Map<string, ScanMatch[]>()
      for (const m of matches) {
        const arr = byFile.get(m.file) || []
        arr.push(m)
        byFile.set(m.file, arr)
      }
      for (const [file, fileMatches] of byFile) {
        process.stdout.write(`${file}\n`)
        for (const m of fileMatches) {
          const badge = `[${m.severity.toUpperCase()}]`
          process.stdout.write(`  ${m.line}:${m.column}  ${badge.padEnd(11)} ${m.lesson_id} — ${m.lesson_title}\n`)
          process.stdout.write(`                         ${m.detection_message}\n`)
          process.stdout.write(`                         matched: ${m.matched_text.replace(/\n/g, '\\n').slice(0, 100)}\n`)
        }
        process.stdout.write('\n')
      }
    }
  }

  if (opts.failOnMatch !== false && matches.length > 0) {
    process.exit(1)
  }
}

export async function lessonsDiagnose(logPath: string, opts: DiagnoseOptions): Promise<void> {
  const { lessons, dir } = resolveCorpus(opts.dir)
  if (lessons.length === 0) {
    process.stderr.write(`[lessons] no lessons loaded from ${dir}\n`)
    process.exit(2)
  }
  const resolvedLog = path.resolve(logPath)
  if (!fsExistsSync(resolvedLog)) {
    process.stderr.write(`[lessons] ERROR: log file does not exist: ${resolvedLog}\n`)
    process.exit(2)
  }
  const topN = opts.topN && opts.topN > 0 ? opts.topN : 3
  const matches = diagnoseFile(resolvedLog, lessons, topN)

  if (matches.length > 0) {
    const uniqueIds = matches.map((m) => m.lesson_id)
    recordHits(dir, uniqueIds, 'cli-diagnose')
  }

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        { corpus: dir, log: resolvedLog, lessons_loaded: lessons.length, matches_count: matches.length, matches },
        null,
        2,
      ) + '\n',
    )
    return
  }

  process.stdout.write(`Corpus: ${dir} (${lessons.length} lessons)\n`)
  process.stdout.write(`Log:    ${resolvedLog}\n\n`)

  if (matches.length === 0) {
    process.stdout.write('No lesson matches the failure signatures in this log.\n')
    return
  }

  process.stdout.write(`Top ${matches.length} lesson match(es):\n\n`)
  for (const [i, m] of matches.entries()) {
    const badge = `[${m.severity.toUpperCase()}]`
    const confidencePct = Math.round(m.confidence * 100)
    process.stdout.write(`${i + 1}. ${m.lesson_id} ${badge.padEnd(11)} — ${m.lesson_title}\n`)
    process.stdout.write(`   confidence: ${confidencePct}% (${m.matched_signatures.length} signature(s) matched)\n`)
    if (m.matched_signatures.length) {
      process.stdout.write(`   signatures: ${m.matched_signatures.join(' | ').slice(0, 180)}\n`)
    }
    if (m.remediation) {
      const first = m.remediation.split('\n').find((l) => l.trim())?.trim() || ''
      process.stdout.write(`   remediation: ${first.slice(0, 160)}\n`)
    }
    process.stdout.write('\n')
  }
}

export async function lessonsStats(opts: StatsOptions): Promise<void> {
  const { dir } = resolveCorpus(opts.dir)
  const entries = statsSummary(dir)
  if (opts.json) {
    process.stdout.write(JSON.stringify({ corpus: dir, count: entries.length, entries }, null, 2) + '\n')
    return
  }
  process.stdout.write(`Corpus: ${dir}\n`)
  if (entries.length === 0) {
    process.stdout.write('No recorded hits yet. Run `tester lessons scan <path>` to populate.\n')
    return
  }
  process.stdout.write(`Hit counts (${entries.length} lesson(s)):\n\n`)
  for (const e of entries) {
    process.stdout.write(`  ${e.lesson_id.padEnd(10)} hits=${String(e.hits).padStart(4)}  last=${e.last_hit}\n`)
  }
}

export async function lessonsValidate(opts: ValidateOptions): Promise<void> {
  const { lessons, dir } = resolveCorpus(opts.dir)
  const repoRoot = opts.repoRoot ? path.resolve(opts.repoRoot) : path.dirname(path.resolve(dir))
  const summary = validateLessonFiles(lessons, repoRoot, { run: opts.run })

  if (opts.json) {
    process.stdout.write(JSON.stringify({ corpus: dir, repo_root: repoRoot, ...summary }, null, 2) + '\n')
  } else {
    process.stdout.write(`Corpus: ${dir}\n`)
    process.stdout.write(`Repo:   ${repoRoot}\n\n`)
    process.stdout.write(
      `Validation: ${summary.pass} pass / ${summary.fail} fail / ${summary.missing} missing / ${summary.skipped} skipped\n\n`,
    )
    for (const r of summary.results) {
      const badge = r.status === 'pass' ? '✓' : r.status === 'missing' ? '?' : r.status === 'skipped' ? '·' : '✗'
      process.stdout.write(
        `  ${badge} ${r.lesson_id.padEnd(10)} [${r.status.toUpperCase()}]${r.reason ? ' — ' + r.reason : ''}\n`,
      )
      if (r.regression_test && r.status === 'pass') {
        process.stdout.write(`      regression: ${r.regression_test}\n`)
      }
    }
  }

  if (summary.fail > 0 || summary.missing > 0) {
    process.exit(1)
  }
}

export async function lessonsImport(from: string, opts: ImportOptions): Promise<void> {
  const resolvedFrom = path.resolve(from)
  if (!fsExistsSync(resolvedFrom)) {
    process.stderr.write(`[lessons] ERROR: source file does not exist: ${resolvedFrom}\n`)
    process.exit(2)
  }

  const imported = importFromFile(resolvedFrom)

  if (opts.json) {
    process.stdout.write(JSON.stringify({ source: resolvedFrom, count: imported.length, imported }, null, 2) + '\n')
    return
  }

  if (imported.length === 0) {
    process.stdout.write(`No lesson candidates found in ${resolvedFrom}.\n`)
    process.stdout.write(`Hint: importer looks for markdown headers like "## L42 — Title" or "### L-24: Title".\n`)
    return
  }

  process.stdout.write(`Source: ${resolvedFrom}\n`)
  process.stdout.write(`Found ${imported.length} lesson candidate(s):\n\n`)

  if (opts.out) {
    const outDir = path.resolve(opts.out)
    fs.mkdirSync(outDir, { recursive: true })
    for (const l of imported) {
      const filename = `${l.proposed_id}-${l.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)}.yaml`
      const out = path.join(outDir, filename)
      fs.writeFileSync(out, `# IMPORTED — REVIEW BEFORE ACTIVATING\n# Source: ${l.source_file}:${l.source_line}\n# Needs review:\n${l.needs_review.map((r) => `#   - ${r}`).join('\n')}\n\n${l.yaml}`, 'utf8')
      process.stdout.write(`  → ${out}\n`)
    }
    process.stdout.write(`\nWrote ${imported.length} stub(s) to ${outDir}. Review each + fill detection regex before moving to lessons/.\n`)
  } else {
    for (const [i, l] of imported.entries()) {
      process.stdout.write(`--- [${i + 1}/${imported.length}] ${l.proposed_id} — ${l.title}\n`)
      process.stdout.write(`    source: ${path.relative(process.cwd(), l.source_file)}:${l.source_line}\n`)
      process.stdout.write(`    needs review:\n`)
      for (const r of l.needs_review) process.stdout.write(`      • ${r}\n`)
      process.stdout.write(`\n${l.yaml}\n`)
    }
    process.stdout.write(`Pass --out <dir> to write stubs to disk. Review each + fill detection regex.\n`)
  }
}

interface ClassifyOptions {
  json?: boolean
  dir?: string
  forceHeuristic?: boolean
}

export async function lessonsClassify(logPath: string, opts: ClassifyOptions): Promise<void> {
  const { dir } = resolveCorpus(opts.dir)
  const resolvedLog = path.resolve(logPath)
  if (!fsExistsSync(resolvedLog)) {
    process.stderr.write(`[lessons] ERROR: log file does not exist: ${resolvedLog}\n`)
    process.exit(2)
  }
  const raw = fs.readFileSync(resolvedLog, 'utf8')
  // Build a FailureContext from a free-form log blob. We use heuristics to
  // split assertion/stack/console — the classifier is tolerant of missing
  // fields and the sha256 signature is stable under the actual text content.
  const assertionMatch = raw.match(/(?:expected|assertion|expect\()([^\n]*)/i)
  const errorMatch = raw.match(/(?:Error:|TypeError:|SyntaxError:|RangeError:|ReferenceError:)([^\n]*)/)
  const urlMatch = raw.match(/https?:\/\/[^\s"')]+/)
  const stackLines = raw
    .split('\n')
    .filter((l) => /^\s+at\s/.test(l))
    .slice(0, 20)
    .join('\n')
  const consoleLines = raw
    .split('\n')
    .filter((l) => /console\.(log|error|warn|info)/.test(l))
    .slice(0, 10)
  const ctx: FailureContext = {
    assertion: assertionMatch ? assertionMatch[0] : undefined,
    errorMessage: errorMatch ? errorMatch[0] : undefined,
    stackTrace: stackLines || undefined,
    consoleErrors: consoleLines.length ? consoleLines : undefined,
    pageUrl: urlMatch ? urlMatch[0] : undefined,
    notes: raw.slice(0, 2000),
  }

  const verdict = await classifyFailure(ctx, { corpusDir: dir, forceHeuristic: opts.forceHeuristic })

  if (opts.json) {
    process.stdout.write(JSON.stringify({ corpus: dir, log: resolvedLog, context_signature: verdict.signature, ...verdict }, null, 2) + '\n')
    return
  }

  const badge = verdict.verdict === 'PRODUCT_BUG' ? '⚑' : verdict.verdict === 'HARNESS_BUG' ? '🔧' : verdict.verdict === 'FLAKE' ? '⚡' : '⚙'
  process.stdout.write(`Corpus: ${dir}\n`)
  process.stdout.write(`Log:    ${resolvedLog}\n\n`)
  process.stdout.write(`${badge} Verdict: ${verdict.verdict}  (confidence ${Math.round(verdict.confidence * 100)}%, source=${verdict.source}${verdict.cached ? ', cached' : ''})\n`)
  process.stdout.write(`  reasoning:   ${verdict.reasoning}\n`)
  process.stdout.write(`  remediation: ${verdict.remediation}\n`)
  process.stdout.write(`  signature:   ${verdict.signature.slice(0, 16)}…\n`)
}

export async function lessonsPromote(opts: PromoteOptions): Promise<void> {
  const { lessons, dir } = resolveCorpus(opts.dir)
  const stats = loadStats(dir)
  const plan = computePromotionPlan(lessons, stats, {
    promote_threshold: opts.promoteThreshold ?? 5,
    mute_months: opts.muteMonths ?? 6,
  })

  if (opts.json) {
    process.stdout.write(JSON.stringify({ corpus: dir, ...plan }, null, 2) + '\n')
    return
  }

  process.stdout.write(`Corpus: ${dir}\n`)
  process.stdout.write(
    `Promotion plan (dry-run — stats-driven): ${plan.promotions.length} promote / ${plan.mutes.length} mute / ${plan.no_change} no-change\n\n`,
  )

  if (plan.promotions.length === 0 && plan.mutes.length === 0) {
    process.stdout.write('No changes proposed. Corpus is stable with current hit counts.\n')
    return
  }

  if (plan.promotions.length) {
    process.stdout.write('Promotions (severity bumps):\n')
    for (const p of plan.promotions) {
      process.stdout.write(
        `  ↑ ${p.lesson_id.padEnd(10)} ${p.current_severity} → ${p.proposed_severity} (${p.reason})\n`,
      )
    }
    process.stdout.write('\n')
  }
  if (plan.mutes.length) {
    process.stdout.write('Mutes (auto-demote to status=muted):\n')
    for (const p of plan.mutes) {
      process.stdout.write(`  ↓ ${p.lesson_id.padEnd(10)} ${p.current_status} → ${p.proposed_status} (${p.reason})\n`)
    }
    process.stdout.write('\n')
  }
  process.stdout.write(
    'NOTE: dry-run only. To apply, manually edit YAML files or wait for --apply support (post-Day-4).\n',
  )
}

export async function lessonsInstallHooks(opts: InstallHooksOptions): Promise<void> {
  const projectRoot = opts.project ? path.resolve(opts.project) : process.cwd()
  const targets = opts.targets
    ? opts.targets.split(',').map((s) => s.trim()).filter(Boolean)
    : ['tests/', 'src/']

  const result = opts.uninstall ? uninstallHooks(projectRoot) : installHooks(projectRoot, targets)

  let badge: string
  if (opts.uninstall) {
    badge = '✓ uninstalled'
  } else if (result.installed) {
    badge = '✓ installed'
  } else {
    badge = '✗ failed'
  }

  process.stdout.write(`${badge}: ${result.path || projectRoot}\n`)
  process.stdout.write(`  ${result.message}\n`)
  if (result.backed_up) {
    process.stdout.write(`  backup: ${result.backed_up}\n`)
  }
  if (!result.installed && !opts.uninstall) {
    process.exit(2)
  }
}
