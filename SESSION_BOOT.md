# Session Boot — AI Tester

## Project
**@aledan/tester** — AI-powered autonomous web testing engine

## Quick Reference
- **Path**: `C:\Projects\Tester`
- **Port**: N/A (CLI tool / library)
- **Stack**: TypeScript + Puppeteer + Claude API + tsup
- **Build**: `npm run build` (tsup)
- **Test**: `npm test` (vitest)
- **CLI**: `npx tester discover <url>` or `npx tester run <url>`

## Presets
- **SAFE**: Read-only discovery mode, no auth, headless
- **STANDARD**: Full test run, write reports, no destructive actions
- **EXPLORE**: Non-headless browser for debugging, verbose logging
- **FIX ONLY**: N/A (this is a testing tool, not a fixer)
