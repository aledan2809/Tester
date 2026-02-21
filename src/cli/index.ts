/**
 * CLI Entry Point — @aledan/tester
 * Autonomous AI-powered web testing engine.
 */

import { Command } from 'commander'
import { discoverCommand } from './commands/discover'
import { runCommand } from './commands/run'

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
  .action(runCommand)

program.parse()
