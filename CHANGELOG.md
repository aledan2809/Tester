# Changelog — AI Tester

## [0.3.0] — 2026-05-03

### journey-audit classifier — config-driven exemptions
Closes G-CLASSIFIER-EXT (cross-project deferred from AVE G-JOURNEY-EMPTY 2026-05-02).
Closes G-JOURNEY-003 (no-auth path now in published distribution; 0.2.0 was missing it).

**New:** the inline page-status classifier in `src/cli/commands/journey-audit.ts` is
extracted into a pure function `classifyPage(input)` in
`src/cli/commands/journey-audit-classifier.ts`. Four optional `JourneyConfig`
knobs control how false-positive `EMPTY` reclassifications work:

- `bodyLenThreshold?: number` — override the hardcoded 200-char "suspiciously
  empty" threshold.
- `validContentMarkers?: string` — regex evaluated against body innerText; if
  ≥1 hit, the EMPTY heuristic is bypassed for that page.
- `perPageOverrides?: Record<string, { skipEmptyCheck?: boolean; expectedH1?: string }>`
  — keyed by `link.href`; opt a specific page out of the empty check.
- `formHeroException?: boolean` — **default `true` in 0.3.0+** (was effectively
  always-flag in 0.2.x). When true, pages with a non-empty `h1` AND at least one
  `<button>` are treated as legitimate even at low bodyLen (login forms, hero
  landings). Set to `false` to restore 0.2.x always-flag behavior.

**Behavior change vs 0.2.x:** consumers without any of these new keys get
`formHeroException:true` default → form/hero pages with h1+buttons that were
previously flagged EMPTY now report `OK` with a `empty_check_skipped (form_hero ...)`
note. This is the AVE false-positive shape; reclassifications happen in-tree
instead of needing a downstream post-processor.

**Tests:** `tests/journey-audit-classifier.test.ts` adds 20 vitest cases covering
basics, threshold override, formHero exception (on/off), validContentMarkers,
perPageOverrides, and exemption precedence. Existing tests unchanged → suite
total 570/570 pass.

### G-001 triage closure
4 new G-XXX entries filed in AUDIT_GAPS.md (G-API-START-EMPTY-BODY,
G-API-FALSE-POSITIVE, G-INNERHTML-FP, G-DEAD-SCRIPTS) + G-LANDING-001 referenced
for landing-page items already eliminated 2026-05-02. G-001 marked Eliminated.

## [0.2.0] — 2026-04-25 (retroactive entry — no published changelog at the time)

### journey-audit no-auth path
- `cfg.login` made optional; `needsAuth = !!cfg.login` runtime gating added.
- Computer-Use vision fallback for Playwright selector failures (G-CU-001,
  opt-in via `TESTER_COMPUTER_USE_FALLBACK=1`).
- Configurable `login.successUrlTimeout` (default 30s, was 15s hardcoded;
  G-JOURNEY-002).

## [0.1.0] — 2026-02-21
### Sprint 1: Foundation
- Project scaffold (package.json, tsconfig, tsup, vitest)
- BrowserCore: 14 step actions, 3-tier element resolution, error capture
- Safety layer: domain lock, URL filtering, step validation
- AI Element Finder: Claude Vision fallback
- BFS Crawler: Puppeteer-based, SPA-compatible
- Page Analyzer: forms, buttons, links, inputs, auth detection
- Site Map Builder: structured output
- CLI: `tester discover` and `tester run` commands
- AITester main class (library API)
- 39 unit tests, TypeScript clean, tsup build OK

### Sprint 2: Auth + Scenario Generation
- Login handler with platform detection (WP, Shopify, Wix, etc.)
- MFA detection (selectors + text patterns) + pause/resume + TOTP auto
- Session persistence (save/load cookies)
- AI Scenario Generator: Claude API with template fallback
- Built-in templates: navigation, forms, login, error pages, broken links
- CLI: `tester login` command with --mfa, --save-session
- 48 unit tests

### Sprint 3: Execution Engine + Assertions
- DOM assertions: 14 types (element_exists, text_equals, url_contains, cookie_value, etc.)
- Network assertions: no_console_errors, no_network_errors, status_code
- Visual regression: pixelmatch-based pixel diff with configurable threshold
- A11Y assertions: axe-core integration for WCAG violations
- Performance assertions: FCP, LCP, TTI via Performance API
- Assertion router: dispatches to correct handler by type
- Test executor: scenario runner with step execution, assertion validation, scoring
- 75 unit tests

### Sprint 4: Reporter + Self-healing + CLI Completion
- JSON reporter: structured TestRun output, CI summary format, screenshot stripping
- HTML reporter: self-contained dashboard with score cards, category breakdown,
  a11y violations, performance metrics, broken links, console errors,
  per-scenario details with step tables and screenshot galleries
- CLI: `tester report` command for HTML regeneration from JSON
- Self-healing: retry failed steps once with 1s delay
- Reporter integration into AITester class and CLI run command
- 85 unit tests, TypeScript clean, tsup build OK
