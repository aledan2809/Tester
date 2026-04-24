/**
 * CLI Entry Point — @aledan007/tester
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
import {
  lessonsList,
  lessonsScan,
  lessonsDiagnose,
  lessonsStats,
  lessonsValidate,
  lessonsInstallHooks,
  lessonsImport,
  lessonsPromote,
  lessonsClassify,
} from './commands/lessons'
import { zombieScanCmd } from './commands/zombie-scan'
import { selfCheckCommand } from './commands/selfcheck'
import { coverageCommand } from './commands/coverage'
import { generateCommand } from './commands/generate'
import { untestedCommand } from './commands/untested'
import { snapshotCommand } from './commands/snapshot'
import { a11yCommand } from './commands/a11y'

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

// ─── lessons (T-000 Active Lessons Engine) ──────────────
const lessonsCmd = program
  .command('lessons')
  .description('T-000 Active Lessons Engine — structured detection/prevention/diagnosis corpus')

lessonsCmd
  .command('list')
  .description('List all active lessons in corpus')
  .option('--severity <level>', 'Filter by severity (info|low|medium|high|critical)')
  .option('--tags <csv>', 'Filter by tags (comma-separated, any-match)')
  .option('--dir <path>', 'Override lessons directory')
  .option('--json', 'Emit JSON', false)
  .action(lessonsList)

lessonsCmd
  .command('scan <path>')
  .description('Scan a file or directory for matches against the lesson corpus (exits 1 on any match)')
  .option('--dir <path>', 'Override lessons directory')
  .option('--json', 'Emit JSON', false)
  .option('--no-fail-on-match', 'Do not exit with code 1 when matches are found')
  .option('--no-record-stats', 'Do not record hit counts to .tester/lessons-stats.json')
  .option('--context <ctx>', 'Context tag for hit recording (default: cli-scan)')
  .action((target, opts) => lessonsScan(target, opts))

lessonsCmd
  .command('diagnose <log-file>')
  .description('Match a failure log against lesson diagnosis signatures — returns top-N remediation hints')
  .option('--dir <path>', 'Override lessons directory')
  .option('--top-n <n>', 'Return top N matches (default 3)', (v) => parseInt(v, 10), 3)
  .option('--json', 'Emit JSON', false)
  .action((logPath, opts) => lessonsDiagnose(logPath, opts))

lessonsCmd
  .command('stats')
  .description('Show per-lesson hit counts (populated by scan + diagnose)')
  .option('--dir <path>', 'Override lessons directory')
  .option('--json', 'Emit JSON', false)
  .action(lessonsStats)

lessonsCmd
  .command('validate')
  .description('Verify every active lesson has its regression_test (file check, or --run to spawn vitest)')
  .option('--dir <path>', 'Override lessons directory')
  .option('--repo-root <path>', 'Repository root for resolving regression_test paths')
  .option('--run', 'Actually spawn vitest on each regression test (Day-4 CI mode)', false)
  .option('--json', 'Emit JSON', false)
  .action(lessonsValidate)

lessonsCmd
  .command('promote')
  .description('Dry-run hit-count promotion/mute plan (hit>=N bumps severity; hit=0 for >Nmo mutes)')
  .option('--dir <path>', 'Override lessons directory')
  .option('--promote-threshold <n>', 'Hit count to trigger severity bump (default 5)', (v) => parseInt(v, 10))
  .option('--mute-months <n>', 'Months without hits to trigger mute (default 6)', (v) => parseInt(v, 10))
  .option('--json', 'Emit JSON', false)
  .action(lessonsPromote)

lessonsCmd
  .command('install-hooks')
  .description('Install a pre-commit hook that runs `tester lessons scan` (T-A2)')
  .option('--project <path>', 'Project root (default: cwd)')
  .option('--uninstall', 'Remove the tester-managed hook block', false)
  .option('--targets <csv>', 'Comma-separated scan targets (default: tests/,src/)')
  .action(lessonsInstallHooks)

lessonsCmd
  .command('import <from>')
  .description('Parse prose markdown (memory/*.md, lessons-learned.md) into YAML stubs; manual review required')
  .option('--out <dir>', 'Write stubs to this directory instead of stdout')
  .option('--json', 'Emit JSON (single object)', false)
  .action((from, opts) => lessonsImport(from, opts))

lessonsCmd
  .command('classify <log-file>')
  .description('T-004 — AI-backed failure classifier (PRODUCT_BUG/HARNESS_BUG/FLAKE/ENV_MISCONFIG) with sha256 signature dedup + cache')
  .option('--dir <path>', 'Override lessons directory')
  .option('--force-heuristic', 'Skip the AI path even if ANTHROPIC_API_KEY is set', false)
  .option('--json', 'Emit JSON', false)
  .action((logPath, opts) => lessonsClassify(logPath, opts))

// ─── zombie-scan (T-C6 preventive tooling for L-24) ─────
program
  .command('zombie-scan')
  .description('T-C6 — List Master pipelines at risk of zombie cleanup (L-24) — non-destructive')
  .option('--master-path <path>', 'Path to Master repo root (or direct path to pipelines.json)')
  .option('--threshold-min <n>', 'Idle threshold in minutes (default: 15 = watchdog warning)', (v) => parseInt(v, 10))
  .option('--json', 'Emit JSON', false)
  .action(zombieScanCmd)

// ─── selfcheck (T-001 harness self-test battery) ─────────
program
  .command('selfcheck')
  .description('T-001 — Run harness self-test battery (CSS validator + timing + corpus presence). Exit 0 pass, 1 warn, 2 fail')
  .option('--json', 'Emit JSON', false)
  .action(selfCheckCommand)

// ─── coverage (T-002 feature coverage matrix) ────────────
program
  .command('coverage')
  .description('T-002 — Feature coverage matrix. Inspect a single feature YAML or roll up a project')
  .option('--feature <path>', 'Path to a single coverage/*.yaml file')
  .option('--project <path>', 'Project root; loads all coverage/*.yaml files under it')
  .option('--fail-under <ratio>', 'Exit 1 if coverage ratio below this (0..1, e.g. 0.9)', (v) => parseFloat(v))
  .option('--json', 'Emit JSON', false)
  .action(coverageCommand)

// ─── generate (T-005 test generator, Prisma MVP) ─────────
program
  .command('generate')
  .description('T-005 — Generate test skeleton from a Prisma schema (OpenAPI + Zod TBD)')
  .option('--from-prisma <path>', 'Path to prisma/schema.prisma file')
  .option('--model <name>', 'Prisma model name to generate tests for')
  .option('--out <dir>', 'Output directory (default: <repo>/tests/generated/<model>/)')
  .option('--api-path <path>', 'HTTP API base path (default: /api/<plural-lowercase-model>)')
  .option('--auth <mode>', 'Auth mode: token | none (default: token)')
  .option('--overwrite', 'Overwrite existing generated file', false)
  .option('--json', 'Emit JSON', false)
  .action(generateCommand)

// ─── a11y (T-009 baseline + budget) ──────────────────────
program
  .command('a11y')
  .description('T-009 — A11y baseline store + budget enforcement (axe-core violations in / diff out)')
  .option('--project <path>', 'Project root (required)')
  .option('--from <path>', 'Scan JSON file path { "scans": [{route, violations[]}] }')
  .option('--baseline', 'Store current scan as baseline (coverage/a11y-baseline.json)', false)
  .option('--check', 'Diff current scan against baseline + enforce budget', false)
  .option('--no-budget', 'Skip budget check when --check is set (diff-only)')
  .option('--json', 'Emit JSON', false)
  .action(a11yCommand)

// ─── snapshot (T-008 visual baseline MVP) ────────────────
program
  .command('snapshot')
  .description('T-008 — Visual regression baseline storage + pixel-diff compare (local FS; S3 adapter TBD)')
  .option('--project <name>', 'Project name namespacing the baseline (required)')
  .option('--route <path>', 'Route identifier (URL or path; required for baseline/compare/approve)')
  .option('--png <path>', 'Path to a PNG file (required for baseline/compare/approve)')
  .option('--baseline-dir <path>', 'Override baseline directory (default: <cwd>/.tester/baselines)')
  .option('--baseline', 'Capture + store baseline for this route', false)
  .option('--compare', 'Compare --png against the stored baseline', false)
  .option('--approve', 'Accept the current --png as the new baseline (alias of --baseline)', false)
  .option('--list', 'List recorded routes for --project', false)
  .option('--max-diff <pct>', 'Max diff % before --compare fails (default 1.0)', (v) => parseFloat(v))
  .option('--capture-if-missing', 'On --compare, seed baseline if none exists (bootstrap)', false)
  .option('--json', 'Emit JSON', false)
  .action(snapshotCommand)

// ─── untested (T-006 session-awareness query) ────────────
program
  .command('untested')
  .description('T-006 — Rank untested items from coverage YAML + AUDIT_GAPS.md + DEVELOPMENT_STATUS.md TODO + Reports/*.json')
  .option('--project <path>', 'Project root directory')
  .option('--sources <csv>', 'Comma-separated sources (coverage,audit_gaps,dev_status,reports). Default: all.')
  .option('--json', 'Emit JSON', false)
  .option('--markdown', 'Emit Markdown table', false)
  .action(untestedCommand)

program.parse()
