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
