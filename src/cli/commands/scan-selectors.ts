/**
 * T-003 Half B — `tester scan-selectors` CLI handler.
 *
 * Walks target project JSX/TSX source and outputs SELECTOR_GAPS.md.
 *
 * Exit codes:
 *   0 — no gaps found
 *   1 — gaps found
 *   2 — directory not found
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { scanSourceDir, formatSelectorGapsMd } from '../../linter/source-scanner'

export interface ScanSelectorsOptions {
  json?: boolean
  out?: string
}

export async function scanSelectorsCommand(
  dir: string,
  opts: ScanSelectorsOptions = {},
): Promise<void> {
  const resolved = path.resolve(dir)
  if (!fs.existsSync(resolved)) {
    process.stderr.write(`[scan-selectors] ERROR: directory not found: ${resolved}\n`)
    process.exit(2)
  }

  const result = scanSourceDir(resolved)

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  } else {
    const md = formatSelectorGapsMd(result, resolved)
    const outPath = opts.out ? path.resolve(opts.out) : path.resolve('SELECTOR_GAPS.md')
    fs.writeFileSync(outPath, md, 'utf8')
    process.stdout.write(`[scan-selectors] ${result.gaps.length} gap(s) in ${result.filesWithGaps}/${result.filesScanned} file(s) → ${outPath}\n`)
  }

  process.exit(result.gaps.length > 0 ? 1 : 0)
}
