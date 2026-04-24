/**
 * T-000 Day-2 — Lesson diagnoser.
 *
 * Given a failure log (arbitrary text: test output, error stack, console log),
 * match against each lesson's `diagnosis.symptom_signatures`. Return ranked
 * candidates with confidence + remediation. CLI-level consumer:
 *   `tester lessons diagnose <failure-log-file>` → top 3 matches.
 */

import * as fs from 'node:fs'
import type { Lesson, SymptomSignature } from './schema'

export interface DiagnosisMatch {
  lesson_id: string
  lesson_title: string
  severity: Lesson['severity']
  confidence: number
  matched_signatures: string[]
  remediation?: string
}

const SIGNATURE_FIELDS: (keyof SymptomSignature)[] = [
  'test_failed_assertion',
  'dom_contains',
  'error_message',
  'console_error',
]

function matchSignature(sig: SymptomSignature, log: string): string[] {
  const hits: string[] = []
  for (const field of SIGNATURE_FIELDS) {
    const pattern = sig[field]
    if (!pattern) continue
    try {
      const re = new RegExp(pattern, 'm')
      if (re.test(log)) hits.push(`${field}:${pattern.slice(0, 60)}`)
    } catch {
      // literal fallback for ill-formed regex
      if (log.includes(pattern)) hits.push(`${field}:literal:${pattern.slice(0, 60)}`)
    }
  }
  return hits
}

export function diagnose(log: string, lessons: Lesson[], topN = 3): DiagnosisMatch[] {
  const results: DiagnosisMatch[] = []

  for (const lesson of lessons) {
    if (lesson.status !== 'active') continue
    if (!lesson.diagnosis || lesson.diagnosis.symptom_signatures.length === 0) continue

    const allHits: string[] = []
    for (const sig of lesson.diagnosis.symptom_signatures) {
      allHits.push(...matchSignature(sig, log))
    }
    if (allHits.length === 0) continue

    const totalSignatures = lesson.diagnosis.symptom_signatures.length
    const confidence = Math.min(1, allHits.length / totalSignatures)

    results.push({
      lesson_id: lesson.id,
      lesson_title: lesson.title,
      severity: lesson.severity,
      confidence,
      matched_signatures: allHits,
      remediation: lesson.diagnosis.suggested_remediation,
    })
  }

  results.sort((a, b) => b.confidence - a.confidence || b.matched_signatures.length - a.matched_signatures.length)
  return results.slice(0, topN)
}

export function diagnoseFile(logPath: string, lessons: Lesson[], topN = 3): DiagnosisMatch[] {
  const log = fs.readFileSync(logPath, 'utf8')
  return diagnose(log, lessons, topN)
}
