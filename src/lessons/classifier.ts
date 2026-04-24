/**
 * T-004 — AI Failure Classifier.
 *
 * Given a failure context (assertion text, stack trace, console errors, network
 * tail, DOM snippet, page URL, Tailwind classes), classify the failure as
 * PRODUCT_BUG | HARNESS_BUG | FLAKE | ENV_MISCONFIG with a confidence score
 * and a one-sentence remediation hint.
 *
 * Design:
 *   - sha256 signature dedup — same failure fingerprint only classifies once
 *     per session (cache persisted at `<corpus-parent>/.tester/classif-cache.json`).
 *   - AI call via Anthropic SDK when `ANTHROPIC_API_KEY` is set; otherwise
 *     falls back to a heuristic classifier (pattern-match the ctx against the
 *     same signatures used by diagnoser + a few extra FLAKE/ENV keywords).
 *   - Rate-limit: max 100 distinct signatures per run (safety envelope).
 *
 * API:
 *   - classify(ctx): Promise<ClassificationResult>
 *   - signatureOf(ctx): string   (sha256 hex)
 *   - loadCache(corpusDir) / saveCache(corpusDir, cache)
 */

import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

export type FailureVerdict = 'PRODUCT_BUG' | 'HARNESS_BUG' | 'FLAKE' | 'ENV_MISCONFIG'

export interface FailureContext {
  assertion?: string
  errorMessage?: string
  stackTrace?: string
  consoleErrors?: string[]
  networkTail?: Array<{ url?: string; status?: number; method?: string }>
  domSnippet?: string
  pageUrl?: string
  tailwindClasses?: string[]
  /** Additional free-form context. */
  notes?: string
}

export interface ClassificationResult {
  verdict: FailureVerdict
  confidence: number // 0..1
  reasoning: string
  remediation: string
  source: 'ai' | 'heuristic'
  signature: string
  cached: boolean
}

export type ClassifCache = Record<string, Omit<ClassificationResult, 'cached'>>

const CACHE_FILE_NAME = 'classif-cache.json'
const RATE_LIMIT_MAX = 100

export function signatureOf(ctx: FailureContext): string {
  const parts = [
    (ctx.assertion || '').trim(),
    (ctx.errorMessage || '').trim(),
    (ctx.stackTrace || '').split('\n').slice(0, 3).join('\n').trim(),
    (ctx.pageUrl || '').trim(),
  ]
  const payload = parts.join('||')
  return crypto.createHash('sha256').update(payload).digest('hex')
}

export function cacheFilePath(corpusDir: string): string {
  const parent = path.dirname(path.resolve(corpusDir))
  return path.join(parent, '.tester', CACHE_FILE_NAME)
}

export function loadCache(corpusDir: string): ClassifCache {
  const file = cacheFilePath(corpusDir)
  if (!fs.existsSync(file)) return {}
  try {
    const raw = fs.readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as ClassifCache
  } catch {
    /* corrupt → empty */
  }
  return {}
}

export function saveCache(corpusDir: string, cache: ClassifCache): { ok: boolean; reason?: string } {
  const file = cacheFilePath(corpusDir)
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(cache, null, 2), 'utf8')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

// Heuristic classifier: matches context fields against known patterns to pick
// a verdict without calling AI. Used when ANTHROPIC_API_KEY absent OR when we
// want to avoid billing. Confidence is capped at 0.7 (AI can go higher).
export function heuristicClassify(ctx: FailureContext): Omit<ClassificationResult, 'signature' | 'cached'> {
  const combined = [
    ctx.assertion,
    ctx.errorMessage,
    ctx.stackTrace,
    (ctx.consoleErrors || []).join('\n'),
    ctx.domSnippet,
    ctx.notes,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()

  // ENV_MISCONFIG — network / auth / missing env variables
  if (
    /econnrefused|enotfound|etimedout|dns resolution failed|missing.*env|undefined.*env|cannot find module/i.test(
      combined,
    )
  ) {
    return {
      verdict: 'ENV_MISCONFIG',
      confidence: 0.7,
      reasoning: 'Network/DNS/env-variable error pattern detected — infrastructure/config issue.',
      remediation: 'Check env vars, DNS resolution, service reachability before re-running.',
      source: 'heuristic',
    }
  }

  // HARNESS_BUG — test-side defects (invalid selectors, case-sensitive regex, unscoped text)
  if (
    /is not a valid selector|querysel[ae]ctor.*syntax|strict mode violation.*resolved to \d+ elements|innerText.*\.(?:test|match)/i.test(
      combined,
    )
  ) {
    return {
      verdict: 'HARNESS_BUG',
      confidence: 0.7,
      reasoning: 'Harness-level defect: invalid selector, strict-mode violation, or innerText regex fragility.',
      remediation: 'Fix test harness (validate selector, add /i flag, scope to container). Do NOT mark as product bug.',
      source: 'heuristic',
    }
  }

  // FLAKE — intermittent patterns (timeouts on network-idle, race conditions, retry exhaustion)
  if (/navigation timeout of|waiting for selector.*exceeded|timeout.*exceeded|race condition|flaky/i.test(combined)) {
    return {
      verdict: 'FLAKE',
      confidence: 0.6,
      reasoning: 'Timeout / race-condition keywords suggest intermittent flake.',
      remediation: 'Retry with longer settle (networkidle2) or per-step timeout extension.',
      source: 'heuristic',
    }
  }

  // Default → PRODUCT_BUG with low confidence (signals "we genuinely don't know,
  // treat as product issue until proven otherwise").
  return {
    verdict: 'PRODUCT_BUG',
    confidence: 0.4,
    reasoning: 'No strong signal for harness/env/flake — assume product defect pending deeper review.',
    remediation: 'Reproduce manually; if pattern matches a known harness issue, reclassify via lessons diagnose.',
    source: 'heuristic',
  }
}

// AI-backed classifier (Anthropic SDK). Kept as a thin shim that can be wired
// to AIRouter later; for Day-1 we just fall back to heuristic if no SDK path.
// The SDK import is dynamic to avoid adding a hard dependency when unused.
async function aiClassify(ctx: FailureContext): Promise<Omit<ClassificationResult, 'signature' | 'cached'> | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  try {
    const sdkMod = (await import('@anthropic-ai/sdk')) as typeof import('@anthropic-ai/sdk')
    const client = new sdkMod.default({ apiKey: process.env.ANTHROPIC_API_KEY })
    const payload = [
      ctx.assertion ? `Assertion: ${ctx.assertion}` : null,
      ctx.errorMessage ? `Error: ${ctx.errorMessage}` : null,
      ctx.stackTrace ? `Stack:\n${ctx.stackTrace.slice(0, 2000)}` : null,
      ctx.consoleErrors?.length ? `Console:\n${ctx.consoleErrors.slice(0, 5).join('\n')}` : null,
      ctx.domSnippet ? `DOM:\n${ctx.domSnippet.slice(0, 1500)}` : null,
      ctx.pageUrl ? `Page: ${ctx.pageUrl}` : null,
      ctx.tailwindClasses?.length ? `Tailwind: ${ctx.tailwindClasses.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join('\n\n')

    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `You are a failure classifier for an automated web test. Classify the failure as ONE of: PRODUCT_BUG, HARNESS_BUG, FLAKE, ENV_MISCONFIG.

Return JSON only:
{
  "verdict": "PRODUCT_BUG|HARNESS_BUG|FLAKE|ENV_MISCONFIG",
  "confidence": 0.0-1.0,
  "reasoning": "one sentence",
  "remediation": "one concrete next step"
}

Failure context:
${payload}`,
        },
      ],
    })

    // Anthropic SDK returns ContentBlock[]; text blocks have .type === 'text'.
    // Cast explicitly after filtering so we avoid a type predicate that SDK
    // revisions may not satisfy.
    const text = res.content
      .filter((b) => (b as { type?: string }).type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n')
    // Extract JSON from the response (tolerant of surrounding prose).
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0]) as {
      verdict?: string
      confidence?: number
      reasoning?: string
      remediation?: string
    }
    if (
      !parsed.verdict ||
      !['PRODUCT_BUG', 'HARNESS_BUG', 'FLAKE', 'ENV_MISCONFIG'].includes(parsed.verdict)
    ) {
      return null
    }
    return {
      verdict: parsed.verdict as FailureVerdict,
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.6)),
      reasoning: parsed.reasoning || '(no reasoning returned)',
      remediation: parsed.remediation || '(no remediation returned)',
      source: 'ai',
    }
  } catch {
    // Any SDK error → graceful degrade to heuristic.
    return null
  }
}

// Session-scoped rate-limit counter (resets per process). Prevents runaway
// AI calls in infinite loops.
let classifCountThisRun = 0

export async function classify(
  ctx: FailureContext,
  opts: { corpusDir?: string; forceHeuristic?: boolean } = {},
): Promise<ClassificationResult> {
  const signature = signatureOf(ctx)
  const corpusDir = opts.corpusDir
  const cache: ClassifCache = corpusDir ? loadCache(corpusDir) : {}

  if (cache[signature]) {
    return { ...cache[signature], cached: true }
  }

  let result: Omit<ClassificationResult, 'signature' | 'cached'> | null = null

  if (!opts.forceHeuristic && classifCountThisRun < RATE_LIMIT_MAX) {
    classifCountThisRun += 1
    result = await aiClassify(ctx)
  }

  if (!result) {
    result = heuristicClassify(ctx)
  }

  const final: ClassificationResult = { ...result, signature, cached: false }

  if (corpusDir) {
    cache[signature] = { ...result, signature }
    saveCache(corpusDir, cache)
  }

  return final
}

// Testing helper: reset the rate-limit counter (used by vitest to ensure
// deterministic fresh-state for each test case).
export function _resetClassifCountForTests(): void {
  classifCountThisRun = 0
}
