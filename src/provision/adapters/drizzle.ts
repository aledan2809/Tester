/**
 * Audit-Suite Module B — Drizzle adapter.
 *
 * Thin wrapper over PgBaseAdapter with Drizzle naming conventions:
 * - Table names are snake_case plural (users, tenants, supplier_access)
 * - Primary key is "id"
 * - Column names are snake_case
 *
 * Usage: set `"driver": "drizzle"` in `.tester-provision.json`.
 */

import { PgBaseAdapter } from './pg-base'

export class DrizzleAdapter extends PgBaseAdapter {
  constructor(dryRun = false) {
    super(dryRun)
  }

  /** Drizzle default: snake_case plural table names. */
  static defaults = {
    userTable: 'users',
    emailField: 'email',
    passwordField: 'password_hash',
    roleField: 'role',
    tenantTable: 'tenants',
    tenantNameField: 'name',
    tenantIdPk: 'id',
    tenantIdField: 'tenant_id',
    activeField: 'is_active' as string | undefined,
  }
}
