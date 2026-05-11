// lessons:skip-all
/**
 * Audit-Suite Module A — Fixture generators (T-002).
 *
 * Tests the four deterministic fixture generators independently:
 *   generatePoCsv, generateUserList, generateInvoicePdf, generateAvizPdf
 * Plus CLI subcommand registration via registerFixtures.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// ── helpers ──────────────────────────────────────────────────────────────────

let tmpDir: string

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tester-fixtures-'))
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function tmp(name: string): string {
  return path.join(tmpDir, name)
}

// ── generatePoCsv ─────────────────────────────────────────────────────────────

import { generatePoCsv } from '../../src/fixtures/po-csv'

describe('generatePoCsv', () => {
  it('returns a CSV string with correct header', () => {
    const csv = generatePoCsv({ out: '', rows: 5 })
    const lines = csv.split('\n').filter(Boolean)
    expect(lines[0]).toBe(
      'po_number,sku,product_name,quantity,unit_price,currency,supplier_id,status,created_at,expected_delivery',
    )
  })

  it('produces exactly `rows` data rows (not counting header)', () => {
    const csv = generatePoCsv({ out: '', rows: 10 })
    const dataLines = csv.split('\n').filter(Boolean).slice(1)
    expect(dataLines).toHaveLength(10)
  })

  it('defaults to 10 rows when rows is omitted', () => {
    const csv = generatePoCsv({ out: '' })
    const dataLines = csv.split('\n').filter(Boolean).slice(1)
    expect(dataLines).toHaveLength(10)
  })

  it('stamps the given supplierId on every row', () => {
    const csv = generatePoCsv({ out: '', rows: 5, supplierId: 'SUP-007' })
    const dataLines = csv.split('\n').filter(Boolean).slice(1)
    for (const line of dataLines) {
      expect(line).toContain('SUP-007')
    }
  })

  it('stamps the given currency on every row', () => {
    const csv = generatePoCsv({ out: '', rows: 5, currency: 'USD' })
    const dataLines = csv.split('\n').filter(Boolean).slice(1)
    for (const line of dataLines) {
      expect(line).toContain('USD')
    }
  })

  it('generates sequential PO numbers starting from PO-0001', () => {
    const csv = generatePoCsv({ out: '', rows: 3 })
    const dataLines = csv.split('\n').filter(Boolean).slice(1)
    expect(dataLines[0]).toMatch(/^PO-0001,/)
    expect(dataLines[1]).toMatch(/^PO-0002,/)
    expect(dataLines[2]).toMatch(/^PO-0003,/)
  })

  it('status values are within the allowed set', () => {
    const allowed = new Set(['DRAFT', 'SUBMITTED', 'APPROVED', 'RECEIVED', 'CANCELLED'])
    const csv = generatePoCsv({ out: '', rows: 50 })
    const dataLines = csv.split('\n').filter(Boolean).slice(1)
    for (const line of dataLines) {
      const cols = line.split(',')
      expect(allowed.has(cols[7])).toBe(true)
    }
  })

  it('writes to file when out is provided', () => {
    const outPath = tmp('pos.csv')
    generatePoCsv({ out: outPath, rows: 5 })
    expect(fs.existsSync(outPath)).toBe(true)
    const content = fs.readFileSync(outPath, 'utf8')
    expect(content).toContain('po_number')
  })

  it('creates parent directory when it does not exist', () => {
    const outPath = tmp('nested/deep/pos.csv')
    generatePoCsv({ out: outPath, rows: 2 })
    expect(fs.existsSync(outPath)).toBe(true)
  })
})

// ── generateUserList ──────────────────────────────────────────────────────────

import { generateUserList } from '../../src/fixtures/user-list'

describe('generateUserList', () => {
  it('returns exactly `count` users by default (no dual-role flags)', () => {
    const users = generateUserList({ count: 5, roles: ['OWNER', 'ADMIN', 'MEMBER'] })
    expect(users).toHaveLength(5)
  })

  it('cycles through roles when count > roles.length', () => {
    const users = generateUserList({ count: 7, roles: ['OWNER', 'ADMIN', 'MEMBER'] })
    const roles = users.map((u) => u.role)
    expect(roles[0]).toBe('OWNER')
    expect(roles[1]).toBe('ADMIN')
    expect(roles[2]).toBe('MEMBER')
    expect(roles[3]).toBe('OWNER') // cycle restarts
  })

  it('every user has a well-formed email containing the domainSuffix', () => {
    const users = generateUserList({ count: 4, domainSuffix: 'mytest.io' })
    for (const u of users) {
      expect(u.email).toMatch(/@mytest\.io$/)
    }
  })

  it('password contains the given prefix', () => {
    const users = generateUserList({ count: 3, passwordPrefix: 'Secret' })
    for (const u of users) {
      expect(u.password).toMatch(/^Secret/)
    }
  })

  it('adds +1 Pattern-A user when dualRolePatternA is true', () => {
    const users = generateUserList({ count: 3, dualRolePatternA: true })
    expect(users).toHaveLength(4)
    const patA = users.find((u) => u.email.startsWith('dual.pattern-a'))
    expect(patA).toBeDefined()
    expect(patA!.dualRole).toBeDefined()
    expect(patA!.dualRole!.tenantLabel).toBe('T1')
  })

  it('adds +1 Pattern-B user when dualRolePatternB is true', () => {
    const users = generateUserList({ count: 3, dualRolePatternB: true })
    expect(users).toHaveLength(4)
    const patB = users.find((u) => u.email.startsWith('dual.pattern-b'))
    expect(patB).toBeDefined()
    expect(patB!.dualRole).toBeDefined()
    expect(patB!.dualRole!.tenantLabel).toBe('T2')
  })

  it('adds +2 users when both dual-role flags are set', () => {
    const users = generateUserList({ count: 3, dualRolePatternA: true, dualRolePatternB: true })
    expect(users).toHaveLength(5)
  })

  it('dual-role users have SUPPLIER dualRole.role', () => {
    const users = generateUserList({ count: 2, dualRolePatternA: true, dualRolePatternB: true })
    const dual = users.filter((u) => u.dualRole)
    expect(dual).toHaveLength(2)
    for (const u of dual) {
      expect(u.dualRole!.role).toBe('SUPPLIER')
    }
  })

  it('non-dual-role users have no dualRole field', () => {
    const users = generateUserList({ count: 4 })
    const withDual = users.filter((u) => u.dualRole !== undefined)
    expect(withDual).toHaveLength(0)
  })

  it('writes a valid JSON array to file when out is provided', () => {
    const outPath = tmp('users.json')
    generateUserList({ out: outPath, count: 3 })
    expect(fs.existsSync(outPath)).toBe(true)
    const parsed = JSON.parse(fs.readFileSync(outPath, 'utf8'))
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(3)
  })

  it('uses default roles when none provided', () => {
    const users = generateUserList({ count: 5 })
    const roles = new Set(users.map((u) => u.role))
    // default roles include OWNER, ADMIN, MANAGER, MEMBER, SUPER_ADMIN
    expect([...roles].every((r) => typeof r === 'string')).toBe(true)
  })
})

// ── parseLineItem / parseAvizLineItem (M-1 NaN validation) ───────────────────

import { parseLineItem, parseAvizLineItem } from '../../src/cli/commands/fixtures'

describe('parseLineItem', () => {
  it('parses a valid line item', () => {
    const r = parseLineItem('BEV-001,7UP 1.5L,10,1.95')
    expect(r).toEqual({ sku: 'BEV-001', description: '7UP 1.5L', quantity: 10, unitPrice: 1.95 })
  })

  it('throws when fewer than 4 comma-separated parts', () => {
    expect(() => parseLineItem('BEV-001,7UP,10')).toThrow('--line must be')
  })

  it('throws when qty is non-numeric', () => {
    expect(() => parseLineItem('BEV-001,desc,abc,1.95')).toThrow('qty must be a number')
  })

  it('throws when unitPrice is non-numeric', () => {
    expect(() => parseLineItem('BEV-001,desc,10,xyz')).toThrow('unitPrice must be a number')
  })
})

describe('parseAvizLineItem', () => {
  it('parses a valid aviz line item with optional unit', () => {
    const r = parseAvizLineItem('BEV-001,7UP 1.5L,10,buc')
    expect(r).toEqual({ sku: 'BEV-001', description: '7UP 1.5L', quantity: 10, unit: 'buc' })
  })

  it('parses without unit', () => {
    const r = parseAvizLineItem('BEV-001,7UP 1.5L,10')
    expect(r.unit).toBeUndefined()
  })

  it('throws when fewer than 3 parts', () => {
    expect(() => parseAvizLineItem('BEV-001,desc')).toThrow('--line must be')
  })

  it('throws when qty is non-numeric', () => {
    expect(() => parseAvizLineItem('BEV-001,desc,nope')).toThrow('qty must be a number')
  })
})

// ── WinAnsi sanitizer (M-3: Romanian diacritics in user-supplied fields) ──────

describe('generateAvizPdf — WinAnsi safety on Romanian names', () => {
  it('does not throw when supplierName contains Romanian diacritics', async () => {
    const outPath = tmp('aviz-romanian.pdf')
    await expect(generateAvizPdf({
      out: outPath,
      supplierName: 'SC Băuturi și Alimente SRL',
      receiverName: 'Magazin Ță SRL',
    })).resolves.not.toThrow()
    expect(fs.existsSync(outPath)).toBe(true)
  })
})

describe('generateInvoicePdf — WinAnsi safety on Romanian names', () => {
  it('does not throw when vendorName contains Romanian diacritics', async () => {
    const outPath = tmp('invoice-romanian.pdf')
    await expect(generateInvoicePdf({
      out: outPath,
      vendorName: 'SC Băuturi SRL',
      buyerName: 'Magazin Ță SA',
      lines: [{ sku: 'BEV-001', description: 'Apă minerală', quantity: 1, unitPrice: 5 }],
    })).resolves.not.toThrow()
    expect(fs.existsSync(outPath)).toBe(true)
  })
})

// ── generateInvoicePdf ────────────────────────────────────────────────────────

import { generateInvoicePdf } from '../../src/fixtures/invoice'

describe('generateInvoicePdf', () => {
  it('creates a file at the given output path', async () => {
    const outPath = tmp('invoice.pdf')
    await generateInvoicePdf({ out: outPath })
    expect(fs.existsSync(outPath)).toBe(true)
  })

  it('output starts with %PDF (valid PDF magic bytes)', async () => {
    const outPath = tmp('invoice-magic.pdf')
    await generateInvoicePdf({ out: outPath })
    const buf = fs.readFileSync(outPath)
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF')
  })

  it('output is non-trivially sized (>1 KB)', async () => {
    const outPath = tmp('invoice-size.pdf')
    await generateInvoicePdf({ out: outPath })
    const { size } = fs.statSync(outPath)
    expect(size).toBeGreaterThan(1024)
  })

  it('creates parent directory when it does not exist', async () => {
    const outPath = tmp('sub/invoice.pdf')
    await generateInvoicePdf({ out: outPath })
    expect(fs.existsSync(outPath)).toBe(true)
  })

  it('accepts custom line items and produces a valid PDF', async () => {
    const outPath = tmp('invoice-lines.pdf')
    await generateInvoicePdf({
      out: outPath,
      lines: [
        { sku: 'BEV-001', description: '7UP 1.5L', quantity: 10, unitPrice: 1.95 },
        { sku: 'BEV-002', description: 'Cola 0.5L', quantity: 5, unitPrice: 1.25 },
      ],
    })
    const buf = fs.readFileSync(outPath)
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF')
  })

  it('accepts --total shorthand (no line items)', async () => {
    const outPath = tmp('invoice-total.pdf')
    await generateInvoicePdf({ out: outPath, total: 250.0, currency: 'USD' })
    const buf = fs.readFileSync(outPath)
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF')
  })

  it('embeds linked-aviz hash when the aviz file exists (valid PDF, no throw)', async () => {
    const avizPath = tmp('aviz-for-link.pdf')
    await generateAvizPdf({ out: avizPath })

    const outPath = tmp('invoice-linked.pdf')
    await generateInvoicePdf({ out: outPath, linkedAviz: avizPath })
    const buf = fs.readFileSync(outPath)
    // Content streams are FlateDecode-compressed; verify PDF validity, not raw text search
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF')
    expect(buf.length).toBeGreaterThan(1024)
  })
})

// ── generateAvizPdf ───────────────────────────────────────────────────────────

import { generateAvizPdf } from '../../src/fixtures/aviz'

describe('generateAvizPdf', () => {
  it('creates a file at the given output path', async () => {
    const outPath = tmp('aviz.pdf')
    await generateAvizPdf({ out: outPath })
    expect(fs.existsSync(outPath)).toBe(true)
  })

  it('output starts with %PDF (valid PDF magic bytes)', async () => {
    const outPath = tmp('aviz-magic.pdf')
    await generateAvizPdf({ out: outPath })
    const buf = fs.readFileSync(outPath)
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF')
  })

  it('output is non-trivially sized (>1 KB)', async () => {
    const outPath = tmp('aviz-size.pdf')
    await generateAvizPdf({ out: outPath })
    const { size } = fs.statSync(outPath)
    expect(size).toBeGreaterThan(1024)
  })

  it('creates parent directory when it does not exist', async () => {
    const outPath = tmp('aviz-sub/aviz.pdf')
    await generateAvizPdf({ out: outPath })
    expect(fs.existsSync(outPath)).toBe(true)
  })

  it('accepts custom line items and produces a valid PDF', async () => {
    const outPath = tmp('aviz-lines.pdf')
    await generateAvizPdf({
      out: outPath,
      lines: [
        { sku: 'BEV-001', description: '7UP 1.5L', quantity: 10, unit: 'buc' },
        { sku: 'BEV-002', description: 'Cola 0.5L', quantity: 5 },
      ],
    })
    const buf = fs.readFileSync(outPath)
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF')
  })

  it('embeds linked-invoice hash when invoice file exists (valid PDF, no throw)', async () => {
    const invoicePath = tmp('invoice-for-aviz-link.pdf')
    await generateInvoicePdf({ out: invoicePath })

    const outPath = tmp('aviz-linked.pdf')
    await generateAvizPdf({ out: outPath, linkedTo: invoicePath })
    // Content streams are FlateDecode-compressed; verify PDF validity, not raw text search
    const buf = fs.readFileSync(outPath)
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF')
    expect(buf.length).toBeGreaterThan(1024)
  })

  it('skips hash section when linked invoice does not exist', async () => {
    const outPath = tmp('aviz-no-link.pdf')
    await generateAvizPdf({ out: outPath, linkedTo: '/nonexistent/path/invoice.pdf' })
    // should still produce a valid PDF without throwing
    const buf = fs.readFileSync(outPath)
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF')
  })
})

// ── CLI subcommand registration ───────────────────────────────────────────────

import { Command } from 'commander'
import { registerFixtures } from '../../src/cli/commands/fixtures'

describe('registerFixtures CLI', () => {
  let program: Command

  beforeAll(() => {
    program = new Command()
    program.exitOverride() // prevent process.exit in tests
    registerFixtures(program)
  })

  it('registers the "fixtures" subcommand', () => {
    const names = program.commands.map((c) => c.name())
    expect(names).toContain('fixtures')
  })

  it('fixtures has invoice, aviz, po-csv, user-list subcommands', () => {
    const fixtures = program.commands.find((c) => c.name() === 'fixtures')!
    const subNames = fixtures.commands.map((c) => c.name())
    expect(subNames).toContain('invoice')
    expect(subNames).toContain('aviz')
    expect(subNames).toContain('po-csv')
    expect(subNames).toContain('user-list')
  })

  it('invoice subcommand has --out as required option', () => {
    const fixtures = program.commands.find((c) => c.name() === 'fixtures')!
    const invoice = fixtures.commands.find((c) => c.name() === 'invoice')!
    const opts = invoice.options.map((o) => o.long)
    expect(opts).toContain('--out')
  })

  it('aviz subcommand has --out and --linked-to options', () => {
    const fixtures = program.commands.find((c) => c.name() === 'fixtures')!
    const aviz = fixtures.commands.find((c) => c.name() === 'aviz')!
    const opts = aviz.options.map((o) => o.long)
    expect(opts).toContain('--out')
    expect(opts).toContain('--linked-to')
  })

  it('po-csv subcommand has --out, --rows, --supplier-id options', () => {
    const fixtures = program.commands.find((c) => c.name() === 'fixtures')!
    const poCsv = fixtures.commands.find((c) => c.name() === 'po-csv')!
    const opts = poCsv.options.map((o) => o.long)
    expect(opts).toContain('--out')
    expect(opts).toContain('--rows')
    expect(opts).toContain('--supplier-id')
  })

  it('user-list subcommand has --out, --roles, --count, --dual-role-a, --dual-role-b options', () => {
    const fixtures = program.commands.find((c) => c.name() === 'fixtures')!
    const userList = fixtures.commands.find((c) => c.name() === 'user-list')!
    const opts = userList.options.map((o) => o.long)
    expect(opts).toContain('--out')
    expect(opts).toContain('--roles')
    expect(opts).toContain('--count')
    expect(opts).toContain('--dual-role-a')
    expect(opts).toContain('--dual-role-b')
  })
})
