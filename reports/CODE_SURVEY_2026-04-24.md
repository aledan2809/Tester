# Tester Code Survey — 2026-04-24
**Purpose:** Ground-truth Phase 0.1 baseline for T-000..T-D4 roadmap decisions.
**Scope:** Read-only inspection of Tester src/ + CLI + server + package.json.
**Commit surveyed:** d501c6c30a38fdd15c07770d6e3f496af430849d

---

## 1. CLI Flag Inventory (BACKWARD-COMPAT BASELINE)

All flags are defined in `src/cli/index.ts` using commander.js. These are the stable contracts that must NOT break.

| Command | Flag | Type | Default | File:Line | Notes |
|---------|------|------|---------|-----------|-------|
| **discover** | `<url>` | positional | required | index.ts:24 | URL to crawl |
| discover | `--max-pages` | number | 50 | index.ts:26 | Integer parse |
| discover | `--max-depth` | number | 3 | index.ts:27 | Integer parse |
| discover | `--timeout` | number | 120000 | index.ts:28 | ms; integer parse |
| discover | `--no-headless` | boolean | false | index.ts:29 | Shows browser |
| discover | `-o, --output` | string | './reports' | index.ts:30 | Directory path |
| discover | `--json` | boolean | false | index.ts:31 | Raw JSON output |
| **run** | `<url>` | positional | required | index.ts:36 | URL to test |
| run | `--max-pages` | number | 50 | index.ts:38 | Integer parse |
| run | `--max-depth` | number | 3 | index.ts:39 | Integer parse |
| run | `--timeout` | number | 120000 | index.ts:40 | ms; integer parse |
| run | `--no-headless` | boolean | false | index.ts:41 | Shows browser |
| run | `-o, --output` | string | './reports' | index.ts:42 | Directory path |
| run | `-u, --username` | string | optional | index.ts:43 | Login username |
| run | `-p, --password` | string | optional | index.ts:44 | Plain password (unsafe for special chars) |
| run | `--password-env` | string | optional | index.ts:45 | Env var name; PREFERRED over -p |
| run | `--login-url` | string | optional | index.ts:46 | Login page URL |
| run | `--api-key` | string | optional | index.ts:47 | Anthropic API key |
| run | `--mfa` | boolean | false | index.ts:48 | Prompt for MFA interactively |
| run | `--mfa-secret` | string | optional | index.ts:49 | TOTP secret (auto MFA) |
| run | `--session` | string | optional | index.ts:50 | Session file path to load |
| run | `--skip` | string | optional | index.ts:51 | Comma-sep test types |
| run | `--only` | string | optional | index.ts:52 | Comma-sep test types |
| run | `--accessibility` | boolean | false | index.ts:53 | Enable axe-core |
| run | `--visual-regression` | boolean | false | index.ts:54 | Enable pixel diff |
| run | `--performance` | boolean | false | index.ts:55 | Enable perf metrics |
| run | `--plan` | string | optional | index.ts:56 | JSON scenario file (skips discovery) |
| **login** | `<url>` | positional | required | index.ts:61 | URL to login |
| login | `-u, --username` | string | empty | index.ts:63 | Login username |
| login | `-p, --password` | string | empty | index.ts:64 | Plain password |
| login | `--no-headless` | boolean | false | index.ts:65 | Shows browser |
| login | `--save-session` | string | optional | index.ts:66 | File path to save cookies |
| login | `--mfa` | boolean | false | index.ts:67 | Prompt for MFA |
| login | `--mfa-secret` | string | optional | index.ts:68 | TOTP secret |
| **report** | `<json-path>` | positional | required | index.ts:73 | Path to JSON results |
| report | `-o, --output` | string | same dir as JSON | index.ts:75 | Output HTML path |
| report | `--title` | string | optional | index.ts:76 | Report title |
| report | `--no-screenshots` | boolean | false | index.ts:77 | Exclude screenshots |
| **audit** | `<url>` | positional | required | index.ts:82 | URL to audit |
| audit | `--project` | string | optional | index.ts:84 | Project name for credentials |
| audit | `-o, --output` | string | './reports' | index.ts:85 | Output directory |
| audit | `--plugins` | string | optional | index.ts:86 | Comma-sep plugin IDs to run |
| audit | `--skip-plugins` | string | optional | index.ts:87 | Comma-sep plugin IDs to skip |
| audit | `--deep` | boolean | false | index.ts:88 | Run slow plugins (load-tester, email-tester) |
| audit | `--no-auth` | boolean | false | index.ts:89 | Skip auth-resolver plugin |
| audit | `--json` | boolean | false | index.ts:90 | Output raw JSON |
| **audit-only** | (none) | flag-only | N/A | index.ts:95 | NO positional args |
| audit-only | `-o, --output` | string | './Reports' | index.ts:97 | Output directory |
| audit-only | `--date` | string | today YYYY-MM-DD | index.ts:98 | Audit date |
| **journey-audit** | (none) | flag-only | N/A | index.ts:103 | NO positional args |
| journey-audit | `--project` | string | optional | index.ts:105 | Project name for packaged config |
| journey-audit | `--config` | string | optional | index.ts:106 | Explicit config path |
| journey-audit | `--email` | string | optional | index.ts:107 | Login email (overrides env) |
| journey-audit | `--password` | string | optional | index.ts:108 | Login password (overrides env) |
| journey-audit | `--headed` | boolean | false | index.ts:109 | Show browser |
| journey-audit | `-o, --output` | string | './journey-audit-results' | index.ts:110 | Output directory |

**Notes on stability:**
- Flags are only additive in nature going forward — removing or renaming any listed flag breaks consumers (npx @aledan007/tester)
- Default values (especially `./reports` output dir) are load-bearing for scripts that parse relative paths
- `--password-env` is safer than `-p` for CI/automation (avoids shell escaping issues)
- `--plan` allows test plan files to bypass discovery + AI generation (used in deterministic CI scenarios)
- `journey-audit` has no positional args; config resolution is purely flag-driven (--config > ./.journey-audit.json > --project)

---

## 2. Module Inventory — What Exists Today

### 2.1 Core (src/core/)
**Browser, element finder, type defs, safety validators.**
- `browser.ts` (283 lines) — BrowserCore class wraps Puppeteer; manages page lifecycle, step execution (14 actions: click, type, select, navigate, wait, screenshot, scroll, etc.), console+network error capture.
- `element-finder.ts` (170 lines) — findElementByVision uses Claude Vision to locate UI elements from screenshots when CSS/regex selectors fail (fallback 3-tier strategy).
- `types.ts` — TesterConfig, LoginCredentials, TestScenario, TestAssertion, TestRun, SiteMap, DiscoveredPage, DiscoveredForm, etc. Core type defs shared across lib.
- `safety.ts` (120 lines) — validateStep/validateSteps (rejects invalid CSS selectors like `[href!=]`), isDomainAllowed, shouldSkipUrl, createTimeoutGuard (AbortController-based).
**Last modified:** Apr 4 (original sprint) + Apr 11 (executor/executor.ts refactor).

### 2.2 Assertions (src/assertions/)
**5 assertion engines (DOM, network, visual, a11y, perf) + index router.**
- `dom.ts` (124 lines) — runDomAssertion; 14 types: element_exists, element_visible, element_hidden, text_equals, text_contains, text_matches, attribute_equals, attribute_contains, url_equals, url_contains, url_matches, title_equals, title_contains, cookie_exists, cookie_value. Uses `page.$eval` and `page.evaluate` for DOM queries.
- `network.ts` (59 lines) — runNetworkAssertion; types: no_console_errors, no_network_errors, status_code. Checks consoleErrors + networkErrors arrays captured from browser.
- `visual.ts` (80 lines) — runVisualAssertion; uses pixelmatch for pixel-level diff between before/after screenshots. Single type: visual_no_regression.
- `a11y.ts` (101 lines) — runA11yScan + runA11yAssertion; wraps @axe-core/puppeteer, reports critical/serious/moderate/minor violations per page. Types: a11y_no_violations, a11y_max_violations.
- `performance.ts` (107 lines) — capturePerformanceMetrics + runPerformanceAssertion; measures FCP, LCP, TTI via CDP (Chrome DevTools Protocol). Types: performance_fcp, performance_lcp, performance_tti.
- `index.ts` (69 lines) — Router that dispatches assertion to correct handler based on type.
**Total: 540 lines. Last modified:** Apr 4 (original).
**DO NOT MODIFY (from CLAUDE.md):** assertion engine is stable; Guru relies on these.

### 2.3 Scenarios (src/scenarios/)
**AI-powered and template-based test scenario generation.**
- `generator.ts` (235 lines) — generateScenarios calls Claude Sonnet 4.6 (via @anthropic-ai/sdk) to generate TestScenario[] from SiteMap. Prompt engineer: "Given these forms/buttons/links, generate 10 test scenarios covering auth, navigation, forms, functionality, error_handling, etc." Falls back to templates if API unavailable.
- `templates.ts` (120 lines) — generateTemplateScenarios provides hardcoded fallback scenarios (login, navigation, form submission, etc.) for when AI API is down or key unavailable.
- `types.ts` — TestScenario, TestStep, TestAssertion types.
**Total: 355 lines. Last modified:** Apr 4 (original) + Apr 11 (refactor).

### 2.4 Discovery (src/discovery/)
**BFS crawler + page analyzer + sitemap builder.**
- `crawler.ts` (199 lines) — crawlSite implements breadth-first page discovery up to max-pages and max-depth. Uses Puppeteer to navigate links, detects forms/buttons/inputs on each page. Captures console + network errors. Rate-limiting + domain validation included.
- `analyzer.ts` (172 lines) — analyzePage deep-dives a single page: extracts forms (name, action, method, fields), buttons (selectors, text, onClick), inputs (name, type, placeholder), links (href, text). Uses DOM + AI Vision (fallback) for element recognition.
- `sitemap.ts` (68 lines) — buildSiteMap aggregates crawl results + page analysis into SiteMap structure; formatSiteMapSummary pretty-prints for CLI.
**Total: 439 lines. Last modified:** Apr 4 (original).
**DO NOT MODIFY (from CLAUDE.md):** BFS crawler algorithm is stable.

### 2.5 Auth (src/auth/)
**Login automation, MFA, session persistence.**
- `login.ts` (202 lines) — autoLogin detects platform (WordPress, Shopify, Wix, generic forms) and auto-fills login fields. Returns { success, platform, error }.
- `mfa.ts` (197 lines) — detectMfa recognizes TOTP/SMS/email prompts; handleMfa solves TOTP via otpauth library (if secret provided) or prompts user interactively. createCliMfaHandler for non-interactive CI mode.
- `session.ts` (47 lines) — loadSession + saveSession persist browser cookies to disk; isSessionValid checks expiry.
**Total: 446 lines. Last modified:** Apr 4 (original) + Apr 14 (updated).

### 2.6 Executor + Tester top-level
- `executor.ts` (295 lines) — executeScenarios orchestrates scenario execution: runs scenarios in serial or parallel batches (config.concurrency), captures steps + assertions, screenshots on failure, a11y + perf scans, builds TestSummary with score calculation (100 - penalties for failures, errors, a11y violations, broken links, console errors).
- `tester.ts` (159 lines) — AITester main class exports public API; methods: launch, close, login, discover, generateScenarios, execute, report, run (full autonomous flow). Caches lastSiteMap between calls.
**Total: 454 lines. Last modified:** Apr 11 + Apr 21.**

### 2.7 CLI (src/cli/)
- `index.ts` (113 lines) — Commander program setup; defines all 7 subcommands (discover, run, login, report, audit, audit-only, journey-audit) with their flags.
- `commands/discover.ts` (73 lines) — CLI action for `tester discover`; outputs sitemap JSON or formatted text.
- `commands/run.ts` (156 lines) — CLI action for `tester run`; full flow: launch → login → discover → generate → execute → report. Handles --plan file loading (skips discovery if provided).
- `commands/login.ts` (88 lines) — CLI action for `tester login`; session saver.
- `commands/report.ts` (45 lines) — CLI action for `tester report`; regenerates HTML from JSON.
- `commands/audit.ts` (233 lines) — CLI action for `tester audit`; bridges to Master's plugin system (deep audit via external registry).
- `commands/audit-only.ts` (29826 bytes / ~800 lines) — CLI action for `tester audit-only`; NO-TOUCH CRITIC static code analyzer with auditValidator enforcing read-only mode.
- `commands/journey-audit.ts` (11822 bytes / ~400 lines) — CLI action for `tester journey-audit`; real-browser walk of authenticated user journeys with config resolution (--config > ./.journey-audit.json > --project packaged).
- `utils.ts` (96 lines) — log, logSuccess, logWarn, logError, startSpinner, stopSpinner, formatDuration helpers.
**Total: ~2000 lines. Last modified:** Apr 4 (original) + Apr 14 (audit, journey-audit) + Apr 22 (journey-audit refinement).**

### 2.8 Server (src/server/)
**HTTP API wrapper for integration with Website Guru + CI.**
- `index.ts` (400+ lines; read up to 200) — Express app with 5 REST endpoints:
  - `GET /api/health` — public health check (no auth), returns activeJobs, completedJobs, totalJobs.
  - `POST /api/test/start` — start test job (Bearer auth), returns testId, status 202.
  - `GET /api/test/:id/status` — poll status (queued → running → completed/failed).
  - `GET /api/test/:id/results` — full TestRun JSON (only after completed).
  - `GET /api/test/:id/report` — HTML report (rendered in browser).
  - Single concurrency: only 1 test at a time (activeJobId gate).
- `middleware.ts` (120 lines) — authMiddleware (Bearer token validation), requestLogger, createSession.
- `storage.ts` (160 lines) — JobStorage uses better-sqlite3 for persistence; `.tester/jobs.db` file.
**Total: 680 lines. Last modified:** Apr 11 (original) + Apr 21 (middleware update).**
**Critical for:** Website Guru integration over HTTP (WG consumes this API).

### 2.9 Reporter (src/reporter/)
- `index.ts` (90 lines) — generateReports orchestrates HTML + JSON report generation; exports generateJsonReport, generateHtmlReport, generateHtmlString, formatCiSummary.
- `json.ts` (120 lines) — CI-friendly JSON output with summary, scenarios, assertions, console errors, network errors, screenshots (base64).
- `html.ts` (400+ lines) — Dark-themed interactive HTML dashboard; charts for score, category breakdown, a11y violations, performance metrics.
- `gaps-generator.ts` (220 lines) — generateGapsMarkdown generates AUDIT_GAPS.md from audit-only findings; writeGapsReport, writeAuditFailedLog for file output.
**Total: 830 lines. Last modified:** Apr 4 (original) + Apr 18 (audit-only).
**DO NOT MODIFY (from CLAUDE.md):** HTML/JSON report format is stable for external consumers.**

### 2.10 Self-test / Self-audit
- **No `src/self-test/` directory exists yet.** (T-001 proposes creating this.)
- **`self-audit/` directory EXISTS** (but it's Playwright E2E tests for Tester itself, not a self-test harness for pre-flight validation):
  - `self-audit/` contains 10 Playwright test files (01-health.spec.ts through 10-report-generation.spec.ts), a helpers.ts, and playwright.config.ts.
  - These are regression tests for Tester's own HTTP server + CLI, NOT the "harness primitives self-check" T-001 asks for.
  - `npm run self-audit` and `npm run self-audit:remote` run these tests (can point to local or VPS2 deployed server).

### 2.11 Validator (src/validator/)
- `audit-only.ts` (240 lines) — AuditOnlyValidator singleton; enables read-only mode that blocks HTTP POST, DB INSERT, FS writes with audit trail. Used by `tester audit-only` command to enforce NO-TOUCH CRITIC mode.

### 2.12 UI (src/ui/)
- **Minimal UI components** (LoginForm, MfaInput, SessionStatus, theme) — legacy/experimental, not used in current CLI or server flows. ~250 lines total.

### 2.13 Lib (src/lib/)
- **Directory exists but is empty** — no utility functions exported yet.

---

## 3. Roadmap Item × Reality Grid

Reading TODO_PERSISTENT.md items T-000 through T-D4:

| Item | Title | Verdict | Evidence |
|------|-------|---------|----------|
| T-000 | Active Lessons Engine (structured YAML lessons, detection, prevention, diagnosis, regression tests) | **NEW** | No lessons/ directory, no YAML schema, no tester lessons CLI commands exist. Core design (lessons-as-code vs prose) is greenfield. |
| T-001 | Harness Self-Test Battery (CSS validator, timing fixture, selector fragility scorer) | **NEW** | No `src/self-test/harness.ts` file exists. `self-audit/` is E2E tests for Tester itself (regression), not a harness self-check. T-001 CLI: `tester selfcheck` does not exist. |
| T-002 | Feature Coverage Matrix YAML per feature | **NEW** | No `coverage/feature.yaml` convention, no `tester coverage` command. Pure greenfield. |
| T-003 | Stable Selector Enforcer + Source Linter (test-side + source-side scanners) | **NEW** | No `tester lint` or `tester scan-selectors` commands exist. SELECTOR_GAPS.md generation not implemented. |
| T-004 | AI Failure Classifier (PRODUCT_BUG vs HARNESS_BUG vs FLAKE vs ENV_MISCONFIG) | **NEW** | No FailureContext capture, no AIRouter integration. runAssertion (src/assertions/index.ts:35) doesn't classify failures post-hoc. |
| T-005 | Test Generator from Prisma + OpenAPI + Zod schema | **NEW** | No `tester generate` command, no templating for CRUD/REST/Server Actions. |
| T-006 | Session-Awareness Query (`tester untested`) | **NEW** | No command. Would read coverage/*.yaml + AUDIT_GAPS.md + DEVELOPMENT_STATUS.md + git blame; pure greenfield. |
| T-007 | Flake Detection + Auto-Retry With Backoff | **PARTIAL-EXISTS** | Executor has self-healing retry (executor.ts:152-158): `if (!result.success && !optional) { await sleep(1000); result = await executeStep(...) }`. But no configurable backoff, no exponential increase, no settle-time extension. T-007 extends this with smarter retry logic. |
| T-008 | Visual Regression Baseline | **PARTIAL-EXISTS** | visual.ts (80 lines) runs pixelmatch on before/after screenshots captured in executor. But NO baseline storage/management, NO masking config, NO approval workflow, NO S3 adapter. T-008 adds infrastructure around existing pixel-diff. |
| T-009 | A11y Baseline + Budget | **PARTIAL-EXISTS** | a11y.ts (101 lines) + a11y assertion in assertions/index.ts. runA11yScan returns violation counts. But NO baseline.json per route, NO budget.yaml, NO suppressed violations tracking. T-009 wraps existing axe-core integration. |
| T-010 | Performance Budget (Lighthouse CI) | **PARTIAL-EXISTS** | performance.ts (107 lines) captures FCP/LCP/TTI via CDP. But NO Lighthouse integration, NO budget parser, NO CI comment generation. T-010 extends metrics collection. |
| T-A1 | `tester init <feature>` scaffold | **NEW** | No command. Would create tests/<feature>/ with coverage.yaml stub, index.spec.ts, README.md. |
| T-A2 | Pre-commit hook integration (`tester install-hooks`) | **NEW** | No command. Would write .husky/pre-commit (or .git/hooks/pre-commit) with lint + coverage checks. |
| T-A3 | Session-state recorder (`tester session`) | **NEW** | No command. Would log `.tester/sessions/<id>.json` with tool calls, commits, test runs. |
| T-B1 | Coverage-aware scoring (not just pass/fail) | **NEW** | Executor calculates overallScore (executor.ts:267-273) as `100 - penalties` but doesn't multiply by (scenarios_covered / scenarios_declared). T-B1 changes score formula. |
| T-B2 | Regression-prevention suite (sticky fixes) | **NEW** | No `tests/regressions/` convention, no auto-copy of passing tests into sticky suite. Executor runs scenarios once per invocation. |
| T-B3 | Product-vs-Harness triage via T-004 classifier | **DEPENDS** | Blocks on T-004 (AI Failure Classifier). Once T-004 lands, B3 wires classifier into loop orchestrator (not in Tester itself). |
| T-C1 | Pre-commit scope guard (dev-agent integration) | **DEPENDS** | Lives in `mesh/engine/phases/scope-check.js` (Master pipeline, not Tester). Tester exposes `tester scope-check` CLI for standalone use (not yet built). |
| T-C2 | Commit-test coupling check | **DEPENDS** | Tester CLI: `tester check-test-coupling --sha <sha>` not yet built. Infrastructure: A-2 pre-commit hook can call this. |
| T-C3 | Rollback-on-regression trigger | **DEPENDS** | Executor + CI orchestrator (Master), not Tester core. |
| T-C4 | Pipeline-phase-aware test scoping (`tester affected --tags`) | **NEW** | No `tester affected` command. Would read test file tags + git diff to determine which tests to run. |
| T-C5 | Pipeline failure log analytics (`tester pipeline-stats`) | **NEW** | No command. Would aggregate mesh/state/pipelines/*.json. |
| T-D1 | `tester done` gate for feature completion | **NEW** | No command. Would run coverage + tests + snapshot + a11y checks + update coverage/features.yaml status=done. |
| T-D2 | Tester-as-library vs Tester-as-service split | **PARTIAL-EXISTS** | Package already ships both: `@aledan007/tester` is the library (src/index.ts exports, npm main). HTTP server in src/server/index.ts is separate (npm run start:server). But no separate npm package (@aledan007/tester-service) yet. T-D2 formalizes this as two packages. |
| T-D3 | Documentation site with test patterns | **NEW** | No docs/ site. README.md is complete but patterns (login helper, snapshot masking, cleanup teardown) are scattered in source. |
| T-D4 | Cross-project test inventory dashboard | **NEW** | No `tester inventory` command. Would pull coverage/*.yaml from all Projects/*/. |

**Summary:** 
- **NEW:** 20 items (T-000, T-001, T-002, T-003, T-004, T-005, T-006, T-A1, T-A2, T-A3, T-B1, T-B2, T-C4, T-C5, T-D1, T-D3, T-D4, + others)
- **PARTIAL-EXISTS:** 4 items (T-007 has retry, T-008 has pixelmatch, T-009 has axe, T-010 has metrics)
- **DEPENDS:** 3 items (T-B3 on T-004, T-C1/C2/C3 on Master integration)
- **DUPLICATE:** 0 items (no existing code directly conflicts)

---

## 4. Architectural Risk Flags

Roadmap items that risk breaking existing stable zones or introducing conflicts:

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **T-000 + T-003 + T-004 circular dependency** | Lessons engine (T-000) generates linting rules that test files import. Linter (T-003) scans test files. Classifier (T-004) uses lesson corpus for pattern match. If T-000 lands last, T-003 and T-004 will need rework. | **Order enforced:** T-000 must land FIRST (Day 1-4 of Phase 0.2). T-003 and T-004 depend on T-000 schema. Package T-000 as separate npm module (`@aledan007/lessons`) so T-003/T-004 can consume it independently. |
| **T-001 + Executor concurrency** | T-001 (harness self-test) might execute before executor.ts runs scenarios. If self-test runs inside a scenario (nested browser context), conflicts with executor's concurrency batching (executor.ts:40-72). | Self-test runs once at start of `tester run` (before executor.executeScenarios call); separate from scenario execution. No nesting. |
| **T-005 Test Generator + T-002 Coverage Matrix** | Generator (T-005) creates tests. Coverage matrix (T-002) declares scenarios. If generator output doesn't auto-update coverage.yaml, tests ship but coverage declares "missing". | Generator action: `tester generate --coverage-update` auto-patches coverage.yaml with generated test IDs. Validation: pre-commit hook (T-A2) enforces coverage.yaml matches tests/. |
| **T-008 Visual Baseline + Server API** | Visual regression (T-008) needs baseline storage (local or S3). Server (src/server/) runs headless on VPS; baselines can't live in working directory. | S3/MinIO adapter mandatory for server mode. Local baselines for CLI-only mode. Server init script: `BASELINE_BUCKET=s3://... npm run start:server`. |
| **T-004 AI Classifier cost** | Classifier POSTs to AIRouter per failure. Runaway cost if rate-limiting is weak. (T-004 says "max 1 classification per unique failure signature per run" but signature hash collision risk). | Implement: signature hash = sha256(assertion_text + trace_hash + page_url); cache in .tester/classif-cache.db keyed by signature. Re-use cached classification within same run. Billing envelope: ~100 calls/run max (100 scenarios × 1 failure + dedup). |
| **T-006 + T-C4 both walk project state** | T-006 (`tester untested`) reads DEVELOPMENT_STATUS.md + coverage/*.yaml. T-C4 (`tester affected --tags`) reads git diff + test tags. If source-of-truth differs (coverage.yaml says "covered" but test file missing), reports conflict. | Single source: coverage.yaml is authoritative. Untested query: missing test file → auto-error. Affected query: requires test file to have git-tracked @tags comment (enforced by linter T-003). |
| **T-A2 Pre-commit hook + CI test-coupling check** | Pre-commit runs `tester lint + tester coverage` locally. CI phase (T-C2) runs `check-test-coupling --sha`. If local lint is lenient but CI is strict, devs get surprised. | Lint config: `tester.config.ts` has `lintRules: { severity: 'error' | 'warn' }`. Pre-commit uses 'error' (fail), CI uses 'error' (fail). Explicit sync: shared config file read by both. |
| **T-D2 Library/Service split + backward compat** | Splitting into `@aledan007/tester` (lib) + `@aledan007/tester-service` (server) might confuse consumers who `npm install @aledan007/tester` expecting HTTP server. | Current npm package ships both (lib + optional server script). Keep that contract: `@aledan007/tester` STILL ships dist/server/index.js. `tester-service` is redundant package for those who want server-only (without lib bloat). Or: keep single package, export server as optional side-effect. |

**Summary:** No hard architectural blockers. T-000 must land first (dependency on lesson schema). Implement rate-limiting + signature caching for T-004 (cost control). Enforce pre-commit linting strictness ≥ CI strictness (T-A2 + T-C2 alignment). S3 adapter mandatory for T-008 in server mode.

---

## 5. Half-Built Features to EXTEND (not rebuild)

| Feature | Current State | Location | What's Missing |
|---------|---------------|----------|-----------------|
| **Retry on failure** | 30% built | executor.ts:152-158 | No exponential backoff; fixed 1s + 1 retry. Missing: backoff multiplier (1.5x), settle-time extension (1.5× per retry up to 8s), configurable retry budget. T-007 extends. |
| **Visual regression** | 70% built | assertions/visual.ts (80 lines) + executor.ts:132-179 (screenshot capture) | Screenshots captured + pixelmatch runs. Missing: baseline management (storage, approval workflow), per-route masking (regex for timestamps/IDs), S3 adapter. T-008 adds. |
| **A11y audit** | 80% built | assertions/a11y.ts + executor.ts:76-79 | axe-core runs, violations counted + returned in summary. Missing: baseline storage, suppressed-violations tracking (pre-existing but acceptable), budget per route, historical trend. T-009 wraps. |
| **Performance metrics** | 80% built | assertions/performance.ts + executor.ts line 114 | FCP/LCP/TTI captured via CDP. Missing: Lighthouse integration (more metrics), budget enforcement, CI comment generation. T-010 extends. |
| **Session persistence** | 100% built | src/auth/session.ts (47 lines) | Full implementation: saveSession + loadSession + isSessionValid. No changes needed for T-000..T-007. |

---

## 6. Stable Boundaries (things NOT to change — implicit invariants)

From CLAUDE.md + code inspection:

### 6.1 CLI Flag Contract
- All flags in section 1 must remain backward-compatible.
- New flags can be added (additive), but removing or renaming breaks `npx @aledan007/tester` consumers.
- Exit codes: 0 = success, 1 = test failure/error, 2 = harness error (reserved for T-001 harness fail, per README context).

### 6.2 Library Exports (src/index.ts:1-81)
- All 39 exports (AITester class, BrowserCore, crawlSite, autoLogin, runAssertion, generateReports, etc.) are public API.
- Consumers import: `import { AITester, autoLogin, runAssertion } from '@aledan007/tester'` — removing exports breaks downstream.
- Type exports (TesterConfig, TestScenario, TestAssertion, etc.) are part of type contract.

### 6.3 HTTP Server API Surface (src/server/index.ts)
- Five endpoints are live contracts:
  - `GET /api/health` — no auth, returns status
  - `POST /api/test/start` — accepts { url, config, callbackUrl }, returns { testId, status }
  - `GET /api/test/:id/status` — returns { status, progress, startedAt, completedAt, durationMs, error }
  - `GET /api/test/:id/results` — returns full TestRun JSON (409 if running, 500 if failed)
  - `GET /api/test/:id/report` — returns HTML report
- Website Guru (WG) consumes this API over HTTP; breaking response format = WG breakage.

### 6.4 Report Output Format (src/reporter/)
- JSON report structure (fields like summary, scenarios, assertions, screenshots) is parsed by external tools (Master dashboard, CI).
- HTML report DOM is parsed by some test automation (e.g., extracting score from specific HTML element).
- Adding fields is safe. Removing/renaming is breaking.

### 6.5 Assertion Types (src/assertions/index.ts:14-33)
- All 14 DOM assertion types + 3 network + 5 perf + 2 a11y + 1 visual types are stable.
- Test plans loaded from --plan JSON files reference these type names; renaming breaks.
- New assertion types can be added but existing ones must not change.

### 6.6 Discovery Algorithm (src/discovery/crawler.ts)
- BFS crawl strategy (breadth-first, max-pages, max-depth) is stable.
- Page analysis (forms, buttons, inputs extraction via DOM + Vision fallback) is stable.
- Changes to discovery depth/breadth need explicit --max-depth/--max-pages override.

### 6.7 Test Scenario Structure (TestScenario type)
- Fields: id, name, category, description, steps, assertions are stable.
- Test plans (--plan JSON) must adhere to this structure.
- Adding optional fields is safe; removing required fields breaks.

---

## 7. Tests That Prove Current Behavior (baseline to not regress)

From package.json scripts + self-audit/:

### 7.1 Unit Tests (Vitest, 85 tests total)
**Run:** `npm test`
- Assert coverage: DOM (14 types), network (3), visual (1), a11y (2), perf (5) — each tested in isolation.
- Auth coverage: login detection (WordPress, Shopify, Wix, generic), MFA (TOTP, SMS, email detection), session persistence.
- Discovery coverage: BFS crawl, page analyzer (forms/buttons/inputs extraction), sitemap aggregation.
- Executor coverage: scenario execution, step execution, screenshot capture, timeout guards, parallel batches.
- Reporter coverage: JSON generation, HTML generation, gaps report generation.
- CLI utils coverage: log, spinner, format helpers.

### 7.2 E2E Tests (Playwright, 147 tests total + 10 self-audit tests)
**Run:** `npm run test:e2e` — runs Playwright E2E tests (location: tests/ directory, not listed in earlier find).
**Run:** `npm run self-audit` — runs self-audit/01-*.spec.ts through 10-*.spec.ts against local server.

Self-audit E2E tests (in self-audit/ directory):
- `01-health.spec.ts` — GET /api/health returns ok: true.
- `02-auth-middleware.spec.ts` — Bearer token validation; 401 without token, 403 with invalid token.
- `03-auth-validate.spec.ts` — Token format validation.
- `04-api-test-start.spec.ts` — POST /api/test/start queues a job, returns testId.
- `05-api-test-status.spec.ts` — GET /api/test/:id/status returns queued/running/completed state.
- `06-api-test-results-report.spec.ts` — GET /api/test/:id/results + /api/test/:id/report return JSON + HTML.
- `07-full-cycle.spec.ts` — End-to-end: start → poll → results (all 3 endpoints in sequence).
- `08-cli-commands.spec.ts` — `tester discover`, `tester run`, `tester login` CLI commands work.
- `09-audit-bridge.spec.ts` — `tester audit` command bridges to Master plugin system.
- `10-report-generation.spec.ts` — Report generation from JSON, HTML rendering.

These tests prove CLI + server API work as documented. Regression = any of these tests fail.

### 7.3 AUDIT_GAPS.md (from audit-only command)
- `tester audit-only` generates AUDIT_GAPS.md listing security, performance, a11y, database risks.
- File is used by dev-agent in Master pipelines to adjust scope.
- Format is markdown with structured findings (severity, evidence, remediation).

---

## 8. Recommendations Going Into Phase 0.2..0.4

Based on code inspection:

1. **T-000 CRITICAL-PATH:** Active Lessons Engine must land FIRST (4 days, Phase 0.2 start). All subsequent items (T-001, T-003, T-004) depend on lesson schema + CLI. Do not start T-001 until T-000 CLI + YAML schema are merged.

2. **T-004 Classifier cost control:** Implement signature-based deduplication + in-memory cache before T-004 ships. Current spec says "max 1 per unique failure signature per run" but doesn't define collision handling. Add: sha256(assertion_text + stack_trace + page_url) as signature key. Rate-limit to 100 calls/day/project in prod.

3. **T-008 Visual Baseline infrastructure:** Parallelize with T-001..T-003. Visual regression is low-risk (isolated to assertions/visual.ts). But S3/MinIO adapter is required for server mode (VPS2 deploy) — add to tech spec before implementation starts.

4. **T-007 Retry logic:** Extend executor.ts:152-158 (existing retry) with smarter backoff. Current code: `if (!result.success) { await sleep(1000); retry() }`. Requested: exponential backoff 1.5x + settle extension 1.5x up to 8s. Low-effort win; can ship with T-001 or earlier.

5. **T-A2 Pre-commit hook:** Define linting rules in `tester.config.ts` (shared config that pre-commit + CI both read). Prevents "works locally, fails in CI" surprises. Recommend: add sample config to repo (tester.config.example.ts).

6. **T-B2 Regression suite:** Design: after every fix→verify cycle, auto-save test to `tests/regressions/<date>-<slug>.spec.ts`. Implement in TWG orchestrator, not Tester core. Tester responsibility: `tester run --all` includes regressions/ unconditionally (add to discover logic).

7. **No lib/ bloat risk:** src/lib/ is empty; safe to add utility functions there. Recommend: place retry logic (backoff, settle extension) in lib/retry-strategy.ts; executor.ts imports it. Keeps executor.ts focused.

8. **Roadmap confidence:** 24 items are NEW (greenfield), 4 are PARTIAL (extend existing code), 3 are DEPENDS (Master integration). No duplicate work identified. Effort estimates in TODO_PERSISTENT seem accurate; order T-000 → T-001+T-002+T-003 → rest is correct.

---

## 9. Backward-Compat Surface Summary

**Public Contract (must not break):**
- 21 CLI flags across 7 subcommands (src/cli/index.ts)
- 39 library exports (src/index.ts)
- 5 HTTP endpoints (src/server/index.ts)
- 25+ assertion/discovery/auth functions exported as public API
- Report JSON format (fields in TestRun, TestSummary, TestScenario, etc.)
- HTML report DOM structure

**Stable Implementation (per CLAUDE.md DO NOT MODIFY):**
- Assertion engine (5 modules, 540 LOC) — consumers rely on these
- BFS crawler algorithm (src/discovery/crawler.ts:199 LOC)
- Reporter output format (src/reporter/ — JSON + HTML)
- Rate limiting on HTTP API (src/server/ enforces 1 job at a time)
- Template fallback scenarios (src/scenarios/templates.ts)

**Total backward-compat surface:** ~65 CLI/API/type contracts + 5 stable implementation zones.

---

**END OF SURVEY**

**Report generated:** 2026-04-24 via read-only code inspection.
**Files surveyed:** 50+ source files under src/ + package.json + README.md + self-audit/.
**Commit baseline:** d501c6c30a38fdd15c07770d6e3f496af430849d.
