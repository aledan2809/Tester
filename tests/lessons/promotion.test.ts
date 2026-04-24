// lessons:skip-all
/**
 * T-000 Day-4 — promotion plan regression tests.
 */

import { describe, it, expect } from 'vitest'
import { computePromotionPlan } from '../../src/lessons/promotion'
import type { Lesson } from '../../src/lessons/schema'
import type { StatsMap } from '../../src/lessons/stats'

function mk(id: string, sev: Lesson['severity'], status: Lesson['status'] = 'active'): Lesson {
  return {
    id,
    slug: id.toLowerCase(),
    title: id,
    first_observed: '2026-01-01',
    projects_hit: [],
    contexts_hit: ['cc-session'],
    hit_count: 0,
    severity: sev,
    tags: [],
    detection: [{ type: 'regex_in_test_file', pattern: 'x', message: 'm' }],
    status,
  }
}

describe('promotion — severity bumps', () => {
  it('promotes medium → high when hits >= threshold', () => {
    const lessons = [mk('L-A', 'medium')]
    const stats: StatsMap = { 'L-A': { hits: 5, last_hit: new Date().toISOString(), contexts: ['scan'] } }
    const plan = computePromotionPlan(lessons, stats)
    expect(plan.promotions.length).toBe(1)
    expect(plan.promotions[0].current_severity).toBe('medium')
    expect(plan.promotions[0].proposed_severity).toBe('high')
  })

  it('does NOT promote below threshold', () => {
    const lessons = [mk('L-A', 'medium')]
    const stats: StatsMap = { 'L-A': { hits: 4, last_hit: new Date().toISOString(), contexts: ['scan'] } }
    const plan = computePromotionPlan(lessons, stats)
    expect(plan.promotions).toEqual([])
  })

  it('does NOT promote critical (top of chain)', () => {
    const lessons = [mk('L-A', 'critical')]
    const stats: StatsMap = { 'L-A': { hits: 100, last_hit: new Date().toISOString(), contexts: ['scan'] } }
    const plan = computePromotionPlan(lessons, stats)
    expect(plan.promotions).toEqual([])
    expect(plan.no_change).toBe(1)
  })

  it('respects custom promote_threshold', () => {
    const lessons = [mk('L-A', 'low')]
    const stats: StatsMap = { 'L-A': { hits: 3, last_hit: new Date().toISOString(), contexts: [] } }
    expect(computePromotionPlan(lessons, stats, { promote_threshold: 3 }).promotions.length).toBe(1)
    expect(computePromotionPlan(lessons, stats, { promote_threshold: 10 }).promotions.length).toBe(0)
  })
})

describe('promotion — mute logic', () => {
  it('mutes lessons with hits=0 (explicit stats entry)', () => {
    const lessons = [mk('L-A', 'medium')]
    const stats: StatsMap = { 'L-A': { hits: 0, last_hit: new Date().toISOString(), contexts: [] } }
    const plan = computePromotionPlan(lessons, stats)
    expect(plan.mutes.length).toBe(1)
    expect(plan.mutes[0].proposed_status).toBe('muted')
  })

  it('mutes lessons with last_hit > mute_months ago', () => {
    const now = new Date('2026-10-01')
    const lessons = [mk('L-A', 'medium')]
    const stats: StatsMap = {
      'L-A': { hits: 2, last_hit: '2026-01-01T00:00:00.000Z', contexts: ['scan'] },
    }
    const plan = computePromotionPlan(lessons, stats, { now })
    expect(plan.mutes.length).toBe(1)
    expect(plan.mutes[0].reason).toMatch(/months ago/)
  })

  it('does NOT mute fresh hits', () => {
    const lessons = [mk('L-A', 'medium')]
    const stats: StatsMap = {
      'L-A': { hits: 2, last_hit: new Date().toISOString(), contexts: ['scan'] },
    }
    const plan = computePromotionPlan(lessons, stats)
    expect(plan.mutes).toEqual([])
    expect(plan.no_change).toBe(1)
  })

  it('mutes lesson with zero stats entry + old last_hit over threshold', () => {
    const now = new Date('2027-01-01')
    const lessons = [mk('L-B', 'low')]
    const stats: StatsMap = {
      'L-B': { hits: 1, last_hit: '2026-01-01T00:00:00.000Z', contexts: [] },
    }
    const plan = computePromotionPlan(lessons, stats, { now, mute_months: 6 })
    expect(plan.mutes[0].lesson_id).toBe('L-B')
  })

  it('skips deprecated lessons entirely', () => {
    const lessons = [mk('L-A', 'medium', 'deprecated')]
    const stats: StatsMap = { 'L-A': { hits: 100, last_hit: new Date().toISOString(), contexts: [] } }
    const plan = computePromotionPlan(lessons, stats)
    expect(plan.promotions).toEqual([])
    expect(plan.mutes).toEqual([])
    expect(plan.no_change).toBe(1)
  })
})

describe('promotion — integration', () => {
  it('handles mixed corpus correctly', () => {
    const lessons = [
      mk('L-A', 'medium'), // will promote
      mk('L-B', 'low'), // no stats — no-change
      mk('L-C', 'high'), // will mute
      mk('L-D', 'critical'), // top — no-change
    ]
    const now = new Date()
    const stats: StatsMap = {
      'L-A': { hits: 5, last_hit: now.toISOString(), contexts: ['scan'] },
      'L-C': { hits: 0, last_hit: now.toISOString(), contexts: [] },
      'L-D': { hits: 10, last_hit: now.toISOString(), contexts: [] },
    }
    const plan = computePromotionPlan(lessons, stats)
    expect(plan.promotions.map((p) => p.lesson_id)).toEqual(['L-A'])
    expect(plan.mutes.map((m) => m.lesson_id)).toEqual(['L-C'])
    expect(plan.no_change).toBe(2) // L-B (no stats) + L-D (top severity)
  })
})
