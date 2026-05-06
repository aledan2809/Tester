/**
 * Project Registry — Module A
 * SQLite store for multi-project configuration.
 * Tracks registered target projects, their base URLs, credentials ref,
 * and last audit results.
 */

import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'

export interface ProjectEntry {
  id: string
  name: string
  baseUrl: string
  /** Optional alias for credentials lookup (credentials store key) */
  credentialsKey?: string
  /** Tags for grouping, e.g. ['production', 'ecosystem:ave'] */
  tags: string[]
  /** ISO timestamp of last audit */
  lastAuditAt?: string
  /** Last audit overall score 0-100 */
  lastScore?: number
  /** Last audit verdict */
  lastVerdict?: 'PASS' | 'FAIL' | 'WARN'
  /** Additional project-specific config (JSON) */
  config?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface ProjectRow {
  id: string
  name: string
  base_url: string
  credentials_key: string | null
  tags: string
  last_audit_at: string | null
  last_score: number | null
  last_verdict: string | null
  config: string | null
  created_at: string
  updated_at: string
}

export class ProjectRegistry {
  private db: Database.Database

  constructor(dbPath?: string) {
    const p = dbPath ?? join(process.cwd(), 'data', 'registry.db')
    const dir = dirname(p)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.db = new Database(p)
    this.init()
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        base_url TEXT NOT NULL,
        credentials_key TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        last_audit_at TEXT,
        last_score INTEGER,
        last_verdict TEXT,
        config TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
    `)
  }

  private rowToEntry(row: ProjectRow): ProjectEntry {
    return {
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      credentialsKey: row.credentials_key ?? undefined,
      tags: JSON.parse(row.tags),
      lastAuditAt: row.last_audit_at ?? undefined,
      lastScore: row.last_score ?? undefined,
      lastVerdict: (row.last_verdict as ProjectEntry['lastVerdict']) ?? undefined,
      config: row.config ? JSON.parse(row.config) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  add(entry: Omit<ProjectEntry, 'id' | 'createdAt' | 'updatedAt'>): ProjectEntry {
    const now = new Date().toISOString()
    const id = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    this.db.prepare(`
      INSERT INTO projects (id, name, base_url, credentials_key, tags, config, created_at, updated_at)
      VALUES (@id, @name, @base_url, @credentials_key, @tags, @config, @now, @now)
    `).run({
      id,
      name: entry.name,
      base_url: entry.baseUrl,
      credentials_key: entry.credentialsKey ?? null,
      tags: JSON.stringify(entry.tags ?? []),
      config: entry.config ? JSON.stringify(entry.config) : null,
      now,
    })
    return this.get(id)!
  }

  update(id: string, patch: Partial<Omit<ProjectEntry, 'id' | 'createdAt'>>): ProjectEntry | null {
    const existing = this.get(id)
    if (!existing) return null

    const now = new Date().toISOString()
    this.db.prepare(`
      UPDATE projects SET
        name = @name, base_url = @base_url, credentials_key = @credentials_key,
        tags = @tags, last_audit_at = @last_audit_at, last_score = @last_score,
        last_verdict = @last_verdict, config = @config, updated_at = @now
      WHERE id = @id
    `).run({
      id,
      name: patch.name ?? existing.name,
      base_url: patch.baseUrl ?? existing.baseUrl,
      credentials_key: patch.credentialsKey ?? existing.credentialsKey ?? null,
      tags: JSON.stringify(patch.tags ?? existing.tags),
      last_audit_at: patch.lastAuditAt ?? existing.lastAuditAt ?? null,
      last_score: patch.lastScore ?? existing.lastScore ?? null,
      last_verdict: patch.lastVerdict ?? existing.lastVerdict ?? null,
      config: (patch.config ?? existing.config) ? JSON.stringify(patch.config ?? existing.config) : null,
      now,
    })
    return this.get(id)
  }

  recordAudit(id: string, result: { score: number; verdict: ProjectEntry['lastVerdict'] }): void {
    this.db.prepare(`
      UPDATE projects SET last_audit_at = @now, last_score = @score, last_verdict = @verdict, updated_at = @now
      WHERE id = @id
    `).run({ id, now: new Date().toISOString(), score: result.score, verdict: result.verdict })
  }

  get(id: string): ProjectEntry | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
    return row ? this.rowToEntry(row) : null
  }

  getByName(name: string): ProjectEntry | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE name = ?').get(name) as ProjectRow | undefined
    return row ? this.rowToEntry(row) : null
  }

  list(filter?: { tag?: string }): ProjectEntry[] {
    let rows: ProjectRow[]
    if (filter?.tag) {
      rows = this.db.prepare("SELECT * FROM projects WHERE tags LIKE ? ORDER BY name").all(`%"${filter.tag}"%`) as ProjectRow[]
    } else {
      rows = this.db.prepare('SELECT * FROM projects ORDER BY name').all() as ProjectRow[]
    }
    return rows.map(r => this.rowToEntry(r))
  }

  remove(id: string): boolean {
    const result = this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    return result.changes > 0
  }

  close(): void {
    this.db.close()
  }
}
