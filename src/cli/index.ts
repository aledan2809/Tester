/**
 * CLI Entry Point — @aledan/tester
 * Autonomous AI-powered web testing engine.
 */

import { Command } from 'commander'
import { discoverCommand } from './commands/discover'
import { runCommand } from './commands/run'
import { loginCommand } from './commands/login'
import { reportCommand } from './commands/report'

const program = new Command()

program
  .name('tester')
  .description('AI-powered autonomous web testing engine')
  .version('0.1.0')

// ─── discover ────────────────────────────────────────────
program
  .command('discover <url>')
  .description('Crawl a website and discover all pages, forms, and interactive elements')
  .option('--max-pages <n>', 'Maximum pages to crawl', (v) => parseInt(v, 10), 50)
  .option('--max-depth <n>', 'Maximum crawl depth', (v) => parseInt(v, 10), 3)
  .option('--timeout <ms>', 'Crawl timeout in ms', (v) => parseInt(v, 10), 120_000)
  .option('--no-headless', 'Show browser window')
  .option('-o, --output <dir>', 'Output directory', './reports')
  .option('--json', 'Output raw JSON', false)
  .action(discoverCommand)

// ─── run ─────────────────────────────────────────────────
program
  .command('run <url>')
  .description('Full autonomous test run: discover, generate scenarios, execute, report')
  .option('--max-pages <n>', 'Maximum pages to crawl', (v) => parseInt(v, 10), 50)
  .option('--max-depth <n>', 'Maximum crawl depth', (v) => parseInt(v, 10), 3)
  .option('--timeout <ms>', 'Crawl timeout in ms', (v) => parseInt(v, 10), 120_000)
  .option('--no-headless', 'Show browser window')
  .option('-o, --output <dir>', 'Output directory', './reports')
  .option('-u, --username <user>', 'Login username')
  .option('-p, --password <pass>', 'Login password')
  .option('--login-url <url>', 'Login page URL')
  .option('--api-key <key>', 'Anthropic API key')
  .option('--mfa', 'Enable MFA prompt', false)
  .option('--mfa-secret <secret>', 'TOTP secret for auto MFA')
  .option('--session <path>', 'Load session from file')
  .option('--skip <types>', 'Skip test types (e.g., visual,performance)')
  .option('--only <types>', 'Only run these test types (e.g., functional,a11y)')
  .action(runCommand)

// ─── login ───────────────────────────────────────────────
program
  .command('login <url>')
  .description('Login to a website and optionally save the session')
  .option('-u, --username <user>', 'Username', '')
  .option('-p, --password <pass>', 'Password', '')
  .option('--no-headless', 'Show browser window')
  .option('--save-session <path>', 'Save session cookies to file')
  .option('--mfa', 'Enable MFA prompt', false)
  .option('--mfa-secret <secret>', 'TOTP secret for auto MFA')
  .action(loginCommand)

// ─── report ──────────────────────────────────────────────
program
  .command('report <json-path>')
  .description('Regenerate HTML report from existing JSON results')
  .option('-o, --output <path>', 'Output HTML path (default: same dir as JSON)')
  .option('--title <title>', 'Report title')
  .option('--no-screenshots', 'Exclude screenshots from report')
  .action(reportCommand)

program.parse()
