/**
 * Audit-Suite Module A — Purchase-Order CSV fixture generator.
 *
 * Generates a realistic PO CSV for data-import and scenario seeding.
 * Each row is a PO line item with randomised SKUs, quantities, and suppliers.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

export interface PoCsvOptions {
  out: string
  rows?: number
  supplierId?: string
  currency?: string
  statusDistribution?: {
    DRAFT?: number
    SUBMITTED?: number
    APPROVED?: number
    RECEIVED?: number
    CANCELLED?: number
  }
}

const PRODUCTS = [
  { sku: 'BEV-PEPSI-003', name: '7UP 1.5L', unitPrice: 1.95 },
  { sku: 'BEV-COLA-001', name: 'Coca-Cola 0.5L', unitPrice: 1.25 },
  { sku: 'FOOD-CHIPS-007', name: 'Lay\'s Classic 200g', unitPrice: 2.40 },
  { sku: 'FOOD-BISCUIT-002', name: 'Biscuiți Digestive 400g', unitPrice: 3.10 },
  { sku: 'CLEAN-DETERG-005', name: 'Detergent Ariel 3kg', unitPrice: 15.80 },
  { sku: 'CLEAN-FABRIC-001', name: 'Balsam Lenor 1.5L', unitPrice: 8.50 },
  { sku: 'DAIRY-MILK-002', name: 'Lapte Zuzu 1L', unitPrice: 2.20 },
  { sku: 'DAIRY-CHEESE-003', name: 'Telemea 400g', unitPrice: 6.90 },
  { sku: 'GRAIN-BREAD-001', name: 'Pâine albă 500g', unitPrice: 2.10 },
  { sku: 'GRAIN-PASTA-004', name: 'Paste Barilla 500g', unitPrice: 4.50 },
]

const STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'RECEIVED', 'CANCELLED'] as const
type PoStatus = typeof STATUSES[number]

function pickStatus(dist: NonNullable<PoCsvOptions['statusDistribution']>): PoStatus {
  const entries = STATUSES.map((s) => [s, dist[s] ?? 0] as [PoStatus, number])
  const total = entries.reduce((s, [, w]) => s + w, 0)
  if (total === 0) return 'APPROVED'
  let r = Math.random() * total
  for (const [status, weight] of entries) {
    r -= weight
    if (r <= 0) return status
  }
  return 'APPROVED'
}

function isoDate(daysOffset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysOffset)
  return d.toISOString().split('T')[0]
}

export function generatePoCsv(opts: PoCsvOptions): string {
  const rows = opts.rows ?? 10
  const supplierId = opts.supplierId ?? 'SUP-001'
  const currency = opts.currency ?? 'EUR'
  const dist = opts.statusDistribution ?? { DRAFT: 2, SUBMITTED: 3, APPROVED: 4, RECEIVED: 3, CANCELLED: 1 }

  const header = ['po_number', 'sku', 'product_name', 'quantity', 'unit_price', 'currency', 'supplier_id', 'status', 'created_at', 'expected_delivery'].join(',')

  const lines: string[] = [header]
  for (let i = 1; i <= rows; i++) {
    const poNum = `PO-${String(i).padStart(4, '0')}`
    const product = PRODUCTS[i % PRODUCTS.length]
    const qty = 5 + (i * 7) % 95
    const status = pickStatus(dist)
    const createdDaysAgo = Math.floor(Math.random() * 60)
    const deliveryDaysFromNow = Math.floor(Math.random() * 30) + 5
    lines.push([
      poNum,
      product.sku,
      `"${product.name}"`,
      qty,
      product.unitPrice.toFixed(2),
      currency,
      supplierId,
      status,
      isoDate(-createdDaysAgo),
      isoDate(deliveryDaysFromNow),
    ].join(','))
  }

  const csv = lines.join('\n') + '\n'

  if (opts.out) {
    const outPath = path.resolve(opts.out)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, csv, 'utf8')
  }

  return csv
}
