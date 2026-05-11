/**
 * Audit-Suite Module A — User-list fixture generator.
 *
 * Generates a JSON array of test user records with deterministic credentials
 * suitable for DB seeding, API provisioning, and dual-role test patterns.
 *
 * Roles follow the procuchaingo2 model (OWNER / ADMIN / MANAGER / MEMBER /
 * SUPER_ADMIN) but the role list is configurable for other consumer projects.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

export interface FixtureUser {
  email: string
  password: string
  firstName: string
  lastName: string
  role: string
  /** True when this user should hold a second role in another tenant (Pattern B). */
  dualRole?: {
    role: string
    tenantLabel: string
  }
}

export interface UserListOptions {
  out?: string
  roles?: string[]
  count?: number
  passwordPrefix?: string
  domainSuffix?: string
  /** Add Pattern-A dual-role entries (buyer + supplier in same tenant). */
  dualRolePatternA?: boolean
  /** Add Pattern-B dual-role entries (buyer in T1 + supplier in T2). */
  dualRolePatternB?: boolean
}

const FIRST_NAMES = ['Alice', 'Bob', 'Carol', 'Dan', 'Eva', 'Frank', 'Gina', 'Hank', 'Iris', 'Jake']
const LAST_NAMES = ['Smith', 'Jones', 'Brown', 'Davis', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'White']

export function generateUserList(opts: UserListOptions): FixtureUser[] {
  const roles = opts.roles ?? ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'SUPER_ADMIN']
  const count = opts.count ?? roles.length
  const passwordPrefix = opts.passwordPrefix ?? 'TestPass!'
  const domain = opts.domainSuffix ?? 'fixture.test'

  const users: FixtureUser[] = []

  // One user per requested role, cycling if count > roles.length
  for (let i = 0; i < count; i++) {
    const role = roles[i % roles.length]
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length]
    const lastName = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length]
    const slug = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i > 0 && i % roles.length === 0 ? i : ''}`
    users.push({
      email: `${slug}@${domain}`,
      password: `${passwordPrefix}${role.toLowerCase()}${i + 1}`,
      firstName,
      lastName,
      role,
    })
  }

  // Pattern A: same user has MEMBER + SupplierAccess in same tenant
  if (opts.dualRolePatternA) {
    users.push({
      email: `dual.pattern-a@${domain}`,
      password: `${passwordPrefix}dual-a1`,
      firstName: 'Dual',
      lastName: 'PatternA',
      role: 'MEMBER',
      dualRole: { role: 'SUPPLIER', tenantLabel: 'T1' },
    })
  }

  // Pattern B: buyer in T1 + supplier-access in T2 (cross-tenant)
  if (opts.dualRolePatternB) {
    users.push({
      email: `dual.pattern-b@${domain}`,
      password: `${passwordPrefix}dual-b1`,
      firstName: 'Dual',
      lastName: 'PatternB',
      role: 'MEMBER',
      dualRole: { role: 'SUPPLIER', tenantLabel: 'T2' },
    })
  }

  if (opts.out) {
    const outPath = path.resolve(opts.out)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, JSON.stringify(users, null, 2), 'utf8')
  }

  return users
}
