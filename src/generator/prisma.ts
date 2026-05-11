/**
 * T-005 — Test generator from Prisma schema.
 *
 * Parses a prisma/schema.prisma file, extracts the requested model's fields,
 * and emits a Vitest spec skeleton covering 14 scenarios:
 *
 *   unauth-401             POST without token → 401 (when auth: 'token')
 *   wrong-role-403         POST with bad token → 403
 *   missing-required-400   POST with empty body → 400
 *   string-too-long-400    POST with oversized String → 400
 *   list-all-200           GET /api/:resources → 200 + array
 *   create-201             POST valid payload → 201 (or 200)
 *   read-by-id-200         GET /api/:resources/:id → 200
 *   read-not-found-404     GET /api/:resources/nonexistent → 404
 *   update-200             PATCH /api/:resources/:id → 200
 *   update-not-found-404   PATCH /api/:resources/nonexistent → 404
 *   delete-204             DELETE /api/:resources/:id → 204 (or 200)
 *   delete-not-found-404   DELETE /api/:resources/nonexistent → 404
 *   unique-409             POST duplicate unique field → 409 (only when @unique fields exist)
 *   cleanup-teardown       afterAll: delete any record created in the test run
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

export interface PrismaField {
  name: string
  type: string
  isId: boolean
  isRequired: boolean
  isUnique: boolean
  isRelation: boolean
  defaultExpr?: string
}

export interface PrismaModel {
  name: string
  fields: PrismaField[]
}

export interface GenerateOptions {
  schemaPath: string
  modelName: string
  outDir?: string
  overwrite?: boolean
  apiPath?: string
  auth?: 'token' | 'none'
}

export interface GenerateResult {
  model: string
  filesWritten: string[]
  scenariosGenerated: string[]
  skipped?: string
}

// ─── Prisma schema parser ────────────────────────────────────────────────────

const MODEL_RE = /^model\s+(\w+)\s*\{([\s\S]*?)^\s*\}/gm
const FIELD_RE = /^\s*(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/

export function parsePrismaSchema(content: string): PrismaModel[] {
  const models: PrismaModel[] = []
  MODEL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MODEL_RE.exec(content)) !== null) {
    const name = m[1]
    const body = m[2]
    const fields: PrismaField[] = []
    for (const line of body.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue
      const match = trimmed.match(FIELD_RE)
      if (!match) continue
      const [, fname, ftype, isList, isOptional, rest] = match
      if (!fname || !ftype) continue
      const isRelation = rest.includes('@relation')
      const isId = rest.includes('@id')
      const isUnique = rest.includes('@unique')
      const isRequired = !isOptional && !isList
      const defaultMatch = rest.match(/@default\(([^)]+)\)/)
      fields.push({
        name: fname,
        type: ftype,
        isId,
        isRequired,
        isUnique,
        isRelation,
        defaultExpr: defaultMatch ? defaultMatch[1] : undefined,
      })
    }
    models.push({ name, fields })
  }
  return models
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function pluralize(name: string): string {
  if (name.endsWith('y')) return name.slice(0, -1) + 'ies'
  if (name.endsWith('s')) return name + 'es'
  return name + 's'
}

export function camelCase(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1)
}

function sampleValueFor(f: PrismaField): string {
  const t = f.type
  if (t === 'String') return `'test-${f.name}-' + Date.now()`
  if (t === 'Int' || t === 'BigInt') return '42'
  if (t === 'Float' || t === 'Decimal') return '3.14'
  if (t === 'Boolean') return 'true'
  if (t === 'DateTime') return 'new Date().toISOString()'
  if (t === 'Json') return "{ hello: 'world' }"
  return `'<${t}>'`
}

// ─── Template ────────────────────────────────────────────────────────────────

function buildSpecFile(
  model: PrismaModel,
  opts: { apiPath: string; auth: 'token' | 'none' },
): { file: string; scenarios: string[] } {
  const required = model.fields.filter(
    (f) => f.isRequired && !f.isId && !f.isRelation && !f.defaultExpr,
  )
  const stringFields = model.fields.filter((f) => f.type === 'String' && !f.isId && !f.isRelation)
  const uniqueFields = model.fields.filter(
    (f) => f.isUnique && !f.isId && f.isRequired && !f.isRelation && !f.defaultExpr,
  )
  const idField = model.fields.find((f) => f.isId) || {
    name: 'id',
    type: 'String',
    isId: true,
    isRequired: true,
    isUnique: true,
    isRelation: false,
  }

  const scenarios: string[] = []
  const out: string[] = []

  const authHeaders =
    opts.auth === 'token'
      ? `'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN`
      : `'Content-Type': 'application/json'`

  const authHeadersNoContentType =
    opts.auth === 'token' ? `Authorization: 'Bearer ' + TOKEN` : ''

  const payloadLines = required.map((f) => `      ${f.name}: ${sampleValueFor(f)},`).join('\n')
  const payload = `{\n${payloadLines}\n    }`

  // File header
  out.push(`// T-005 auto-generated spec — REVIEW + CUSTOMIZE before merging.`)
  out.push(`// Generated from model: ${model.name}`)
  out.push(`// Endpoint convention: ${opts.apiPath}`)
  out.push(`// Auth: ${opts.auth}`)
  out.push(`//`)
  out.push(`// Before running:`)
  out.push(`//   export TEST_BASE_URL=http://localhost:3000`)
  if (opts.auth === 'token') {
    out.push(`//   export TEST_TOKEN=<your-bearer-token>`)
    out.push(`//   export TEST_INVALID_TOKEN=<token-with-wrong-role>  # for wrong-role-403 scenario`)
  }
  out.push(``)
  out.push(`import { describe, it, expect, beforeAll, afterAll } from 'vitest'`)
  out.push(``)
  out.push(`const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'`)
  if (opts.auth === 'token') {
    out.push(`const TOKEN = process.env.TEST_TOKEN || ''`)
    out.push(`const INVALID_TOKEN = process.env.TEST_INVALID_TOKEN || 'bad-token'`)
  }
  out.push(`// FAKE_ID: valid-format but non-existent. Replace with a numeric string if your PK is Int/BigInt.`)
  out.push(`const FAKE_ID = 'nonexistent-id-00000000'`)
  out.push(``)
  out.push(`let createdId: string | null = null`)
  out.push(``)
  out.push(`describe('${model.name} — T-005 generated suite', () => {`)

  // beforeAll: create a record that subsequent tests can read / update / delete
  out.push(``)
  out.push(`  beforeAll(async () => {`)
  out.push(`    // Create a record once to share across read/update/delete tests.`)
  out.push(`    const res = await fetch(BASE_URL + '${opts.apiPath}', {`)
  out.push(`      method: 'POST',`)
  out.push(`      headers: { ${authHeaders} },`)
  out.push(`      body: JSON.stringify(${payload}),`)
  out.push(`    })`)
  out.push(`    if (res.ok) {`)
  out.push(`      const data = await res.json() as Record<string, unknown>`)
  out.push(`      createdId = (data.${idField.name} ?? data.id) as string | null`)
  out.push(`    }`)
  out.push(`  })`)

  // afterAll: cleanup
  out.push(``)
  out.push(`  afterAll(async () => {`)
  out.push(`    if (!createdId) return`)
  out.push(`    const res = await fetch(BASE_URL + '${opts.apiPath}/' + createdId, {`)
  out.push(`      method: 'DELETE',`)
  out.push(`      headers: { ${authHeaders} },`)
  out.push(`    })`)
  out.push(`    if (res.status !== 200 && res.status !== 204) {`)
  out.push(`      console.warn('T-005 teardown: DELETE returned', res.status, 'for', createdId)`)
  out.push(`    }`)
  out.push(`  })`)
  scenarios.push('cleanup-teardown')

  // ── Auth scenarios ────────────────────────────────────────────────────────

  if (opts.auth === 'token') {
    scenarios.push('unauth-401')
    out.push(``)
    out.push(`  it('returns 401 when Authorization header is missing', async () => {`)
    out.push(`    const res = await fetch(BASE_URL + '${opts.apiPath}', {`)
    out.push(`      method: 'POST',`)
    out.push(`      headers: { 'Content-Type': 'application/json' },`)
    out.push(`      body: JSON.stringify({}),`)
    out.push(`    })`)
    out.push(`    expect(res.status).toBe(401)`)
    out.push(`  })`)

    scenarios.push('wrong-role-403')
    out.push(``)
    out.push(`  it('returns 401 or 403 when token is invalid or has insufficient role', async () => {`)
    out.push(`    const res = await fetch(BASE_URL + '${opts.apiPath}', {`)
    out.push(`      method: 'POST',`)
    out.push(`      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + INVALID_TOKEN },`)
    out.push(`      body: JSON.stringify({}),`)
    out.push(`    })`)
    out.push(`    expect([401, 403]).toContain(res.status)`)
    out.push(`  })`)
  }

  // ── Validation scenarios ──────────────────────────────────────────────────

  if (required.length > 0) {
    scenarios.push('missing-required-400')
    out.push(``)
    out.push(`  it('returns 400 when required fields are missing', async () => {`)
    out.push(`    const res = await fetch(BASE_URL + '${opts.apiPath}', {`)
    out.push(`      method: 'POST',`)
    out.push(`      headers: { ${authHeaders} },`)
    out.push(`      body: JSON.stringify({}),`)
    out.push(`    })`)
    out.push(`    expect(res.status).toBe(400)`)
    out.push(`  })`)
  }

  if (stringFields.length > 0) {
    const targetField = required.find((f) => f.type === 'String') || stringFields[0]
    scenarios.push('string-too-long-400')
    out.push(``)
    out.push(`  it('returns 400 when a String field exceeds reasonable length', async () => {`)
    out.push(`    const res = await fetch(BASE_URL + '${opts.apiPath}', {`)
    out.push(`      method: 'POST',`)
    out.push(`      headers: { ${authHeaders} },`)
    out.push(`      body: JSON.stringify({ ...${payload}, ${targetField.name}: 'x'.repeat(10001) }),`)
    out.push(`    })`)
    out.push(`    // Expect 400 for validation or 413 for body-too-large; both are correct.`)
    out.push(`    expect([400, 413]).toContain(res.status)`)
    out.push(`  })`)
  }

  // ── List scenario ─────────────────────────────────────────────────────────

  scenarios.push('list-all-200')
  out.push(``)
  out.push(`  it('returns 200 and an array on GET (list)', async () => {`)
  out.push(`    const res = await fetch(BASE_URL + '${opts.apiPath}', {`)
  if (authHeadersNoContentType) {
    out.push(`      headers: { ${authHeadersNoContentType} },`)
  }
  out.push(`    })`)
  out.push(`    expect(res.status).toBe(200)`)
  out.push(`    const data = await res.json()`)
  out.push(`    // Accepts plain arrays OR paginated envelopes ({ data: [...], items: [...] }).`)
  out.push(`    // Customize for your API's actual list shape.`)
  out.push(`    expect(Array.isArray(data) || (typeof data === 'object' && data !== null)).toBe(true)`)
  out.push(`  })`)

  // ── CRUD scenarios ────────────────────────────────────────────────────────

  scenarios.push('create-201')
  out.push(``)
  out.push(`  it('returns 2xx and the created record on POST', async () => {`)
  out.push(`    const res = await fetch(BASE_URL + '${opts.apiPath}', {`)
  out.push(`      method: 'POST',`)
  out.push(`      headers: { ${authHeaders} },`)
  out.push(`      body: JSON.stringify(${payload}),`)
  out.push(`    })`)
  out.push(`    expect(res.status).toBeGreaterThanOrEqual(200)`)
  out.push(`    expect(res.status).toBeLessThan(300)`)
  out.push(`    const data = await res.json() as Record<string, unknown>`)
  out.push(`    expect(data.${idField.name} ?? data.id).toBeTruthy()`)
  out.push(`    // Clean up this extra record.`)
  out.push(`    const id = (data.${idField.name} ?? data.id) as string`)
  out.push(`    if (id && id !== createdId) {`)
  out.push(`      await fetch(BASE_URL + '${opts.apiPath}/' + id, {`)
  out.push(`        method: 'DELETE',`)
  out.push(`        headers: { ${authHeaders} },`)
  out.push(`      })`)
  out.push(`    }`)
  out.push(`  })`)

  scenarios.push('read-by-id-200')
  out.push(``)
  out.push(`  it('returns 200 and the record on GET by id (requires beforeAll create)', async () => {`)
  out.push(`    if (!createdId) return`)
  out.push(`    const res = await fetch(BASE_URL + '${opts.apiPath}/' + createdId, {`)
  if (authHeadersNoContentType) {
    out.push(`      headers: { ${authHeadersNoContentType} },`)
  }
  out.push(`    })`)
  out.push(`    expect(res.status).toBe(200)`)
  out.push(`    const data = await res.json() as Record<string, unknown>`)
  out.push(`    expect(data.${idField.name} ?? data.id).toBe(createdId)`)
  out.push(`  })`)

  scenarios.push('read-not-found-404')
  out.push(``)
  out.push(`  it('returns 404 on GET with nonexistent id', async () => {`)
  out.push(`    const res = await fetch(BASE_URL + '${opts.apiPath}/' + FAKE_ID, {`)
  if (authHeadersNoContentType) {
    out.push(`      headers: { ${authHeadersNoContentType} },`)
  }
  out.push(`    })`)
  out.push(`    expect(res.status).toBe(404)`)
  out.push(`  })`)

  scenarios.push('update-200')
  out.push(``)
  out.push(`  it('returns 2xx on PATCH with valid payload (requires beforeAll create)', async () => {`)
  out.push(`    if (!createdId) return`)
  if (required.length > 0) {
    const f = required[0]
    out.push(`    const res = await fetch(BASE_URL + '${opts.apiPath}/' + createdId, {`)
    out.push(`      method: 'PATCH',`)
    out.push(`      headers: { ${authHeaders} },`)
    out.push(`      body: JSON.stringify({ ${f.name}: ${sampleValueFor(f)} }),`)
    out.push(`    })`)
  } else {
    out.push(`    const res = await fetch(BASE_URL + '${opts.apiPath}/' + createdId, {`)
    out.push(`      method: 'PATCH',`)
    out.push(`      headers: { ${authHeaders} },`)
    out.push(`      body: JSON.stringify({}),`)
    out.push(`    })`)
  }
  out.push(`    expect(res.status).toBeGreaterThanOrEqual(200)`)
  out.push(`    expect(res.status).toBeLessThan(300)`)
  out.push(`  })`)

  scenarios.push('update-not-found-404')
  out.push(``)
  out.push(`  it('returns 404 on PATCH with nonexistent id', async () => {`)
  out.push(`    const res = await fetch(BASE_URL + '${opts.apiPath}/' + FAKE_ID, {`)
  out.push(`      method: 'PATCH',`)
  out.push(`      headers: { ${authHeaders} },`)
  out.push(`      body: JSON.stringify(${payload}),`)
  out.push(`    })`)
  out.push(`    expect(res.status).toBe(404)`)
  out.push(`  })`)

  scenarios.push('delete-204')
  out.push(``)
  out.push(`  it('returns 200 or 204 on DELETE (requires beforeAll create)', async () => {`)
  out.push(`    if (!createdId) return`)
  out.push(`    const res = await fetch(BASE_URL + '${opts.apiPath}/' + createdId, {`)
  out.push(`      method: 'DELETE',`)
  out.push(`      headers: { ${authHeaders} },`)
  out.push(`    })`)
  out.push(`    expect([200, 204]).toContain(res.status)`)
  out.push(`    createdId = null // prevent double-delete in afterAll`)
  out.push(`  })`)

  scenarios.push('delete-not-found-404')
  out.push(``)
  out.push(`  it('returns 404 on DELETE with nonexistent id', async () => {`)
  out.push(`    const res = await fetch(BASE_URL + '${opts.apiPath}/' + FAKE_ID, {`)
  out.push(`      method: 'DELETE',`)
  out.push(`      headers: { ${authHeaders} },`)
  out.push(`    })`)
  out.push(`    expect(res.status).toBe(404)`)
  out.push(`  })`)

  // ── Unique constraint ─────────────────────────────────────────────────────

  if (uniqueFields.length > 0) {
    const uf = uniqueFields[0]
    scenarios.push('unique-409')
    out.push(``)
    out.push(`  it('returns 409 when a unique-constraint field is duplicated', async () => {`)
    out.push(`    const uniqueValue = '${uf.name}-unique-' + Date.now()`)
    out.push(`    const base = { ...${payload}, ${uf.name}: uniqueValue }`)
    out.push(`    const first = await fetch(BASE_URL + '${opts.apiPath}', {`)
    out.push(`      method: 'POST',`)
    out.push(`      headers: { ${authHeaders} },`)
    out.push(`      body: JSON.stringify(base),`)
    out.push(`    })`)
    out.push(`    const firstJson = first.ok ? (await first.json() as Record<string, unknown>) : null`)
    out.push(`    const firstId = firstJson ? ((firstJson.${idField.name} ?? firstJson.id) as string | null) : null`)
    out.push(`    try {`)
    out.push(`      const second = await fetch(BASE_URL + '${opts.apiPath}', {`)
    out.push(`        method: 'POST',`)
    out.push(`        headers: { ${authHeaders} },`)
    out.push(`        body: JSON.stringify(base),`)
    out.push(`      })`)
    out.push(`      expect([409, 422]).toContain(second.status)`)
    out.push(`    } finally {`)
    out.push(`      if (firstId) {`)
    out.push(`        await fetch(BASE_URL + '${opts.apiPath}/' + firstId, {`)
    out.push(`          method: 'DELETE',`)
    out.push(`          headers: { ${authHeaders} },`)
    out.push(`        })`)
    out.push(`      }`)
    out.push(`    }`)
    out.push(`  })`)
  }

  out.push(`})`)
  out.push(``)

  return { file: out.join('\n'), scenarios }
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function generateFromPrisma(opts: GenerateOptions): GenerateResult {
  if (!fs.existsSync(opts.schemaPath)) {
    throw new Error(`schema.prisma not found at: ${opts.schemaPath}`)
  }
  const content = fs.readFileSync(opts.schemaPath, 'utf8')
  const models = parsePrismaSchema(content)
  const model = models.find((m) => m.name === opts.modelName)
  if (!model) {
    throw new Error(
      `Model "${opts.modelName}" not found in schema. Available: ${models.map((m) => m.name).join(', ')}`,
    )
  }

  // Default outDir: sibling to prisma/.  schemaPath is typically
  // `<project>/prisma/schema.prisma`, so one level up lands at the project root.
  const outDir =
    opts.outDir ||
    path.join(path.dirname(opts.schemaPath), '..', 'tests', 'generated', camelCase(model.name))
  const apiPath = opts.apiPath || `/api/${camelCase(pluralize(model.name))}`
  const auth = opts.auth || 'token'

  const { file: specContent, scenarios } = buildSpecFile(model, { apiPath, auth })
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, `${camelCase(model.name)}.generated.test.ts`)
  if (fs.existsSync(outFile) && !opts.overwrite) {
    return {
      model: model.name,
      filesWritten: [],
      scenariosGenerated: scenarios,
      skipped: `${outFile} already exists; pass --overwrite to replace`,
    }
  }
  fs.writeFileSync(outFile, specContent, 'utf8')
  return {
    model: model.name,
    filesWritten: [outFile],
    scenariosGenerated: scenarios,
  }
}
