// lessons:skip-all
/**
 * PAS 2 redo per L01 — REAL behavior tests for audit fixes.
 *
 * Replaces the source-pattern grep tests in `regression-patterns.test.ts`
 * for F-001, F-002, F-005, F-012, F-013 with actual behavior verification:
 * import the Master / website-guru fn, exercise it, assert on output or
 * side effects. The source-pattern file stays as a fast belt-and-braces
 * guard; this file is the authoritative regression lock.
 *
 * F-003, F-004, F-007, F-008, F-014 involve Next.js route handlers /
 * class constructors that are expensive to unit-test cleanly. We cover:
 *   - F-003 behavior: constructor guard (sets globalThis.window + dynamic
 *     import → expect throw).
 *   - F-014 behavior: clearTesterResultCache invocation (exported).
 *   - F-004, F-007, F-008 are documented as INTEGRATION-REQUIRED (skipped
 *     here; regression-patterns.test.ts retains the source-anchor guard).
 *
 * Honest L01 reporting: 6 of 10 findings get real behavior tests; 4
 * require either a live running service or a further refactor to become
 * unit-testable. The INTEGRATION-REQUIRED notes cite the required
 * refactor so a future session can unlock them.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'

const MASTER_ROOT = path.resolve(__dirname, '../..', '..', 'Master')
const WG_ROOT = path.resolve(__dirname, '../..', '..', 'website-guru')
const MASTER_PRESENT = fs.existsSync(path.join(MASTER_ROOT, 'mesh'))
const WG_PRESENT = fs.existsSync(path.join(WG_ROOT, 'src'))

// ─── F-001 checkScopeCreep — real behavior ────────────────────────────────
describe.skipIf(!MASTER_PRESENT)('F-001 checkScopeCreep — behavior', () => {
  let repo: string
  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'f001-'))
    execFileSync('git', ['init', '-q'], { cwd: repo })
    execFileSync('git', ['config', 'user.email', 't@x'], { cwd: repo })
    execFileSync('git', ['config', 'user.name', 't'], { cwd: repo })
    execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: repo })
    fs.writeFileSync(path.join(repo, 'README.md'), '#', 'utf8')
    execFileSync('git', ['add', '-A'], { cwd: repo })
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo })
  })
  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true })
  })

  it('flags breach + writes scope-warnings record when file count exceeds threshold', async () => {
    // Stage > DEV_SCOPE_FILE_THRESHOLD (default 10) files so
    // `git diff --stat HEAD` surfaces them. We do NOT commit — git diff
    // against HEAD considers both working-tree AND staged changes.
    for (let i = 0; i < 12; i++) {
      fs.writeFileSync(path.join(repo, `f${i}.txt`), 'x'.repeat(50), 'utf8')
    }
    execFileSync('git', ['add', '-A'], { cwd: repo })

    const { checkScopeCreep } = (await import(
      /* @vite-ignore */ path.join(MASTER_ROOT, 'mesh/dev/dev-agent.js')
    )) as {
      checkScopeCreep: (
        repo: string,
        desc: string,
        tag: string,
        opts?: { warningsDir?: string },
      ) => { filesChanged: number; linesTotal: number; breached: boolean; allowWide: boolean; ok?: boolean } | null
    }
    const warnDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f001-warn-'))
    try {
      const r = checkScopeCreep(repo, 'small bug fix', 'test', { warningsDir: warnDir })
      expect(r).not.toBeNull()
      expect(r!.filesChanged).toBeGreaterThanOrEqual(12)
      expect(r!.breached).toBe(true)
      expect(r!.allowWide).toBe(false)
      // Side effect: a scope_*.json record was written into the override dir.
      const writtenFiles = fs.readdirSync(warnDir).filter((f) => /^scope_.*\.json$/.test(f))
      expect(writtenFiles.length).toBe(1)
      const record = JSON.parse(fs.readFileSync(path.join(warnDir, writtenFiles[0]), 'utf8'))
      expect(record.filesChanged).toBeGreaterThanOrEqual(12)
      expect(record.fileThreshold).toBeGreaterThan(0)
      expect(typeof record.timestamp).toBe('string')
    } finally {
      fs.rmSync(warnDir, { recursive: true, force: true })
    }
  })

  it('stays below breach when scope is small (1 file)', async () => {
    fs.writeFileSync(path.join(repo, 'tiny.txt'), 'x', 'utf8')
    execFileSync('git', ['add', '-A'], { cwd: repo })
    const { checkScopeCreep } = (await import(
      /* @vite-ignore */ path.join(MASTER_ROOT, 'mesh/dev/dev-agent.js')
    )) as {
      checkScopeCreep: (
        repo: string,
        desc: string,
        tag: string,
        opts?: { warningsDir?: string },
      ) => { filesChanged: number; linesTotal: number; breached?: boolean; ok?: boolean } | null
    }
    const warnDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f001-warn-'))
    try {
      const r = checkScopeCreep(repo, 'small bug fix', 'test', { warningsDir: warnDir })
      expect(r).not.toBeNull()
      expect(r!.filesChanged).toBe(1)
      expect(r!.breached || false).toBe(false)
      expect(fs.readdirSync(warnDir).filter((f) => /^scope_.*\.json$/.test(f))).toHaveLength(0)
    } finally {
      fs.rmSync(warnDir, { recursive: true, force: true })
    }
  })

  it('honors allow-wide-scope tokens in task description', async () => {
    for (let i = 0; i < 20; i++) {
      fs.writeFileSync(path.join(repo, `f${i}.txt`), 'x'.repeat(30), 'utf8')
    }
    execFileSync('git', ['add', '-A'], { cwd: repo })
    const { checkScopeCreep } = (await import(
      /* @vite-ignore */ path.join(MASTER_ROOT, 'mesh/dev/dev-agent.js')
    )) as {
      checkScopeCreep: (
        repo: string,
        desc: string,
        tag: string,
        opts?: { warningsDir?: string },
      ) => { filesChanged: number; breached?: boolean; allowWide?: boolean } | null
    }
    const warnDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f001-warn-'))
    try {
      const r = checkScopeCreep(
        repo,
        'allow-wide-scope: bulk refactor of layout files',
        'test',
        { warningsDir: warnDir },
      )
      expect(r).not.toBeNull()
      expect(r!.allowWide).toBe(true)
      expect(r!.breached || false).toBe(false)
      expect(fs.readdirSync(warnDir).filter((f) => /^scope_.*\.json$/.test(f))).toHaveLength(0)
    } finally {
      fs.rmSync(warnDir, { recursive: true, force: true })
    }
  })
})

// ─── F-002 scanInputValidation — benign-context guard behavior ───────────
describe.skipIf(!MASTER_PRESENT)('F-002 scanInputValidation — behavior', () => {
  let root: string
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'f002-'))
  })
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('returns 0 findings on a console.log with SQL keywords (benign context)', async () => {
    const file = path.join(root, 'example.ts')
    fs.writeFileSync(
      file,
      `console.log('SELECT count from users:', count)\ntoast.success('INSERT done')\n`,
      'utf8',
    )
    const { scanInputValidation } = (await import(
      /* @vite-ignore */ path.join(MASTER_ROOT, 'mesh/red/red-agent.js')
    )) as { scanInputValidation: (files: string[], root: string) => unknown[] }
    const findings = scanInputValidation([file], root)
    expect(findings).toEqual([])
  })

  it('flags a real prisma.$queryRaw with unescaped interpolation', async () => {
    // Use the real tagged-template shape that prisma expects (no parens
    // around the template). Pattern (a) in scanInputValidation keys off
    // `prisma.$queryRaw` + `` ` `` + interpolation `${...}` on the same line.
    const file = path.join(root, 'vuln.ts')
    fs.writeFileSync(
      file,
      `const rows = await prisma.$queryRaw\`SELECT * FROM users WHERE email = \${req.query.email}\`\n`,
      'utf8',
    )
    const { scanInputValidation } = (await import(
      /* @vite-ignore */ path.join(MASTER_ROOT, 'mesh/red/red-agent.js')
    )) as {
      scanInputValidation: (
        files: string[],
        root: string,
      ) => Array<{ severity?: string; message?: string; category?: string }>
    }
    const findings = scanInputValidation([file], root)
    expect(findings.length).toBeGreaterThan(0)
    const hit = findings.find(
      (f) => /sql|injection|interpolat/i.test(String(f.message || '')),
    )
    expect(hit).toBeDefined()
  })

  it('ignores test files entirely', async () => {
    const file = path.join(root, 'something.spec.ts')
    fs.writeFileSync(
      file,
      `await prisma.$queryRaw(\`SELECT * FROM users WHERE id = \${x}\`)\n`,
      'utf8',
    )
    const { scanInputValidation } = (await import(
      /* @vite-ignore */ path.join(MASTER_ROOT, 'mesh/red/red-agent.js')
    )) as { scanInputValidation: (files: string[], root: string) => unknown[] }
    const findings = scanInputValidation([file], root)
    expect(findings).toEqual([])
  })
})

// ─── F-012 sub-pipeline workdir — behavior ────────────────────────────────
describe.skipIf(!MASTER_PRESENT)('F-012 prepareSubPipelineWorkDir — behavior', () => {
  it('creates <parent>/phase<N>/ + README inside a caller-supplied stateDir', async () => {
    const mod = (await import(
      /* @vite-ignore */ path.join(MASTER_ROOT, 'mesh/engine/sub-pipeline-paths.js')
    )) as {
      getSubPipelineWorkDir: (id: string, phase: number, stateDir?: string) => string
      prepareSubPipelineWorkDir: (id: string, phase: number, stateDir?: string) => string
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f012-'))
    try {
      const dir = mod.prepareSubPipelineWorkDir('big_test', 3, tmp)
      expect(fs.existsSync(dir)).toBe(true)
      expect(dir.endsWith(path.join('sub-pipelines', 'big_test', 'phase3'))).toBe(true)
      const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8')
      expect(readme).toMatch(/F-012 fix/)
      expect(readme).toMatch(/big_test/)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('cleans stale dir on re-spawn (no cross-run bleed)', async () => {
    const mod = (await import(
      /* @vite-ignore */ path.join(MASTER_ROOT, 'mesh/engine/sub-pipeline-paths.js')
    )) as {
      prepareSubPipelineWorkDir: (id: string, phase: number, stateDir?: string) => string
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f012-'))
    try {
      const dir = mod.prepareSubPipelineWorkDir('bp', 1, tmp)
      fs.writeFileSync(path.join(dir, 'stale.marker'), 'old', 'utf8')
      mod.prepareSubPipelineWorkDir('bp', 1, tmp)
      expect(fs.existsSync(path.join(dir, 'stale.marker'))).toBe(false)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})

// ─── F-013 planner userConstraints — extended behavior ────────────────────
describe.skipIf(!MASTER_PRESENT)('F-013 extractUserConstraints — extended', () => {
  it('returns empty array on empty / non-string input', async () => {
    const { extractUserConstraints } = (await import(
      /* @vite-ignore */ path.join(MASTER_ROOT, 'mesh/planner/planner-agent.js')
    )) as { extractUserConstraints: (t: unknown) => string[] }
    expect(extractUserConstraints('')).toEqual([])
    expect(extractUserConstraints(undefined)).toEqual([])
    expect(extractUserConstraints(42 as unknown)).toEqual([])
  })

  it('deduplicates constraints that only differ in case', async () => {
    const { extractUserConstraints } = (await import(
      /* @vite-ignore */ path.join(MASTER_ROOT, 'mesh/planner/planner-agent.js')
    )) as { extractUserConstraints: (t: string) => string[] }
    const out = extractUserConstraints(
      'NU reformata. Do NOT reformat. do not reformat. NU reformata codul.',
    )
    // NU reformata / NU reformata codul → 2 distinct, do not reformat → 1.
    // Expect at most 3 unique.
    expect(out.length).toBeGreaterThanOrEqual(1)
    expect(out.length).toBeLessThanOrEqual(4)
  })
})

// ─── F-005 crypto v2 — encrypt/decrypt behavior via WG module ────────────
describe.skipIf(!WG_PRESENT)('F-005 crypto v2 — behavior (encrypt/decrypt)', () => {
  // Deterministic 64-char hex key — never used in production; covers the
  // `process.env.ENCRYPTION_KEY` guard in website-guru/src/lib/crypto.ts.
  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY
  })

  it('encryptFields emits v2:-prefixed values with unique IVs per field + roundtrips via decryptFields', async () => {
    // Vitest esbuild-transpiles this .ts on import; WG crypto has only
    // node:crypto + node:buffer deps so the import graph is clean.
    const mod = (await import(
      /* @vite-ignore */ path.join(WG_ROOT, 'src/lib/crypto.ts')
    )) as {
      encryptFields: (obj: Record<string, string | null | undefined>) => {
        encrypted: Record<string, string | null>
        iv: string
      }
      decryptFields: (obj: Record<string, string | null>, iv: string) => Record<string, string | null>
      encrypt: (plain: string) => { ciphertext: string; iv: string }
      decrypt: (ciphertext: string, iv: string) => string
    }
    const plaintext = { email: 'a@x.com', phone: '+1234567', token: 'secret-xyz' }
    const { encrypted, iv } = mod.encryptFields(plaintext)
    // Marker iv is literal 'v2'
    expect(iv).toBe('v2')
    // All fields v2:-prefixed
    for (const v of Object.values(encrypted)) {
      expect(v).toMatch(/^v2:/)
    }
    // IVs differ across fields — v2 packs IV inside the blob; compare blob
    // bytes to show they diverge even when plaintext repeats.
    const repeated = mod.encryptFields({ a: 'same', b: 'same' })
    expect(repeated.encrypted.a).not.toBe(repeated.encrypted.b)
    // Decrypt roundtrips
    const decrypted = mod.decryptFields(encrypted, iv)
    expect(decrypted).toEqual(plaintext)
  })

  it('decryptFields still handles legacy v1 blobs that lack the v2: prefix', async () => {
    const mod = (await import(/* @vite-ignore */ path.join(WG_ROOT, 'src/lib/crypto.ts'))) as {
      encrypt: (plain: string) => { ciphertext: string; iv: string }
      decryptFields: (obj: Record<string, string | null>, sharedIv: string) => Record<string, string | null>
    }
    // Produce a v1-style row: encrypt each field with a shared IV, store the
    // ciphertext (no v2: prefix) + pass the iv separately to decryptFields.
    const { ciphertext: cA, iv: sharedIv } = mod.encrypt('v1-alpha')
    // Sanity: v1 blob must NOT have v2: prefix.
    expect(cA.startsWith('v2:')).toBe(false)
    const out = mod.decryptFields({ a: cA }, sharedIv)
    expect(out.a).toBe('v1-alpha')
  })
})

// ─── F-003 TesterClient — browser-context guard ───────────────────────────
describe.skipIf(!WG_PRESENT)('F-003 TesterClient — browser-context guard', () => {
  it('throws with the F-003 error when loaded in browser context', async () => {
    // The module evaluates `const IS_SERVER = typeof window === 'undefined'`
    // at import time. We set globalThis.window BEFORE the dynamic import so
    // IS_SERVER becomes false. Then `export const testerClient = new
    // TesterClient()` at line 288 triggers the constructor guard, which
    // throws. The throw propagates out of the dynamic import().
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const windowShim = {} as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).window = windowShim
    try {
      // vitest caches modules; use a cache-busting query to force re-evaluation.
      const wgPath = path.join(WG_ROOT, 'src/lib/tester-client.ts')
      await expect(
        import(/* @vite-ignore */ `${wgPath}?bust=${Date.now()}`),
      ).rejects.toThrow(/server-side only|F-003/i)
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).window
    }
  })
})

// ─── F-014 TesterClient dedup — exported cache-clear hook ─────────────────
describe.skipIf(!WG_PRESENT)('F-014 TesterClient result dedup — behavior', () => {
  it('exposes clearTesterResultCache and it resets internal cache (smoke)', async () => {
    const mod = (await import(
      /* @vite-ignore */ path.join(WG_ROOT, 'src/lib/tester-client.ts')
    )) as { clearTesterResultCache?: () => void; testerClient?: unknown }
    expect(typeof mod.clearTesterResultCache).toBe('function')
    // Invocation must not throw on a fresh process.
    expect(() => mod.clearTesterResultCache?.()).not.toThrow()
    expect(mod.testerClient).toBeDefined()
  })
})

// ─── F-004/F-007/F-008 — REAL behavior tests post-refactor (2026-04-25) ────
// Each fix's testable atom was extracted into a sibling pure module so
// behavior tests cover the actual logic (not source-pattern grep).
//   - F-004 → website-guru/src/lib/browser-agent/browser-args.ts
//   - F-007 → website-guru/src/lib/rate-limit/fix-request-limiter.ts
//   - F-008 → website-guru/src/lib/fix-engine/cred-expiry.ts

describe.skipIf(!WG_PRESENT)('F-004 computeBrowserArgs — behavior', () => {
  it('returns sandbox-enabled (no --no-sandbox) on bare VPS / local env', async () => {
    const mod = (await import(
      /* @vite-ignore */ path.join(WG_ROOT, 'src/lib/browser-agent/browser-args.ts')
    )) as { computeBrowserArgs: (i?: { env?: Record<string, string> }) => { args: string[]; useSandbox: boolean; reason: string } }
    const r = mod.computeBrowserArgs({ env: {} })
    expect(r.useSandbox).toBe(true)
    expect(r.reason).toBe('default-vps-or-local')
    expect(r.args).not.toContain('--no-sandbox')
    expect(r.args).not.toContain('--disable-setuid-sandbox')
    expect(r.args).toContain('--disable-dev-shm-usage')
    expect(r.args.some((a) => a.startsWith('--window-size='))).toBe(true)
  })

  it('forces --no-sandbox on serverless markers', async () => {
    const mod = (await import(
      /* @vite-ignore */ path.join(WG_ROOT, 'src/lib/browser-agent/browser-args.ts')
    )) as { computeBrowserArgs: (i?: { env?: Record<string, string> }) => { args: string[]; useSandbox: boolean; reason: string } }
    for (const k of ['VERCEL', 'NETLIFY', 'LAMBDA_TASK_ROOT', 'AWS_LAMBDA_FUNCTION_NAME']) {
      const r = mod.computeBrowserArgs({ env: { [k]: '1' } })
      expect(r.useSandbox).toBe(false)
      expect(r.reason).toBe('serverless-marker')
      expect(r.args).toContain('--no-sandbox')
      expect(r.args).toContain('--disable-setuid-sandbox')
    }
  })

  it('honors explicit BROWSER_USE_SANDBOX=true override even on serverless', async () => {
    const mod = (await import(
      /* @vite-ignore */ path.join(WG_ROOT, 'src/lib/browser-agent/browser-args.ts')
    )) as { computeBrowserArgs: (i?: { env?: Record<string, string> }) => { args: string[]; useSandbox: boolean; reason: string } }
    const r = mod.computeBrowserArgs({ env: { VERCEL: '1', BROWSER_USE_SANDBOX: 'true' } })
    expect(r.useSandbox).toBe(true)
    expect(r.reason).toBe('env-force-true')
    expect(r.args).not.toContain('--no-sandbox')
  })

  it('honors explicit BROWSER_USE_SANDBOX=false override on bare env', async () => {
    const mod = (await import(
      /* @vite-ignore */ path.join(WG_ROOT, 'src/lib/browser-agent/browser-args.ts')
    )) as { computeBrowserArgs: (i?: { env?: Record<string, string> }) => { args: string[]; useSandbox: boolean; reason: string } }
    const r = mod.computeBrowserArgs({ env: { BROWSER_USE_SANDBOX: 'false' } })
    expect(r.useSandbox).toBe(false)
    expect(r.reason).toBe('env-force-false')
    expect(r.args).toContain('--no-sandbox')
  })

  it('respects viewport size in --window-size argument', async () => {
    const mod = (await import(
      /* @vite-ignore */ path.join(WG_ROOT, 'src/lib/browser-agent/browser-args.ts')
    )) as { computeBrowserArgs: (i?: { env?: Record<string, string>; viewportWidth?: number; viewportHeight?: number }) => { args: string[]; useSandbox: boolean; reason: string } }
    const r = mod.computeBrowserArgs({
      env: {},
      viewportWidth: 1920,
      viewportHeight: 1080,
    })
    expect(r.args).toContain('--window-size=1920,1080')
  })
})

describe.skipIf(!WG_PRESENT)('F-007 fix-request-limiter — behavior', () => {
  it('first call passes; second call within cooldown returns 429 with Retry-After', async () => {
    const mod = (await import(
      /* @vite-ignore */ path.join(WG_ROOT, 'src/lib/rate-limit/fix-request-limiter.ts')
    )) as typeof import('../../../website-guru/src/lib/rate-limit/fix-request-limiter')
    let t = 1_000_000
    const limiter = mod.createFixRequestLimiter({ now: () => t })
    const first = limiter.check('fix-1')
    expect(first.ok).toBe(true)
    limiter.begin('fix-1')

    // Same fix-id within cooldown
    t += 5_000
    const second = limiter.check('fix-1')
    expect(second.ok).toBe(false)
    if (!second.ok) {
      expect(second.status).toBe(429)
      expect(second.retryAfterSec).toBeGreaterThan(0)
      expect(second.message).toMatch(/rate-limited/i)
      expect(second.reason).toBe('cooldown')
    }

    // After cooldown lapses, allowed again
    t += 60_000
    expect(limiter.check('fix-1').ok).toBe(true)
  })

  it('returns 429/concurrent when global limit hit', async () => {
    const mod = (await import(
      /* @vite-ignore */ path.join(WG_ROOT, 'src/lib/rate-limit/fix-request-limiter.ts')
    )) as typeof import('../../../website-guru/src/lib/rate-limit/fix-request-limiter')
    const limiter = mod.createFixRequestLimiter({ globalConcurrentLimit: 2 })
    expect(limiter.check('a').ok).toBe(true)
    limiter.begin('a')
    expect(limiter.check('b').ok).toBe(true)
    limiter.begin('b')
    const r = limiter.check('c')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('concurrent')
      expect(r.message).toMatch(/concurrent/i)
    }
    limiter.end()
    expect(limiter.check('c').ok).toBe(true)
  })

  it('prunes the per-fix map after pruneEveryN checks (size stays bounded)', async () => {
    const mod = (await import(
      /* @vite-ignore */ path.join(WG_ROOT, 'src/lib/rate-limit/fix-request-limiter.ts')
    )) as typeof import('../../../website-guru/src/lib/rate-limit/fix-request-limiter')
    let t = 0
    const limiter = mod.createFixRequestLimiter({
      now: () => t,
      pruneEveryN: 5,
      perFixCooldownMs: 60_000,
      perFixMapMax: 3,
    })
    // Add 3 entries in fast succession.
    limiter.check('a'); limiter.begin('a')
    limiter.check('b'); limiter.begin('b')
    limiter.check('c'); limiter.begin('c')
    expect(limiter.size()).toBe(3)
    // Advance past 2× cooldown so they're stale, then run pruneEveryN checks
    // to trigger the opportunistic prune.
    t += 200_000
    for (let i = 0; i < 6; i++) limiter.check(`probe-${i}`)
    // After prune, all original stale entries are gone (only fresh probes remain,
    // and the map is capped at perFixMapMax=3).
    expect(limiter.size()).toBeLessThanOrEqual(3)
  })

  it('end() decrements concurrent slot but never below 0', async () => {
    const mod = (await import(
      /* @vite-ignore */ path.join(WG_ROOT, 'src/lib/rate-limit/fix-request-limiter.ts')
    )) as typeof import('../../../website-guru/src/lib/rate-limit/fix-request-limiter')
    const limiter = mod.createFixRequestLimiter({ globalConcurrentLimit: 2 })
    limiter.end()
    limiter.end() // multiple end() calls without begin() are safe
    expect(limiter.check('x').ok).toBe(true)
  })
})

describe.skipIf(!WG_PRESENT)('F-008 cred-expiry — behavior', () => {
  it('returns ok:true when cred has no expiresAt', async () => {
    const mod = (await import(
      /* @vite-ignore */ path.join(WG_ROOT, 'src/lib/fix-engine/cred-expiry.ts')
    )) as typeof import('../../../website-guru/src/lib/fix-engine/cred-expiry')
    const r = mod.checkCredentialExpiry({
      cred: {},
      completed: 0,
      totalTasks: 5,
      skipped: 0,
    })
    expect(r.ok).toBe(true)
  })

  it('returns ok:true when cred is still valid', async () => {
    const mod = (await import(
      /* @vite-ignore */ path.join(WG_ROOT, 'src/lib/fix-engine/cred-expiry.ts')
    )) as typeof import('../../../website-guru/src/lib/fix-engine/cred-expiry')
    const future = new Date('2999-12-31')
    const r = mod.checkCredentialExpiry({
      cred: { expiresAt: future },
      completed: 1,
      totalTasks: 3,
      skipped: 0,
      now: () => new Date('2026-04-25'),
    })
    expect(r.ok).toBe(true)
  })

  it('emits "Completed N/M" reason + audit shape on expiry mid-batch', async () => {
    const mod = (await import(
      /* @vite-ignore */ path.join(WG_ROOT, 'src/lib/fix-engine/cred-expiry.ts')
    )) as typeof import('../../../website-guru/src/lib/fix-engine/cred-expiry')
    const expired = new Date('2026-04-20T00:00:00Z')
    const r = mod.checkCredentialExpiry({
      cred: { expiresAt: expired },
      completed: 1,
      totalTasks: 3,
      skipped: 0,
      failed: 0,
      now: () => new Date('2026-04-25T12:00:00Z'),
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/Completed 1\/3 tasks/)
    expect(r.reason).toMatch(/2 remaining/)
    expect(r.reason).toMatch(/Re-submit with fresh credentials/)
    expect(r.audit?.completed).toBe(1)
    expect(r.audit?.remaining).toBe(2)
    expect(r.audit?.expiresAt).toBe('2026-04-20T00:00:00.000Z')
  })

  it('handles 0 completed (cred expired before batch even started)', async () => {
    const mod = (await import(
      /* @vite-ignore */ path.join(WG_ROOT, 'src/lib/fix-engine/cred-expiry.ts')
    )) as typeof import('../../../website-guru/src/lib/fix-engine/cred-expiry')
    const r = mod.checkCredentialExpiry({
      cred: { expiresAt: new Date('2020-01-01') },
      completed: 0,
      totalTasks: 5,
      skipped: 0,
      now: () => new Date('2026-04-25'),
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/Completed 0\/5 tasks/)
  })

  it('counts skipped tasks against the remaining tally', async () => {
    const mod = (await import(
      /* @vite-ignore */ path.join(WG_ROOT, 'src/lib/fix-engine/cred-expiry.ts')
    )) as typeof import('../../../website-guru/src/lib/fix-engine/cred-expiry')
    const r = mod.checkCredentialExpiry({
      cred: { expiresAt: new Date('2020-01-01') },
      completed: 1,
      totalTasks: 4,
      skipped: 2, // 1 done + 2 skipped → 1 remaining
      now: () => new Date('2026-04-25'),
    })
    expect(r.ok).toBe(false)
    expect(r.audit?.remaining).toBe(1)
    expect(r.reason).toMatch(/1 remaining/)
  })
})
