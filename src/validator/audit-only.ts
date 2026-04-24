/**
 * Audit-Only Validator
 * Enforces read-only mode during audit runs.
 * Blocks all write operations (DB, FS, API) with explicit error messages.
 * Decoupled from test logic for reuse in future audit waves.
 */

export interface AuditViolation {
  type: 'db' | 'fs' | 'api'
  operation: string
  detail: string
  timestamp: string
}

export class AuditOnlyValidator {
  private violations: AuditViolation[] = []
  private enabled = false

  /** Activate audit-only mode */
  enable(): void {
    this.enabled = true
    this.violations = []
  }

  /** Deactivate audit-only mode */
  disable(): void {
    this.enabled = false
  }

  isEnabled(): boolean {
    return this.enabled
  }

  getViolations(): AuditViolation[] {
    return [...this.violations]
  }

  hasViolations(): boolean {
    return this.violations.length > 0
  }

  /**
   * Check if a DB operation is allowed.
   * In audit mode, only SELECT queries are permitted.
   */
  validateDbOperation(sql: string): void {
    if (!this.enabled) return

    const normalized = sql.trim().toUpperCase()
    const writeOps = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'REPLACE']

    for (const op of writeOps) {
      if (normalized.startsWith(op)) {
        const violation: AuditViolation = {
          type: 'db',
          operation: op,
          detail: `AUDIT-ONLY violation: Write operation attempted — ${op} query blocked`,
          timestamp: new Date().toISOString(),
        }
        this.violations.push(violation)
        throw new Error(violation.detail)
      }
    }
  }

  /**
   * Check if an HTTP method is allowed.
   * In audit mode, only GET and HEAD are permitted.
   */
  validateHttpMethod(method: string, path: string): void {
    if (!this.enabled) return

    const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE']
    const upper = method.toUpperCase()

    if (writeMethods.includes(upper)) {
      const violation: AuditViolation = {
        type: 'api',
        operation: upper,
        detail: `AUDIT-ONLY violation: Write operation attempted — ${upper} ${path} blocked`,
        timestamp: new Date().toISOString(),
      }
      this.violations.push(violation)
      throw new Error(violation.detail)
    }
  }

  /**
   * Check if a filesystem write is allowed.
   * In audit mode, only reads are permitted (except for the audit report output itself).
   */
  validateFsWrite(filePath: string, allowedOutputDir?: string): void {
    if (!this.enabled) return

    // Allow writes to the audit report output directory
    if (allowedOutputDir && filePath.startsWith(allowedOutputDir)) {
      return
    }

    const violation: AuditViolation = {
      type: 'fs',
      operation: 'write',
      detail: `AUDIT-ONLY violation: Write operation attempted — fs write to ${filePath} blocked`,
      timestamp: new Date().toISOString(),
    }
    this.violations.push(violation)
    throw new Error(violation.detail)
  }

  /**
   * Generate a summary of all violations for logging.
   */
  getSummary(): string {
    if (this.violations.length === 0) {
      return 'AUDIT-ONLY: No violations detected — audit completed in read-only mode.'
    }
    const lines = [
      `AUDIT-ONLY: ${this.violations.length} violation(s) detected:`,
      ...this.violations.map((v, i) => `  ${i + 1}. [${v.type}] ${v.detail}`),
    ]
    return lines.join('\n')
  }
}

/** Singleton validator instance */
export const auditValidator = new AuditOnlyValidator()
