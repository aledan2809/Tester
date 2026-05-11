// lessons:skip-all
/**
 * Audit-Suite Module B — Provisioner (T-003).
 *
 * Tests the provision engine in dry-run mode (no DB connection required)
 * and the CLI command registration. All assertions operate on in-memory
 * results and generated SQL/credentials files.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// ── helpers ───────────────────────────────────────────────────────────────────

let tmpDir: string

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tester-provision-'))
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function tmp(name: string): string {
  return path.join(tmpDir, name)
}

function writeConfig(dir: string, cfg: object): void {
  fs.writeFileSync(path.join(dir, '.tester-provision.json'), JSON.stringify(cfg, null, 2))
}

const baseConfig = {
  driver: 'prisma',
  schemaMapping: {
    userTable: 'user',
    emailField: 'email',
    passwordField: 'password',
    passwordAlgo: 'bcrypt',
    bcryptRounds: 4,
    roleField: 'role',
    tenantIdField: 'tenantId',
    activeField: 'isActive',
    extraFields: { onboardingCompleted: true },
  },
  multiTenant: {
    model: 'column',
    tenantTable: 'tenant',
    tenantNameField: 'name',
    tenantIdPk: 'id',
  },
}

// ── imports ───────────────────────────────────────────────────────────────────

import { loadConfig, runProvision, CONFIG_FILE } from '../../src/provision/engine'

// ── loadConfig ────────────────────────────────────────────────────────────────

describe('loadConfig', () => {
  it('loads and parses a valid .tester-provision.json', () => {
    const dir = tmp('loadconfig-valid')
    fs.mkdirSync(dir)
    writeConfig(dir, baseConfig)
    const cfg = loadConfig(dir)
    expect(cfg.driver).toBe('prisma')
    expect(cfg.schemaMapping.userTable).toBe('user')
    expect(cfg.multiTenant.model).toBe('column')
  })

  it('throws when .tester-provision.json is absent', () => {
    const dir = tmp('loadconfig-missing')
    fs.mkdirSync(dir)
    expect(() => loadConfig(dir)).toThrow(CONFIG_FILE)
  })

  it('throws on malformed JSON', () => {
    const dir = tmp('loadconfig-bad')
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, CONFIG_FILE), '{ bad json }')
    expect(() => loadConfig(dir)).toThrow()
  })
})

// ── runProvision — single tenant, single role ─────────────────────────────────

describe('runProvision — single tenant, single role (dry-run)', () => {
  let projectDir: string

  beforeAll(() => {
    projectDir = tmp('single')
    fs.mkdirSync(projectDir)
    writeConfig(projectDir, baseConfig)
  })

  it('returns exactly 1 tenant', async () => {
    const result = await runProvision({ projectDir, tenants: 1, roles: ['OWNER'], dryRun: true })
    expect(result.tenants).toHaveLength(1)
    expect(result.tenants[0].label).toBe('Tenant-1')
  })

  it('returns exactly 1 user', async () => {
    const result = await runProvision({ projectDir, tenants: 1, roles: ['OWNER'], dryRun: true })
    expect(result.users).toHaveLength(1)
    expect(result.users[0].role).toBe('OWNER')
  })

  it('user email follows <role>.t<n>@<domain> pattern', async () => {
    const result = await runProvision({ projectDir, tenants: 1, roles: ['ADMIN'], dryRun: true })
    expect(result.users[0].email).toBe('admin.t1@fixture.test')
  })

  it('user password uses custom prefix', async () => {
    const result = await runProvision({
      projectDir,
      tenants: 1,
      roles: ['MEMBER'],
      passwordPrefix: 'Audit!',
      dryRun: true,
    })
    expect(result.users[0].password).toMatch(/^Audit!/)
  })

  it('generates SQL INSERT for tenant table', async () => {
    const result = await runProvision({ projectDir, tenants: 1, roles: ['OWNER'], dryRun: true })
    const tenantSql = result.sql.find((s) => s.includes('INSERT INTO "tenant"'))
    expect(tenantSql).toBeDefined()
  })

  it('generates SQL INSERT for user table', async () => {
    const result = await runProvision({ projectDir, tenants: 1, roles: ['OWNER'], dryRun: true })
    const userSql = result.sql.find((s) => s.includes('INSERT INTO "user"'))
    expect(userSql).toBeDefined()
  })

  it('user SQL includes email, password, role, tenantId, isActive columns', async () => {
    const result = await runProvision({ projectDir, tenants: 1, roles: ['OWNER'], dryRun: true })
    const userSql = result.sql.find((s) => s.includes('INSERT INTO "user"')) ?? ''
    expect(userSql).toContain('"email"')
    expect(userSql).toContain('"password"')
    expect(userSql).toContain('"role"')
    expect(userSql).toContain('"tenantId"')
    expect(userSql).toContain('"isActive"')
  })
})

// ── runProvision — multi-tenant, multi-role ───────────────────────────────────

describe('runProvision — multi-tenant, multi-role (dry-run)', () => {
  let projectDir: string

  beforeAll(() => {
    projectDir = tmp('multi')
    fs.mkdirSync(projectDir)
    writeConfig(projectDir, baseConfig)
  })

  it('creates tenantCount × roles.length users', async () => {
    const result = await runProvision({
      projectDir,
      tenants: 2,
      roles: ['OWNER', 'ADMIN', 'MEMBER'],
      dryRun: true,
    })
    expect(result.users).toHaveLength(6)
  })

  it('tenant labels are Tenant-1 ... Tenant-N', async () => {
    const result = await runProvision({ projectDir, tenants: 3, roles: ['OWNER'], dryRun: true })
    const labels = result.tenants.map((t) => t.label)
    expect(labels).toEqual(['Tenant-1', 'Tenant-2', 'Tenant-3'])
  })

  it('users in T2 have different emails from users in T1', async () => {
    const result = await runProvision({
      projectDir,
      tenants: 2,
      roles: ['OWNER'],
      dryRun: true,
    })
    expect(result.users[0].email).not.toBe(result.users[1].email)
    expect(result.users[0].tenantLabel).toBe('Tenant-1')
    expect(result.users[1].tenantLabel).toBe('Tenant-2')
  })
})

// ── runProvision — suppliers ───────────────────────────────────────────────────

describe('runProvision — suppliers (dry-run)', () => {
  let projectDir: string

  beforeAll(() => {
    projectDir = tmp('suppliers')
    fs.mkdirSync(projectDir)
    writeConfig(projectDir, baseConfig)
  })

  it('adds supplier users on top of regular users', async () => {
    const result = await runProvision({
      projectDir,
      tenants: 1,
      roles: ['OWNER'],
      suppliers: 2,
      dryRun: true,
    })
    // 1 OWNER + 2 SUPPLIER
    expect(result.users).toHaveLength(3)
    const supplierUsers = result.users.filter((u) => u.role === 'SUPPLIER')
    expect(supplierUsers).toHaveLength(2)
  })

  it('supplier emails are supplier.N@domain', async () => {
    const result = await runProvision({
      projectDir,
      tenants: 1,
      roles: [],
      suppliers: 1,
      dryRun: true,
    })
    expect(result.users[0].email).toBe('supplier.1@fixture.test')
  })
})

// ── runProvision — dual-role Pattern A ────────────────────────────────────────

describe('runProvision — dual-role Pattern A (dry-run)', () => {
  let projectDir: string

  beforeAll(() => {
    projectDir = tmp('dual-a')
    fs.mkdirSync(projectDir)
    writeConfig(projectDir, {
      ...baseConfig,
      dualRolePatternA: {
        supplierTable: 'supplier_access',
        supplierUserIdField: 'userId',
        supplierTenantIdField: 'tenantId',
        supplierFields: { isVerified: true },
      },
    })
  })

  it('marks first supplier user as dualRoleA = true', async () => {
    const result = await runProvision({
      projectDir,
      tenants: 1,
      roles: ['OWNER'],
      suppliers: 1,
      dualRolePatterns: ['A'],
      dryRun: true,
    })
    const dual = result.users.find((u) => u.dualRoleA)
    expect(dual).toBeDefined()
    expect(dual!.role).toBe('SUPPLIER')
  })

  it('generates SQL INSERT for supplier_access table', async () => {
    const result = await runProvision({
      projectDir,
      tenants: 1,
      roles: [],
      suppliers: 1,
      dualRolePatterns: ['A'],
      dryRun: true,
    })
    const accessSql = result.sql.find((s) => s.includes('supplier_access'))
    expect(accessSql).toBeDefined()
    expect(accessSql).toContain('"isVerified"')
  })
})

// ── runProvision — dual-role Pattern B ────────────────────────────────────────

describe('runProvision — dual-role Pattern B (dry-run)', () => {
  let projectDir: string

  beforeAll(() => {
    projectDir = tmp('dual-b')
    fs.mkdirSync(projectDir)
    writeConfig(projectDir, {
      ...baseConfig,
      dualRolePatternB: { t1Role: 'MEMBER', t2Role: 'SUPPLIER' },
    })
  })

  it('requires at least 2 tenants to apply Pattern B', async () => {
    const result = await runProvision({
      projectDir,
      tenants: 1,
      roles: [],
      dualRolePatterns: ['B'],
      dryRun: true,
    })
    const duals = result.users.filter((u) => u.dualRoleB !== undefined)
    // With only 1 tenant, Pattern B is silently skipped
    expect(duals).toHaveLength(0)
  })

  it('creates 2 extra rows when tenants >= 2', async () => {
    const result = await runProvision({
      projectDir,
      tenants: 2,
      roles: [],
      dualRolePatterns: ['B'],
      dryRun: true,
    })
    const duals = result.users.filter((u) => u.dualRoleB !== undefined)
    expect(duals).toHaveLength(2)
    expect(duals[0].role).toBe('MEMBER')
    expect(duals[1].role).toBe('SUPPLIER')
  })
})

// ── credentials file output ────────────────────────────────────────────────────

describe('runProvision — credentials file output (dry-run)', () => {
  let projectDir: string

  beforeAll(() => {
    projectDir = tmp('creds-out')
    fs.mkdirSync(projectDir)
    writeConfig(projectDir, baseConfig)
  })

  it('writes a .env-style credentials file', async () => {
    const outPath = tmp('creds.env')
    await runProvision({
      projectDir,
      tenants: 1,
      roles: ['OWNER', 'MEMBER'],
      out: outPath,
      dryRun: true,
    })
    expect(fs.existsSync(outPath)).toBe(true)
    const content = fs.readFileSync(outPath, 'utf8')
    expect(content).toContain('_EMAIL=')
    expect(content).toContain('_PASSWORD=')
    expect(content).toContain('TENANT_1')
  })

  it('env file contains one EMAIL + PASSWORD pair per user', async () => {
    const outPath = tmp('creds-count.env')
    await runProvision({
      projectDir,
      tenants: 1,
      roles: ['OWNER', 'ADMIN', 'MEMBER'],
      out: outPath,
      dryRun: true,
    })
    const lines = fs.readFileSync(outPath, 'utf8').split('\n').filter((l) => l.includes('_EMAIL='))
    expect(lines).toHaveLength(3)
  })
})

// ── SQL file output ────────────────────────────────────────────────────────────

describe('runProvision — SQL file output (dry-run)', () => {
  let projectDir: string

  beforeAll(() => {
    projectDir = tmp('sql-out')
    fs.mkdirSync(projectDir)
    writeConfig(projectDir, baseConfig)
  })

  it('writes a SQL file with INSERT statements', async () => {
    const sqlPath = tmp('seed.sql')
    await runProvision({
      projectDir,
      tenants: 1,
      roles: ['OWNER'],
      sqlOut: sqlPath,
      dryRun: true,
    })
    expect(fs.existsSync(sqlPath)).toBe(true)
    const content = fs.readFileSync(sqlPath, 'utf8')
    expect(content).toContain('INSERT INTO')
  })
})

// ── adapter defaults ───────────────────────────────────────────────────────────

import { PrismaAdapter } from '../../src/provision/adapters/prisma'
import { DrizzleAdapter } from '../../src/provision/adapters/drizzle'

describe('PrismaAdapter static defaults', () => {
  it('userTable is "user"', () => {
    expect(PrismaAdapter.defaults.userTable).toBe('user')
  })
  it('tenantTable is "tenant"', () => {
    expect(PrismaAdapter.defaults.tenantTable).toBe('tenant')
  })
  it('roleField is "role"', () => {
    expect(PrismaAdapter.defaults.roleField).toBe('role')
  })
})

describe('DrizzleAdapter static defaults', () => {
  it('userTable is "users"', () => {
    expect(DrizzleAdapter.defaults.userTable).toBe('users')
  })
  it('tenantTable is "tenants"', () => {
    expect(DrizzleAdapter.defaults.tenantTable).toBe('tenants')
  })
  it('passwordField is "password_hash"', () => {
    expect(DrizzleAdapter.defaults.passwordField).toBe('password_hash')
  })
  it('tenantIdField is "tenant_id"', () => {
    expect(DrizzleAdapter.defaults.tenantIdField).toBe('tenant_id')
  })
})

// ── password hashing ──────────────────────────────────────────────────────────

import { PgBaseAdapter } from '../../src/provision/adapters/pg-base'

describe('PgBaseAdapter.hashPassword', () => {
  const adapter = new PgBaseAdapter(true)

  it('returns the original string for plaintext algo', async () => {
    const hash = await adapter.hashPassword('MyPass!', 'plaintext')
    expect(hash).toBe('MyPass!')
  })

  it('returns a bcrypt hash starting with $2', async () => {
    const hash = await adapter.hashPassword('MyPass!', 'bcrypt', 4)
    expect(hash).toMatch(/^\$2[ab]\$/)
  })

  it('produces different hashes on each call (salted)', async () => {
    const h1 = await adapter.hashPassword('same', 'bcrypt', 4)
    const h2 = await adapter.hashPassword('same', 'bcrypt', 4)
    expect(h1).not.toBe(h2)
  })
})

// ── CLI registration ─────────────────────────────────────────────────────────

import { Command } from 'commander'
import { registerProvision } from '../../src/cli/commands/provision'

describe('registerProvision', () => {
  it('registers a "provision" subcommand', () => {
    const program = new Command()
    registerProvision(program)
    const cmd = program.commands.find((c) => c.name() === 'provision')
    expect(cmd).toBeDefined()
  })

  it('"provision" requires --project-dir', () => {
    const program = new Command()
    registerProvision(program)
    const cmd = program.commands.find((c) => c.name() === 'provision')!
    const opt = cmd.options.find((o) => o.long === '--project-dir')
    expect(opt).toBeDefined()
    expect(opt!.mandatory).toBe(true)
  })

  it('"provision" has --dry-run flag', () => {
    const program = new Command()
    registerProvision(program)
    const cmd = program.commands.find((c) => c.name() === 'provision')!
    const opt = cmd.options.find((o) => o.long === '--dry-run')
    expect(opt).toBeDefined()
  })
})
