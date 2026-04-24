/**
 * T-000 Day-4 — Hit-count-driven promotion + demotion.
 *
 * Ingests the stats map from stats.ts + lesson corpus, proposes severity
 * bumps (hit>=5 → next level) and muting (hit=0 for >6mo → status:muted).
 * Does NOT auto-write YAML — returns a PromotionPlan for `tester lessons
 * promote --apply` to commit changes. Stays read-only by default to match
 * NO-TOUCH CRITIC + avoid surprise severity escalations on CI.
 */

import type { Lesson, LessonSeverity, LessonStatus } from './schema'
import type { StatsMap } from './stats'

export interface PromotionProposal {
  lesson_id: string
  current_severity: LessonSeverity
  proposed_severity?: LessonSeverity
  current_status: LessonStatus
  proposed_status?: LessonStatus
  hits: number
  last_hit?: string
  reason: string
}

export interface PromotionPlan {
  promotions: PromotionProposal[]
  mutes: PromotionProposal[]
  no_change: number
}

const SEVERITY_CHAIN: LessonSeverity[] = ['info', 'low', 'medium', 'high', 'critical']

function nextSeverity(cur: LessonSeverity): LessonSeverity | undefined {
  const idx = SEVERITY_CHAIN.indexOf(cur)
  if (idx < 0 || idx === SEVERITY_CHAIN.length - 1) return undefined
  return SEVERITY_CHAIN[idx + 1]
}

export interface PromotionConfig {
  promote_threshold: number // default 5 hits → bump one level
  mute_months: number // default 6 months with zero hits → mute
  now?: Date // injectable for tests
}

const DEFAULT_CONFIG: PromotionConfig = {
  promote_threshold: 5,
  mute_months: 6,
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 30.4375)
}

export function computePromotionPlan(
  lessons: Lesson[],
  stats: StatsMap,
  config: Partial<PromotionConfig> = {},
): PromotionPlan {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const now = cfg.now || new Date()

  const promotions: PromotionProposal[] = []
  const mutes: PromotionProposal[] = []
  let noChange = 0

  for (const lesson of lessons) {
    if (lesson.status === 'deprecated') {
      noChange++
      continue
    }
    const stat = stats[lesson.id]
    const hits = stat?.hits || 0

    // Check mute first (lessons without any stats entry are muting candidates
    // only if they've been in the corpus long enough; for Day-4 simplicity we
    // only mute those with an explicit stat entry whose last_hit is stale).
    if (lesson.status === 'active' && stat) {
      const lastHitDate = new Date(stat.last_hit)
      const months = monthsBetween(lastHitDate, now)
      if (hits === 0 || months >= cfg.mute_months) {
        mutes.push({
          lesson_id: lesson.id,
          current_severity: lesson.severity,
          current_status: 'active',
          proposed_status: 'muted',
          hits,
          last_hit: stat.last_hit,
          reason:
            hits === 0
              ? `zero hits recorded`
              : `last hit ${months.toFixed(1)} months ago (threshold: ${cfg.mute_months}mo)`,
        })
        continue
      }
    }

    // Promotion eligibility
    if (lesson.status === 'active' && hits >= cfg.promote_threshold) {
      const bumpTo = nextSeverity(lesson.severity)
      if (bumpTo && bumpTo !== lesson.severity) {
        promotions.push({
          lesson_id: lesson.id,
          current_severity: lesson.severity,
          proposed_severity: bumpTo,
          current_status: lesson.status,
          hits,
          last_hit: stat?.last_hit,
          reason: `${hits} hits (>= ${cfg.promote_threshold}); bump ${lesson.severity} → ${bumpTo}`,
        })
        continue
      }
    }

    noChange++
  }

  return { promotions, mutes, no_change: noChange }
}
