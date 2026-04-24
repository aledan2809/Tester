/**
 * T-A1 — `tester init <feature>` CLI handler.
 */

import { initFeature } from '../../init/scaffolder'

export interface InitCliOptions {
  project?: string
  owner?: string
  overwrite?: boolean
  withLogin?: boolean
  json?: boolean
}

export async function initCommand(feature: string, opts: InitCliOptions): Promise<void> {
  if (!feature || typeof feature !== 'string') {
    process.stderr.write(`[init] ERROR: feature slug is required (e.g. \`tester init four-way-match\`)\n`)
    process.exit(2)
  }

  const projectRoot = opts.project || process.cwd()
  try {
    const result = initFeature({
      feature,
      projectRoot,
      owner: opts.owner,
      overwrite: !!opts.overwrite,
      withLogin: opts.withLogin !== false, // default on
    })

    if (opts.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      return
    }

    process.stdout.write(`Scaffolded "${result.feature}" in ${result.projectRoot}:\n`)
    for (const f of result.filesWritten) process.stdout.write(`  ✓ ${f}\n`)
    if (result.filesSkipped.length > 0) {
      process.stdout.write(`\nSkipped (already exists — pass --overwrite to replace):\n`)
      for (const f of result.filesSkipped) process.stdout.write(`  · ${f}\n`)
    }
    process.stdout.write(`\nIndex updated: ${result.featuresIndex}\n`)
    process.stdout.write(`\nNext steps:\n`)
    process.stdout.write(`  1. Edit coverage/${result.feature}.yaml — flesh out scenarios`)
    process.stdout.write(`\n  2. Wire tests/${result.feature}/index.spec.ts to real endpoints`)
    process.stdout.write(`\n  3. Run: npx vitest run tests/${result.feature}\n`)
    process.stdout.write(`  4. Check progress: npx @aledan007/tester untested --project .\n`)
  } catch (e) {
    process.stderr.write(`[init] ERROR: ${(e as Error).message}\n`)
    process.exit(2)
  }
}
