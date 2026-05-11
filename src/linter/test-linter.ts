/**
 * T-003 Half A — test-side linter.
 *
 * Walks test files (*.spec.ts, *.test.ts) using ts-morph AST analysis and
 * reports violations of the 4 linter rules:
 *   - fragile-query-selector
 *   - text-content-primary
 *   - short-timeout-auth
 *   - invalid-css-chars
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { Project, SyntaxKind, Node } from 'ts-morph'
import type { LintViolation, LintSeverity } from './rules'
import {
  RULE_FRAGILE_QUERY_SELECTOR,
  RULE_TEXT_CONTENT_PRIMARY,
  RULE_SHORT_TIMEOUT_AUTH,
  RULE_INVALID_CSS_CHARS,
  isStableSelector,
  hasFragileChars,
  hasInvalidCssChars,
  snippetAt,
} from './rules'

const STABLE_ATTR_RE = /\[(data-testid|name|aria-label|id|role|type)=/

export interface LintOptions {
  /** Severity override: 'warn' keeps going, 'error' is blocking. Default per-rule. */
  severity?: LintSeverity
  /** Minimum timeout ms below which short-timeout rule fires (default 500). */
  minTimeoutMs?: number
}

const TEST_FILE_RE = /\.(spec|test)\.[cm]?[tj]sx?$/

function collectTestFiles(dir: string): string[] {
  const out: string[] = []
  function walk(d: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git') continue
      const full = path.join(d, e.name)
      if (e.isDirectory()) {
        walk(full)
      } else if (e.isFile() && TEST_FILE_RE.test(e.name)) {
        out.push(full)
      }
    }
  }
  walk(dir)
  return out
}

/** Returns true if the node is inside a function with an auth/nav-flavoured name. */
function inAuthOrNavContext(node: Node): boolean {
  let cur: Node | undefined = node.getParent()
  while (cur) {
    const kind = cur.getKind()
    if (
      kind === SyntaxKind.FunctionDeclaration ||
      kind === SyntaxKind.FunctionExpression ||
      kind === SyntaxKind.ArrowFunction ||
      kind === SyntaxKind.MethodDeclaration
    ) {
      const nameNode =
        kind === SyntaxKind.FunctionDeclaration || kind === SyntaxKind.MethodDeclaration
          ? (cur as import('ts-morph').FunctionDeclaration).getNameNode?.()
          : undefined
      const name = nameNode?.getText() ?? ''
      if (/login|auth|sign[_-]?in|navigate|goto|visit|open/i.test(name)) return true
    }
    // Also check parent describe/it/test name string
    if (kind === SyntaxKind.CallExpression) {
      const callExpr = cur as import('ts-morph').CallExpression
      const callee = callExpr.getExpression().getText()
      if (/^(it|test|describe)$/.test(callee)) {
        const firstArg = callExpr.getArguments()[0]
        const label = firstArg?.getText() ?? ''
        if (/login|auth|sign[_-]?in|navigate|goto/i.test(label)) return true
      }
    }
    cur = cur.getParent()
  }
  return false
}

export function lintFile(filePath: string, opts: LintOptions = {}): LintViolation[] {
  const source = fs.readFileSync(filePath, 'utf8')
  const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true })
  const sf = project.createSourceFile('__lint__.ts', source)
  const violations: LintViolation[] = []
  const minMs = opts.minTimeoutMs ?? 500
  const sev = opts.severity

  function violation(
    ruleId: string,
    defaultSeverity: LintSeverity,
    message: string,
    node: Node,
  ): LintViolation {
    const pos = node.getStart()
    const { line, column } = sf.getLineAndColumnAtPos(pos)
    return {
      ruleId,
      severity: sev ?? defaultSeverity,
      message,
      file: filePath,
      line,
      col: column,
      snippet: snippetAt(source, pos),
    }
  }

  sf.forEachDescendant((node) => {
    // ── Rule 1 + 4: fragile-query-selector / invalid-css-chars ──────────────
    if (Node.isCallExpression(node)) {
      const expr = node.getExpression().getText()
      if (/querySelector(All)?/.test(expr)) {
        const args = node.getArguments()
        if (args.length > 0) {
          const arg = args[0]
          let sel = ''
          if (Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg)) {
            sel = arg.getLiteralText()
          }
          if (sel) {
            if (!isStableSelector(sel) && hasFragileChars(sel)) {
              violations.push(
                violation(
                  RULE_FRAGILE_QUERY_SELECTOR,
                  'warn',
                  `Fragile selector "${sel}" — prefer [data-testid=...], [name=...], or [aria-label=...]`,
                  arg,
                ),
              )
            }
            if (hasInvalidCssChars(sel)) {
              violations.push(
                violation(
                  RULE_INVALID_CSS_CHARS,
                  'error',
                  `Invalid CSS selector chars in "${sel}" (contains != or unescaped $ / ^ outside attribute brackets)`,
                  arg,
                ),
              )
            }
          }
        }
      }

      // ── Rule 3: short-timeout-auth ─────────────────────────────────────────
      const callText = node.getText()
      // Pattern: new Promise(r => setTimeout(r, N)) or setTimeout(resolve, N)
      const setTimeoutRe = /setTimeout\s*\(\s*\w+\s*,\s*(\d+)\s*\)/
      const m = setTimeoutRe.exec(callText)
      if (m) {
        const ms = parseInt(m[1], 10)
        if (ms < minMs && inAuthOrNavContext(node)) {
          violations.push(
            violation(
              RULE_SHORT_TIMEOUT_AUTH,
              'warn',
              `Short setTimeout(${ms}ms) < ${minMs}ms in auth/navigation context — use waitForSelector or increase delay`,
              node,
            ),
          )
        }
      }
    }

    // ── Rule 2: text-content-primary ──────────────────────────────────────────
    if (Node.isPropertyAccessExpression(node)) {
      const propName = node.getName()
      if (propName === 'textContent' || propName === 'innerText') {
        // Walk up to find the nearest statement/expression that contains an assertion
        let cur: Node | undefined = node.getParent()
        let assertionText = ''
        for (let i = 0; i < 6 && cur; i++) {
          const t = cur.getText()
          if (/toBe|toContain|toEqual|toMatch/.test(t)) {
            assertionText = t
            break
          }
          cur = cur.getParent()
        }
        if (assertionText && !STABLE_ATTR_RE.test(assertionText)) {
          violations.push(
            violation(
              RULE_TEXT_CONTENT_PRIMARY,
              'warn',
              `${propName} used as primary match criterion — prefer querying by stable attribute first`,
              node,
            ),
          )
        }
      }
    }
  })

  return violations
}

export interface LintDirResult {
  violations: LintViolation[]
  filesScanned: number
  filesWithViolations: number
}

export function lintDir(dir: string, opts: LintOptions = {}): LintDirResult {
  const files = collectTestFiles(path.resolve(dir))
  let violations: LintViolation[] = []
  const withViolations = new Set<string>()
  for (const f of files) {
    const v = lintFile(f, opts)
    if (v.length > 0) {
      violations = violations.concat(v)
      withViolations.add(f)
    }
  }
  return {
    violations,
    filesScanned: files.length,
    filesWithViolations: withViolations.size,
  }
}
