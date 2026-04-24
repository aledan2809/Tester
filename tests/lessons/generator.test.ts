// lessons:skip-all
/**
 * T-005 — Prisma test generator regression tests.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { generateFromPrisma, parsePrismaSchema, pluralize, camelCase } from '../../src/generator/prisma'

function writeSchema(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prisma-gen-'))
  const file = path.join(dir, 'prisma', 'schema.prisma')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content, 'utf8')
  return file
}

const MINI_SCHEMA = `
generator client {
  provider = "prisma-client-js"
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  createdAt DateTime @default(now())
  posts     Post[]
}

model Post {
  id        String   @id @default(cuid())
  title     String
  body      String?
  published Boolean  @default(false)
  authorId  String
  author    User     @relation(fields: [authorId], references: [id])
}
`

describe('Prisma parser', () => {
  it('extracts all models', () => {
    const models = parsePrismaSchema(MINI_SCHEMA)
    expect(models.map((m) => m.name).sort()).toEqual(['Post', 'User'])
  })

  it('identifies @id, @unique, required / optional / relation fields', () => {
    const models = parsePrismaSchema(MINI_SCHEMA)
    const user = models.find((m) => m.name === 'User')!
    const id = user.fields.find((f) => f.name === 'id')!
    const email = user.fields.find((f) => f.name === 'email')!
    const name = user.fields.find((f) => f.name === 'name')!

    expect(id.isId).toBe(true)
    expect(email.isUnique).toBe(true)
    expect(email.isRequired).toBe(true)
    expect(name.isRequired).toBe(true)

    const post = models.find((m) => m.name === 'Post')!
    const author = post.fields.find((f) => f.name === 'author')!
    const body = post.fields.find((f) => f.name === 'body')!
    expect(author.isRelation).toBe(true)
    expect(body.isRequired).toBe(false) // optional via ?
  })
})

describe('pluralize + camelCase helpers', () => {
  it('pluralizes standard nouns', () => {
    expect(pluralize('User')).toBe('Users')
    expect(pluralize('Activity')).toBe('Activities')
    expect(pluralize('Address')).toBe('Addresses')
  })

  it('camel-cases', () => {
    expect(camelCase('UserProfile')).toBe('userProfile')
  })
})

describe('generateFromPrisma — MVP output', () => {
  it('generates a spec file with 3 scenarios for User model', () => {
    const schema = writeSchema(MINI_SCHEMA)
    const projectRoot = path.dirname(path.dirname(schema)) // above prisma/
    const outDir = path.join(projectRoot, 'tests', 'generated', 'user')
    try {
      const result = generateFromPrisma({
        schemaPath: schema,
        modelName: 'User',
        outDir,
      })
      expect(result.model).toBe('User')
      expect(result.filesWritten).toHaveLength(1)
      expect(result.scenariosGenerated).toContain('unauth-401')
      expect(result.scenariosGenerated).toContain('missing-required-400')
      expect(result.scenariosGenerated).toContain('create-read-delete-happy-path')
      // Verify content
      const content = fs.readFileSync(result.filesWritten[0], 'utf8')
      expect(content).toContain('T-005 auto-generated')
      expect(content).toContain("describe('User — T-005 generated suite'")
      expect(content).toContain("fetch(BASE_URL + '/api/users'")
      expect(content).toContain('Authorization')
    } finally {
      fs.rmSync(path.dirname(schema), { recursive: true, force: true })
      // outDir lives under projectRoot which is rm-ed by the line above
    }
  })

  it('supports --auth none (no Authorization header)', () => {
    const schema = writeSchema(MINI_SCHEMA)
    try {
      const result = generateFromPrisma({
        schemaPath: schema,
        modelName: 'User',
        auth: 'none',
      })
      const content = fs.readFileSync(result.filesWritten[0], 'utf8')
      expect(content).not.toContain('Authorization')
      // Should NOT include unauth-401 scenario since there's no auth
      expect(result.scenariosGenerated).not.toContain('unauth-401')
    } finally {
      fs.rmSync(path.dirname(path.dirname(schema)), { recursive: true, force: true })
    }
  })

  it('throws on unknown model', () => {
    const schema = writeSchema(MINI_SCHEMA)
    try {
      expect(() => generateFromPrisma({ schemaPath: schema, modelName: 'Nonexistent' })).toThrow(/not found/)
    } finally {
      fs.rmSync(path.dirname(path.dirname(schema)), { recursive: true, force: true })
    }
  })

  it('skips overwrite unless --overwrite given', () => {
    const schema = writeSchema(MINI_SCHEMA)
    try {
      const first = generateFromPrisma({ schemaPath: schema, modelName: 'User' })
      expect(first.filesWritten).toHaveLength(1)
      const second = generateFromPrisma({ schemaPath: schema, modelName: 'User' })
      expect(second.filesWritten).toHaveLength(0)
      expect(second.skipped).toMatch(/already exists/)
      const third = generateFromPrisma({ schemaPath: schema, modelName: 'User', overwrite: true })
      expect(third.filesWritten).toHaveLength(1)
    } finally {
      fs.rmSync(path.dirname(path.dirname(schema)), { recursive: true, force: true })
    }
  })

  it('supports custom apiPath override', () => {
    const schema = writeSchema(MINI_SCHEMA)
    try {
      const r = generateFromPrisma({
        schemaPath: schema,
        modelName: 'User',
        apiPath: '/v2/custom/users',
      })
      const content = fs.readFileSync(r.filesWritten[0], 'utf8')
      expect(content).toContain("fetch(BASE_URL + '/v2/custom/users'")
    } finally {
      fs.rmSync(path.dirname(path.dirname(schema)), { recursive: true, force: true })
    }
  })
})
