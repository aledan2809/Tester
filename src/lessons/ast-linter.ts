/**
 * T-003 (roadmap item) — AST-based linter.
 *
 * Complements the regex-based scanner with AST inspection for patterns
 * regex can't express cleanly — most importantly the "absence of X"
 * condition that L-42 (`requireAdmin` without `requireDomainAdmin`) needs.
 *
 * Design:
 *   - Uses `ts-morph` (TypeScript compiler API wrapper) for syntactic analysis
 *   - AST check runs AFTER the regex scanner; a lesson's ast_check (if present)
 *     REFINES the regex match (keeps or discards a finding based on AST signal)
 *   - A lesson opts in by adding `ast_check: <check-id>` inside a detection rule;
 *     the linter maps check-id to a registered checker function
 *
 * Registered AST checkers (Day-1 surface):
 *   - `require-domain-admin-pair` — closes L-42 regex false-positive:
 *     only keep the match if the same file does NOT contain a call expression
 *     named `requireDomainAdmin` (case-sensitive). Skip directive still wins.
 *
 * Additional checkers can be added without schema changes: extend
 * AST_CHECKERS registry; a lesson YAML references the check-id in its
 * detection rule. Unknown check-ids are no-ops (fail-open) with a warning.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { Project, SourceFile, SyntaxKind, Node } from 'ts-morph'
import type { ScanMatch } from './schema'

export type AstCheckId = 'require-domain-admin-pair' | string

export interface AstCheckContext {
  file: string
  fileContent: string
  sourceFile: SourceFile
  match: ScanMatch
}

export interface AstCheckResult {
  keep: boolean
  note?: string
}

/**
 * Registered AST checkers. Each returns `{ keep: true }` to preserve the
 * upstream regex match, `{ keep: false }` to discard it as a false positive.
 */
const AST_CHECKERS: Record<string, (ctx: AstCheckContext) => AstCheckResult> = {
  'require-domain-admin-pair': (ctx) => {
    const hasDomainAdminCall = ctx.sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .some((call) => {
        const expr = call.getExpression()
        const text = expr.getText()
        return (
          text === 'requireDomainAdmin' ||
          text.endsWith('.requireDomainAdmin') ||
          /\brequireDomainAdmin\b/.test(text)
        )
      })
    if (hasDomainAdminCall) {
      return {
        keep: false,
        note: 'file already calls requireDomainAdmin — L-42 pair satisfied',
      }
    }
    return { keep: true }
  },
}

/**
 * Lazily-initialized ts-morph Project. We share a single instance across
 * refineMatches calls because Project construction is ~40ms overhead.
 */
let sharedProject: Project | null = null
function getProject(): Project {
  if (!sharedProject) {
    sharedProject = new Project({
      useInMemoryFileSystem: false,
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
      compilerOptions: { allowJs: true, noEmit: true, target: 99 /* ESNext */ },
    })
  }
  return sharedProject
}

export interface RefineOptions {
  /** Lookup: lesson_id → detection rule → optional ast_check id. */
  astChecksPerLesson?: Record<string, AstCheckId | undefined>
}

/**
 * Refine a list of ScanMatches from the regex scanner: for each match whose
 * lesson declares an `ast_check`, run the registered checker. Matches flagged
 * `keep: false` are dropped (false positive). Matches without ast_check
 * declarations pass through untouched.
 *
 * Matches are grouped per file so we load each source file at most once.
 */
export function refineMatches(matches: ScanMatch[], opts: RefineOptions = {}): ScanMatch[] {
  const astMap = opts.astChecksPerLesson || {}
  if (matches.length === 0) return matches

  const byFile = new Map<string, ScanMatch[]>()
  for (const m of matches) {
    const arr = byFile.get(m.file) || []
    arr.push(m)
    byFile.set(m.file, arr)
  }

  const project = getProject()
  const kept: ScanMatch[] = []

  for (const [file, fileMatches] of byFile) {
    // If no match needs AST refinement, short-circuit.
    const anyAstCheck = fileMatches.some((m) => astMap[m.lesson_id])
    if (!anyAstCheck) {
      kept.push(...fileMatches)
      continue
    }

    // Load source file. If not a TS/JS file we can parse, pass through.
    let sf: SourceFile
    try {
      const existing = project.getSourceFile(file)
      if (existing) {
        sf = existing
        sf.replaceWithText(fs.readFileSync(file, 'utf8'))
      } else {
        sf = project.addSourceFileAtPath(file)
      }
    } catch {
      kept.push(...fileMatches)
      continue
    }

    const fileContent = sf.getFullText()

    for (const m of fileMatches) {
      const checkId = astMap[m.lesson_id]
      if (!checkId) {
        kept.push(m)
        continue
      }
      const checker = AST_CHECKERS[checkId]
      if (!checker) {
        // Unknown check-id → fail-open (keep) + warn via stderr side-channel.
        process.stderr.write(
          `[lessons] ast-linter WARN: unknown ast_check "${checkId}" on lesson ${m.lesson_id}; keeping match\n`,
        )
        kept.push(m)
        continue
      }
      const verdict = checker({ file, fileContent, sourceFile: sf, match: m })
      if (verdict.keep) {
        kept.push(m)
      }
    }
  }

  return kept
}

export { AST_CHECKERS, getProject as _getProjectForTests, Node as _Node }

/**
 * Helper exported for tests: run a single AST check against a file path.
 * Returns the checker's verdict plus metadata. Used by regression-battery to
 * verify L-42 AST refinement catches the requireDomainAdmin pair.
 */
export function runSingleCheck(checkId: AstCheckId, file: string, match: ScanMatch): AstCheckResult {
  const checker = AST_CHECKERS[checkId]
  if (!checker) return { keep: true, note: `unknown checker: ${checkId}` }
  const project = getProject()
  const existing = project.getSourceFile(file)
  const sf = existing ? (existing.replaceWithText(fs.readFileSync(file, 'utf8')), existing) : project.addSourceFileAtPath(file)
  const fileContent = sf.getFullText()
  return checker({ file, fileContent, sourceFile: sf, match })
}

// Marker for dead-code detection if the linter bundle drops the module.
export const _AST_LINTER_LOADED = true

// Path re-export for configs that want to reference the checker IDs without importing types.
export const AST_CHECK_IDS = Object.keys(AST_CHECKERS) as AstCheckId[]

// Helper for when a caller wants to resolve a check-id from the lesson YAML
// structure directly, without pre-building the astChecksPerLesson map.
export function buildAstChecksFromLessons(lessons: Array<{ id: string; detection: Array<{ ast_check?: string }> }>): Record<string, AstCheckId | undefined> {
  const out: Record<string, AstCheckId | undefined> = {}
  for (const l of lessons) {
    for (const rule of l.detection || []) {
      if (rule.ast_check) {
        out[l.id] = rule.ast_check as AstCheckId
        break
      }
    }
  }
  return out
}

// Silence "unused import" on platforms that drop the path import.
void path
