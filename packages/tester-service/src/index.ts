/**
 * @aledan007/tester-service — HTTP server shipped as a separate npm package.
 *
 * T-D2 monorepo split: the server code lives in `@aledan007/tester`'s
 * `src/server/` for backwards compatibility with consumers who npm-installed
 * the combined package. This new sibling package is a thin re-export so the
 * HTTP server can be published, versioned, and deployed independently from
 * the library.
 *
 * CLI entry: `tester-service` binary imports this module which bootstraps
 * the Express app that ships inside `@aledan007/tester` (src/server/index.ts
 * has a side-effect `app.listen(...)` when run as main module).
 */

import * as path from 'path'
import { createRequire } from 'module'

// We can't `import from '@aledan007/tester/server'` because the combined
// package's exports map doesn't surface server internals. Fall back to the
// sibling path — works in both workspace mode (node_modules symlink) and
// published-consumer mode (package dirname lookup).
const _require = createRequire(import.meta.url)

function resolveServerEntry(): string {
  try {
    // Main package's installed location.
    const pkgJsonPath = _require.resolve('@aledan007/tester/package.json')
    return path.join(path.dirname(pkgJsonPath), 'dist', 'server', 'index.js')
  } catch {
    // Workspace sibling fallback.
    return path.resolve(__dirname, '..', '..', '..', 'dist', 'server', 'index.js')
  }
}

export async function startTesterService(): Promise<void> {
  const entry = resolveServerEntry()
  // Dynamic import — the server module runs its own app.listen on import.
  await import(`file://${entry}`)
}

// CLI — when invoked directly, start the service.
// tsup's `format: esm/cjs` doesn't set require.main; we check argv instead.
if (
  process.argv[1] &&
  (process.argv[1].endsWith('tester-service') ||
    process.argv[1].endsWith('dist/index.js') ||
    process.argv[1].endsWith('dist/index.mjs'))
) {
  startTesterService().catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[tester-service] failed to start:', e)
    process.exit(1)
  })
}
