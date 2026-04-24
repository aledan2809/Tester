# Project Status - Tester

Last Updated: 2026-04-24 (latest-3) — +T-007/T-008/T-009/T-010 wave 1 complete. Roadmap progress 13/27 items. **332/332 tests pass** across 34 files (from 236/27 at start of session).

## Latest Session (2026-04-24 latest-3) — T-006..T-010 wave + 3 PAS uplift

### Commits (9 on top of 2026-04-24 latest baseline)

| Commit | Subject | Tests added |
|---|---|---|
| `280bc4a` | feat(tester): T-006 `tester untested` session-awareness query | +18 |
| `e80dec6` | test(tester): CLI integration (selfcheck+coverage+classify+generate) | +15 |
| `5697a18` | test(tester): regression coverage for 10 audit fixes F-001..F-014 | +12 |
| `0b16a09` | test(tester): classifier error paths (invalid-key, rate-limit, RO FS) | +4 |
| `b69755c` | docs(tester): 2026-04-24 session delta (T-006 + 3 PAS) | — |
| `ee5cbec` | feat(tester): T-007 retry backoff extension (exponential + settle cap) | +8 |
| `f5a3bf3` | feat(tester): T-008 visual baseline MVP — LocalFSStore + compare + CLI | +14 |
| `c66b98d` | feat(tester): T-009 a11y baseline + per-route budget enforcement | +13 |
| `a62fb55` | feat(tester): T-010 perf budget evaluator + CI delta comment | +12 |

**Baseline:** 236/236 → **332/332** (+96 tests, +7 files, zero regressions).

### What shipped (beyond the T-006 + 3 PAS block captured earlier)

**T-007 retry backoff** — extracts the inline `sleep(1000); retry()` at `executor.ts:149-158` into exported `retryStepWithBackoff` helper. TesterConfig +5 knobs (retryBudget/retryInitialSettleMs/retryBackoffMultiplier/retrySettleCapMs/noRetry); StepResult +3 metadata fields (retryCount/timeToVerdictMs/retryFinalVerdict). Backward-compat preserved (existing callers see equivalent behavior; defaults soft-expand budget 1→2).

**T-008 visual baseline MVP** — `BaselineStore` interface + `LocalFSStore` with sha256 meta JSON, `S3Store` stub (fail-fast throw), `compareRoute` API, `tester snapshot --baseline|--compare|--approve|--list` CLI. Layout: `<baseDir>/<project>/<safeRoute>.png` + `.meta.json`. S3 adapter, masking YAML, Puppeteer integration deferred.

**T-009 a11y baseline + budget** — `coverage/a11y-baseline.json` store + diff (regression = new crit/serious), `coverage/a11y-budget.yaml` per-route budget with defaults fallback, `tester a11y --baseline|--check --from <scan.json>` CLI. Decoupled from axe-core (caller feeds scan output).

**T-010 perf budget** — `coverage/perf-budget.yaml` parser + evaluator, before/after delta + CI comment markdown rendering, `tester perf --check|--delta` CLI. Metric keys: fcp_ms/lcp_ms/tti_ms/cls/transfer_bytes. Lighthouse runtime deferred.

### Lessons learned (L-S19 already captured)

**L-S19 — Test-file count ≠ test quality.** (Still load-bearing after wave 1.) Wave 1 added +96 tests across 7 files — what mattered wasn't the file count but the test distribution (CLI integration + audit-fix patterns + classifier error paths + behavior-level executor retry + store+diff regression + budget evaluator). Each commit ships a distinct failure-mode guard.

### TODO (next session — resume point)

**Wave 2** (per resume prompt, after T-006..T-010):
- T-A1 `tester init <feature>` (~0.5d)
- T-A3 session-state recorder (~1d)
- T-B1 coverage-aware scoring (~0.5d)
- T-B2 regression-prevention suite (~1d)
- T-B3 product-vs-harness triage via T-004 (~0.5d; depends on T-004 ✓)
- T-C4 phase-aware test scoping (~2d, P0-promoted)
- T-C5 pipeline failure analytics (~1.5d, P0-promoted)
- T-C6 zombie watchdog (DONE via prior commit `f43aef7` + Master `32a5e56`)
- T-C1 scope-check HOLD after C4
- T-D1..T-D4 (~5d) — done gate, lib split, docs, dashboard

**Follow-ups surfaced during wave 1** (all deferred deliberately):
- T-006 `--since <sha>` git-scope filter
- T-007 §4 `tester flake-report` CLI (reads historical retry metadata)
- T-008 S3/MinIO adapter + masking YAML + Puppeteer `tester run` integration
- T-009 `suppressed_until` field + HTML report + `tester run` scan-JSON writer
- T-010 Lighthouse runtime integration + historical trend storage + GitHub PR posting
- T-001 Day-2 Puppeteer browser probes
- T-005 OpenAPI + Zod generators
- Importer corpus activation (42 stubs)
- 8 deferred audit findings (F-006, F-009..F-011, F-015..F-018)

### NO-TOUCH CRITIC compliance

All wave 1 changes additive. DO NOT MODIFY zones preserved throughout:
- Assertion engine internals (dom, network, visual, a11y, performance — only external wrapper/budget modules added alongside)
- BFS crawler discovery algorithm
- Reporter HTML/JSON format
- HTTP API rate limiter
- Template fallback scenarios

Ledger: `reports/DIRECT-CHANGES-2026-04.md` updated with entries for each T-### commit per protocol.

---

## Earlier session (2026-04-24 latest-2, preserved)

Last Updated: 2026-04-24 (latest-2) — +T-006 `tester untested` + 3-PAS quality uplift (CLI integration, audit-fix regression patterns, classifier error paths). Roadmap progress 9/27 items. **285/285 tests pass** across 30 files (from 236/27).

## Latest Session (2026-04-24 latest-2) — T-006 ship + 3 PAS quality uplift

### Commits (4)

| Commit | Subject | Tests added |
|---|---|---|
| `280bc4a` | feat(tester): T-006 `tester untested` session-awareness query | +18 |
| `e80dec6` | test(tester): CLI integration for selfcheck+coverage+classify+generate | +15 |
| `5697a18` | test(tester): regression coverage for 10 audit fixes F-001..F-014 | +12 |
| `0b16a09` | test(tester): classifier error paths (invalid-key, rate-limit, RO FS) | +4 |

**Baseline:** 236/236 → **285/285** (+49 tests, +3 files, zero regressions).

### What shipped

**T-006 `tester untested`** — aggregates + ranks open work items from four sources across a target project (`coverage/*.yaml` missing, `AUDIT_GAPS.md` Open rows, `DEVELOPMENT_STATUS.md` TODO unchecked, `Reports/*.json` non-resolved findings). Output modes: ascii (default) / json / markdown. Wired into CLI at [src/cli/index.ts:224](src/cli/index.ts#L224).

**PAS 1 CLI integration (+15 tests)** — spawn tests for `tester selfcheck`, `tester coverage --feature`, `tester lessons classify --force-heuristic`, `tester generate --from-prisma` covering happy path + failure modes + flag interactions. Closes the read-only integration gap on the 4 CLI commands shipped earlier in the day.

**PAS 2 audit-fix regression (+12 tests)** — new dir `tests/audit-fixes/` with source-pattern assertions that block reverts of F-001..F-014 fixes (Master + website-guru sibling repos). Skip cleanly when siblings absent.

**PAS 3 classifier error paths (+4 tests)** — invalid-key fallback, rate-limit saturation, read-only FS cache, signature stability under noisy fields. Module-level `vi.mock('@anthropic-ai/sdk')` removes network dependency (18s → 20ms).

### Lessons learned (L-S19)

**L-S19 — Test-file count (27) ≠ test quality.** File count is a lagging indicator; what matters is depth per feature (happy + edge + failure + error), integration coverage (spawn-based CLI tests beat pure unit tests for surface contract), and regression lock-in (pattern assertions on shipped fixes prevent silent reverts). This session: +49 tests across 3 files ≥ prior sessions' +54 across 12 files, but the distribution (CLI integration + audit-fix patterns + classifier error paths) produces meaningfully different confidence per LOC. Rule: when asked "are we well-tested?" answer with coverage of failure modes + integration paths + regression patterns, not file counts.

### TODO (next sessions — resume point)

**Locked roadmap order** (per `Master/knowledge/Tester-Resume-Prompt-2026-04-24.md`):
- **T-007** retry backoff extension (~0.5d) — extend `executor.ts:152-158` with exponential backoff + settle extension per T-007 spec
- T-008 visual baseline + S3 adapter (~1.5d)
- T-009 a11y baseline + budget (~0.5d)
- T-010 Lighthouse perf budget (~1d)
- T-A1 `tester init <feature>` (~0.5d)
- T-A3 session-state recorder (~1d)
- T-B1..T-B3, T-C1..T-C5, T-D1..T-D4

**Follow-ups (non-blocking):**
- T-001 Day-2 browser probes (Puppeteer fixtures)
- T-005 generators (OpenAPI, Zod)
- 8 deferred audit findings (F-006, F-009..F-011, F-015..F-018)
- Importer corpus activation — 42 stubs from `Master/knowledge/lessons-learned.md` (review + fill detection regex)
- T-006 `--since <sha>` filter (deferred from this session's MVP)

---

## Earlier session (2026-04-24 latest, preserved)

Last Updated: 2026-04-24 (latest) — +T-004 AI classifier +T-005 Prisma test generator (MVP). Roadmap progress 8/27 items.

## Latest Session (2026-04-24 late→latest) — Audit fix cycle + 6 roadmap items

### Current State

**Shipped this session (8 Tester commits + 3 cross-repo):**

T-004 + T-005 added on top of the prior T-001/T-002/T-003/T-C6 + audit-fix work.

**Shipped this session:**
- ✅ **T-C6 Master-side** (commit `32a5e56` in Master) — 15min watchdog warning in mesh/route.ts, persists to `mesh/state/watchdog-warnings.json`
- ✅ **T-C6 Tester-side integration** (commit `f43aef7`) — zombie-scan reads warnings file, surfaces `WD-ACK` tag
- ✅ **E2E audit WG + Dev agents** — 578-line report, 18 findings (3 CRIT + 5 HIGH + 7 MED + 3 LOW), posture 64/100 initial
- ✅ **Top-10 audit fixes** applied:
  - Master (commit `ac5086c`): F-001 dev-agent scope gate, F-002 RED_TEAM benign-context + test-file skip, F-013 planner userConstraints, F-012 sub-pipeline isolation
  - WG (commit `5b35447`): F-003 tester-client server-side guard, F-004 conditional --no-sandbox, F-005 per-field IV v2 format, F-007 rate limit, F-008 per-task credential expiry, F-014 result dedup
  - WG polish (commit `4e1d671`): F-007 rate-limit map bounded
- ✅ **Re-audit** — 6/10 verified RESOLVED (Master 4 fixes not accessible to subagent; verified by me directly via git show)
- ✅ **T-003 AST linter** (commit `4484a2d`) — ts-morph `refineMatches()`, closes L-42 false-positive when `requireDomainAdmin` already present. Added `ast_check` field to lesson schema.
- ✅ **T-001 Harness self-check** (commit `b5c4985`) — `tester selfcheck` CLI with 4 active probes + 2 deferred (browser). Exit codes 0/1/2 per spec.
- ✅ **T-002 Coverage matrix** (commit `a94f276`) — `tester coverage` with --feature/--project/--fail-under/--json; coverage_ratio + critical-missing gating.
- ✅ **T-004 AI Failure Classifier** (commit `30ac792`) — `tester lessons classify <log>`. sha256 signature dedup + persistent cache. AI path via Anthropic SDK (Haiku 4.5); heuristic fallback when no key. 4 verdicts (PRODUCT_BUG/HARNESS_BUG/FLAKE/ENV_MISCONFIG) + remediation.
- ✅ **T-005 Prisma Test Generator MVP** (commit `301f2a9`) — `tester generate --from-prisma <schema> --model <Name>`. Parses Prisma models + emits vitest spec with 3 scenarios (unauth-401 / missing-required-400 / create-read-delete-happy-path).

**Tests:** 236/236 pass (was 183 at session start; +53 new). 27 test files. Zero regressions.

### Commit trail this session (8 Tester + 3 cross-repo)

| Commit | Subject |
|---|---|
| `301f2a9` | feat(tester): T-005 Prisma test generator MVP |
| `30ac792` | feat(tester): T-004 AI failure classifier |
| `a94f276` | feat(tester): T-002 coverage matrix |
| `b5c4985` | feat(tester): T-001 harness self-test battery |
| `4484a2d` | feat(tester): T-003 AST-based linter (closes L-42) |
| `f43aef7` | feat(tester): T-C6 integration — read Master watchdog-warnings.json |
| (website-guru) `4e1d671` | fix(wg): F-007 rate-limit map bounded |
| (website-guru) `5b35447` | fix(wg): audit fixes F-003 F-004 F-005 F-007 F-008 F-014 |
| (Master) `ac5086c` | fix(mesh): audit fixes F-001 F-002 F-013 F-012 |
| (Master) `32a5e56` | feat(mesh): T-C6 Master-side — 15min watchdog warning |

### TODO (next sessions)

**High priority (continues roadmap in locked order):**
- **T-006 `tester untested`** (~1d) — session-awareness query; reads coverage/*.yaml + AUDIT_GAPS.md + DEVELOPMENT_STATUS TODO + git blame; returns ranked untested items.
- **T-007..T-010 extensions** (~3d combined) — retry backoff, visual baseline S3, a11y budget, Lighthouse perf.
- **T-A1..A3** (~2d) — scaffold / install-hooks (done) / session-state recorder.
- **T-B1..B3** (~2d) — coverage-aware scoring, regression-prevention suite, product-vs-harness triage.
- **T-C1..C5** (~6.5d) — pipeline-side guards + analytics. Note: C4+C5 promoted to P0 per Phase 0 data.
- **T-D1..D4** (~5d) — done gate, lib split, docs site, inventory dashboard.

**Polish / deferred:**
- T-001 Day-2 browser probes (Puppeteer + HTML fixtures bundled)
- 8 deferred audit findings (F-006 evaluate validation, F-009 backup verification, F-010 platform timeouts, F-011 selector accuracy, F-015 screenshot memory, F-016 URL format validation, F-017 handler priority, F-018 audit trail expansion)
- F-005 Prisma schema migration for existing v1 credentials (backwards-compatible fallback in place; DB migration optional, user decision)
- **Final audit compare pass (Task C)** — once T-005..T-D4 complete, re-run E2E audit + compare with post-fix baseline; deferred to a future session.

### Lessons learned this session (L-S11..L-S18)

**L-S15 — Anthropic SDK type predicates are brittle across SDK versions.**
Wrote `filter((b): b is { type: 'text'; text: string } => b.type === 'text')` in T-004 classifier. tsc complained because the current `@anthropic-ai/sdk` ContentBlock includes citations on TextBlock. Fix: use plain filter + cast. Rule: avoid structural type predicates on SDK types that revise minor-to-minor; use property cast.

**L-S16 — Default outDir heuristics are trap-prone.**
T-005 originally computed `outDir = <schema>/../../tests/...` assuming two levels up from `prisma/schema.prisma`. Correct is one level up (schema is in `<project>/prisma/schema.prisma`, so one `..` reaches project root). Fixed after tests caught it. Rule: when computing default output paths from input paths, sanity-check against a real project layout, not abstract assumptions.

**L-S17 — sha256 signatures for failure dedup should exclude noisy fields.**
Classifier signature uses assertion + errorMessage + first-3-stack-lines + pageUrl, NOT domSnippet or consoleErrors (which vary between runs). Stability is more valuable than precision here — a false-cache-hit is ~free since the verdict is advisory. Rule: dedup keys should be "what the bug IS," not "what the run captured."

**L-S18 — Prisma schema parsing via regex is good enough for MVP.**
Initially thought T-005 needed ts-morph or the @prisma/internals AST. Regex-based parser in ~40 lines covers models, fields, @id/@unique/@default/@relation attributes — enough to generate CRUD test skeletons. Rule: reach for AST only when regex provably falls short (escaped strings inside schema comments, etc.).

### Lessons learned earlier in session (L-S11..L-S14)

**L-S11 — Stubbed untracked files vanish between sessions.**
Mid-session the build broke because `src/validator/audit-only.ts` + `src/cli/commands/audit-only.ts` (untracked) had disappeared from disk. I restored minimal stubs preserving the import contract. Rule: when `git status` shows `??` on files critical to src/index.ts imports, either git-track them or make them regeneratable — otherwise they're a landmine.

**L-S12 — `validateSteps` does NOT validate CSS syntax.**
Building T-001 I assumed safety.ts would reject `[href!=X]`. It doesn't — syntax rejection lives in L-F2 detection regex + Puppeteer runtime. Probe had to pivot to verify the layered defence rather than a non-existent shape check. Rule: inspect exported function behaviour, not README claims.

**L-S13 — Subagent re-audits have sandbox scope limits.**
Post-fix re-audit verified 6/10 (WG) but flagged 4 Master fixes as unverified due to Master repo access limitation. Verified manually via `git show`. Rule: for cross-repo re-audits, pass explicit `--master-path` flag or merge prompts for both repos.

**L-S14 — ts-morph startup cost matters — share the Project instance.**
Naive instantiation added ~40ms per scan. Cached shared Project eliminates overhead. Rule: for any ts-morph integration, share Project across invocations.

### NO-TOUCH CRITIC compliance

All changes additive. DO NOT MODIFY zones untouched:
- Tester: assertion engine, BFS crawler, reporter format, rate limiter, template fallback
- website-guru: browser agent safety constraints (strengthened on VPS via conditional flag), fix engine dispatch flow (additive pre-checks), audit scoring, Stripe webhook

Ledger updated: `reports/DIRECT-CHANGES-2026-04.md` pending entries for this session's audit-fix commits (TODO next session).

---

## Earlier sessions (preserved)

Last Updated: 2026-04-24 (T-000 Active Lessons Engine + T-C6 zombie-scan shipped)

See git log for full detail. Brief:
- T-000 Active Lessons Engine shipped end-to-end (4 days compressed into one session)
- T-C6 Tester-side zombie-scan CLI
- Phase 0 self-diagnosis + roadmap revision
- 6 active seed lessons, 42 importable stubs from Master prose
- 183/183 tests (→ 214 after this session)

---

Last Updated: 2026-04-22 (Journey Audit shipped + npm publish v0.2.0)

## Session (2026-04-21 → 2026-04-22) — Journey Audit + npm publish

- NEW CLI: `tester journey-audit` — real-browser user-journey walker
- Config resolution: `--config > ./.journey-audit.json > --project` packaged
- Scope rename: `@aledan/tester` → `@aledan007/tester`
- Published @aledan007/tester@0.2.0 on npm
- TradeInvest config decentralized
- Journey audit verified: 14 OK / 2 HAS_ERRORS / 4 GATED

---

Last Updated: 2026-04-04 (AVE Ecosystem Repair)

- Static landing page via nginx; ESM imports fixed; CORS restricted; security headers
- E2E audit: 0 FAIL, 0 WARN
- Production URL: https://tester.techbiz.ae (VPS1, PM2, port 3012)

### API Endpoints (current)
- GET /api/health
- POST /api/test/start
- GET /api/test/:id/status
- GET /api/test/:id/results
- GET /api/test/:id/report
