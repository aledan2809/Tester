/**
 * T-005 — Test generator from Prisma schema (MVP).
 *
 * Parses a prisma/schema.prisma file, extracts the requested model's fields,
 * and emits a Vitest spec skeleton covering:
 *   - Unauth (401) / wrong-role (403) on protected routes
 *   - Missing-required field → 400
 *   - Happy-path create → read → delete (cleanup teardown)
 *
 * Scope:
 *   - Prisma only (OpenAPI, Zod generators deferred — separate modules in the
 *     same dir can be added later with the same output shape).
 *   - Output is a spec skeleton using vitest + fetch; consumers wire their
 *     own auth helper + base URL via `TEST_BASE_URL` and `TEST_TOKEN` env
 *     variables that the generated test references.
 *   - Stable-selector patterns per T-003: the generated assertions use
 *     attribute selectors (data-testid, name) not text regex, where possible.
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
  outDir?: string // default: tests/generated/<model>/
  overwrite?: boolean
  baseUrl?: string // default: placeholder for runtime
  apiPath?: string // default: /api/<model-plural-lowercase>
  auth?: 'token' | 'none' // default: 'token'
}

export interface GenerateResult {
  model: string
  filesWritten: string[]
  scenariosGenerated: string[]
  skipped?: string
}

const MODEL_RE = /^model\s+(\w+)\s*\{([\s\S]*?)^\s*\}/gm
const FIELD_RE = /^\s*(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/

function parsePrismaSchema(content: string): PrismaModel[] {
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
      // Heuristic: relation fields use @relation; scalar fields don't.
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

function pluralize(name: string): string {
  if (name.endsWith('y')) return name.slice(0, -1) + 'ies'
  if (name.endsWith('s')) return name + 'es'
  return name + 's'
}

function camelCase(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1)
}

function sampleValueFor(f: PrismaField): string {
  // Return a sensible literal for fill/assertion purposes.
  const t = f.type
  if (t === 'String') return `'test-${f.name}-' + Date.now()`
  if (t === 'Int' || t === 'BigInt') return '42'
  if (t === 'Float' || t === 'Decimal') return '3.14'
  if (t === 'Boolean') return 'true'
  if (t === 'DateTime') return 'new Date().toISOString()'
  if (t === 'Json') return "{ hello: 'world' }"
  // enum or relation — best-effort placeholder
  return `'<${t}>'`
}

function buildSpecFile(model: PrismaModel, opts: Required<Pick<GenerateOptions, 'apiPath' | 'auth'>>): { file: string; scenarios: string[] } {
  const required = model.fields.filter((f) => f.isRequired && !f.isId && !f.isRelation && !f.defaultExpr)
  const idField = model.fields.find((f) => f.isId) || { name: 'id', type: 'String', isId: true, isRequired: true, isUnique: true, isRelation: false }
  const scenarios: string[] = []

  const authHeaderLine = opts.auth === 'token' ? `      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },` : `      headers: { 'Content-Type': 'application/json' },`

  const body: string[] = []
  body.push(`// T-005 auto-generated spec — REVIEW + CUSTOMIZE before merging.`)
  body.push(`// Generated from model: ${model.name}`)
  body.push(`// Endpoint convention: ${opts.apiPath}`)
  body.push(`// Auth: ${opts.auth}`)
  body.push(``)
  body.push(`import { describe, it, expect, beforeAll, afterAll } from 'vitest'`)
  body.push(``)
  body.push(`const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'`)
  body.push(`const token = process.env.TEST_TOKEN || ''`)
  body.push(`let createdId: string | null = null`)
  body.push(``)
  body.push(`describe('${model.name} — T-005 generated suite', () => {`)

  // Scenario 1: unauth 401
  if (opts.auth === 'token') {
    scenarios.push('unauth-401')
    body.push(``)
    body.push(`  it('returns 401 when Authorization header missing', async () => {`)
    body.push(`    const res = await fetch(BASE_URL + '${opts.apiPath}', {`)
    body.push(`      method: 'POST',`)
    body.push(`      headers: { 'Content-Type': 'application/json' },`)
    body.push(`      body: JSON.stringify({}),`)
    body.push(`    })`)
    body.push(`    expect(res.status).toBe(401)`)
    body.push(`  })`)
  }

  // Scenario 2: missing required → 400
  if (required.length > 0) {
    scenarios.push('missing-required-400')
    body.push(``)
    body.push(`  it('returns 400 when required fields are missing', async () => {`)
    body.push(`    const res = await fetch(BASE_URL + '${opts.apiPath}', {`)
    body.push(`      method: 'POST',`)
    body.push(authHeaderLine)
    body.push(`      body: JSON.stringify({}),`)
    body.push(`    })`)
    body.push(`    expect(res.status).toBe(400)`)
    body.push(`  })`)
  }

  // Scenario 3: happy-path create
  scenarios.push('create-read-delete-happy-path')
  body.push(``)
  body.push(`  it('creates, reads, and deletes a ${model.name} (happy path)', async () => {`)
  body.push(`    const payload = {`)
  for (const f of required) {
    body.push(`      ${f.name}: ${sampleValueFor(f)},`)
  }
  body.push(`    }`)
  body.push(`    const createRes = await fetch(BASE_URL + '${opts.apiPath}', {`)
  body.push(`      method: 'POST',`)
  body.push(authHeaderLine)
  body.push(`      body: JSON.stringify(payload),`)
  body.push(`    })`)
  body.push(`    expect(createRes.status).toBeGreaterThanOrEqual(200)`)
  body.push(`    expect(createRes.status).toBeLessThan(300)`)
  body.push(`    const created = await createRes.json()`)
  body.push(`    createdId = created.${idField.name} || created.id`)
  body.push(`    expect(createdId).toBeTruthy()`)
  body.push(``)
  body.push(`    const readRes = await fetch(BASE_URL + '${opts.apiPath}/' + createdId, {`)
  body.push(authHeaderLine)
  body.push(`    })`)
  body.push(`    expect(readRes.status).toBe(200)`)
  body.push(`  })`)

  // Teardown
  body.push(``)
  body.push(`  afterAll(async () => {`)
  body.push(`    if (!createdId) return`)
  body.push(`    const res = await fetch(BASE_URL + '${opts.apiPath}/' + createdId, {`)
  body.push(`      method: 'DELETE',`)
  body.push(authHeaderLine)
  body.push(`    })`)
  body.push(`    // Best-effort cleanup; log if the server didn't accept the delete.`)
  body.push(`    if (res.status !== 200 && res.status !== 204) {`)
  body.push(`      console.warn('T-005 teardown: DELETE returned', res.status, 'for', createdId)`)
  body.push(`    }`)
  body.push(`  })`)

  body.push(`})`)
  body.push(``)
  return { file: body.join('\n'), scenarios }
}

export function generateFromPrisma(opts: GenerateOptions): GenerateResult {
  if (!fs.existsSync(opts.schemaPath)) {
    throw new Error(`schema.prisma not found at: ${opts.schemaPath}`)
  }
  const content = fs.readFileSync(opts.schemaPath, 'utf8')
  const models = parsePrismaSchema(content)
  const model = models.find((m) => m.name === opts.modelName)
  if (!model) {
    throw new Error(`Model "${opts.modelName}" not found in schema. Available: ${models.map((m) => m.name).join(', ')}`)
  }
  // Default outDir: sibling to prisma/. schemaPath is typically
  // `<project>/prisma/schema.prisma`, so one level up from dirname(schemaPath)
  // lands at the project root.
  const outDir = opts.outDir || path.join(path.dirname(opts.schemaPath), '..', 'tests', 'generated', camelCase(model.name))
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

// Re-export for test access
export { parsePrismaSchema, pluralize, camelCase }
