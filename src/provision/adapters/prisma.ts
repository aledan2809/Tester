/**
 * Audit-Suite Module B — Prisma adapter.
 *
 * Thin wrapper over PgBaseAdapter with Prisma naming conventions:
 * - Models are lowercase singular (User → "user", Tenant → "tenant")
 * - Primary key is "id" (UUID or int)
 * - Default password field: "password"
 * - Default role field: "role" (string enum on the User table)
 *
 * Usage: set `"driver": "prisma"` in `.tester-provision.json`.
 */

import { PgBaseAdapter } from './pg-base'

export class PrismaAdapter extends PgBaseAdapter {
  constructor(dryRun = false) {
    super(dryRun)
  }

  /** Prisma default: model names are lowercase, PKs are "id". */
  static defaults = {
    userTable: 'user',
    emailField: 'email',
    passwordField: 'password',
    roleField: 'role',
    tenantTable: 'tenant',
    tenantNameField: 'name',
    tenantIdPk: 'id',
    tenantIdField: 'tenantId',
    activeField: undefined as string | undefined,
  }
}
