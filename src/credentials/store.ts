/**
 * Credentials Manager — Module B
 * Encrypted, multi-account, role-based credential store.
 * Uses AES-256-GCM symmetric encryption via Node.js crypto.
 * Secrets are never stored in plaintext — only encrypted blobs.
 *
 * The encryption key is derived from TESTER_CREDENTIALS_KEY env var
 * (or a project-specific key). If no key is set, credentials are stored
 * with a warning (suitable for local dev, not production).
 */

import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { createCipheriv, createDecipheriv, randomBytes, createHash, scryptSync } from 'crypto'

// ─── Encryption ──────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm'
const KEY_LEN = 32
const IV_LEN = 16
const TAG_LEN = 16

function deriveKey(passphrase: string): Buffer {
  const salt = createHash('sha256').update('tester-creds-salt-v1').digest()
  return scryptSync(passphrase, salt, KEY_LEN) as Buffer
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

function decrypt(ciphertext: string, key: Buffer): string {
  const buf = Buffer.from(ciphertext, 'base64')
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const encrypted = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

// ─── Types ───────────────────────────────────────────────────

export type CredentialRole = 'admin' | 'user' | 'readonly' | 'superadmin' | string

export interface CredentialEntry {
  id: string
  projectKey: string
  label: string
  role: CredentialRole
  username: string
  /** Decrypted password (only present when loaded via get/list with decrypt=true) */
  password?: string
  /** Optional extra fields (e.g. mfaSecret, apiKey) stored encrypted */
  extra?: Record<string, string>
  createdAt: string
  updatedAt: string
}

interface CredentialRow {
  id: string
  project_key: string
  label: string
  role: string
  username: string
  password_enc: string
  extra_enc: string | null
  created_at: string
  updated_at: string
}

// ─── Store ───────────────────────────────────────────────────

export class CredentialsManager {
  private db: Database.Database
  private key: Buffer | null

  constructor(dbPath?: string, encryptionPassphrase?: string) {
    const p = dbPath ?? join(process.cwd(), 'data', 'credentials.db')
    const dir = dirname(p)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.db = new Database(p)

    const passphrase = encryptionPassphrase ?? process.env.TESTER_CREDENTIALS_KEY
    if (passphrase) {
      this.key = deriveKey(passphrase)
    } else {
      this.key = null
      console.warn(
        '[CredentialsManager] No TESTER_CREDENTIALS_KEY set — credentials stored unencrypted. Set this env var for production use.'
      )
    }

    this.init()
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS credentials (
        id TEXT PRIMARY KEY,
        project_key TEXT NOT NULL,
        label TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        username TEXT NOT NULL,
        password_enc TEXT NOT NULL,
        extra_enc TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_key, label)
      );
      CREATE INDEX IF NOT EXISTS idx_creds_project ON credentials(project_key);
    `)
  }

  private encryptValue(value: string): string {
    if (!this.key) return value
    return encrypt(value, this.key)
  }

  private decryptValue(value: string): string {
    if (!this.key) return value
    try {
      return decrypt(value, this.key)
    } catch {
      return '[decryption failed — wrong key?]'
    }
  }

  private rowToEntry(row: CredentialRow, withPassword = false): CredentialEntry {
    const entry: CredentialEntry = {
      id: row.id,
      projectKey: row.project_key,
      label: row.label,
      role: row.role as CredentialRole,
      username: row.username,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
    if (withPassword) {
      entry.password = this.decryptValue(row.password_enc)
      if (row.extra_enc) {
        try {
          entry.extra = JSON.parse(this.decryptValue(row.extra_enc))
        } catch {
          entry.extra = {}
        }
      }
    }
    return entry
  }

  store(entry: {
    projectKey: string
    label: string
    role?: CredentialRole
    username: string
    password: string
    extra?: Record<string, string>
  }): CredentialEntry {
    const now = new Date().toISOString()
    const id = `cred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const passwordEnc = this.encryptValue(entry.password)
    const extraEnc = entry.extra ? this.encryptValue(JSON.stringify(entry.extra)) : null

    this.db.prepare(`
      INSERT INTO credentials (id, project_key, label, role, username, password_enc, extra_enc, created_at, updated_at)
      VALUES (@id, @project_key, @label, @role, @username, @password_enc, @extra_enc, @now, @now)
      ON CONFLICT(project_key, label) DO UPDATE SET
        username = excluded.username,
        password_enc = excluded.password_enc,
        extra_enc = excluded.extra_enc,
        role = excluded.role,
        updated_at = excluded.updated_at
    `).run({
      id,
      project_key: entry.projectKey,
      label: entry.label,
      role: entry.role ?? 'user',
      username: entry.username,
      password_enc: passwordEnc,
      extra_enc: extraEnc,
      now,
    })

    return this.get(entry.projectKey, entry.label)!
  }

  get(projectKey: string, label: string): CredentialEntry | null {
    const row = this.db.prepare(
      'SELECT * FROM credentials WHERE project_key = ? AND label = ?'
    ).get(projectKey, label) as CredentialRow | undefined
    return row ? this.rowToEntry(row, true) : null
  }

  getById(id: string): CredentialEntry | null {
    const row = this.db.prepare('SELECT * FROM credentials WHERE id = ?').get(id) as CredentialRow | undefined
    return row ? this.rowToEntry(row, true) : null
  }

  listForProject(projectKey: string): CredentialEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM credentials WHERE project_key = ? ORDER BY role, label'
    ).all(projectKey) as CredentialRow[]
    return rows.map(r => this.rowToEntry(r, false))
  }

  listByRole(projectKey: string, role: CredentialRole): CredentialEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM credentials WHERE project_key = ? AND role = ? ORDER BY label'
    ).all(projectKey, role) as CredentialRow[]
    return rows.map(r => this.rowToEntry(r, true))
  }

  remove(projectKey: string, label: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM credentials WHERE project_key = ? AND label = ?'
    ).run(projectKey, label)
    return result.changes > 0
  }

  close(): void {
    this.db.close()
  }
}
