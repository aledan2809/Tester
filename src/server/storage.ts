/**
 * Persistent Job Storage
 * SQLite-based storage for test jobs with auto-cleanup
 */

import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import type { TestRun } from '../core/types'

export interface Job {
  id: string
  url: string
  config: string // JSON string
  status: 'queued' | 'running' | 'completed' | 'failed'
  progress?: string
  startedAt: string // ISO string
  completedAt?: string // ISO string
  result?: string // JSON string
  error?: string
}

export class JobStorage {
  private db: Database.Database

  constructor(dbPath?: string) {
    const path = dbPath || join(process.cwd(), 'data', 'tester.db')

    // Create data directory if not exists BEFORE creating database
    const dataDir = dirname(path)
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }

    this.db = new Database(path)
    this.init()
    this.startCleanupTimer()
  }

  private init(): void {
    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        config TEXT NOT NULL,
        status TEXT NOT NULL,
        progress TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        result TEXT,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_started_at ON jobs(started_at);
    `)
  }

  save(job: Omit<Job, 'id'> & { id: string }): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO jobs (
        id, url, config, status, progress, started_at, completed_at, result, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      job.id,
      job.url,
      job.config,
      job.status,
      job.progress || null,
      job.startedAt,
      job.completedAt || null,
      job.result || null,
      job.error || null
    )
  }

  get(id: string): Job | undefined {
    const stmt = this.db.prepare('SELECT * FROM jobs WHERE id = ?')
    const row = stmt.get(id) as any

    if (!row) return undefined

    return {
      id: row.id,
      url: row.url,
      config: row.config,
      status: row.status,
      progress: row.progress || undefined,
      startedAt: row.started_at,
      completedAt: row.completed_at || undefined,
      result: row.result || undefined,
      error: row.error || undefined,
    }
  }

  getAll(): Job[] {
    const stmt = this.db.prepare('SELECT * FROM jobs ORDER BY started_at DESC')
    const rows = stmt.all() as any[]

    return rows.map(row => ({
      id: row.id,
      url: row.url,
      config: row.config,
      status: row.status,
      progress: row.progress || undefined,
      startedAt: row.started_at,
      completedAt: row.completed_at || undefined,
      result: row.result || undefined,
      error: row.error || undefined,
    }))
  }

  getRunning(): Job[] {
    const stmt = this.db.prepare('SELECT * FROM jobs WHERE status = ?')
    const rows = stmt.all('running') as any[]

    return rows.map(row => ({
      id: row.id,
      url: row.url,
      config: row.config,
      status: row.status,
      progress: row.progress || undefined,
      startedAt: row.started_at,
      completedAt: row.completed_at || undefined,
      result: row.result || undefined,
      error: row.error || undefined,
    }))
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM jobs WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  // Auto-cleanup jobs older than 1 hour (or configured retention)
  cleanup(retentionHours: number = 1): number {
    const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000).toISOString()
    const stmt = this.db.prepare(`
      DELETE FROM jobs
      WHERE started_at < ? AND status IN ('completed', 'failed')
    `)
    const result = stmt.run(cutoff)
    return result.changes
  }

  private startCleanupTimer(): void {
    // Auto-cleanup every 5 minutes
    setInterval(() => {
      try {
        const deleted = this.cleanup(1) // 1 hour retention
        if (deleted > 0) {
          console.info(`[JobStorage] Cleaned up ${deleted} old jobs`)
        }
      } catch (err) {
        console.error('[JobStorage] Cleanup failed:', err)
      }
    }, 5 * 60 * 1000)
  }

  close(): void {
    this.db.close()
  }
}