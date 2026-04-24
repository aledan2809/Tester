/**
 * T-005 — `tester generate` CLI handler (Prisma MVP).
 */

import * as path from 'node:path'
import * as fs from 'node:fs'
import { generateFromPrisma } from '../../generator/prisma'

export interface GenerateCliOptions {
  fromPrisma?: string
  model?: string
  out?: string
  apiPath?: string
  auth?: string
  overwrite?: boolean
  json?: boolean
}

export async function generateCommand(opts: GenerateCliOptions): Promise<void> {
  if (!opts.fromPrisma) {
    process.stderr.write(`[generate] ERROR: --from-prisma <path-to-schema.prisma> is required (OpenAPI + Zod generators TBD)\n`)
    process.exit(2)
  }
  if (!opts.model) {
    process.stderr.write(`[generate] ERROR: --model <ModelName> is required\n`)
    process.exit(2)
  }
  const schemaPath = path.resolve(opts.fromPrisma)
  if (!fs.existsSync(schemaPath)) {
    process.stderr.write(`[generate] ERROR: schema.prisma not found: ${schemaPath}\n`)
    process.exit(2)
  }
  if (opts.auth && !['token', 'none'].includes(opts.auth)) {
    process.stderr.write(`[generate] ERROR: --auth must be token|none, got: ${opts.auth}\n`)
    process.exit(2)
  }

  try {
    const result = generateFromPrisma({
      schemaPath,
      modelName: opts.model,
      outDir: opts.out,
      apiPath: opts.apiPath,
      auth: (opts.auth as 'token' | 'none') || 'token',
      overwrite: opts.overwrite,
    })

    if (opts.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      return
    }

    if (result.skipped) {
      process.stdout.write(`[generate] Skipped: ${result.skipped}\n`)
      process.exit(1)
    }

    process.stdout.write(`Generated ${result.filesWritten.length} file(s) for model "${result.model}":\n`)
    for (const f of result.filesWritten) process.stdout.write(`  → ${f}\n`)
    process.stdout.write(`\nScenarios covered (${result.scenariosGenerated.length}):\n`)
    for (const s of result.scenariosGenerated) process.stdout.write(`  • ${s}\n`)
    process.stdout.write(`\nNext steps:\n`)
    process.stdout.write(`  1. Review the generated test file and customize payload / assertions as needed\n`)
    process.stdout.write(`  2. Set TEST_BASE_URL + TEST_TOKEN env vars\n`)
    process.stdout.write(`  3. Run \`npx vitest run <path>\` to execute the generated suite\n`)
  } catch (e) {
    process.stderr.write(`[generate] ERROR: ${(e as Error).message}\n`)
    process.exit(2)
  }
}
