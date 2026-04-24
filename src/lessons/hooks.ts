/**
 * T-000 Day-3 — Git hook installer (T-A2).
 *
 * `tester lessons install-hooks <project>` writes a pre-commit hook that runs
 * `tester lessons scan tests/` (or configurable path) against the active
 * corpus. Commit fails if any block_commit_if_unfixed lesson matches.
 *
 * Also supports `--uninstall` to remove the hook.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

export interface HookInstallResult {
  installed: boolean
  path: string
  backed_up?: string
  message: string
}

const HOOK_MARKER_START = '# >>> @aledan007/tester lessons pre-commit >>>'
const HOOK_MARKER_END = '# <<< @aledan007/tester lessons pre-commit <<<'

function hookScript(scanTargets: string[]): string {
  const targets = scanTargets.map((t) => `"${t}"`).join(' ')
  return `#!/usr/bin/env bash
${HOOK_MARKER_START}
# Auto-installed by \`tester lessons install-hooks\`. Do not edit between markers.
# To temporarily disable: commit with --no-verify. To remove: tester lessons install-hooks --uninstall.

set -e
scan_targets=(${targets})
for t in "\${scan_targets[@]}"; do
  if [ -e "$t" ]; then
    npx @aledan007/tester lessons scan "$t" --context pre-commit || {
      echo ""
      echo "❌ pre-commit blocked: lesson matches found in $t"
      echo "   Review above, fix or add // lessons:skip <L-XX> directive, and retry."
      echo "   Bypass with --no-verify (use sparingly)."
      exit 1
    }
  fi
done
${HOOK_MARKER_END}
`
}

export function installHooks(
  projectRoot: string,
  scanTargets = ['tests/', 'src/'],
): HookInstallResult {
  const gitDir = path.join(projectRoot, '.git')
  if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) {
    return { installed: false, path: '', message: `not a git repo: ${projectRoot}` }
  }
  const hookDir = path.join(gitDir, 'hooks')
  const hookFile = path.join(hookDir, 'pre-commit')
  fs.mkdirSync(hookDir, { recursive: true })

  const newHook = hookScript(scanTargets)

  if (fs.existsSync(hookFile)) {
    const existing = fs.readFileSync(hookFile, 'utf8')
    if (existing.includes(HOOK_MARKER_START)) {
      // Replace managed block only
      const replaced = existing.replace(
        new RegExp(
          `${HOOK_MARKER_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${HOOK_MARKER_END.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&',
          )}`,
        ),
        newHook.trim(),
      )
      fs.writeFileSync(hookFile, replaced, 'utf8')
      try {
        fs.chmodSync(hookFile, 0o755)
      } catch {
        // best-effort
      }
      return {
        installed: true,
        path: hookFile,
        message: 'updated existing tester-managed block in pre-commit hook',
      }
    }
    // Back up the existing hook before overwriting
    const backup = `${hookFile}.tester-bak-${Date.now()}`
    fs.copyFileSync(hookFile, backup)
    const merged = `${existing.trimEnd()}\n\n${newHook}`
    fs.writeFileSync(hookFile, merged, 'utf8')
    try {
      fs.chmodSync(hookFile, 0o755)
    } catch {
      // best-effort
    }
    return {
      installed: true,
      path: hookFile,
      backed_up: backup,
      message: `appended tester block to existing pre-commit hook (backup: ${path.basename(backup)})`,
    }
  }

  fs.writeFileSync(hookFile, newHook, 'utf8')
  try {
    fs.chmodSync(hookFile, 0o755)
  } catch {
    // best-effort
  }
  return {
    installed: true,
    path: hookFile,
    message: `created new pre-commit hook at ${path.relative(projectRoot, hookFile)}`,
  }
}

export function uninstallHooks(projectRoot: string): HookInstallResult {
  const hookFile = path.join(projectRoot, '.git', 'hooks', 'pre-commit')
  if (!fs.existsSync(hookFile)) {
    return { installed: false, path: hookFile, message: 'no pre-commit hook present — nothing to uninstall' }
  }
  const existing = fs.readFileSync(hookFile, 'utf8')
  if (!existing.includes(HOOK_MARKER_START)) {
    return {
      installed: false,
      path: hookFile,
      message: 'pre-commit hook has no tester-managed block — nothing to remove',
    }
  }
  const replaced = existing.replace(
    new RegExp(
      `\\n?${HOOK_MARKER_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${HOOK_MARKER_END.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&',
      )}\\n?`,
    ),
    '',
  )
  const stripped = replaced.trim()
  if (!stripped || stripped === '#!/usr/bin/env bash') {
    // Nothing else in the hook — delete the file entirely
    fs.unlinkSync(hookFile)
    return { installed: false, path: hookFile, message: 'removed pre-commit hook (was only tester block)' }
  }
  fs.writeFileSync(hookFile, stripped + '\n', 'utf8')
  return { installed: false, path: hookFile, message: 'removed tester-managed block from pre-commit hook' }
}
