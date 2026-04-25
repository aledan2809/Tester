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

## User collaboration rules (L02 — mandatory, see `knowledge/lessons-learned.md`)
1. **Communicate in Romanian + plain language + everyday analogies.** Technical references (paths, commits, commands) include a one-line translation. Conversation defaults to RO + non-tehnic; reserve dense technical prose for artifacts (commit messages, ledger).
2. **Preserve uncommitted code; merge best parts.** When 2+ uncommitted variants of the same module exist, read each, compare against strategy, pick the best from each + adapt into one coherent version with zero overlap + zero dropped functionality. Never silently pick or discard.
3. **Ask when something is wrong; otherwise autonomous best-of-best.** Think through rules 1+2 first. Strategy conflict / missing inputs / multiple reasonable paths / unmerged variants → ask in user-friendly terms with options. Clear path → ship best-of-best without asking. Never minimal/MVP, never silent on ambiguity.

## Ownership + self-serve (L03 — mandatory, see `knowledge/lessons-learned.md`)
1. **Code I'm in is mine.** Pre-existing audit/test/lint findings in the codebase I'm working on = mine to fix. "Not from my current diff" is a triage label, not a license to ignore.
2. **Self-serve unblock before asking.** Before "need credentials / config / endpoint", check: can I seed it? generate it? mock it? read the source? Ask only when destructive, genuinely impossible, or steering-decision territory.
3. **Done = 100%.** Score gates default to 100. Anything less requires per-finding documentation in AUDIT_GAPS.md or user-approved deferral, never bucket-level silence.
