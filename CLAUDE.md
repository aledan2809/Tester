# Tester — AI-Powered Autonomous Web Testing Engine

## Overview
BFS crawler discovers pages, Claude AI generates test scenarios, executes multi-assertion tests (DOM, network, visual regression, a11y, performance), generates reports.
Also ships a **journey-audit** CLI command for project-agnostic real-browser user-journey walks (login + click-through every nav link, screenshot, classify).

## Stack
- Node.js, TypeScript, Puppeteer, Express, tsup
- AI: @anthropic-ai/sdk (Claude Sonnet 4.5)
- Testing: Vitest (85 unit) + Playwright (147 E2E) = 232 tests
- DB: better-sqlite3 (job persistence)
- Deploy: Railway (Docker), port 3012

## Build & Run
```bash
npm run build      # tsup (CJS+ESM+DTS)
npm test           # Vitest (85 tests)
npm run test:e2e   # Playwright (147 tests)
npm start          # HTTP server
```

## Journey Audit (CLI)
- `src/cli/commands/journey-audit.ts` — project-agnostic user-journey walker
- Config resolution: `--config` > `./.journey-audit.json` (project-local) > `journey-audit/configs/<name>.json` (packaged)
- Consumers invoke via `npx @aledan007/tester journey-audit` — NO dependency on Tester, no bundled copy
- Each consumer project owns its `.journey-audit.json` at repo root (decentralized source of truth)
- Backed by Puppeteer (same engine as the core tester — no Playwright runtime dep needed)

## AI Architecture
- `src/scenarios/generator.ts` — Claude generates test scenarios from page elements
- `src/core/element-finder.ts` — Claude Vision locates UI elements from screenshots
- Template fallback if API unavailable

## DO NOT MODIFY
- Assertion engine (DOM, network, visual, a11y, performance)
- BFS crawler discovery algorithm
- Reporter output format (HTML/JSON)
- Rate limiting on HTTP API
- Template fallback scenarios

## Env Vars
```
ANTHROPIC_API_KEY=...
TESTER_API_SECRET=...
TESTER_PORT=3012
```


## Governance Reference
See: `Master/knowledge/MASTER_SYSTEM.md` §1-§5. This project follows Master governance; do not duplicate rules.
NO-TOUCH CRITIC: see `AUDIT_GAPS.md` at project root for propose-confirm-apply protocol (Master `CLAUDE.md` §2d).

## Standing work ethic (L01 — mandatory, see `knowledge/lessons-learned.md`)
Every Tester work session MUST operate at **best-of-best** quality: close spec items fully (no "scope-tight MVP"), use `WebSearch` / `WebFetch` / Agent subagents for research, write behavior tests (not source-pattern grep), ship real integrations (not data-in/data-out shortcuts), do cross-repo work when the spec requires it, install packages when needed, report honest status ratios, ask when ambiguous. See L01 for the full rule + violation detection protocol.
