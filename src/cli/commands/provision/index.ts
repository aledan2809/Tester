/**
 * `tester provision` — Audit-Suite Module B CLI command.
 *
 * Seeds users and tenants in a consumer project's database for True E2E
 * test scenarios. Reads `.tester-provision.json` from the project directory.
 *
 *   tester provision --project-dir /path/to/procuchaingo2 \
 *     --tenants 2 --roles OWNER,ADMIN,MANAGER,MEMBER,SUPER_ADMIN \
 *     --suppliers 3 --dual-role-pattern A,B \
 *     --out master-creds.env
 *
 *   # Dry-run: print SQL, write creds file, no DB writes
 *   tester provision --project-dir . --dry-run --sql-out provision.sql
 */

import type { Command } from 'commander'
import { runProvision } from '../../../provision/engine'

export function registerProvision(program: Command): void {
  program
    .command('provision')
    .description("Seed test users and tenants into a consumer project's database")
    .addHelpText(
      'after',
      `
Examples:
  tester provision --project-dir ./procuchaingo2 --tenants 2 --roles OWNER,ADMIN,MEMBER
  tester provision --project-dir . --suppliers 3 --dual-role-pattern A,B --out creds.env
  tester provision --project-dir . --dry-run --sql-out seed.sql
`,
    )
    .requiredOption(
      '--project-dir <path>',
      'Path to the consumer project root (must contain .tester-provision.json)',
    )
    .option('--tenants <n>', 'Number of tenants to create', parseInt, 1)
    .option(
      '--roles <list>',
      'Comma-separated roles to provision per tenant',
      'OWNER,ADMIN,MANAGER,MEMBER,SUPER_ADMIN',
    )
    .option('--suppliers <n>', 'Number of additional supplier users to create', parseInt, 0)
    .option(
      '--dual-role-pattern <patterns>',
      'Dual-role patterns to apply, comma-separated (A and/or B)',
      '',
    )
    .option('--password-prefix <prefix>', 'Prefix for generated passwords', 'TestPass!')
    .option('--domain <suffix>', 'Email domain suffix', 'fixture.test')
    .option('--out <path>', 'Write credentials env file to this path')
    .option('--sql-out <path>', 'Write INSERT SQL statements to this path')
    .option('--dry-run', 'Generate SQL and credentials without connecting to the database')
    .action(
      async (opts: {
        projectDir: string
        tenants: number
        roles: string
        suppliers: number
        dualRolePattern: string
        passwordPrefix: string
        domain: string
        out?: string
        sqlOut?: string
        dryRun?: boolean
      }) => {
        const dualRolePatterns = opts.dualRolePattern
          ? opts.dualRolePattern.split(',').map((s) => s.trim().toUpperCase())
          : []

        const result = await runProvision({
          projectDir: opts.projectDir,
          tenants: opts.tenants,
          roles: opts.roles.split(',').map((r) => r.trim().toUpperCase()),
          suppliers: opts.suppliers,
          dualRolePatterns,
          passwordPrefix: opts.passwordPrefix,
          domainSuffix: opts.domain,
          out: opts.out,
          sqlOut: opts.sqlOut,
          dryRun: opts.dryRun,
        })

        console.log(
          `provision done — tenants: ${result.tenants.length}, users: ${result.users.length}`,
        )
        if (opts.out) console.log(`credentials → ${opts.out}`)
        if (opts.sqlOut) console.log(`sql → ${opts.sqlOut}`)
        if (opts.dryRun && result.sql.length > 0) {
          console.log('\n--- dry-run SQL ---')
          console.log(result.sql.join('\n'))
        }
      },
    )
}
