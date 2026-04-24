// lessons:skip-all
/**
 * T-000 Day-2 — stats (hit-count persistence) regression tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { loadStats, recordHits, statsFilePath, statsSummary } from '../../src/lessons/stats'

function withTempCorpus(fn: (corpusDir: string, statsFile: string) => void) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-test-'))
  const corpusDir = path.join(projectDir, 'lessons')
  fs.mkdirSync(corpusDir)
  const statsFile = statsFilePath(corpusDir)
  try {
    fn(corpusDir, statsFile)
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true })
  }
}

describe('stats — hit persistence', () => {
  it('returns empty object when no stats file exists', () => {
    withTempCorpus((corpus) => {
      expect(loadStats(corpus)).toEqual({})
    })
  })

  it('records a new hit and creates stats file', () => {
    withTempCorpus((corpus, statsFile) => {
      const r = recordHits(corpus, ['L-F2'], 'test')
      expect(r.written).toBe(true)
      expect(fs.existsSync(statsFile)).toBe(true)
      const loaded = loadStats(corpus)
      expect(loaded['L-F2'].hits).toBe(1)
      expect(loaded['L-F2'].contexts).toContain('test')
    })
  })

  it('increments hits across multiple calls', () => {
    withTempCorpus((corpus) => {
      recordHits(corpus, ['L-F2'], 'test')
      recordHits(corpus, ['L-F2'], 'test')
      recordHits(corpus, ['L-F2'], 'test')
      expect(loadStats(corpus)['L-F2'].hits).toBe(3)
    })
  })

  it('merges contexts without duplicates', () => {
    withTempCorpus((corpus) => {
      recordHits(corpus, ['L-F2'], 'scan')
      recordHits(corpus, ['L-F2'], 'diagnose')
      recordHits(corpus, ['L-F2'], 'scan')
      expect(loadStats(corpus)['L-F2'].contexts.sort()).toEqual(['diagnose', 'scan'])
    })
  })

  it('records multiple lesson ids per call', () => {
    withTempCorpus((corpus) => {
      recordHits(corpus, ['L-F2', 'L-F8', 'L-F10'], 'scan')
      const loaded = loadStats(corpus)
      expect(loaded['L-F2'].hits).toBe(1)
      expect(loaded['L-F8'].hits).toBe(1)
      expect(loaded['L-F10'].hits).toBe(1)
    })
  })

  it('statsSummary sorts by hits desc', () => {
    withTempCorpus((corpus) => {
      recordHits(corpus, ['L-F2'], 'scan')
      recordHits(corpus, ['L-F8'], 'scan')
      recordHits(corpus, ['L-F8'], 'scan')
      recordHits(corpus, ['L-F10'], 'scan')
      recordHits(corpus, ['L-F10'], 'scan')
      recordHits(corpus, ['L-F10'], 'scan')
      const summary = statsSummary(corpus)
      expect(summary.map((e) => e.lesson_id)).toEqual(['L-F10', 'L-F8', 'L-F2'])
      expect(summary.map((e) => e.hits)).toEqual([3, 2, 1])
    })
  })

  it('returns { written: true } for empty id list without creating file', () => {
    withTempCorpus((corpus, statsFile) => {
      const r = recordHits(corpus, [], 'noop')
      expect(r.written).toBe(true)
      expect(fs.existsSync(statsFile)).toBe(false)
    })
  })

  it('gracefully handles corrupted stats file (returns {})', () => {
    withTempCorpus((corpus, statsFile) => {
      fs.mkdirSync(path.dirname(statsFile), { recursive: true })
      fs.writeFileSync(statsFile, 'not-json{{{', 'utf8')
      expect(loadStats(corpus)).toEqual({})
    })
  })
})
