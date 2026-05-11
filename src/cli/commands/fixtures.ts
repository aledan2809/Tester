/**
 * `tester fixtures` — Audit-Suite Module A CLI command.
 *
 * Generates deterministic test fixtures for audit-suite scenarios:
 *
 *   tester fixtures invoice --out invoice.pdf --total 487.50 --currency EUR \
 *     --line "BEV-PEPSI-003,7UP 1.5L,50,1.95"
 *
 *   tester fixtures aviz --out aviz.pdf --linked-to invoice.pdf \
 *     --line "BEV-PEPSI-003,7UP 1.5L,50"
 *
 *   tester fixtures po-csv --out pos.csv --rows 100 --supplier-id SUP-007
 *
 *   tester fixtures user-list --out users.json \
 *     --roles OWNER,ADMIN,MEMBER --count 5 --dual-role-a --dual-role-b
 */

import type { Command } from 'commander'
import { generateInvoicePdf } from '../../fixtures/invoice'
import { generateAvizPdf } from '../../fixtures/aviz'
import { generatePoCsv } from '../../fixtures/po-csv'
import { generateUserList } from '../../fixtures/user-list'

export function parseLineItem(raw: string): { sku: string; description: string; quantity: number; unitPrice: number } {
  const parts = raw.split(',')
  if (parts.length < 4) {
    throw new Error(`--line must be "sku,description,qty,unitPrice" (got: ${raw})`)
  }
  const quantity = Number(parts[2])
  const unitPrice = Number(parts[3])
  if (Number.isNaN(quantity)) throw new Error(`--line qty must be a number (got: "${parts[2]}")`)
  if (Number.isNaN(unitPrice)) throw new Error(`--line unitPrice must be a number (got: "${parts[3]}")`)
  return { sku: parts[0].trim(), description: parts[1].trim(), quantity, unitPrice }
}

export function parseAvizLineItem(raw: string): { sku: string; description: string; quantity: number; unit?: string } {
  const parts = raw.split(',')
  if (parts.length < 3) {
    throw new Error(`--line must be "sku,description,qty[,unit]" (got: ${raw})`)
  }
  const quantity = Number(parts[2])
  if (Number.isNaN(quantity)) throw new Error(`--line qty must be a number (got: "${parts[2]}")`)
  return { sku: parts[0].trim(), description: parts[1].trim(), quantity, unit: parts[3]?.trim() }
}

export function registerFixtures(program: Command): void {
  const fixtures = program
    .command('fixtures')
    .description('Generate deterministic test fixtures (PDFs, CSVs, user lists) for audit-suite scenarios')
    .addHelpText('after', `
Examples:
  tester fixtures invoice --out ./tmp/invoice.pdf --total 487.50 --currency EUR
  tester fixtures aviz --out ./tmp/aviz.pdf --linked-to ./tmp/invoice.pdf
  tester fixtures po-csv --out ./tmp/pos.csv --rows 50 --supplier-id SUP-007
  tester fixtures user-list --out ./tmp/users.json --roles OWNER,ADMIN,MEMBER --count 5
`)

  // ── invoice ───────────────────────────────────────────────────────────────
  fixtures
    .command('invoice')
    .description('Generate a realistic invoice PDF')
    .requiredOption('--out <path>', 'Output path for the PDF')
    .option('--total <number>', 'Invoice total (used when --line not given)', parseFloat)
    .option('--currency <code>', 'Currency code', 'EUR')
    .option('--line <spec>', 'Line item "sku,description,qty,unitPrice" (repeatable)', (v, acc: string[]) => { acc.push(v); return acc }, [] as string[])
    .option('--invoice-number <n>', 'Override auto-generated invoice number')
    .option('--vendor <name>', 'Vendor name')
    .option('--buyer <name>', 'Buyer name')
    .option('--linked-aviz <path>', 'Path to a linked aviz PDF (embeds file hash for 4-way-match)')
    .action(async (opts: {
      out: string
      total?: number
      currency: string
      line: string[]
      invoiceNumber?: string
      vendor?: string
      buyer?: string
      linkedAviz?: string
    }) => {
      const lines = opts.line.map(parseLineItem)
      await generateInvoicePdf({
        out: opts.out,
        total: opts.total,
        currency: opts.currency,
        lines: lines.length > 0 ? lines : undefined,
        invoiceNumber: opts.invoiceNumber,
        vendorName: opts.vendor,
        buyerName: opts.buyer,
        linkedAviz: opts.linkedAviz,
      })
      console.log(`invoice written → ${opts.out}`)
    })

  // ── aviz ─────────────────────────────────────────────────────────────────
  fixtures
    .command('aviz')
    .description('Generate a delivery note (aviz de însoțire) PDF')
    .requiredOption('--out <path>', 'Output path for the PDF')
    .option('--linked-to <path>', 'Path to linked invoice PDF (embeds file hash)')
    .option('--line <spec>', 'Line item "sku,description,qty[,unit]" (repeatable)', (v, acc: string[]) => { acc.push(v); return acc }, [] as string[])
    .option('--aviz-number <n>', 'Override auto-generated aviz number')
    .option('--supplier <name>', 'Supplier name')
    .option('--receiver <name>', 'Receiver name')
    .action(async (opts: {
      out: string
      linkedTo?: string
      line: string[]
      avizNumber?: string
      supplier?: string
      receiver?: string
    }) => {
      const lines = opts.line.map(parseAvizLineItem)
      await generateAvizPdf({
        out: opts.out,
        linkedTo: opts.linkedTo,
        lines: lines.length > 0 ? lines : undefined,
        avizNumber: opts.avizNumber,
        supplierName: opts.supplier,
        receiverName: opts.receiver,
      })
      console.log(`aviz written → ${opts.out}`)
    })

  // ── po-csv ────────────────────────────────────────────────────────────────
  fixtures
    .command('po-csv')
    .description('Generate a purchase-order CSV for data-import testing')
    .requiredOption('--out <path>', 'Output path for the CSV')
    .option('--rows <n>', 'Number of PO rows', parseInt, 10)
    .option('--supplier-id <id>', 'Supplier ID to stamp on all rows', 'SUP-001')
    .option('--currency <code>', 'Currency code', 'EUR')
    .action((opts: { out: string; rows: number; supplierId: string; currency: string }) => {
      generatePoCsv({ out: opts.out, rows: opts.rows, supplierId: opts.supplierId, currency: opts.currency })
      console.log(`po-csv written → ${opts.out} (${opts.rows} rows)`)
    })

  // ── user-list ─────────────────────────────────────────────────────────────
  fixtures
    .command('user-list')
    .description('Generate a JSON user-list for provisioning + dual-role testing')
    .requiredOption('--out <path>', 'Output path for the JSON file')
    .option('--roles <list>', 'Comma-separated role names', 'OWNER,ADMIN,MANAGER,MEMBER')
    .option('--count <n>', 'Total number of users to generate', parseInt, 5)
    .option('--password-prefix <prefix>', 'Password prefix', 'TestPass!')
    .option('--domain <suffix>', 'Email domain suffix', 'fixture.test')
    .option('--dual-role-a', 'Include a Pattern-A dual-role user (buyer + supplier in same tenant)')
    .option('--dual-role-b', 'Include a Pattern-B dual-role user (buyer T1 + supplier T2)')
    .action((opts: {
      out: string
      roles: string
      count: number
      passwordPrefix: string
      domain: string
      dualRoleA?: boolean
      dualRoleB?: boolean
    }) => {
      const users = generateUserList({
        out: opts.out,
        roles: opts.roles.split(',').map((r) => r.trim().toUpperCase()),
        count: opts.count,
        passwordPrefix: opts.passwordPrefix,
        domainSuffix: opts.domain,
        dualRolePatternA: opts.dualRoleA,
        dualRolePatternB: opts.dualRoleB,
      })
      console.log(`user-list written → ${opts.out} (${users.length} users)`)
    })
}
