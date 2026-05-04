/**
 * Behavior tests for the journey-audit classifier (pure function).
 *
 * Covers the 0.3.0 config-driven exemption knobs:
 *   - bodyLenThreshold (override default 200)
 *   - formHeroException (default true; opt-out for 0.2.x parity)
 *   - validContentMarkers (precomputed count via runner)
 *   - perPageOverrides[href].skipEmptyCheck
 *
 * Also asserts backward-compat for existing markers (empty/error/gated)
 * and HTTP status precedence.
 */

import { describe, it, expect } from 'vitest'
import {
  classifyPage,
  DEFAULT_BODY_LEN_THRESHOLD,
  type ClassifierInput,
  type JourneyClassifierConfig,
} from '../src/cli/commands/journey-audit-classifier.js'

function makeInput(partial: Partial<ClassifierInput> = {}): ClassifierInput {
  return {
    link: { name: 'Home', href: '/' },
    httpStatus: 200,
    h1: '',
    bodyLen: 800,
    tableCount: 0,
    buttonCount: 0,
    emptyCount: 0,
    errorCount: 0,
    gatedCount: 0,
    validContentCount: 0,
    cfg: {},
    ...partial,
  }
}

describe('classifyPage — basics', () => {
  it('returns OK when nothing flags', () => {
    const r = classifyPage(makeInput())
    expect(r.status).toBe('OK')
    expect(r.notes[0]).toMatch(/tables=0 buttons=0 bodyLen=800/)
  })

  it('flags HAS_ERRORS when errorCount > 0', () => {
    const r = classifyPage(makeInput({ errorCount: 3 }))
    expect(r.status).toBe('HAS_ERRORS')
    expect(r.notes).toContain('errorMarkers=3')
  })

  it('flags GATED when gatedCount > 0', () => {
    const r = classifyPage(makeInput({ gatedCount: 1 }))
    expect(r.status).toBe('GATED')
    expect(r.notes).toContain('ONBOARDING_WALL')
  })

  it('GATED overrides HAS_ERRORS (more informative gate marker wins)', () => {
    const r = classifyPage(makeInput({ errorCount: 1, gatedCount: 1 }))
    expect(r.status).toBe('GATED')
  })

  it('HTTP_NNN overrides everything else', () => {
    const r = classifyPage(makeInput({ httpStatus: 404, gatedCount: 1, errorCount: 1, bodyLen: 0 }))
    expect(r.status).toBe('HTTP_404')
  })
})

describe('classifyPage — empty heuristic (default threshold 200)', () => {
  it('flags EMPTY when bodyLen below default 200 with no h1+buttons', () => {
    const r = classifyPage(makeInput({ bodyLen: 50 }))
    expect(r.status).toBe('EMPTY')
    expect(r.notes).toContain('suspiciously_empty')
  })

  it('does NOT flag EMPTY when bodyLen >= 200', () => {
    const r = classifyPage(makeInput({ bodyLen: 200 }))
    expect(r.status).toBe('OK')
    expect(r.notes.find((n) => n.startsWith('suspiciously_empty'))).toBeUndefined()
  })

  it('respects DEFAULT_BODY_LEN_THRESHOLD constant export', () => {
    expect(DEFAULT_BODY_LEN_THRESHOLD).toBe(200)
  })
})

describe('classifyPage — bodyLenThreshold override', () => {
  it('uses custom threshold from cfg', () => {
    const cfg: JourneyClassifierConfig = { bodyLenThreshold: 50 }
    const r = classifyPage(makeInput({ bodyLen: 80, cfg }))
    expect(r.status).toBe('OK')
  })

  it('flags EMPTY when bodyLen below custom threshold', () => {
    const cfg: JourneyClassifierConfig = { bodyLenThreshold: 100 }
    const r = classifyPage(makeInput({ bodyLen: 80, cfg }))
    expect(r.status).toBe('EMPTY')
  })
})

describe('classifyPage — formHeroException (default true in 0.3.0)', () => {
  it('skips EMPTY for h1+buttons even with low bodyLen (default true)', () => {
    const r = classifyPage(
      makeInput({
        bodyLen: 100,
        h1: 'AVE',
        buttonCount: 1,
      })
    )
    expect(r.status).toBe('OK')
    expect(r.notes.some((n) => n.startsWith('empty_check_skipped (form_hero'))).toBe(true)
  })

  it('still flags EMPTY when h1 missing', () => {
    const r = classifyPage(
      makeInput({
        bodyLen: 100,
        h1: '',
        buttonCount: 3,
      })
    )
    expect(r.status).toBe('EMPTY')
  })

  it('still flags EMPTY when buttonCount = 0', () => {
    const r = classifyPage(
      makeInput({
        bodyLen: 100,
        h1: 'AVE',
        buttonCount: 0,
      })
    )
    expect(r.status).toBe('EMPTY')
  })

  it('formHeroException: false restores 0.2.x always-flag behavior', () => {
    const cfg: JourneyClassifierConfig = { formHeroException: false }
    const r = classifyPage(
      makeInput({
        bodyLen: 100,
        h1: 'AVE',
        buttonCount: 3,
        cfg,
      })
    )
    expect(r.status).toBe('EMPTY')
  })
})

describe('classifyPage — validContentMarkers', () => {
  it('skips EMPTY when validContentCount > 0', () => {
    const r = classifyPage(makeInput({ bodyLen: 50, validContentCount: 2 }))
    expect(r.status).toBe('OK')
    expect(
      r.notes.some((n) => n.startsWith('empty_check_skipped (validContentMarkers='))
    ).toBe(true)
  })

  it('does NOT skip when validContentCount === 0', () => {
    const r = classifyPage(makeInput({ bodyLen: 50, validContentCount: 0 }))
    expect(r.status).toBe('EMPTY')
  })
})

describe('classifyPage — perPageOverrides', () => {
  it('skips EMPTY for matching href when override.skipEmptyCheck=true', () => {
    const cfg: JourneyClassifierConfig = {
      perPageOverrides: { '/about': { skipEmptyCheck: true } },
    }
    const r = classifyPage(
      makeInput({
        link: { name: 'About', href: '/about' },
        bodyLen: 50,
        cfg,
      })
    )
    expect(r.status).toBe('OK')
    expect(r.notes.some((n) => n.startsWith('empty_check_skipped (override:/about)'))).toBe(true)
  })

  it('does NOT affect pages whose href is not in overrides', () => {
    const cfg: JourneyClassifierConfig = {
      perPageOverrides: { '/about': { skipEmptyCheck: true } },
    }
    const r = classifyPage(
      makeInput({
        link: { name: 'Home', href: '/' },
        bodyLen: 50,
        cfg,
      })
    )
    expect(r.status).toBe('EMPTY')
  })
})

describe('classifyPage — exemption precedence', () => {
  it('override > formHero > validContent (most-specific wins on note label)', () => {
    const cfg: JourneyClassifierConfig = {
      perPageOverrides: { '/': { skipEmptyCheck: true } },
    }
    const r = classifyPage(
      makeInput({
        bodyLen: 50,
        h1: 'AVE',
        buttonCount: 1,
        validContentCount: 5,
        cfg,
      })
    )
    expect(r.status).toBe('OK')
    expect(r.notes.some((n) => n.startsWith('empty_check_skipped (override:'))).toBe(true)
    expect(r.notes.some((n) => n.startsWith('empty_check_skipped (form_hero'))).toBe(false)
  })

  it('formHero takes precedence over validContent when override absent', () => {
    const r = classifyPage(
      makeInput({
        bodyLen: 50,
        h1: 'AVE',
        buttonCount: 1,
        validContentCount: 5,
      })
    )
    expect(r.notes.some((n) => n.startsWith('empty_check_skipped (form_hero'))).toBe(true)
    expect(r.notes.some((n) => n.startsWith('empty_check_skipped (validContentMarkers'))).toBe(false)
  })
})
