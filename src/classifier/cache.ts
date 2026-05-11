/**
 * T-004 — ClassifierCache
 *
 * SQLite-backed dedup cache keyed by sha256(assertion + pageUrl + domSnapshot[:200]).
 * Prevents re-classifying the same failure in the same or subsequent runs (TTL: 7d).
 */

import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FailureContext } from './failure-context'
import type { FailureClassification } from './classifier'

const DEFAULT_TTL_DAYS = 7
const SCHEMA = `
CREATE TABLE IF NOT EXISTS classifier_cache (
  signature TEXT PRIMARY KEY,
  category  TEXT NOT NULL,
  confidence REAL NOT NULL,
  reason     TEXT NOT NULL,
  remediation TEXT NOT NULL,
  created_at INTEGER NOT NULL
);`

interface CacheRow {
  signature: string
  category: string
  confidence: number
  reason: string
  remediation: string
  created_at: number
}

export class ClassifierCache {
  private db: InstanceType<typeof Database>
  private ttlMs: number
  private readonly stmtGet: Database.Statement
  private readonly stmtSet: Database.Statement
  private readonly stmtDelete: Database.Statement
  private readonly stmtPrune: Database.Statement

  constructor(dbPath: string, ttlDays = DEFAULT_TTL_DAYS) {
    const dir = dirname(dbPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(SCHEMA)
    this.ttlMs = ttlDays * 24 * 60 * 60 * 1000
    this.stmtGet = this.db.prepare('SELECT * FROM classifier_cache WHERE signature = ?')
    this.stmtSet = this.db.prepare(
      `INSERT OR REPLACE INTO classifier_cache
       (signature, category, confidence, reason, remediation, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    this.stmtDelete = this.db.prepare('DELETE FROM classifier_cache WHERE signature = ?')
    this.stmtPrune = this.db.prepare('DELETE FROM classifier_cache WHERE created_at <= ?')
  }

  /**
   * Compute a stable signature for a FailureContext.
   * SHA-256 has 2^256 possible values; accidental collision probability is negligible.
   * Intentional collision (prompt injection) is mitigated by the UNTRUSTED delimiters in buildPrompt.
   */
  static signature(ctx: FailureContext): string {
    const raw = [ctx.assertion, ctx.pageUrl, ctx.domSnapshot.slice(0, 200)].join('\x00')
    return createHash('sha256').update(raw).digest('hex')
  }

  get(signature: string): FailureClassification | null {
    const row = this.stmtGet.get(signature) as CacheRow | undefined
    if (!row) return null
    if (Date.now() - row.created_at >= this.ttlMs) {
      this.stmtDelete.run(signature)
      return null
    }
    return {
      category: row.category as FailureClassification['category'],
      confidence: row.confidence,
      reason: row.reason,
      remediation: row.remediation,
      signature,
      cached: true,
    }
  }

  // tokensUsed is intentionally excluded — it's a live-call metric, not a cached property.
  set(signature: string, result: Omit<FailureClassification, 'signature' | 'cached' | 'tokensUsed'>): void {
    this.stmtSet.run(signature, result.category, result.confidence, result.reason, result.remediation, Date.now())
  }

  /** Remove all entries older than ttl. */
  prune(): number {
    const cutoff = Date.now() - this.ttlMs
    const info = this.stmtPrune.run(cutoff)
    return info.changes
  }

  close(): void {
    this.db.close()
  }
}
