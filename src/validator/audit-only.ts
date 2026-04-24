/**
 * AUDIT-ONLY validator — NO-TOUCH CRITIC mode enforcement.
 *
 * Minimal stub reconstructed 2026-04-24 after upstream files were found missing
 * from the working tree (referenced in src/index.ts + src/cli/index.ts since
 * before the T-000 series of commits, but the underlying files were untracked
 * and deleted at some point). Preserves the public API surface:
 *   - `AuditOnlyValidator` singleton class
 *   - `auditValidator` instance
 *   - `AuditViolation` record type
 *
 * Behaviour: enable() flips to read-only mode; every mutation attempt is
 * recorded. violations() returns the audit trail. Used by `tester audit-only`
 * command to ensure NO-TOUCH CRITIC pipelines cannot silently mutate state.
 */

export type AuditViolationKind = 'fs_write' | 'db_insert' | 'http_post' | 'browser_mutation' | 'other'

export interface AuditViolation {
  kind: AuditViolationKind
  target: string
  timestamp: string
  origin?: string
  details?: string
}

export class AuditOnlyValidator {
  private enabled = false
  private readonly trail: AuditViolation[] = []

  enable(): void {
    this.enabled = true
  }

  disable(): void {
    this.enabled = false
  }

  isEnabled(): boolean {
    return this.enabled
  }

  record(kind: AuditViolationKind, target: string, details?: string, origin?: string): void {
    if (!this.enabled) return
    this.trail.push({
      kind,
      target,
      timestamp: new Date().toISOString(),
      origin,
      details,
    })
  }

  assert(kind: AuditViolationKind, target: string, details?: string, origin?: string): void {
    if (!this.enabled) return
    this.record(kind, target, details, origin)
    throw new Error(
      `[audit-only] blocked ${kind} on ${target}${details ? ' — ' + details : ''}${origin ? ' (origin: ' + origin + ')' : ''}`,
    )
  }

  violations(): readonly AuditViolation[] {
    return this.trail
  }

  clear(): void {
    this.trail.length = 0
  }
}

export const auditValidator = new AuditOnlyValidator()
