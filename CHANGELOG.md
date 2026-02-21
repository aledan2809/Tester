# Changelog — AI Tester

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
