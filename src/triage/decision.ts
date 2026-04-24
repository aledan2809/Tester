/**
 * T-B3 — Product-vs-harness triage for TWG.
 *
 * Wraps the T-004 classifier with a decision helper that maps verdicts
 * to routing actions the TWG orchestrator should take:
 *
 *   PRODUCT_BUG    → route: 'guru'          (hand to Website Guru fix engine)
 *   HARNESS_BUG    → route: 'tester-self'   (Tester self-heals; do NOT ping Guru)
 *   FLAKE          → route: 'flake-retry'   (retry with extended settle — T-007)
 *   ENV_MISCONFIG  → route: 'env-fix'       (surface to human; env/cred issue)
 *
 * Pure wrapper. Classifier already runs heuristic fallback when
 * ANTHROPIC_API_KEY is absent, so this module stays synchronous-ish
 * from the caller's POV (one `await` per fail).
 */

import { classify, type FailureContext, type FailureVerdict } from '../lessons/classifier'

export type TriageRoute = 'guru' | 'tester-self' | 'flake-retry' | 'env-fix'

export interface TriageDecision {
  route: TriageRoute
  verdict: FailureVerdict
  confidence: number
  remediation: string
  reasoning: string
  signature: string
  cached: boolean
}

export interface TriageOptions {
  corpusDir?: string
  forceHeuristic?: boolean
  /** When confidence < this, route falls back to 'guru' (safer default). */
  minConfidence?: number
}

const VERDICT_TO_ROUTE: Record<FailureVerdict, TriageRoute> = {
  PRODUCT_BUG: 'guru',
  HARNESS_BUG: 'tester-self',
  FLAKE: 'flake-retry',
  ENV_MISCONFIG: 'env-fix',
}

export async function triageFailure(
  ctx: FailureContext,
  opts: TriageOptions = {},
): Promise<TriageDecision> {
  const r = await classify(ctx, { corpusDir: opts.corpusDir, forceHeuristic: opts.forceHeuristic })
  const minConfidence = opts.minConfidence ?? 0.5
  let route = VERDICT_TO_ROUTE[r.verdict]
  // Low-confidence verdicts don't auto-route away from human review — default
  // to 'guru' so at worst a human gets a ping. This preserves the original
  // "loop defers to Guru when uncertain" semantic from pre-T-000.
  if (r.confidence < minConfidence) {
    route = 'guru'
  }
  return {
    route,
    verdict: r.verdict,
    confidence: r.confidence,
    remediation: r.remediation,
    reasoning: r.reasoning,
    signature: r.signature,
    cached: r.cached,
  }
}

export interface TriageSplit {
  guru: number
  tester_self: number
  flake_retry: number
  env_fix: number
}

export function emptySplit(): TriageSplit {
  return { guru: 0, tester_self: 0, flake_retry: 0, env_fix: 0 }
}

export function accumulateSplit(split: TriageSplit, decision: TriageDecision): TriageSplit {
  switch (decision.route) {
    case 'guru':
      return { ...split, guru: split.guru + 1 }
    case 'tester-self':
      return { ...split, tester_self: split.tester_self + 1 }
    case 'flake-retry':
      return { ...split, flake_retry: split.flake_retry + 1 }
    case 'env-fix':
      return { ...split, env_fix: split.env_fix + 1 }
  }
}
