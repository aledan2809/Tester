/**
 * Audit-Suite Module B — PostgreSQL base adapter.
 *
 * Shared implementation used by both the Prisma and Drizzle adapters.
 * Executes raw parameterised SQL via `pg` — no ORM dependency required.
 */

import { Client } from 'pg'
import * as bcryptjs from 'bcryptjs'
import type {
  ProvisionAdapter,
  MultiTenantConfig,
  DualRolePatternAConfig,
  UserInsertParams,
} from '../types'

export class PgBaseAdapter implements ProvisionAdapter {
  protected client: Client | null = null
  private readonly sqlLog: string[] = []
  readonly dryRun: boolean

  constructor(dryRun = false) {
    this.dryRun = dryRun
  }

  async connect(url: string): Promise<void> {
    if (this.dryRun) return
    this.client = new Client({ connectionString: url })
    await this.client.connect()
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end()
      this.client = null
    }
  }

  getSql(): string[] {
    return [...this.sqlLog]
  }

  async hashPassword(plain: string, algo: 'bcrypt' | 'plaintext', rounds = 10): Promise<string> {
    if (algo === 'plaintext') return plain
    return bcryptjs.hash(plain, rounds)
  }

  async findOrCreateTenant(label: string, config: MultiTenantConfig): Promise<string> {
    if (config.model === 'none') return ''

    const table = config.tenantTable ?? 'tenant'
    const nameCol = config.tenantNameField ?? 'name'
    const pk = config.tenantIdPk ?? 'id'

    if (this.dryRun) {
      const id = `dry-tenant-${label.toLowerCase().replace(/\s+/g, '-')}`
      this.sqlLog.push(
        `INSERT INTO "${table}" ("${nameCol}") VALUES ('${label}') ON CONFLICT ("${nameCol}") DO NOTHING RETURNING "${pk}";`,
      )
      return id
    }

    // Try to find existing tenant first
    const find = await this.client!.query(
      `SELECT "${pk}" FROM "${table}" WHERE "${nameCol}" = $1 LIMIT 1`,
      [label],
    )
    if (find.rows.length > 0) return String(find.rows[0][pk])

    // Insert new tenant
    const insert = await this.client!.query(
      `INSERT INTO "${table}" ("${nameCol}") VALUES ($1) RETURNING "${pk}"`,
      [label],
    )
    return String(insert.rows[0][pk])
  }

  async insertUser(params: UserInsertParams): Promise<string> {
    const cols: string[] = [params.emailField, params.passwordField]
    const vals: unknown[] = [params.email, params.passwordHash]

    if (params.roleField && params.role) {
      cols.push(params.roleField)
      vals.push(params.role)
    }
    if (params.tenantIdField && params.tenantId) {
      cols.push(params.tenantIdField)
      vals.push(params.tenantId)
    }
    if (params.activeField) {
      cols.push(params.activeField)
      vals.push(true)
    }
    for (const [k, v] of Object.entries(params.extraFields ?? {})) {
      cols.push(k)
      vals.push(v)
    }

    const quotedCols = cols.map((c) => `"${c}"`).join(', ')
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ')
    const sql = `INSERT INTO "${params.userTable}" (${quotedCols}) VALUES (${placeholders}) ON CONFLICT ("${params.emailField}") DO UPDATE SET "${params.passwordField}" = EXCLUDED."${params.passwordField}" RETURNING id;`

    this.sqlLog.push(sql)

    if (this.dryRun) {
      return `dry-user-${params.email}`
    }

    const res = await this.client!.query(sql, vals)
    return String(res.rows[0]?.id ?? params.email)
  }

  async addDualRoleA(
    userId: string,
    tenantId: string,
    config: DualRolePatternAConfig,
  ): Promise<void> {
    const table = config.supplierTable
    if (!table) return

    const userCol = config.supplierUserIdField ?? 'userId'
    const tenantCol = config.supplierTenantIdField ?? 'tenantId'
    const extra = config.supplierFields ?? {}

    const cols = [`"${userCol}"`, `"${tenantCol}"`]
    const vals: unknown[] = [userId, tenantId]
    for (const [k, v] of Object.entries(extra)) {
      cols.push(`"${k}"`)
      vals.push(v)
    }
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ')
    const sql = `INSERT INTO "${table}" (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING;`

    this.sqlLog.push(sql)
    if (this.dryRun) return
    await this.client!.query(sql, vals)
  }
}
