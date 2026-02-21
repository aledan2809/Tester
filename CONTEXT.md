# Context — AI Tester

## Current State
Sprint 1 COMPLETE. Foundation built with:
- 12 source files across 4 directories
- BrowserCore with 14 step actions + console/network error capture
- BFS Puppeteer crawler + page analyzer
- CLI with `discover` and `run` commands
- 39 unit tests passing
- TypeScript clean, tsup build OK

## Next: Sprint 2
- Auth: login handler, MFA detection + pause/resume, session persistence
- AI Scenario Generator: Claude API for test plan generation
- CLI: `tester login` command

## Files Created
```
src/index.ts, src/tester.ts
src/core/browser.ts, types.ts, safety.ts, element-finder.ts
src/discovery/crawler.ts, analyzer.ts, sitemap.ts
src/cli/index.ts, utils.ts, commands/discover.ts, commands/run.ts
tests/core/browser.test.ts, safety.test.ts
tests/discovery/crawler.test.ts
```

## Code Reuse from Website Guru
Adapted (NOT modified) from WG browser-agent: agent.ts → browser.ts, types.ts → types.ts, safety.ts → safety.ts, element-finder.ts → element-finder.ts. All are NEW files in Tester project.
