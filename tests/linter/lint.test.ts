/**
 * T-003 — Selector Linter — Unit Tests
 *
 * Tests:
 *   - rules.ts: isStableSelector, hasFragileChars, hasInvalidCssChars
 *   - test-linter.ts: lintFile on fixture strings
 *   - source-scanner.ts: scanSourceFile on fixture JSX strings
 *   - CLI: lintCommand + scanSelectorsCommand exit codes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { isStableSelector, hasFragileChars, hasInvalidCssChars } from '../../src/linter/rules'
import { lintFile } from '../../src/linter/test-linter'
import { scanSourceFile, formatSelectorGapsMd } from '../../src/linter/source-scanner'
import { lintCommand } from '../../src/cli/commands/lint'
import { scanSelectorsCommand } from '../../src/cli/commands/scan-selectors'

// ─── rules.ts helpers ────────────────────────────────────────────────────────

describe('T-003 Selector Linter', () => {
  describe('rules — isStableSelector()', () => {
    it('accepts [data-testid=...] as stable', () => {
      expect(isStableSelector('[data-testid="submit-btn"]')).toBe(true)
    })
    it('accepts [name=...] as stable', () => {
      expect(isStableSelector('[name="email"]')).toBe(true)
    })
    it('accepts [aria-label=...] as stable', () => {
      expect(isStableSelector('[aria-label="close"]')).toBe(true)
    })
    it('rejects plain class selectors as unstable', () => {
      expect(isStableSelector('.vendor-card button')).toBe(false)
    })
    it('rejects text-only XPath-style selectors', () => {
      expect(isStableSelector('div.container > span')).toBe(false)
    })
  })

  describe('rules — hasFragileChars()', () => {
    it('flags + outside attribute brackets', () => {
      expect(hasFragileChars('div > span + em')).toBe(true)
    })
    it('flags ? outside attribute brackets', () => {
      expect(hasFragileChars('div.container ? span')).toBe(true)
    })
    it('accepts clean [data-testid=...] selector (brackets stripped)', () => {
      expect(hasFragileChars('[data-testid="x"]')).toBe(false)
    })
  })

  describe('rules — hasInvalidCssChars()', () => {
    it('flags != in selector (F2 pattern)', () => {
      expect(hasInvalidCssChars('[href!="#"]')).toBe(true)
    })
    it('flags unescaped $ outside attribute brackets', () => {
      expect(hasInvalidCssChars('div.$class')).toBe(true)
    })
    it('accepts [attr$=...] attribute suffix selector (valid CSS)', () => {
      // $ inside brackets is valid CSS attribute selector syntax
      expect(hasInvalidCssChars('[href$=".pdf"]')).toBe(false)
    })
    it('accepts clean selector', () => {
      expect(hasInvalidCssChars('[data-testid="btn"]')).toBe(false)
    })
  })

  // ─── lintFile ──────────────────────────────────────────────────────────────

  describe('lintFile()', () => {
    let tmpFile: string

    beforeEach(() => {
      tmpFile = path.join(os.tmpdir(), `tester-lint-${Date.now()}.test.ts`)
    })
    afterEach(() => {
      try { fs.unlinkSync(tmpFile) } catch { /* ok */ }
    })

    function writeAndLint(source: string) {
      fs.writeFileSync(tmpFile, source, 'utf8')
      return lintFile(tmpFile)
    }

    it('flags querySelector with fragile + selector', () => {
      const v = writeAndLint(`
        const el = document.querySelector('div > span + em')
      `)
      expect(v.some((x) => x.ruleId === 'fragile-query-selector')).toBe(true)
    })

    it('flags querySelector with != (F2 pattern)', () => {
      const v = writeAndLint(`
        const el = document.querySelector('[href!="#"]')
      `)
      expect(v.some((x) => x.ruleId === 'invalid-css-chars')).toBe(true)
    })

    it('does NOT flag querySelector with stable [data-testid=...]', () => {
      const v = writeAndLint(`
        const el = document.querySelector('[data-testid="submit-btn"]')
      `)
      expect(v.filter((x) => x.ruleId === 'fragile-query-selector')).toHaveLength(0)
    })

    it('flags textContent used in expect() without stable selector', () => {
      const v = writeAndLint(`
        expect(el.textContent).toBe('Hello')
      `)
      expect(v.some((x) => x.ruleId === 'text-content-primary')).toBe(true)
    })

    it('returns empty array for clean test file', () => {
      const v = writeAndLint(`
        import { expect } from 'vitest'
        const el = document.querySelector('[data-testid="name"]')
        expect(el).toBeTruthy()
      `)
      expect(v).toHaveLength(0)
    })

    it('each violation has required fields', () => {
      const v = writeAndLint(`
        const el = document.querySelector('[href!="#"]')
      `)
      expect(v.length).toBeGreaterThan(0)
      for (const violation of v) {
        expect(typeof violation.ruleId).toBe('string')
        expect(typeof violation.severity).toBe('string')
        expect(typeof violation.message).toBe('string')
        expect(typeof violation.line).toBe('number')
        expect(typeof violation.col).toBe('number')
      }
    })
  })

  // ─── scanSourceFile ────────────────────────────────────────────────────────

  describe('scanSourceFile()', () => {
    let tmpFile: string

    beforeEach(() => {
      tmpFile = path.join(os.tmpdir(), `tester-scan-${Date.now()}.tsx`)
    })
    afterEach(() => {
      try { fs.unlinkSync(tmpFile) } catch { /* ok */ }
    })

    function writeAndScan(source: string) {
      fs.writeFileSync(tmpFile, source, 'utf8')
      return scanSourceFile(tmpFile)
    }

    it('flags <input> without name or data-testid', () => {
      const gaps = writeAndScan(`
        export function Form() {
          return <input type="text" placeholder="Email" />
        }
      `)
      expect(gaps.some((g) => g.element === 'input')).toBe(true)
    })

    it('does NOT flag <input> with name attribute', () => {
      const gaps = writeAndScan(`
        export function Form() {
          return <input type="text" name="email" />
        }
      `)
      expect(gaps.filter((g) => g.element === 'input')).toHaveLength(0)
    })

    it('does NOT flag <input> with data-testid', () => {
      const gaps = writeAndScan(`
        export function Form() {
          return <input type="text" data-testid="email-input" />
        }
      `)
      expect(gaps.filter((g) => g.element === 'input')).toHaveLength(0)
    })

    it('returns empty for non-JSX file', () => {
      const f = path.join(os.tmpdir(), `plain-${Date.now()}.ts`)
      fs.writeFileSync(f, 'const x = 1\n', 'utf8')
      try {
        expect(scanSourceFile(f)).toHaveLength(0)
      } finally {
        fs.unlinkSync(f)
      }
    })
  })

  // ─── formatSelectorGapsMd ─────────────────────────────────────────────────

  describe('formatSelectorGapsMd()', () => {
    it('produces "No selector gaps detected" when empty', () => {
      const md = formatSelectorGapsMd({ gaps: [], filesScanned: 5, filesWithGaps: 0 }, '/project')
      expect(md).toContain('No selector gaps detected')
    })

    it('includes file path and suggestion for each gap', () => {
      const md = formatSelectorGapsMd(
        {
          gaps: [{ file: '/project/src/Form.tsx', line: 10, col: 4, element: 'input', issue: 'missing name', suggestion: 'Add name="field"' }],
          filesScanned: 1,
          filesWithGaps: 1,
        },
        '/project',
      )
      expect(md).toContain('Form.tsx')
      expect(md).toContain('Add name="field"')
    })
  })

  // ─── lintCommand exit codes ───────────────────────────────────────────────

  describe('lintCommand() — exit codes', () => {
    let exitSpy: ReturnType<typeof vi.spyOn>
    let tmpDir: string

    beforeEach(() => {
      exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tester-lint-dir-'))
    })
    afterEach(() => {
      exitSpy.mockRestore()
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('exits 0 when no test files or clean test file', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'ok.test.ts'),
        `const el = document.querySelector('[data-testid="x"]')\n`,
        'utf8',
      )
      await lintCommand({ dir: tmpDir })
      expect(exitSpy).toHaveBeenCalledWith(0)
    })

    it('exits 1 when violations found', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'bad.test.ts'),
        `const el = document.querySelector('[href!="#"]')\n`,
        'utf8',
      )
      await lintCommand({ dir: tmpDir })
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('exits 2 when directory not found', async () => {
      await lintCommand({ dir: '/nonexistent/path/xyz' })
      expect(exitSpy).toHaveBeenCalledWith(2)
    })

    it('exits 0 with --no-fail even when violations present', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'bad.test.ts'),
        `const el = document.querySelector('[href!="#"]')\n`,
        'utf8',
      )
      await lintCommand({ dir: tmpDir, noFail: true })
      expect(exitSpy).toHaveBeenCalledWith(0)
    })
  })

  // ─── scanSelectorsCommand exit codes ─────────────────────────────────────

  describe('scanSelectorsCommand() — exit codes', () => {
    let exitSpy: ReturnType<typeof vi.spyOn>
    let tmpDir: string

    beforeEach(() => {
      exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tester-scan-dir-'))
    })
    afterEach(() => {
      exitSpy.mockRestore()
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('exits 0 when no gaps found', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'GoodForm.tsx'),
        `export function F() { return <input name="email" /> }\n`,
        'utf8',
      )
      const out = path.join(tmpDir, 'SELECTOR_GAPS.md')
      await scanSelectorsCommand(tmpDir, { out })
      expect(exitSpy).toHaveBeenCalledWith(0)
    })

    it('exits 1 when gaps found', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'BadForm.tsx'),
        `export function F() { return <input type="text" placeholder="x" /> }\n`,
        'utf8',
      )
      const out = path.join(tmpDir, 'SELECTOR_GAPS.md')
      await scanSelectorsCommand(tmpDir, { out })
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('exits 2 when directory not found', async () => {
      await scanSelectorsCommand('/nonexistent/xyz', {})
      expect(exitSpy).toHaveBeenCalledWith(2)
    })

    it('writes SELECTOR_GAPS.md with gap details', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'Form.tsx'),
        `export function F() { return <input type="text" placeholder="x" /> }\n`,
        'utf8',
      )
      const out = path.join(tmpDir, 'SELECTOR_GAPS.md')
      await scanSelectorsCommand(tmpDir, { out })
      expect(fs.existsSync(out)).toBe(true)
      const content = fs.readFileSync(out, 'utf8')
      expect(content).toContain('input')
    })
  })
})
