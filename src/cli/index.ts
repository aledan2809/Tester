/**
 * CLI Entry Point — @aledan/tester
 * Autonomous AI-powered web testing engine.
 */

import { Command } from 'commander'
import { discoverCommand } from './commands/discover'
import { runCommand } from './commands/run'
import { loginCommand } from './commands/login'
import { reportCommand } from './commands/report'
import { auditCommand } from './commands/audit'
import { auditOnlyCommand } from './commands/audit-only'
import { journeyAuditCliAction } from './commands/journey-audit'

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
  .option('--password-env <var>', 'Read password from environment variable (safe for special chars)')
  .option('--login-url <url>', 'Login page URL')
  .option('--api-key <key>', 'Anthropic API key')
  .option('--mfa', 'Enable MFA prompt', false)
  .option('--mfa-secret <secret>', 'TOTP secret for auto MFA')
  .option('--session <path>', 'Load session from file')
  .option('--skip <types>', 'Skip test types (e.g., visual,performance)')
  .option('--only <types>', 'Only run these test types (e.g., functional,a11y)')
  .option('--accessibility', 'Enable accessibility testing', false)
  .option('--visual-regression', 'Enable visual regression testing', false)
  .option('--performance', 'Enable performance testing', false)
  .option('--plan <path>', 'Load test plan from JSON file (skips AI scenario generation)')
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

// ─── audit ──────────────────────────────────────────────
program
  .command('audit <url>')
  .description('Deep E2E audit: security, a11y, API, DB, load, cross-browser (via Master plugin system)')
  .option('--project <name>', 'Project name for credential lookup')
  .option('-o, --output <dir>', 'Output directory', './reports')
  .option('--plugins <ids>', 'Only run these plugins (comma-separated)')
  .option('--skip-plugins <ids>', 'Skip these plugins (comma-separated)')
  .option('--deep', 'Also run slow plugins (load-tester, email-tester)', false)
  .option('--no-auth', 'Skip auth-resolver plugin')
  .option('--json', 'Output raw JSON instead of markdown', false)
  .action(auditCommand)

// ─── audit-only ─────────────────────────────────────────
program
  .command('audit-only')
  .description('NO-TOUCH CRITIC: static code audit in read-only mode (ML2 Wave 2)')
  .option('-o, --output <dir>', 'Output directory', './Reports')
  .option('--date <date>', 'Audit date (YYYY-MM-DD)', new Date().toISOString().split('T')[0])
  .action(auditOnlyCommand)

// ─── journey-audit ──────────────────────────────────────
program
  .command('journey-audit')
  .description('User-journey audit with real browser: login + walk every nav link + screenshots')
  .option('--project <name>', 'Project name (reads packaged config by that name)')
  .option('--config <path>', 'Explicit path to a .journey-audit.json file')
  .option('--email <email>', 'Login email (overrides env var from config.credentials.emailEnv)')
  .option('--password <pw>', 'Login password (overrides env var from config.credentials.passwordEnv)')
  .option('--headed', 'Show the browser window', false)
  .option('-o, --output <dir>', 'Output directory root', './journey-audit-results')
  .action(journeyAuditCliAction)

program.parse()
