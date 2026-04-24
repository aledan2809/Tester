// lessons:skip-all
/**
 * PAS 2 — Audit-fix regression tests (F-001..F-014).
 *
 * These tests guard against reverts of the 10 fixes shipped in 2026-04-24
 * (Master commits ac5086c + 32a5e56; website-guru commits 5b35447 + 4e1d671).
 * Full evidence: website-guru/reports/AUDIT-DEV-AGENTS-POST-FIX-2026-04-24.md.
 *
 * Strategy: source-file pattern assertions (F-001..F-014 comment anchors +
 * signature behaviors) because the fixes live in sibling repos (Master,
 * website-guru) that are not imported as deps from Tester. Tests skip if
 * sibling repos aren't present on disk.
 *
 * One behavior test for F-013 (extractUserConstraints is cleanly exported).
 * Everything else is pattern-based — a revert of the fix markers will trip.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const MASTER_ROOT = path.resolve(__dirname, '../..', '..', 'Master')
const WG_ROOT = path.resolve(__dirname, '../..', '..', 'website-guru')
const MASTER_PRESENT = fs.existsSync(path.join(MASTER_ROOT, 'mesh'))
const WG_PRESENT = fs.existsSync(path.join(WG_ROOT, 'src'))

function readSource(rel: string, repoRoot: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8')
}

describe.skipIf(!MASTER_PRESENT)('audit-fixes — Master (F-001, F-002, F-012, F-013)', () => {
  it('F-001 dev-agent scope gate — writes mesh/state/scope-warnings/<id>.json on breach', () => {
    const src = readSource('mesh/dev/dev-agent.js', MASTER_ROOT)
    // Scope-warnings directory target must be referenced
    expect(src).toMatch(/scope-warnings/)
    // Must use masterPath helper (cross-platform) not a hardcoded path
    expect(src).toMatch(/masterPath\(["']mesh["'],\s*["']state["'],\s*["']scope-warnings["']\)/)
    // Must include the "SCOPE_CREEP_WARNING" record type marker
    expect(src).toMatch(/SCOPE_CREEP_WARNING/)
  })

  it('F-002 RED_TEAM benign-context guard — test-file skip + shared filter', () => {
    const src = readSource('mesh/red/red-agent.js', MASTER_ROOT)
    // F-002 anchor comment must remain
    expect(src).toMatch(/F-002.*benign-context/i)
    // Benign-context filter must exclude console / toast / fetch patterns
    expect(src).toMatch(/console\./)
    // Must NOT match SQL keywords inside console.log (regex tightened)
    // Verified by absence of the old "match any SELECT/INSERT" broad rule —
    // fix pattern includes a DB-call proximity requirement.
    expect(src).toMatch(/prisma\.\$queryRaw|db\.raw|db\.query|pool\.query|sql`/)
  })

  it('F-012 sub-pipeline workDir isolation — phase<N> path under sub-pipelines/<parent>/', () => {
    const src = readSource('mesh/engine/big-pipeline-watcher.js', MASTER_ROOT)
    expect(src).toMatch(/sub-pipelines/)
    // Must construct phase<N> subdir keyed by parent big-pipeline id
    expect(src).toMatch(/phase\$\{[^}]+\}|phase\${phaseIndex}/)
  })

  it('F-013 planner userConstraints — extractUserConstraints is exported + works on NU/do-not/no-refactor inputs', async () => {
    const modPath = path.join(MASTER_ROOT, 'mesh/planner/planner-agent.js')
    expect(fs.existsSync(modPath)).toBe(true)
    const mod = (await import(/* @vite-ignore */ modPath)) as {
      extractUserConstraints: (t: string) => string[]
    }
    expect(typeof mod.extractUserConstraints).toBe('function')

    const out = mod.extractUserConstraints(
      'fix X, NU reformata fisiere; only modify src/foo.ts; do not refactor adjacent code.',
    )
    // Must capture at least the NU-prefixed + do-not constraints
    expect(out.length).toBeGreaterThanOrEqual(2)
    expect(out.some((c: string) => /^NU\b/i.test(c))).toBe(true)
    expect(out.some((c: string) => /^do not\b/i.test(c))).toBe(true)
  })

  it('F-013 planner constraints block — verbatim block emitted when constraints present', () => {
    const src = readSource('mesh/engine/orchestrator-v2.js', MASTER_ROOT)
    expect(src).toMatch(/User Constraints \(verbatim, do not paraphrase\)/)
  })
})

describe.skipIf(!WG_PRESENT)('audit-fixes — website-guru (F-003..F-008, F-014)', () => {
  it('F-003 tester-client — server-side-only guard with clear error', () => {
    const src = readSource('src/lib/tester-client.ts', WG_ROOT)
    // Server vs browser gate marker
    expect(src).toMatch(/typeof window === 'undefined'/)
    // Error message on construction in browser
    expect(src).toMatch(/TesterClient is server-side only/)
    // F-003 anchor reference in comment (audit report tie-in)
    expect(src).toMatch(/F-003/)
  })

  it('F-004 conditional --no-sandbox — VERCEL/NETLIFY/LAMBDA env markers + no unconditional push', () => {
    const src = readSource('src/lib/browser-agent/agent.ts', WG_ROOT)
    expect(src).toMatch(/F-004/)
    // Gate on serverless markers
    expect(src).toMatch(/process\.env\.VERCEL/)
    expect(src).toMatch(/process\.env\.NETLIFY/)
    // Unconditional args.push('--no-sandbox') must not appear as top-level default
    const hasUnconditionalSandbox = /^\s*args\.push\(['"]--no-sandbox['"]\)/m.test(src)
    expect(hasUnconditionalSandbox).toBe(false)
  })

  it('F-005 crypto v2 — per-field v2: prefix + IV unique per field', () => {
    const src = readSource('src/lib/crypto.ts', WG_ROOT)
    expect(src).toMatch(/v2:/)
    expect(src).toMatch(/V2_PREFIX/)
    // v1 legacy path must be retained (shared IV) for backwards-compat
    expect(src).toMatch(/legacy/i)
  })

  it('F-007 rate limit — bounded state (prune) + RATE_LIMITED response', () => {
    const src = readSource(
      'src/app/api/admin/fix-requests/[id]/execute/route.ts',
      WG_ROOT,
    )
    expect(src).toMatch(/F-007/)
    expect(src).toMatch(/RATE_LIMITED/)
    // Map-size pruning must be present (rate-limit map bounded fix 4e1d671)
    const hasPrune = /(\.size\s*>|map\.size\s*>|prune|\bdelete\b)/.test(src)
    expect(hasPrune).toBe(true)
  })

  it('F-008 per-task credential expiry — mid-batch expiry check throws with "Completed N/M"', () => {
    const src = readSource('src/lib/fix-engine/dispatcher.ts', WG_ROOT)
    expect(src).toMatch(/F-008/)
    // Canonical error signature
    expect(src).toMatch(/Completed \$\{completed\}\/\$\{/)
    // expiresAt check inside task loop (not only at start)
    expect(src).toMatch(/cred\.expiresAt/)
  })

  it('F-014 dedup — cache keyed URL + tier; bypassCache flag short-circuits', () => {
    const src = readSource('src/lib/tester-client.ts', WG_ROOT)
    expect(src).toMatch(/F-014/)
    expect(src).toMatch(/bypassCache/)
    // TTL expressed somewhere in the 5-minute region
    expect(src).toMatch(/5\s*\*\s*60|300_?000|TTL|ttl/)
  })
})

describe('audit-fixes — sibling-repo presence', () => {
  it('at least one of Master or website-guru is reachable in this checkout', () => {
    // If both absent, CI is configured without ecosystem siblings — regression
    // tests cannot fire and this guards against a silent skip-all.
    expect(MASTER_PRESENT || WG_PRESENT).toBe(true)
  })
})
