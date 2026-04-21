/**
 * AUDIT_GAPS.md Generator
 * Produces structured audit gap reports from findings.
 * Output format matches ML2 Wave 2 NO-TOUCH CRITIC specification.
 */

import fs from 'fs'
import path from 'path'

export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export interface AuditFinding {
  id: string
  severity: FindingSeverity
  title: string
  location: string
  description: string
  suggestion: string
  screenshotRef?: string
}

export interface AuditMetadata {
  auditDate: string
  testerVersion: string
  commitHash: string
  branch: string
  stack: string
  totalFilesReviewed: number
  categories: string[]
  previousAuditFindings?: number
}

export interface AuditReport {
  findings: AuditFinding[]
  metadata: AuditMetadata
}

/**
 * Generate AUDIT_GAPS.md content from structured findings.
 */
export function generateGapsMarkdown(report: AuditReport): string {
  const { findings, metadata } = report

  const counts = {
    CRITICAL: findings.filter(f => f.severity === 'CRITICAL').length,
    HIGH: findings.filter(f => f.severity === 'HIGH').length,
    MEDIUM: findings.filter(f => f.severity === 'MEDIUM').length,
    LOW: findings.filter(f => f.severity === 'LOW').length,
  }
  const total = findings.length

  const lines: string[] = []

  // Header
  lines.push('# AUDIT_GAPS.md \u2014 Tester (NO-TOUCH CRITIC)')
  lines.push('')
  lines.push('**Audit Mode:** AUDIT-ONLY (read-only, no system modifications)')
  lines.push(`**Project:** @aledan007/tester v${metadata.testerVersion}`)
  lines.push(`**Date:** ${metadata.auditDate}`)
  lines.push('**Auditor:** ML2 Wave 2 \u2014 NO-TOUCH CRITIC (AVE Ecosystem #4)')
  lines.push(`**Commit:** ${metadata.commitHash}`)
  lines.push('**Validator:** AUDIT-ONLY enforced \u2014 zero writes to DB, FS, or API')
  lines.push('')
  lines.push('---')
  lines.push('')

  // Summary
  lines.push('## Summary')
  lines.push('')
  lines.push('| Severity | Count |')
  lines.push('|----------|-------|')
  lines.push(`| CRITICAL | ${counts.CRITICAL} |`)
  lines.push(`| HIGH | ${counts.HIGH} |`)
  lines.push(`| MEDIUM | ${counts.MEDIUM} |`)
  lines.push(`| LOW | ${counts.LOW} |`)
  lines.push(`| **Total** | **${total}** |`)
  lines.push('')
  lines.push('---')
  lines.push('')

  // Findings
  lines.push('## Findings')
  lines.push('')

  for (const finding of findings) {
    const criticalTag = finding.severity === 'CRITICAL' ? '![CRITICAL] ' : ''
    lines.push(`### ${criticalTag}${finding.id} \u2014 ${finding.title}`)
    lines.push('')
    lines.push(`- **Severity:** \`${finding.severity}\``)
    lines.push(`- **Location:** \`${finding.location}\``)
    lines.push(`- **Description:** ${finding.description}`)
    lines.push(`- **Suggestion:** ${finding.suggestion}`)
    if (finding.screenshotRef) {
      lines.push(`- **Reference:** ![screenshot](${finding.screenshotRef})`)
    }
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  // Metadata
  lines.push('## Metadata')
  lines.push('')
  lines.push('| Field | Value |')
  lines.push('|-------|-------|')
  lines.push(`| **Audit Date** | ${metadata.auditDate} |`)
  lines.push(`| **Tester Version** | ${metadata.testerVersion} |`)
  lines.push(`| **Commit Hash** | \`${metadata.commitHash}\` |`)
  lines.push(`| **Branch** | \`${metadata.branch}\` |`)
  lines.push(`| **Stack** | ${metadata.stack} |`)
  lines.push(`| **Audit Mode** | AUDIT-ONLY (NO-TOUCH CRITIC) \u2014 no files modified, no DB writes, no API calls |`)
  lines.push(`| **Total Files Reviewed** | ${metadata.totalFilesReviewed} |`)
  lines.push(`| **Categories Covered** | ${metadata.categories.join(', ')} |`)
  if (metadata.previousAuditFindings !== undefined) {
    lines.push(`| **Previous Audit** | ${metadata.previousAuditFindings} findings (initial pass) |`)
    lines.push(`| **Delta** | +${total - metadata.previousAuditFindings} new findings |`)
  }

  return lines.join('\n')
}

/**
 * Write AUDIT_GAPS.md to disk.
 * Creates output directory if it doesn't exist.
 */
export function writeGapsReport(
  report: AuditReport,
  outputDir: string,
  filename = 'AUDIT_GAPS.md',
): string {
  fs.mkdirSync(outputDir, { recursive: true })
  const content = generateGapsMarkdown(report)
  const outputPath = path.join(outputDir, filename)
  fs.writeFileSync(outputPath, content, 'utf8')
  return outputPath
}

/**
 * Write AUDIT_FAILED.log on audit failure.
 */
export function writeAuditFailedLog(
  outputDir: string,
  error: Error | string,
  violations?: Array<{ type: string; detail: string }>,
): string {
  fs.mkdirSync(outputDir, { recursive: true })
  const lines = [
    `AUDIT FAILED \u2014 ${new Date().toISOString()}`,
    '',
    `Error: ${error instanceof Error ? error.message : error}`,
    '',
  ]
  if (error instanceof Error && error.stack) {
    lines.push('Stack Trace:')
    lines.push(error.stack)
    lines.push('')
  }
  if (violations && violations.length > 0) {
    lines.push('Validator Violations:')
    for (const v of violations) {
      lines.push(`  [${v.type}] ${v.detail}`)
    }
  }
  const outputPath = path.join(outputDir, 'AUDIT_FAILED.log')
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8')
  return outputPath
}
