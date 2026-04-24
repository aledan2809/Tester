# Project Status - Tester

Last Updated: 2026-04-24 (T-000 Active Lessons Engine + T-C6 zombie-scan shipped)

## Latest Session (2026-04-24) — T-000 Full Ship + T-C6 Tester-side

### Current State

**Shipped:**
- ✅ **T-000 Active Lessons Engine** — COMPLETE end-to-end. 10 CLI subcommands (`list`, `scan`, `diagnose`, `stats`, `validate`, `install-hooks`, `import`, `promote`), 6 active seed lessons (L-F2, L-F8, L-F10, L-05, L-24, L-42), 42 importable stubs from Master prose corpus. Meta-test gate per Phase 0.4 PASSES.
- ✅ **T-C6 Tester-side** — `tester zombie-scan` CLI shipped. Non-destructive L-24 preventive tooling. Reports Master pipelines at risk of zombie cleanup BEFORE the 30min auto-failure.
- ✅ **Phase 0 self-diagnosis** — 3 reports (CODE_SURVEY, LESSONS_INVENTORY, PIPELINE_FAILURE_SIGNATURES) grounded the roadmap in real data (59% lesson recurrence, 44% zombie failure share, 100% of failures concentrated in "auto" phase).

**In progress:** nothing active; all session scope complete.

**Tests:** 183/183 pass (baseline was 85 → +98 new), 22 test files, zero regressions on pre-existing assertion engine / BFS crawler / reporter / rate limiter / template fallback.

### TODO (next sessions)

- [ ] **T-C6 Master-side** — `waiting_watchdog` state emission at 15min idle (half of 30min cleanup threshold) in Master `src/app/api/mesh/route.ts`. Cross-repo scope; do in dedicated Master-focused session to avoid L40 scope creep.
- [ ] **T-001 Harness Self-Test Battery** — `tester selfcheck` (CSS selector validator, timing fixture, selector fragility scorer). T-000 blocks this but now unblocked.
- [ ] **T-002 Coverage Matrix YAML** — `tester coverage --feature <x>` + per-project coverage/ dir convention.
- [ ] **T-003 AST-based linter** — closes L-42 regex limitation (currently has `// lessons:skip L-42` escape hatch). Uses ts-morph.
- [ ] **T-004 AI Failure Classifier** — AIRouter integration with sha256 signature dedup + cache.
- [ ] **T-005 Test Generator** — from Prisma schema, OpenAPI, Zod schemas.
- [ ] **T-006 `tester untested`** — session-awareness query.
- [ ] **T-007..T-010 extensions** — retry backoff, visual baseline, a11y budget, Lighthouse perf budget (all PARTIAL-EXISTS per Phase 0.1; small extensions, not greenfield).
- [ ] **T-A1..A3** — scaffold / install-hooks (DONE) / session-state recorder.
- [ ] **T-B1..B3** — coverage-aware scoring / regression-prevention suite / product-vs-harness triage.
- [ ] **T-C1..C5** — pipeline-side integrations (revised priorities: C4+C5 P0, C2 P1, C3 P2, C1 HOLD after C4).
- [ ] **T-D1..D4** — done gate / lib-service split / docs site / inventory dashboard.
- [ ] **Importer corpus activation** — review 42 stubs from Master prose corpus → fill detection regex → move to lessons/ as active YAMLs.
- [ ] **Promote `--apply`** (deferred post-T-000 polish) — auto-mutate YAML severity on hit-count promotion. Deferred intentionally to avoid CI-driven severity bumps without human sign-off (NO-TOUCH CRITIC).

### Recent Changes (this session, 8 commits)

| Commit | Subject |
|---|---|
| `4ef8271` | feat(tester): T-C6 — zombie-scan CLI (L-24 preventive tooling) |
| `4bb6358` | feat(tester): T-000 Day-4 — promote + validate --run (FINAL) |
| `d285bba` | feat(tester): T-000 Day-3 — validate + hooks + importer + regression battery |
| `b71a429` | feat(tester): T-000 Day-2 — diagnose + stats + corpus expansion |
| `ce84716` | fix(tester): T-000 Day-1 polish — 3 gap closures + CLI tests |
| `0da0106` | feat(tester): T-000 Day-1 active lessons engine |
| `d036344` | docs(tester): correct zombie count 31%→44% |
| `ace5d34` | docs(tester): phase 0 self-diagnosis revises roadmap |

### Technical Notes — Lessons Learned (this session)

**L-S1 — Subagent bucketing split related signals; always re-aggregate.**
Phase 0.3 subagent split zombie failures into clusters C5 ("Zombie cleanup: process X dead") and C10 ("Other unique zombie PIDs"). My first synthesis took only C5 (n=32, 31%) and missed C10 (n=12). Real number = 44/99 = 44%. Independent jq re-verification caught it after user challenge. **Rule:** when reading subagent cluster outputs, collapse signature variants (per-PID, per-timestamp, per-path) back into regex-class buckets BEFORE accepting count metrics. The forward guardrail is now documented in `TODO_PERSISTENT.md` Addendum — T-000 detection rules and T-C5 analytics must expose per-regex-class counts, not just per-exact-signature.

**L-S2 — Shell pipes eat exit codes unless `set -o pipefail`.**
My initial CLI audit showed `exit=0` on commands that actually exited 1, because `$CLI ... | tail -N` propagates tail's exit, not CLI's. Led to a false "exit code bug" claim that wasted ~15 min. **Rule:** any exit-code verification bash script must start with `set -o pipefail`, or use `${PIPESTATUS[0]}`, or avoid pipes entirely. Direct `node dist/cli.js ...; echo $?` is the cleanest pattern for audit.

**L-S3 — `\s` in regex char classes matches newlines; use `[ \t]` for line-bounded capture.**
My first skip-directive regex was `[A-Za-z0-9_\-,\s]+` — intended to match "L-F2, L-F10" on one line, but `\s` ate newlines and greedily consumed subsequent code tokens ("L-F2\n document...") making the skip-id set junk. Tests caught it. **Rule:** for line-bounded captures use `[ \t]` (space/tab only) or explicit `[^\r\n]`. Only use `\s` when intentionally multi-line.

**L-S4 — Self-referential scanner traps: add skip directives FROM THE START.**
Scanner walking the Tester repo flagged 26 matches inside `tests/lessons/scanner.test.ts` (positive-case fixtures containing F2/F8/F10 patterns as INTENTIONAL defects). Fix: `// lessons:skip-all` directive at top of file, scanner honors it. **Rule:** any lint/scan tool operating on its own tests MUST have a file-level skip directive mechanism in the Day-1 design, not Day-3 retrofit.

**L-S5 — Hardcoded count assertions break on corpus growth; use `>= N` + seed-id checks.**
CLI tests asserted `count === 3` — broke when corpus grew 3 → 6 after Day-2 expansion. Fix: `count >= 3` + `ids.has('L-F2')` + `ids.has('L-F8')` etc. **Rule:** any test on a corpus that grows over time must be robust to future additions. Assert lower bound + specific required members, not exact size.

**L-S6 — macOS APFS case-insensitive FS: `Reports/` and `reports/` resolve to same inode.**
Gitignore on `reports/` (lowercase) matched my `Reports/` (capital). Had to `git add -f`. Filed inodes showed both resolve to same path. **Rule:** cross-platform repos: prefer lowercase dir names OR explicit gitignore patterns with case-sensitivity flag. For Phase 0 deliverables, force-add was the right call with clear commit message disclosure.

**L-S7 — Commander `--no-X` boolean semantics: default `true`, flag sets `false`.**
`opts.failOnMatch` defaults to `true` when flag absent; only set `false` when `--no-fail-on-match` passed. My check was `!== false` (works for both undefined default path and explicit `true`). **Rule:** always test boolean commander options with `!== false` pattern, not `=== true` — the latter breaks when default is undefined.

**L-S8 — Vitest include glob defaults to `*.test.ts`, not `*.spec.ts`.**
My first test files were named `.spec.ts` — silently ignored by vitest until rename. **Rule:** before shipping tests, check the project's `vitest.config.ts` `include` glob. When in doubt, `.test.ts` has wider ecosystem compatibility.

**L-S9 — Honest verification IS the multiplier.**
User's "tu ai verificat?" challenge on Day 1 triggered independent jq re-runs that surfaced the 31%→44% miscount. Without that re-verification, commit `ace5d34` would have shipped a documented-as-canonical but wrong metric. **Rule:** `feedback_verification_ritual` memory is load-bearing. On any "claim + done" sequence, run an independent verification command before treating claim as canonical. The cost (2 min) is negligible vs the cost of enshrining wrong data in roadmap.

**L-S10 — Signature bucketing in automated analytics is not a detail — it's architectural.**
The Phase 0.3 subagent was technically correct (C5 and C10 ARE different exact signatures), but the downstream consumer (my synthesis) needed a higher-level aggregation. This mirrors the broader lesson about lesson-detection rules themselves: count by regex-class, not by raw-message identity. **Rule:** for any frequency-count surface (pipeline analytics, lesson hit counts, failure signatures), design two counting levels: (a) exact signature, (b) regex-class. Expose both. Consumers choose.

### Known limitations (documented, have escape hatches)

- **L-42 regex false-positives** on files containing BOTH `requireAdmin()` AND `requireDomainAdmin()` — regex can't express "absence of". Escape hatch: `// lessons:skip L-42`. Proper fix = T-003 AST-based linter.
- **Promote `--apply`** — dry-run only by intent. Auto-mutate YAML without human sign-off breaks NO-TOUCH CRITIC. Add when governance protocol exists.
- **T-C6 Master-side** — 50% shipped (Tester preventive CLI). `waiting_watchdog` state emission at 15min pending cross-repo session.

### NO-TOUCH CRITIC compliance this session

All changes additive. Zero edits to DO-NOT-MODIFY zones (assertion engine, BFS crawler, reporter format, rate limiter, template fallback). 21 pre-existing CLI flags byte-identical. HTTP API surface consumed by Website Guru unchanged. Ledger in `reports/DIRECT-CHANGES-2026-04.md` updated at every commit (per §2d protocol).

---

## Earlier sessions (preserved)

Last Updated: 2026-04-22 (Journey Audit shipped + npm publish v0.2.0)

## Latest Session (2026-04-21 → 2026-04-22) — Journey Audit + npm publish

### Changes
- ✅ NEW CLI command: `tester journey-audit` — real-browser user-journey walker (Puppeteer-based, 156KB CLI bundle)
- ✅ Config resolution chain: `--config <path>` > `./.journey-audit.json` > packaged `--project <name>` (decentralized, project-owned)
- ✅ Resolved pre-existing merge conflict on `src/server/middleware.ts` via hybrid: kept `cookies?` optional from OURS + added SessionPayload + in-memory store + getSession/revokeSession/sessionCount helpers from THEIRS. No breaking change for createSession callers.
- ✅ Renamed scope: `@aledan/tester` → `@aledan007/tester` (npm scope must match owning user `aledan007`)
- ✅ Published `@aledan007/tester@0.2.0` on npm registry → propagated and verified via `npx --yes @aledan007/tester@0.2.0 journey-audit`
- ✅ Files in tarball: `dist/` + `journey-audit/configs/tradeinvest.json` + `journey-audit/README.md` (packaged central-registry fallback for `--project <name>`)
- ✅ Master/CLAUDE.md option [8] now routes to `npx @aledan007/tester journey-audit` (no per-project bundling)
- ✅ TradeInvest config decentralized to `<project>/.journey-audit.json` (deleted from Tester central; kept tradeinvest.json as packaged template)
- ✅ Journey audit verified end-to-end on TradeInvest: 14 OK / 2 HAS_ERRORS / 4 GATED (consistent across local + cold-npx invocations)

### Deployment
- npm: https://www.npmjs.com/package/@aledan007/tester
- Tester repo: 2 local commits (rename + journey-audit feature) — NOT pushed to GitHub yet (deferred awaiting user OK; respects unfinished pre-existing work in working tree)
- Master repo: 2 commits pushed (CLAUDE.md + CHANGELOG.md updates for option [8])
- TradeInvest repo: `.journey-audit.json` + .gitignore committed and pushed

### Pending (user)
- ROTATE npm token `npm_8mdMaMy4Gy...` (exposed in conversation; delete on npmjs.com → Settings → Tokens)
- Push Tester local commits (after deciding what else to commit from pre-existing untracked/modified work)

---

Last Updated: 2026-04-04 (AVE Ecosystem Repair)

## Session (2026-04-04)

### Changes
- ✅ Static landing page via nginx (was 404 on root)
- ✅ ESM imports fixed in dist/ (15 files — .js extensions added)
- ✅ CORS restricted to *.techbiz.ae + localhost (was wildcard *)
- ✅ Security headers: HSTS, X-Frame-Options, nosniff (global nginx)
- ✅ Commit: `732af58` on VPS1
- 🎯 E2E audit: **0 FAIL, 0 WARN**

### Deployment
| Field | Value |
|-------|-------|
| Production URL | https://tester.techbiz.ae |
| VPS1 | 187.77.179.159:3012 |
| PM2 name | tester |
| Dir | /var/www/tester |
| Type | Express API (no frontend) |

### API Endpoints
- GET /api/health — health check with job counts
- POST /api/test/start — start test job
- GET /api/test/:id/status — job status
- GET /api/test/:id/results — job results
- GET /api/test/:id/report — HTML report
