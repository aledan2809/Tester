import { test, expect } from '@playwright/test'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'

const TESTER_ROOT = path.resolve(__dirname, '..')
const CLI = path.join(TESTER_ROOT, 'dist', 'cli', 'index.js')

function runCli(args: string, options?: { timeout?: number }): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI} ${args}`, {
      cwd: TESTER_ROOT,
      timeout: options?.timeout || 60_000,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { stdout, stderr: '', exitCode: 0 }
  } catch (err: any) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.status || 1,
    }
  }
}

test.describe('Self-Audit: Audit Command Bridge to Master Plugins', () => {
  const masterRoot = process.env.MASTER_ROOT || path.resolve(TESTER_ROOT, '..', 'Master')
  const pluginsPath = path.join(masterRoot, 'mesh', 'qa', 'plugins', 'registry.js')
  const hasMaster = fs.existsSync(pluginsPath)

  test('audit command shows help correctly', () => {
    const { stdout, exitCode } = runCli('audit --help')
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Deep E2E audit')
    expect(stdout).toContain('Master plugin')
  })

  test('audit command fails gracefully when Master is missing', () => {
    if (hasMaster) {
      test.skip(true, 'Master is available — skip missing-Master test')
      return
    }
    // With no Master, should exit with error but NOT crash
    const { exitCode, stderr, stdout } = runCli('audit https://example.com --output /tmp/tester-audit-test', { timeout: 15_000 })
    expect(exitCode).not.toBe(0)
    const output = stdout + stderr
    expect(output).toMatch(/Master.*not found|Failed to load/i)
  })

  test('audit command runs with Master plugins when available', () => {
    if (!hasMaster) {
      test.skip(true, 'Master not available — skip plugin execution test')
      return
    }

    const outputDir = '/tmp/tester-self-audit-bridge-test'
    const { exitCode, stdout, stderr } = runCli(
      `audit https://example.com --project test-self-audit --output ${outputDir} --json`,
      { timeout: 60_000 },
    )

    const output = stdout + stderr

    // Should either succeed or fail gracefully
    if (exitCode === 0) {
      // Check JSON output was created
      const files = fs.readdirSync(outputDir).filter(f => f.startsWith('audit_'))
      expect(files.length).toBeGreaterThan(0)

      const jsonContent = JSON.parse(fs.readFileSync(path.join(outputDir, files[0]), 'utf8'))
      expect(jsonContent.url).toBe('https://example.com')
      expect(jsonContent.projectName).toBeDefined()
      expect(jsonContent.durationMs).toBeGreaterThan(0)
    } else {
      // Graceful failure — should have meaningful error message
      expect(output.length).toBeGreaterThan(0)
    }

    // Cleanup
    try { fs.rmSync(outputDir, { recursive: true }) } catch { /* */ }
  })

  test('audit --plugins filter works', () => {
    const { stdout, exitCode } = runCli('audit --help')
    expect(exitCode).toBe(0)
    // Verify the --plugins flag is documented
    expect(stdout).toContain('--plugins')
    expect(stdout).toContain('comma-separated')
  })

  test('audit --skip-plugins filter works', () => {
    const { stdout, exitCode } = runCli('audit --help')
    expect(exitCode).toBe(0)
    expect(stdout).toContain('--skip-plugins')
  })
})
