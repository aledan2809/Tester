/**
 * T-005 — Test generator public API.
 * MVP ships Prisma; OpenAPI + Zod generators can be added later in the same dir.
 */
export type { PrismaField, PrismaModel, GenerateOptions, GenerateResult } from './prisma'
export { generateFromPrisma, parsePrismaSchema, pluralize, camelCase } from './prisma'
