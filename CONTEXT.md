# Context — AI Tester

## Current State
ALL 4 SPRINTS COMPLETE. Full autonomous web testing engine built.

## Summary
- **85 unit tests** passing across 11 test files
- **30+ source files** across 7 directories
- TypeScript clean, tsup build OK (CJS + ESM + DTS)
- Library API (`AITester` class) + CLI tool (`tester`)

## Architecture
```
@aledan/tester
├── CLI (commander): discover, run, login, report commands
├── Core: BrowserCore (Puppeteer), Safety, Element Finder (AI Vision)
├── Discovery: BFS Crawler, Page Analyzer, Site Map Builder
├── Auth: Login handler (platform detection), MFA (TOTP), Session persistence
├── Scenarios: AI Generator (Claude API) + Template fallback
├── Assertions: DOM(14), Network(3), Visual(pixelmatch), A11Y(axe-core), Performance(FCP/LCP/TTI)
├── Executor: Scenario runner, self-healing retry, scoring model
└── Reporter: JSON (CI), HTML (dashboard with screenshots)
```

## Key Files
```
src/tester.ts          — Main AITester class (public API)
src/index.ts           — Library barrel export
src/core/browser.ts    — Puppeteer wrapper, 14 step actions, 3-tier element resolution
src/core/types.ts      — All shared TypeScript types
src/core/safety.ts     — Domain lock, URL filtering, validation
src/core/element-finder.ts — Claude Vision element discovery
src/discovery/crawler.ts   — BFS page crawler
src/discovery/analyzer.ts  — Page element extractor
src/auth/login.ts      — Auto-login with platform detection
src/auth/mfa.ts        — MFA detection + TOTP auto-generation
src/scenarios/generator.ts — AI scenario generation
src/scenarios/templates.ts — Built-in test scenario templates
src/assertions/        — 5 assertion handlers + router
src/executor.ts        — Scenario execution engine
src/reporter/json.ts   — JSON report generator
src/reporter/html.ts   — HTML dashboard report generator
src/cli/index.ts       — CLI entry point
```

## Code Reuse from Website Guru
Adapted (NOT modified) from WG browser-agent: agent.ts → browser.ts, types.ts → types.ts, safety.ts → safety.ts, element-finder.ts → element-finder.ts, visual-verify/diff.ts → assertions/visual.ts. All are NEW files in Tester project.

## Potential Future Work
- GitHub repo creation + Vercel deployment
- Integration hooks for AVE ecosystem
- Custom test plan YAML/JSON input
- Parallel scenario execution
- Video recording of test runs
- CI/CD GitHub Action
- Register in Master project
