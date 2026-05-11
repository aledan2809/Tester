/**
 * Audit-Suite Module B — Provisioner engine.
 *
 * Reads `.tester-provision.json`, resolves an adapter, creates tenants
 * and users (with hashed passwords and dual-role patterns), then writes
 * a `master-creds.env` credentials file.
 *
 * DB interaction is fully delegated to the adapter — dry-run mode
 * (dryRun: true) generates SQL without connecting to any DB.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type {
  ProvisionConfig,
  ProvisionResult,
  ProvisionedTenant,
  ProvisionedUser,
  ProvisionAdapter,
  SchemaMappingConfig,
  MultiTenantConfig,
  UserInsertParams,
} from './types'
import { PrismaAdapter } from './adapters/prisma'
import { DrizzleAdapter } from './adapters/drizzle'
import { PgBaseAdapter } from './adapters/pg-base'

export const CONFIG_FILE = '.tester-provision.json'

export function loadConfig(projectDir: string): ProvisionConfig {
  const p = path.resolve(projectDir, CONFIG_FILE)
  if (!fs.existsSync(p)) {
    throw new Error(`No ${CONFIG_FILE} found at ${p}`)
  }
  return JSON.parse(fs.readFileSync(p, 'utf8')) as ProvisionConfig
}

function resolveAdapter(driver: string, dryRun: boolean): ProvisionAdapter {
  if (driver === 'prisma') return new PrismaAdapter(dryRun)
  if (driver === 'drizzle') return new DrizzleAdapter(dryRun)
  return new PgBaseAdapter(dryRun)
}

export function resolveDbUrl(config: ProvisionConfig): string {
  const raw = config.databaseUrl ?? ''
  // Support ${ENV_VAR} interpolation anywhere in the value,
  // e.g. "postgresql://user@${DB_HOST}/mydb" or a bare "${DATABASE_URL}".
  return raw.replace(/\${([^}]+)}/g, (_, k: string) => process.env[k] ?? '')
}

function makeSlug(role: string, tenantIdx: number): string {
  return `${role.toLowerCase()}.t${tenantIdx + 1}`
}

function buildInsertParams(
  email: string,
  passwordHash: string,
  role: string | undefined,
  tenantId: string | undefined,
  sm: SchemaMappingConfig,
  mt: MultiTenantConfig,
): UserInsertParams {
  return {
    email,
    passwordHash,
    emailField: sm.emailField,
    passwordField: sm.passwordField,
    role: sm.roleField ? role : undefined,
    roleField: sm.roleField,
    tenantId: mt.model === 'column' ? tenantId : undefined,
    tenantIdField: sm.tenantIdField,
    activeField: sm.activeField,
    extraFields: sm.extraFields ?? {},
    userTable: sm.userTable,
  }
}

export interface ProvisionOptions {
  projectDir: string
  tenants?: number
  roles?: string[]
  suppliers?: number
  dualRolePatterns?: string[]
  passwordPrefix?: string
  domainSuffix?: string
  out?: string
  sqlOut?: string
  dryRun?: boolean
}

export async function runProvision(opts: ProvisionOptions): Promise<ProvisionResult> {
  const config = loadConfig(opts.projectDir)
  const sm = config.schemaMapping
  const mt = config.multiTenant

  const tenantCount = opts.tenants ?? 1
  const roles = opts.roles ?? ['OWNER', 'ADMIN', 'MEMBER']
  const supplierCount = opts.suppliers ?? 0
  const dualPatterns = opts.dualRolePatterns ?? []
  const passwordPrefix = opts.passwordPrefix ?? 'TestPass!'
  const domain = opts.domainSuffix ?? 'fixture.test'
  const dryRun = opts.dryRun ?? false

  const adapter = resolveAdapter(config.driver, dryRun)
  const dbUrl = resolveDbUrl(config)

  if (!dryRun && !dbUrl) {
    throw new Error('DATABASE_URL is not set and databaseUrl is not in config')
  }

  await adapter.connect(dbUrl)

  const result: ProvisionResult = { tenants: [], users: [], sql: [] }

  try {
    // ── Tenants ────────────────────────────────────────────────────────────
    const provisionedTenants: ProvisionedTenant[] = []
    for (let ti = 0; ti < tenantCount; ti++) {
      const label = `Tenant-${ti + 1}`
      const id = await adapter.findOrCreateTenant(label, mt)
      provisionedTenants.push({ label, id })
    }
    result.tenants = provisionedTenants

    // ── Regular users (one per role, per tenant) ───────────────────────────
    for (let ti = 0; ti < provisionedTenants.length; ti++) {
      const { label: tenantLabel, id: tenantId } = provisionedTenants[ti]
      for (const role of roles) {
        const email = `${makeSlug(role, ti)}@${domain}`
        const plain = `${passwordPrefix}${role.toLowerCase()}${ti + 1}`
        const hash = await adapter.hashPassword(plain, sm.passwordAlgo, sm.bcryptRounds)
        await adapter.insertUser(buildInsertParams(email, hash, role, tenantId, sm, mt))
        result.users.push({ email, password: plain, role, tenantLabel, tenantId })
      }
    }

    // ── Supplier users ──────────────────────────────────────────────────────
    for (let si = 0; si < supplierCount; si++) {
      const ti = si % provisionedTenants.length
      const { label: tenantLabel, id: tenantId } = provisionedTenants[ti]
      const email = `supplier.${si + 1}@${domain}`
      const plain = `${passwordPrefix}supplier${si + 1}`
      const hash = await adapter.hashPassword(plain, sm.passwordAlgo, sm.bcryptRounds)

      const userId = await adapter.insertUser(
        buildInsertParams(email, hash, 'SUPPLIER', tenantId, sm, mt),
      )
      const provUser: ProvisionedUser = { email, password: plain, role: 'SUPPLIER', tenantLabel, tenantId }
      result.users.push(provUser)

      // Pattern A: supplier also gets a SupplierAccess row in the same tenant
      if (dualPatterns.includes('A') && config.dualRolePatternA && si === 0) {
        await adapter.addDualRoleA(userId, tenantId, config.dualRolePatternA)
        provUser.dualRoleA = true
      }
    }

    // ── Dual-role Pattern B (cross-tenant) ─────────────────────────────────
    if (dualPatterns.includes('B') && config.dualRolePatternB && provisionedTenants.length >= 2) {
      const cfg = config.dualRolePatternB
      const t1Role = cfg.t1Role ?? roles[0]
      const t2Role = cfg.t2Role ?? 'SUPPLIER'
      const plain = `${passwordPrefix}dual-b`

      // Buyer row in T1
      const hash1 = await adapter.hashPassword(plain, sm.passwordAlgo, sm.bcryptRounds)
      await adapter.insertUser(
        buildInsertParams(`dual.b@${domain}`, hash1, t1Role, provisionedTenants[0].id, sm, mt),
      )
      result.users.push({
        email: `dual.b@${domain}`,
        password: plain,
        role: t1Role,
        tenantLabel: provisionedTenants[0].label,
        tenantId: provisionedTenants[0].id,
        dualRoleB: false,
      })

      // Supplier row in T2 (separate email to avoid UK conflict)
      const hash2 = await adapter.hashPassword(plain, sm.passwordAlgo, sm.bcryptRounds)
      await adapter.insertUser(
        buildInsertParams(`dual.b.t2@${domain}`, hash2, t2Role, provisionedTenants[1].id, sm, mt),
      )
      result.users.push({
        email: `dual.b.t2@${domain}`,
        password: plain,
        role: t2Role,
        tenantLabel: provisionedTenants[1].label,
        tenantId: provisionedTenants[1].id,
        dualRoleB: true,
      })
    }
  } finally {
    await adapter.disconnect()
  }

  result.sql = adapter.getSql()

  // ── Write credentials file ─────────────────────────────────────────────
  if (opts.out) writeCredsFile(opts.out, result)

  // ── Write SQL file ─────────────────────────────────────────────────────
  if (opts.sqlOut && result.sql.length > 0) {
    const sqlPath = path.resolve(opts.sqlOut)
    fs.mkdirSync(path.dirname(sqlPath), { recursive: true })
    fs.writeFileSync(sqlPath, result.sql.join('\n') + '\n', 'utf8')
  }

  return result
}

function writeCredsFile(outPath: string, result: ProvisionResult): void {
  const resolved = path.resolve(outPath)
  fs.mkdirSync(path.dirname(resolved), { recursive: true })

  const lines: string[] = [
    '# Generated by tester provision — do not commit',
    `# Tenants: ${result.tenants.length}  Users: ${result.users.length}`,
    '',
  ]

  for (const t of result.tenants) {
    const key = t.label.toUpperCase().replace(/[^A-Z0-9]/g, '_')
    lines.push(`${key}_ID=${t.id}`)
  }
  lines.push('')

  for (const u of result.users) {
    const roleKey = u.role.toUpperCase()
    const tenantKey = u.tenantLabel.toUpperCase().replace(/[^A-Z0-9]/g, '_')
    const suffix = u.dualRoleA ? '_DUAL_A' : u.dualRoleB ? '_DUAL_B' : ''
    const prefix = `${tenantKey}_${roleKey}${suffix}`
    lines.push(`${prefix}_EMAIL=${u.email}`)
    lines.push(`${prefix}_PASSWORD=${u.password}`)
  }
  lines.push('')

  fs.writeFileSync(resolved, lines.join('\n'), 'utf8')
}
