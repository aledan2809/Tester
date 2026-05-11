/**
 * Audit-Suite Module B — Provision type definitions.
 *
 * Each consumer project ships a `.tester-provision.json` at its repo root
 * that tells the provisioner how to create users inside its database.
 *
 * Supported drivers: 'prisma' | 'drizzle' | 'raw'
 * Supported password algorithms: 'bcrypt' | 'plaintext'
 * Supported multi-tenant models: 'column' | 'none'
 */

// ── Config file schema (.tester-provision.json) ───────────────────────────────

export interface ProvisionConfig {
  /** ORM the project uses — affects naming conventions and default table names. */
  driver: 'prisma' | 'drizzle' | 'raw'
  /**
   * PostgreSQL or SQLite connection URL.
   * If omitted, read from `DATABASE_URL` env var at runtime.
   */
  databaseUrl?: string
  /** How user rows are structured in the DB. */
  schemaMapping: SchemaMappingConfig
  /** How tenants are isolated. */
  multiTenant: MultiTenantConfig
  /** Optional Pattern-A dual-role setup (buyer + supplier in same tenant). */
  dualRolePatternA?: DualRolePatternAConfig
  /** Optional Pattern-B dual-role setup (buyer T1 + supplier T2). */
  dualRolePatternB?: DualRolePatternBConfig
}

export interface SchemaMappingConfig {
  /** Actual DB table name (e.g. "user", "users", "accounts"). */
  userTable: string
  /** Column for email address. */
  emailField: string
  /** Column where the hashed password is stored. */
  passwordField: string
  /** Hashing algorithm for new passwords. */
  passwordAlgo: 'bcrypt' | 'plaintext'
  /** bcrypt cost factor (default: 10). */
  bcryptRounds?: number
  /** Column for the user's primary role (omit if roles live in a separate table). */
  roleField?: string
  /** Column that links a user to a tenant (relevant when multiTenant.model = 'column'). */
  tenantIdField?: string
  /** If the schema has an isActive / active flag, set it to true on insert. */
  activeField?: string
  /**
   * Any extra static columns to include on every INSERT
   * (e.g. `{ "onboardingCompleted": true, "emailVerified": true }`).
   */
  extraFields?: Record<string, unknown>
}

export interface MultiTenantConfig {
  /**
   * 'column' — tenantId stored as a column on the user table.
   * 'none'   — single-tenant, no tenant segregation.
   */
  model: 'column' | 'none'
  /** Table that stores tenants (required when model = 'column'). */
  tenantTable?: string
  /** Column that holds the tenant's human-readable name. */
  tenantNameField?: string
  /** Primary key column of the tenant table. */
  tenantIdPk?: string
}

export interface DualRolePatternAConfig {
  /**
   * Pattern A: one user holds two roles inside the SAME tenant.
   * Implemented by inserting a row into a secondary supplier table
   * OR by setting extra fields on the user row.
   */
  /** Separate table for supplier access rows (optional). */
  supplierTable?: string
  /** FK column pointing at the user in supplierTable. */
  supplierUserIdField?: string
  /** FK column pointing at the tenant in supplierTable. */
  supplierTenantIdField?: string
  /** Extra static fields to write on the supplier access row. */
  supplierFields?: Record<string, unknown>
  /** Roles the dual-role user should carry (defaults to [roles[0], roles[1]]). */
  roles?: [string, string]
}

export interface DualRolePatternBConfig {
  /**
   * Pattern B: one user exists in T1 with a buyer role AND in T2 with a
   * supplier role — separate rows in the user table under different tenants.
   */
  t1Role?: string
  t2Role?: string
}

// ── Runtime records produced by the provisioner ──────────────────────────────

export interface ProvisionedTenant {
  label: string
  id: string
}

export interface ProvisionedUser {
  email: string
  password: string
  role: string
  tenantLabel: string
  tenantId: string
  /** Set for dual-role Pattern A users. */
  dualRoleA?: boolean
  /**
   * Set for both legs of a dual-role Pattern B pair.
   * false = buyer side (T1), true = supplier side (T2).
   * undefined = not a Pattern B user at all.
   */
  dualRoleB?: boolean
}

export interface ProvisionResult {
  tenants: ProvisionedTenant[]
  users: ProvisionedUser[]
  /** SQL INSERT statements (populated when dry-run or sqlOut requested). */
  sql: string[]
}

// ── Adapter interface ─────────────────────────────────────────────────────────

export interface ProvisionAdapter {
  connect(url: string): Promise<void>
  findOrCreateTenant(label: string, config: MultiTenantConfig): Promise<string>
  hashPassword(plain: string, algo: 'bcrypt' | 'plaintext', rounds?: number): Promise<string>
  insertUser(params: UserInsertParams): Promise<string>
  addDualRoleA(userId: string, tenantId: string, config: DualRolePatternAConfig): Promise<void>
  disconnect(): Promise<void>
  /** Returns accumulated SQL statements (dry-run adapters only). */
  getSql(): string[]
}

export interface UserInsertParams {
  email: string
  passwordHash: string
  emailField: string
  passwordField: string
  role: string | undefined
  roleField: string | undefined
  tenantId: string | undefined
  tenantIdField: string | undefined
  activeField: string | undefined
  extraFields: Record<string, unknown>
  userTable: string
}
