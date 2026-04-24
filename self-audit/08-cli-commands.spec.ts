import { test, expect } from '@playwright/test'
import { execSync } from 'child_process'
import path from 'path'

const TESTER_ROOT = path.resolve(__dirname, '..')
const CLI = path.join(TESTER_ROOT, 'dist', 'cli', 'index.js')

function runCli(args: string, options?: { timeout?: number }): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI} ${args}`, {
      cwd: TESTER_ROOT,
      timeout: options?.timeout || 30_000,
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

test.describe('Self-Audit: CLI Commands', () => {
  test('tester --version outputs version', () => {
    const { stdout, exitCode } = runCli('--version')
    expect(exitCode).toBe(0)
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/)
  })

  test('tester --help lists all commands', () => {
    const { stdout, exitCode } = runCli('--help')
    expect(exitCode).toBe(0)
    expect(stdout).toContain('discover')
    expect(stdout).toContain('run')
    expect(stdout).toContain('login')
    expect(stdout).toContain('report')
    expect(stdout).toContain('audit')
  })

  test('tester discover --help shows options', () => {
    const { stdout, exitCode } = runCli('discover --help')
    expect(exitCode).toBe(0)
    expect(stdout).toContain('--max-pages')
    expect(stdout).toContain('--max-depth')
    expect(stdout).toContain('--timeout')
    expect(stdout).toContain('--output')
  })

  test('tester run --help shows options', () => {
    const { stdout, exitCode } = runCli('run --help')
    expect(exitCode).toBe(0)
    expect(stdout).toContain('--username')
    expect(stdout).toContain('--password')
    expect(stdout).toContain('--plan')
    expect(stdout).toContain('--accessibility')
    expect(stdout).toContain('--visual-regression')
    expect(stdout).toContain('--performance')
  })

  test('tester login --help shows options', () => {
    const { stdout, exitCode } = runCli('login --help')
    expect(exitCode).toBe(0)
    expect(stdout).toContain('--username')
    expect(stdout).toContain('--password')
    expect(stdout).toContain('--save-session')
    expect(stdout).toContain('--mfa')
  })

  test('tester report --help shows options', () => {
    const { stdout, exitCode } = runCli('report --help')
    expect(exitCode).toBe(0)
    expect(stdout).toContain('--output')
    expect(stdout).toContain('--title')
  })

  test('tester audit --help shows options', () => {
    const { stdout, exitCode } = runCli('audit --help')
    expect(exitCode).toBe(0)
    expect(stdout).toContain('--project')
    expect(stdout).toContain('--plugins')
    expect(stdout).toContain('--skip-plugins')
    expect(stdout).toContain('--deep')
    expect(stdout).toContain('--json')
  })

  test('tester discover with no url exits with error', () => {
    const { exitCode, stderr } = runCli('discover')
    expect(exitCode).not.toBe(0)
    expect(stderr).toBeTruthy()
  })

  test('tester run with no url exits with error', () => {
    const { exitCode, stderr } = runCli('run')
    expect(exitCode).not.toBe(0)
    expect(stderr).toBeTruthy()
  })

  test('tester report with no path exits with error', () => {
    const { exitCode, stderr } = runCli('report')
    expect(exitCode).not.toBe(0)
    expect(stderr).toBeTruthy()
  })

  test('tester audit with no url exits with error', () => {
    const { exitCode, stderr } = runCli('audit')
    expect(exitCode).not.toBe(0)
    expect(stderr).toBeTruthy()
  })

  test('dist/cli/index.js exists (build output)', () => {
    const fs = require('fs')
    expect(fs.existsSync(CLI)).toBe(true)
  })
})
