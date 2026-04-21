# @aledan007/tester

AI-powered autonomous web testing engine. Discover, test, and report on any website using Claude AI + Puppeteer.

## Features

- **BFS Crawler** — Discovers up to 50 pages with depth-based traversal
- **AI Scenario Generation** — Claude generates intelligent test scenarios from discovered elements
- **Multi-platform Auth** — Auto-login for WordPress, Shopify, Wix + MFA/TOTP support
- **14 DOM Assertions** — element existence, visibility, text, attributes, count, etc.
- **Network Assertions** — response codes, no 4xx/5xx errors, network error detection
- **Visual Regression** — Pixel-level comparison via `pixelmatch`
- **Accessibility** — Full `axe-core` audit
- **Performance** — FCP, LCP, TTI metrics
- **HTML + JSON Reports** — Dark-themed interactive dashboard + CI-friendly JSON
- **HTTP Server** — REST API for integration with other services (WebsiteGuru, CI/CD)
- **CLI** — Run tests directly from the terminal
- **Journey Audit** — Real-browser walk of authenticated user flow: login + click every nav link + screenshots + status classification (OK / GATED / EMPTY / HAS_ERRORS / CRASHED). Config-driven via a JSON file per project. Catches UX regressions that API-shape and unit tests miss (hidden pages, dead links, onboarding walls)

## Installation

```bash
npm install @aledan007/tester
# or use directly via CLI
npx @aledan007/tester run https://example.com
```

## Quick Start

### Library

```typescript
import { AITester } from '@aledan007/tester'

const tester = new AITester({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  maxPages: 20,
  accessibility: true,
  performance: true,
})

await tester.launch()
const results = await tester.run('https://example.com')
console.log(`Score: ${results.summary.overallScore}/100`)
await tester.close()
```

### CLI

```bash
# Discover pages only
tester discover https://example.com

# Full test run
tester run https://example.com --api-key sk-ant-...

# Run with authentication
tester run https://example.com \
  --username admin@example.com \
  --password secret123 \
  --login-url https://example.com/login

# Run with MFA (TOTP)
tester run https://example.com \
  --username admin@example.com \
  --password secret \
  --mfa-secret JBSWY3DPEHPK3PXP

# Regenerate HTML report from saved JSON
tester report ./reports/test-run-xxx.json
```

## HTTP Server

The tester exposes a REST API for integration with other services.

### Start the server

```bash
# Development
npm run server

# Production
npm run build && npm run start:server
```

### API Endpoints

#### `GET /api/health`
Health check — no auth required.

```json
{ "status": "ok", "activeJob": null }
```

#### `POST /api/test/start`
Start a new test run (single concurrency — one test at a time).

**Auth:** `Authorization: Bearer <TESTER_API_SECRET>`

**Body:**
```json
{
  "url": "https://example.com",
  "config": {
    "maxPages": 10,
    "accessibility": true,
    "performance": false
  }
}
```

**Response:** `202 Accepted`
```json
{ "testId": "uuid-...", "status": "queued" }
```

#### `GET /api/test/:id/status`
Poll for test progress.

**Auth:** `Authorization: Bearer <TESTER_API_SECRET>`

**Response:**
```json
{
  "status": "running",
  "progress": 45,
  "startedAt": "2026-01-01T10:00:00Z",
  "completedAt": null,
  "durationMs": null,
  "summary": null
}
```

`status` values: `queued` → `running` → `completed` | `failed`

#### `GET /api/test/:id/results`
Get full test results (JSON).

**Auth:** `Authorization: Bearer <TESTER_API_SECRET>`

**Response:** Full `TestRun` object with all scenarios, assertions, and screenshots.

#### `GET /api/test/:id/report`
Get the HTML report (rendered in browser).

**Auth:** `Authorization: Bearer <TESTER_API_SECRET>`

**Response:** `text/html` — interactive dark dashboard.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes* | — | Claude API key for AI scenarios + vision |
| `TESTER_PORT` | No | `3012` | HTTP server port |
| `TESTER_API_SECRET` | Yes (server) | — | Bearer token for HTTP server auth |

*Required for AI scenario generation and vision-based element finding. Templates still work without it.

## Configuration (TesterConfig)

```typescript
interface TesterConfig {
  // Browser
  headless?: boolean           // Default: true

  // Discovery
  maxPages?: number            // Default: 50
  maxDepth?: number            // Default: 3
  crawlTimeout?: number        // Default: 120_000ms
  allowedDomains?: string[]    // Restrict crawl to these domains
  excludePatterns?: string[]   // URL patterns to skip

  // Auth
  credentials?: {
    username: string
    password: string
    loginUrl?: string
  }
  mfaHandler?: MfaHandler      // Custom MFA resolver
  sessionPath?: string         // Load/save session cookies

  // AI
  anthropicApiKey?: string     // Overrides ANTHROPIC_API_KEY env var
  aiModel?: string             // Default: 'claude-sonnet-4-6'

  // Features
  screenshotOnError?: boolean  // Default: true
  screenshotEveryStep?: boolean
  visualRegression?: boolean   // Pixel diff vs baseline
  accessibility?: boolean      // axe-core audit
  performance?: boolean        // FCP/LCP/TTI metrics

  // Reporting
  outputDir?: string           // Default: './reports'
  reportFormats?: ('json' | 'html')[]
}
```

## CLI Commands

### `tester discover <url>`

Crawl a website and output discovered pages, forms, buttons, and links.

```
Options:
  --max-pages <n>     Maximum pages to crawl (default: 50)
  --max-depth <n>     Maximum crawl depth (default: 3)
  --timeout <ms>      Crawl timeout in ms (default: 120000)
  --no-headless       Show browser window
  -o, --output <dir>  Output directory (default: ./reports)
  --json              Output raw JSON instead of formatted text
```

### `tester run <url>`

Run a full test suite against a website.

```
Options:
  --max-pages <n>         Maximum pages to crawl
  --max-depth <n>         Maximum crawl depth
  --timeout <ms>          Total timeout in ms
  --no-headless           Show browser window
  -u, --username <user>   Login username
  -p, --password <pass>   Login password
  --login-url <url>       Login page URL (if different from base URL)
  --api-key <key>         Anthropic API key (overrides env var)
  --mfa                   Enable interactive MFA prompt
  --mfa-secret <secret>   TOTP secret for automated MFA
  --session <path>        Load existing session from file
  --skip <types>          Comma-separated test types to skip
  --only <types>          Run only these test types
  -o, --output <dir>      Output directory (default: ./reports)
```

### `tester login <url>`

Log in and save the session for later reuse.

```
Options:
  -u, --username <user>     Login username
  -p, --password <pass>     Login password
  --no-headless             Show browser window
  --save-session <path>     Path to save session file
  --mfa                     Enable MFA prompt
  --mfa-secret <secret>     TOTP secret
```

### `tester journey-audit`

Real-browser walk of an authenticated user journey. Logs in, visits every
configured nav link, screenshots each page, classifies status. Catches UX
regressions that code-level audits miss.

```bash
# Fastest: drop a .journey-audit.json in your project and run
npx @aledan007/tester journey-audit \
  --email you@example.com --password 'secret'

# Use a packaged config by project name (configs shipped with Tester)
npx @aledan007/tester journey-audit --project tradeinvest \
  --email ... --password ...

# Explicit path (useful in CI)
npx @aledan007/tester journey-audit --config ./path/to/config.json \
  --email ... --password ... --headed
```

**Config resolution** (first match wins):
1. `--config <path>` flag
2. `./.journey-audit.json` in the current working directory (decentralized — lives with each project)
3. `--project <name>` → `<tester-install>/journey-audit/configs/<name>.json` (central registry shipped with Tester)

**Config format** — see `journey-audit/configs/tradeinvest.json` for a full example. Minimum fields:

```json
{
  "name": "YourApp",
  "baseUrl": "https://yourapp.example.com",
  "login": {
    "path": "/auth/login",
    "emailSelector": "input[type=email]",
    "passwordSelector": "input[type=password]",
    "submitSelector": "button[type=submit]",
    "successUrlPattern": "/(dashboard|home)"
  },
  "credentials": { "emailEnv": "JOURNEY_EMAIL", "passwordEnv": "JOURNEY_PASSWORD" },
  "navLinks": [
    { "name": "Dashboard", "href": "/dashboard" },
    { "name": "Settings", "href": "/settings" }
  ],
  "onboardingMarkers": "Connect|Configure|Link your",
  "emptyStateMarkers": "No .*yet|empty",
  "errorMarkers": "error|failed",
  "viewport": { "width": 1440, "height": 900 }
}
```

**Output**:
- `journey-audit-results/<project>/screenshots/*.png` — one per nav link
- `journey-audit-results/<project>/report.json` — structured findings per page with status, h1, notes, screenshot path

**Options**:
- `--headed` — show the browser window
- `-o, --output <dir>` — results root (default `./journey-audit-results`)

### `tester report <json-path>`

Regenerate the HTML report from a saved JSON results file.

```
Options:
  -o, --output <path>   Output HTML file path
  --title <title>       Report title
  --no-screenshots      Exclude screenshots from report
```

## Test Categories

| Category | Description |
|----------|-------------|
| `auth` | Login flows, session management, unauthorized access |
| `navigation` | Page loads, links, 404 detection |
| `forms` | Form validation, required fields, submission |
| `functionality` | Button interactions, dynamic content |
| `error_handling` | Invalid input, edge cases, error messages |
| `accessibility` | axe-core WCAG audit |
| `performance` | Core Web Vitals (FCP, LCP, TTI) |
| `visual` | Pixel-level regression vs baseline |

## Assertion Types

| Type | Description |
|------|-------------|
| `element_exists` | Element is present in DOM |
| `element_visible` | Element is visible (not hidden) |
| `element_not_exists` | Element is absent |
| `text_contains` | Element text includes value |
| `text_equals` | Element text exactly matches |
| `text_not_contains` | Element text does not include value |
| `url_contains` | Current URL includes value |
| `url_equals` | Current URL exactly matches |
| `attribute_equals` | Element attribute matches |
| `count_equals` | Number of matching elements |
| `count_greater_than` | At least N matching elements |
| `count_less_than` | At most N matching elements |
| `no_console_errors` | No console errors during test |
| `no_network_errors` | No failed network requests |
| `response_ok` | HTTP response is 200-299 |
| `no_4xx` | No 4xx HTTP responses |
| `no_5xx` | No 5xx HTTP responses |
| `visual_match` | Screenshot matches baseline (pixelmatch) |
| `a11y_violations` | Zero or below threshold axe violations |
| `performance_metric` | Core Web Vital within threshold |

## Building

```bash
npm run build         # Build all 3 entry points (lib + cli + server)
npm run dev           # Watch mode
npm run typecheck     # TypeScript type check
```

Build output:
- `dist/index.js` + `dist/index.mjs` + `dist/index.d.ts` — Library (CJS + ESM)
- `dist/cli/index.js` — CLI binary
- `dist/server/index.js` — HTTP server

## Testing

```bash
npm test              # Run all 85 tests (Vitest)
npm run test:watch    # Watch mode
```

Test coverage:
- DOM, network, visual, a11y, performance assertions
- BFS crawler, page analyzer
- MFA detection, session persistence
- Browser core (14 step actions)
- Scenario executor
- JSON + HTML reporter

## Deployment

### HTTP Server (VPS/Railway)

```bash
# Build first
npm run build

# Set environment variables
export ANTHROPIC_API_KEY=sk-ant-...
export TESTER_API_SECRET=your-secret-token
export TESTER_PORT=3012

# Start
npm run start:server
```

### Railway

A `railway.json` is included for one-click Railway deployment.

### PM2

```bash
pm2 start dist/server/index.js --name tester
pm2 save
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   AITester                       │
│                  (tester.ts)                     │
└─────┬───────┬──────────┬───────────┬────────────┘
      │       │          │           │
   Browser  Auth    Discovery   Scenarios
  (browser) (login)  (crawler)  (generator)
      │                              │
   Step         Claude API      Templates
  Actions      (AI scenarios)  (built-in)
      │
  Assertions → Reporter → HTML/JSON
```

## License

MIT — Alex Danciulescu, TechBiz Hub L.L.C-FZ
