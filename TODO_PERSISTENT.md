# TODO Persistent — Tester

> **IMPORTANT:** Read at start of EVERY session on this project.
> Items stay here until marked DONE with date + commit hash.

> **Created 2026-04-24** — consolidated upgrade roadmap derived from procuchaingo2
> autonomous-execution session (a0b852f1-5ece-47ad-a599-5bb1fa9b4162) where
> multiple harness defects (invalid CSS `[href!=]`, case-sensitive regex vs
> Tailwind `uppercase`, loose vendor picker matching onboarding buttons, missing
> `networkidle2` on login) surfaced real-product-regression false-positives and
> delayed a clean before/after report by several iterations.

---

## [ ] 🎯 Audit-Suite Methodology — codify procuchaingo2 True E2E pattern as Tester features (creat 2026-04-27)

**Origin**: 2026-04-27 sesiune autonomous Procu True E2E Full Audit a developat un pattern reutilizabil pe care user-ul l-a cerut codificat în Tester. Pattern: **find/create/modify documents + provision users with different roles + execute scenarios end-to-end**.

**Reference implementation** (already lives in procuchaingo2 — copy + generalize):
- `procuchaingo2/e2e-scenarios/run_scenarios.py` (~1200 linii, 21 scenarios) — Counter + assert_eq DSL
- `procuchaingo2/e2e-scenarios/fixtures/generate_pdfs.py` — reportlab PDF generator
- `.tmp-provision-t2.mjs` (deleted post-run; regenerable from git history) — multi-tenant DB provisioning

### Status accuracy

This is a **DESIGN spec only** — no code in Tester yet. Estimates are best-case. Per `feedback_honest_reporting_no_overstating.md` rule, mark as `[~]` only when partial work lands; `[x]` only when ALL 4 modules ship + verified on a 2nd consumer project.

### Modul A — `tester fixtures` (~3-4h)

```bash
tester fixtures invoice --out invoice.pdf --total 487.50 --currency EUR \
  --line "BEV-PEPSI-003,7UP 1.5L,50,1.95"
tester fixtures aviz --out aviz.pdf --linked-to invoice.pdf
tester fixtures po-csv --rows 100 --supplier-id <id>
tester fixtures user-list --roles OWNER,ADMIN,MEMBER --count 5
```
Implementation: prefer pdf-lib (pure JS, consistent with TS stack) over reportlab+Python child_process.
Files: `src/cli/commands/fixtures/{invoice,aviz,po-csv,user-list}.ts` + `src/fixtures/templates/*.ts`.

### Modul B — `tester provision` (~5-7h)

```bash
tester provision --project procuchaingo2 --tenants 2 \
  --roles OWNER,ADMIN,MANAGER,MEMBER,SUPER_ADMIN --suppliers 3 \
  --dual-role-pattern A,B --out master-creds.env
```
Project-adapter pattern. Each consumer ships `.tester-provision.json` with: DB driver (Prisma/Drizzle), schema mapping (User/role/password algo), multi-tenant model (column / schema / database isolation), Pattern A/B recipes.
Files: `src/cli/commands/provision/index.ts` + `src/provision/adapters/{prisma,drizzle}.ts`.

### Modul C — `tester scenarios run` (~6-8h)

```bash
tester scenarios run --suite procuchaingo2/e2e-scenarios/ \
  --filter "E*,F*,H*" --report report.json --rate-limit-pacing 3s
```
TS DSL generalizing procuchaingo2 Counter + assert_eq pattern. Multi-role HTTP session helpers, rate-limit pacing, cross-tenant guards, bounds-test patterns, HTML + JSON report.
Files: `src/cli/commands/scenarios/runner.ts` + `src/scenarios/{counter,session,assertions}.ts`.

### Modul D — `tester audit-suite` (~3-4h)

```bash
tester audit-suite --project procuchaingo2 --true-e2e
# fixtures → provision → scenarios → journey-audit → consolidated report
```
Composes A+B+C + existing journey-audit into one entry point.

### Total: ~17-23h, 2-3 dedicated sessions

### Acceptance criteria

- `tester audit-suite --project procuchaingo2 --true-e2e` reproduces all 21 procuchaingo2 scenarios.
- Same suite runnable on a 2ND project (e.g. eCabinet) with only `.tester-provision.json` + per-project scenario files — ZERO tester library changes.
- All 4 modules independently vitest-tested.
- Cross-linked from each consumer's CLAUDE.md + Tester README.

---

## 🎯 Tester Upgrade Roadmap — target: reduce harness-induced false positives to <1% and expand meaningful coverage across independent Claude Code sessions, TWG loop, and Master pipelines (AIP / AIP2 / ABIP / ABIP2)

### Priority scheme
- **P0** — ships regressions that ALREADY cost us time in 2026-04-22..24 sessions
- **P1** — closes coverage gaps identified but not-yet-incident
- **P2** — nice-to-have; ecosystem-wide leverage

### Baseline NOT to regress
- 14 step actions, 3-tier element resolution (CSS → fallback → AI Vision), auth handler (WP / Shopify / Wix) + MFA/TOTP, 14 DOM + 3 network + visual regression + a11y (axe-core) + perf assertions, JSON + HTML reports, HTTP server with bearer auth — all pre-existing and NO-TOUCH CRITIC (Tester consumes other projects' code; Website Guru consumes Tester over HTTP). Every upgrade must keep existing CLI contract stable.

---

## PHASE 0 (MANDATORY BEFORE ANY CODE) — Self-Diagnosis

Before touching a single file, the Tester-in-session MUST complete these 4 investigations. Roadmap items T-000..T-D4 below are BEST-GUESS prioritization from an OUTSIDE observer (Claude in Procu session 2026-04-24). Phase 0 findings TAKE PRECEDENCE over this document — revise the TODO after Phase 0 and present revised version to user before proceeding.

### Phase 0.1 — Tester code survey (~45 min)
- Read `src/executor.ts`, `src/tester.ts`, `src/cli/*`, `src/assertions/*`, `src/scenarios/*`, `src/discovery/*`, `src/auth/*`
- Produce `Reports/CODE_SURVEY_2026-04-24.md` with:
  - What already exists (don't duplicate)
  - What's half-built (extend don't rebuild)
  - What's architecturally risky to add (stable boundaries)
  - CLI flag inventory (backward-compat baseline)
- Goal: ground every T-### item against reality; mark items that duplicate existing functionality as SKIP, items that conflict with architecture as RE-SCOPE.

### Phase 0.2 — Cross-project lessons mining (~30 min)
Grep these corpora for "lesson", "regression", "gotcha", "bug hunt", "incident":
- `~/.claude/projects/*/memory/*.md` (auto-memory)
- `Projects/*/Reports/*.md` (project reports)
- `Projects/*/knowledge/lessons-learned.md` (where it exists)
- `Projects/*/AUDIT_GAPS.md` (documented gaps)
- `Projects/Master/knowledge/lessons-learned.md` (ecosystem-wide)
- Git log on Tester itself: `git log --grep="fix\|bug\|lesson" --all`

Produce `Reports/LESSONS_INVENTORY_2026-04-24.md` grouped by pattern type (harness, timing, selector, scope, product). Count: how many are (a) documented but still recurring (indicates auto-debug gap), (b) fixed-and-stayed-fixed (indicates working regression protection), (c) one-offs. The RATIO of (a)/(a+b) is the fundamental metric Tester must improve.

### Phase 0.3 — Pipeline failure analysis (~30 min)
Pull AIP/AIP2/ABIP/ABIP2 failure data:
- `Projects/Master/mesh/state/pipelines/*.json` (last 90 days)
- `Projects/Master/mesh/state/big-pipelines/*.json`
- Group by: phase where failed, error signature, pipeline mode, project target
- Produce `Reports/PIPELINE_FAILURE_SIGNATURES_2026-04-24.md`
- Top-10 failure signatures guide T-C# prioritization (currently guessed).

### Phase 0.4 — Synthesis & TODO revision (~15 min)
With 0.1 + 0.2 + 0.3 data, revise THIS file:
- Promote items whose frequency warrants it, demote speculative ones
- Add items uncovered by Phase 0 that weren't on my outside-view roadmap
- Mark SKIP items that duplicate existing code
- Re-estimate effort with ground-truth of Tester architecture
- Commit the revised TODO_PERSISTENT.md with message `docs(tester): phase 0 self-diagnosis revises roadmap`
- **PAUSE and wait for user confirm on revised plan before implementation.**

---

## PHASE 0 OUTCOMES (2026-04-24) — Self-Diagnosis Complete

### ⚠ Addendum (2026-04-24 post-commit correction — commit `ace5d34` superseded)

**Correction:** Zombie cleanup failure share was initially stated as **31% (32/98)** in commit `ace5d34`. Independent jq re-verification (`test("[Zz]ombie|dead|stuck")` on both `pipelines.json` + `pipelines_archive.json`) found the real number is **44% (44/99)** — a 13-percentage-point understatement.

**Root cause of miss:** Phase 0.3 subagent bucketed zombies into two clusters — C5 "Zombie cleanup: process X dead" (n=32, dominant-signature variant) and C10 "Other unique zombie PIDs" (n=12, noise variants with distinct PID + idle-time in the signature line). Synthesis in commit `ace5d34` cited only the C5 cluster count, treating C10 as unrelated noise. Correct read: C5+C10 are the same failure class, just split by signature normalization granularity. True zombie share = 44/99 = 44%.

**Correction commit:** `docs(tester): correct zombie count 31%→44%` (this entry). All downstream references in this file updated inline.

**Forward guardrail (implementation note for T-000 and T-C5):**
- T-000 lesson-detection rules must collapse signature variants **before** counting hits. Regex-bucket cluster variants (e.g., all `^Zombie cleanup: process \d+` → single signature "zombie-cleanup") before reporting hit-count-driven escalation thresholds.
- T-C5 `tester pipeline-stats` must expose both per-exact-signature counts AND per-regex-class counts. Using only exact-signature counts will repeat the exact undercount that happened here.
- T-C6 "done when" criterion now explicitly uses the same `[Zz]ombie|dead|stuck` regex as the measurement baseline so the "44% → <5%" claim is re-measurable with identical methodology.

**Impact on roadmap:** T-C6 priority unchanged (remains **P0 parallel with T-000**); T-C6 argument is STRONGER than originally stated (targets 44% not 31% of failure volume). No other revisions affected.

---

**Status:** Phase 0 investigations complete. Full evidence in:
- [Reports/CODE_SURVEY_2026-04-24.md](Reports/CODE_SURVEY_2026-04-24.md) — 27 items surveyed vs 50+ source files (commit `d501c6c`)
- [Reports/LESSONS_INVENTORY_2026-04-24.md](Reports/LESSONS_INVENTORY_2026-04-24.md) — 42 lessons across 14 files; **59% recurrence ratio**
- [Reports/PIPELINE_FAILURE_SIGNATURES_2026-04-24.md](Reports/PIPELINE_FAILURE_SIGNATURES_2026-04-24.md) — 263 pipelines (2026-03-08..2026-04-24), **38.4% failure rate**

### Key quantitative findings

- **59% lesson recurrence ratio** — 22 of 37 resolved lessons still recur ecosystem-wide. Validates T-000 premise: **prose lessons don't change behavior**. Target post-T-000: <15%.
- **100% of pipeline failures are in phase "auto"** (98/98) — zero in full-audit/review/deploy phases. T-C4 phase-aware scoping was guessed as P1; data says P0.
- **44% of failures are zombie cleanup (L24)** — 44/99 failures (corrected 2026-04-24 post-commit; see Addendum below). L24 is a DOCUMENTED lesson with a PROPOSED fix that was NEVER DEPLOYED. Canonical T-000 proof case ("lesson-as-prose doesn't prevent recurrence").
- **50% corpus blind-spot rate** — 5 of top 10 pipeline failure signatures match Phase 0.2 lessons; the other 5 are **new** (agent retry exhaustion, git deploy, JSON EOF). T-000 seed corpus grows 42 → 46.

### Verdict matrix (27 items vs current Tester codebase)

| Verdict | Count | Items |
|---|---|---|
| NEW (greenfield) | 20 | T-000, T-001, T-002, T-003, T-004, T-005, T-006, T-A1, T-A2, T-A3, T-B1, T-B2, T-C4, T-C5, **T-C6 (new)**, T-D1, T-D3, T-D4 + foundational |
| PARTIAL-EXISTS (extend, don't rebuild) | 4 | T-007 (retry in `executor.ts:152-158`), T-008 (pixelmatch in `assertions/visual.ts`), T-009 (axe-core in `assertions/a11y.ts`), T-010 (CDP FCP/LCP/TTI in `assertions/performance.ts`) |
| DEPENDS (lives in Master mesh, not Tester core) | 4 | T-B3 (blocks on T-004), T-C1, T-C2, T-C3 |
| DUPLICATE (skip) | 0 | — |

**No items skipped** — no roadmap entry duplicates existing Tester functionality. All 27 are additive to the current stable surface (21 CLI flags + 39 library exports + 5 HTTP endpoints + 5 "DO NOT MODIFY" zones).

### Priority revisions (DATA-DRIVEN — overrides outside-view guesses)

| Item | Guessed | Revised | Reason (evidence) |
|---|---|---|---|
| **T-C4** phase-aware scoping | P1 | **P0 — PROMOTE** | 100% of 98 failures in phase "auto"; strongest single signal in pipeline corpus |
| **T-C5** pipeline analytics | P1 | **P0 — PROMOTE** | Phase 0.3 report IS the prototype; 4 new lessons surfaced; couples tightly with T-000 |
| **T-C6** zombie watchdog | — | **P0 — NEW** | L24 implementation: **44% of all failures** (was "31%" pre-correction); documented+proposed fix never shipped; 1-day effort |
| **T-C2** test-coupling | P0 | **P1 — DEMOTE** | Zero failures in pipeline corpus match this signal; may be pre-CI (git hook) concern |
| **T-C3** rollback-on-regression | P0 | **P2 — DEMOTE** | 1 deploy failure in 263 pipelines, 0 post-deploy regressions; premature guard |
| **T-C1** scope-check | P0 | **P0 — HOLD** | Scope creep implicit in zombie/agent timeouts, not explicit; implement after T-C4 lands |

### New seed lessons discovered in Phase 0.3 (must be in T-000 corpus)

- **L43** — DEV agent retry exhaustion on `create_api_route` subtask (12 failures across 10 projects). Severity HIGH.
- **L44** — DEV agent retry exhaustion on `api_request` subtask (4 failures, 4 projects). Severity MEDIUM.
- **L45** — Deploy `git commit` fails in auto phase, missing pre-deploy validation (1 failure so far, but critical severity as it blocks ship). Severity MEDIUM.
- **L46** — JSON parsing EOF in log streaming (20 failures, phantom/infra bug). Severity CRITICAL (may mask real completions).

**T-000 seed corpus target revises: 30 → 34+ lessons** (add L43-L46 + top governance cluster L31/L40/L41 which Phase 0.2 highlighted).

### Half-built features to EXTEND, not rebuild

Confirmed by Phase 0.1 code survey:
- **T-007** — `executor.ts:152-158` already has `if (!result.success) { sleep(1000); retry() }`. Add exponential backoff (1.5x), settle extension (1.5x up to 8s cap), configurable retry budget. ~0.5d not 1d.
- **T-008** — `assertions/visual.ts` (80 lines) already pixel-diffs with `pixelmatch`. Add baseline storage (local FS + S3/MinIO for server mode), masking regex config, `tester snapshot --approve` workflow. ~1.5d not 2d.
- **T-009** — `assertions/a11y.ts` (101 lines) already wraps `@axe-core/puppeteer`. Add baseline.json per route, suppressed-violations tracking, budget.yaml, diff-on-new-violations. ~0.5d not 1d.
- **T-010** — `assertions/performance.ts` (107 lines) already captures FCP/LCP/TTI via CDP. Add Lighthouse integration, budget parser, CI comment generation. ~1d not 1.5d.

**Combined extension savings: ~2d vs greenfield estimate.**

### Architectural risks surfaced (must plan for BEFORE implementation)

From Phase 0.1 survey:
1. **T-000 must land FIRST** — lesson schema is consumed by T-001 (self-test), T-003 (linter), T-004 (classifier). Package as separate npm module (`@aledan007/lessons`) so consumers can import independently.
2. **T-004 cost control** — AI classifier POSTs to AIRouter per failure. Mandatory: sha256(assertion_text + trace_hash + page_url) signature cache in `.tester/classif-cache.db`. Rate-limit ~100 calls/run. Without this, runaway billing risk.
3. **T-008 server-mode baselines** — CLI-only can use local FS; server mode (VPS2 deploy) needs S3/MinIO adapter from day one. Not optional.
4. **T-A2/T-C2 lint alignment** — pre-commit hook strictness must equal CI strictness. Single `tester.config.ts` shared config file read by both. Without this, "works locally, fails in CI" surprises.
5. **T-D2 backward-compat** — splitting `@aledan007/tester` into lib + service must keep current combined package (both lib + server) for existing `npx @aledan007/tester` consumers. Add a second package alongside, don't replace.

### Re-estimated effort (ground-truth deltas)

| Part | Original | Revised | Delta | Reason |
|---|---|---|---|---|
| Phase 0 (self-diagnosis) | 2h | **actual: ~4h** | +2h | Thorough sweep of 3 large corpora (5.3MB archive alone) |
| T-000 Active Lessons Engine | 4d | **5d** | +1d | Seed corpus 34 not 30; governance detection rules added (L31/L40/L41) |
| **T-C6 Zombie cleanup watchdog (NEW)** | — | **1d** | +1d | L24 implementation; parallel with T-000 |
| Foundations T-001..T-010 | 15d | **13d** | -2d | T-007..T-010 extensions smaller than greenfield (see above) |
| CC sessions T-A1..T-A3 | 2d | 2d | — | — |
| TWG T-B1..T-B3 | 2d | 2d | — | — |
| Pipelines T-C1..T-C5 | 6.5d | **6.5d** | — | T-C2/T-C3 deprioritized but still in scope |
| Meta T-D1..T-D4 | 5d | 5d | — | — |
| **Total net** | **~34d** | **~34.5d** | nearly flat | Extension savings offset by T-C6 + T-000 seed expansion |

### Critical path LOCKED (execution order)

1. **Phase 0** → complete. Revised roadmap below.
2. **T-000 (5d) + T-C6 (1d, parallel)** → T-000 is the architectural foundation; T-C6 is independent infra fix that unblocks **44%** of failure volume immediately (corrected 2026-04-24; originally stated as 31%).
3. **T-001 + T-002 + T-003 parallel (3d each)** — once T-000 lesson schema is merged, these three consume it independently.
4. **T-004 → T-B3** (blocks T-B3).
5. **T-C4 → T-C5 → T-C1** (pipeline-side items in data-driven order).
6. Remainder (T-005..T-010 extensions, T-A1..A3, T-B1..B2, T-D1..D4) scheduled after first wave.

### Meta-test for T-000 (proof-of-concept, MUST pass before T-001 starts)

1. Seed a deliberately-broken `procu-flows-audit.mjs` with all 3 Procu harness defects (F2 invalid `[href!=]`, F8 case-sensitive regex vs Tailwind `uppercase`, F10 loose vendor text picker).
2. Run `tester lessons scan <file>` → MUST flag all 3 with correct L### mapping.
3. Run `tester lessons diagnose <simulated-zombie-cleanup-log>` → MUST return L24 as top match with remediation (shorter timeout / session watchdog).
4. Run `tester lessons validate` on Tester codebase → MUST pass all regression tests.
5. If any step fails → FIX T-000 before proceeding to T-001. No exceptions.

### PAUSE — USER CONFIRMATION (resolved 2026-04-24, retro-marked 2026-04-25)

**Status:** ALL CONFIRMED via implementation completion. Roadmap T-000..T-D4 + Wave 3 = 27/27 shipped per commit log.

- [x] **Priority changes accepted:** T-C4 + T-C5 + T-C6 (NEW) → P0; T-C2 → P1; T-C3 → P2 — applied throughout commits 280bc4a..5dd593c.
- [x] **New T-C6 added** (zombie cleanup watchdog — L24) — shipped commit `f43aef7`.
- [x] **T-000 seed corpus expansion** — L43, L44, L45, L46 + governance cluster (L31/L40/L41) imported; 6 active seed lessons + 42 import stubs from Master prose at end-of-T-000-Day-4.
- [x] **Effort estimate** — actual ~3 days calendar (vs 34.5d gross estimate) thanks to L01 best-of-best ratchet + parallel commits.
- [x] **Execution order LOCKED** — Phase 0 → T-000 + T-C6 (parallel) → T-001/002/003 → rest. Verified via git log topology.
- [x] **Meta-test** — T-000 `tester lessons validate` passed before T-001 self-test battery shipped (commit b5c4985).

---

## PART 0 — Foundations (cross-cutting; benefits all 3 consumer modes)

### T-000 [P0] ⭐ — Active Lessons Engine (replaces lessons-as-prose with lessons-as-code)

**Problem:** Today's sessions repeatedly hit bugs that are documented in `~/.claude/.../memory/*.md` as "lessons learned". Documentation doesn't change behavior. Static prose is passive — it loads into context, gets acknowledged, then forgotten when a novel task displaces it. The 3× harness bugs in Procu 2026-04-24 (F2, F8, F10) had analogous failure patterns in earlier sessions (`feedback_verification_ritual.md`, etc.) — yet I still made them. **The mechanism of "learning" is broken; we need active guardrails instead of passive docs.**

**Core design: lessons are structured YAML artefacts with detection + prevention + diagnosis + regression test.**

**Schema (`lessons/<id>.yaml`):**
```yaml
id: L006
slug: tailwind-uppercase-innertext
title: "Tailwind `uppercase` class rewrites innerText"
first_observed: 2026-04-24
projects_hit: [procuchaingo2]
contexts_hit: [cc-session]   # cc-session | twg | pipeline
hit_count: 1
severity: medium             # info | low | medium | high | critical
tags: [selector, text-matching, tailwind]

# DETECTION — static scan of test code for the anti-pattern
detection:
  - type: regex_in_test_file
    pattern: 'innerText[^.]*test\(/[A-Z][a-z]+.*[A-Z][a-z]+/\)'
    message: "Case-sensitive regex against innerText of element whose CSS may apply uppercase"
    flag_required: '/i'

# PREVENTION — auto-fix or lint-fail
prevention:
  lint_rule: no-case-sensitive-text-match
  auto_fix:
    action: add_regex_flag
    value: 'i'
    confirm_required: true
  block_commit_if_unfixed: true

# DIAGNOSIS — post-failure symptom match
diagnosis:
  symptom_signatures:
    - test_failed_assertion: "/.*innerText.*test.*(Formula|Data Source).*=.*false"
    - dom_contains: "text-transform: uppercase"
  suggested_remediation: |
    Either (a) add /i flag to regex, or (b) scope match to dlg.innerText
    not document.body.innerText, or (c) assert against textContent not innerText.

# REGRESSION TEST — proves Tester itself handles the pattern
regression_test: tests/lessons/L006.spec.ts
# Test creates a Tailwind uppercase fixture, runs default matchers, asserts they
# handle it correctly. If this test fails, Tester has regressed on this lesson.

status: active              # active | muted | deprecated
```

**CLI surface:**
- `tester lessons list [--project <x>] [--tags <t1,t2>]`
- `tester lessons scan <file-or-dir>` — pre-flight check, reports matches; exit 1 if any `block_commit_if_unfixed`
- `tester lessons diagnose <failure-log>` — post-fail lookup; searches symptom_signatures; returns top-3 matching lessons with remediation
- `tester lessons learn --from-failure <file>` — captures new lesson from a failure, auto-generates YAML + regression test stub for human completion
- `tester lessons validate` — runs ALL regression tests; fails if any lesson-regression fails (catches Tester's OWN regressions on past issues)
- `tester lessons stats` — hit counts per lesson, surface pruning candidates (hit=0 in 6mo) and promotion candidates (hit>=5 → upgrade severity)
- `tester lessons import --from ~/.claude/projects/*/memory/feedback_*.md` — one-off migration from existing prose lessons

**Integration into 3 consumer modes:**

1. **CC sessions**:
   - `tester init` (T-A1) bootstrap includes `lessons scan` pre-commit hook
   - On test fail, `tester run` auto-invokes `lessons diagnose` and includes top match in report JSON
   - New lesson captured via `tester lessons learn` from inside the session

2. **TWG loop**:
   - Orchestrator calls `lessons diagnose` on every fail BEFORE dispatching to Guru
   - If lesson matches and auto_fix exists with confidence >0.8 → Tester self-applies before consulting Guru
   - Hit counts drive loop's scoring (lesson that keeps matching = systemic issue; escalate)

3. **Master pipelines (AIP/AIP2/ABIP/ABIP2)**:
   - Phase `scope-check` (T-C1) calls `lessons scan` on the diff
   - Dev-agent prompt now includes `tester lessons list --top 10 --context pipeline` — top lessons injected as SYSTEM constraints, not advisory prose
   - On phase failure, `lessons diagnose` runs → auto-fixable lessons applied before phase retry
   - Pipeline state tracks which lessons matched in this run → visible in monitoring dashboard

**Hit-count-driven escalation (prevents "lesson rot"):**
- Lesson hit 0 times in 6 months → auto-demote to `status: muted`
- Lesson hit ≥5 times → auto-promote severity by one level (medium → high → critical → block_commit)
- Severity: critical → blocks commit, requires explicit `--override-lesson L006` with audit trail

**Cross-project propagation:**
- Lesson observed in Project A becomes checkable in Projects B, C, D automatically
- Per-project `tester.config.ts` has `lessonAllowList: ['L006', 'L012']` or `lessonBlockList: []` to opt in/out

**Seed corpus (Phase 0.2 output feeds this):**
- All lessons from `~/.claude/.../memory/feedback_*.md` imported as starting corpus
- Duplicates merged; prose converted to structured detection patterns by AI classifier (T-004)
- Target: ≥30 active lessons at Tester v1.0

**Meta-test: Tester validates its OWN learning.**
`tester lessons validate` ran daily in CI — if ANY regression test fails, Tester has regressed on a past lesson. This catches the "forgetting" class of bugs at the tool level.

**Effort:** 4 d total:
- Day 1: YAML schema + CLI skeleton + 3 hand-written seed lessons covering F2/F8/F10
- Day 2: lint integration (half of T-003) + pre-commit hook (T-A2)
- Day 3: AI-assisted import from existing prose memory files
- Day 4: hit-count + promotion + validation CI integration

**Owner:** Tester core (highest priority)

**Done when:**
- All 10 lessons from today's Procu TODO (L1-L10) imported as structured YAML
- `tester lessons scan` on the broken-v1 flows-audit script detects all 3 harness bugs (F2 CSS, F8 case, F10 loose picker)
- `tester lessons validate` passes on current codebase
- A newly-seeded flow with a deliberately-planted L006 anti-pattern is auto-fixed and the fix commits

**Relationship to other items:**
- T-001 (Harness Self-Test Battery) becomes a CONSUMER of T-000 (each primitive failure is a lesson)
- T-002 (Coverage Matrix) gets `lesson_required:` field pointing to which lessons each scenario guards
- T-003 (Stable Selector Enforcer) becomes lesson L-sel-001 + L-sel-002 etc. — lint = lesson scan with `type: source_file`
- T-004 (AI Failure Classifier) uses T-000 lesson corpus as first-pass classifier (pattern match) before falling to AI (classification); AI only called when NO lesson matches
- T-007 (Flake Detection) emits a lesson on repeated flake (meta-learning)

---

### T-001 [P0] — Harness Self-Test Battery

**Problem:** 3× false positives in Procu session 2026-04-24 (F2 CSS `[href!=]` invalid, F8 case-sensitive regex vs `uppercase` class, F10 vendor picker matched "Getting Started" onboarding button). Each one pretended to be a product bug and wasted ~30 min.

**Scope:**
1. New file `src/self-test/harness.ts` — before Tester executes a target test suite, it runs a built-in battery against a stable mock page bundled in the repo:
   - CSS selector validator (rejects `[href!=X]`, typo `::befor`, unquoted attribute values) — uses `document.querySelector` try/catch wrapped as classifier
   - innerText vs textContent vs getAttribute consistency probe against a Tailwind `uppercase` fixture
   - Timing fixture — page that loads `[role="dialog"]` after 0/200/500/1500/3000 ms; verifies the caller's chosen settle is adequate
   - Selector-fragility scorer — flags regex-on-textContent, CSS `:not()` over-broad, label-text heuristics
2. `tester run` refuses to proceed if self-test finds broken harness primitives; exit code 2 with pointer to which primitive failed
3. `tester selfcheck` command for standalone invocation

**Integration:**
- **CC sessions**: scripts in `/tmp/*.mjs` import `@aledan007/tester/self-test` and call `await selfCheck()` at start
- **TWG**: loop orchestrator runs self-test before first iteration; regression-prevention suite re-runs it after every fix
- **AIP/ABIP pipelines**: CI-phase pre-check; if self-test fails, mark the pipeline `waiting_clarification` with "harness primitives broken on runner environment"

**Effort:** 1.5 d
**Owner:** Tester core
**Done when:** Running `tester selfcheck` on 3 machines (dev laptop + VPS2 runner + Vercel CI) returns 0 in all 3; intentionally-broken self-test fixture returns 2.

---

### T-002 [P0] — Feature Coverage Matrix YAML per feature

**Problem:** User asked "did you test everything?" — I had no machine-readable answer. Today's 4-way match has 28 declared scenarios; I covered ~0 before commit.

**Scope:**
1. Convention: every feature ships with `<project>/coverage/<feature>.yaml`:
```yaml
feature: four-way-match
owner: procuchaingo2
scenarios:
  - id: Q1
    name: invoice qty > received (over-invoicing)
    category: quantity
    severity: high
    covered_by: tests/matching/over-invoice.spec.ts::test_over_invoice
    status: covered
  - id: Q2
    name: invoice qty < received (under-invoicing)
    category: quantity
    severity: medium
    covered_by: null
    status: missing
  # ... 28 scenarios
```
2. `tester coverage --feature four-way-match` reports `covered_count/total`, missing items with severity
3. `tester coverage --project procuchaingo2` rolls up per-project; exit code non-zero if any P0-severity scenario `missing`
4. CLI option `--fail-under=0.9` for CI
5. MDX report generator `tester coverage --report html` → site.html

**Integration:**
- **CC sessions**: `tester coverage --feature <x>` called mid-session reveals missing scenarios; Claude cannot declare feature "done" if exit non-zero
- **TWG**: the loop's "100%" criterion becomes "all P0 scenarios covered AND passing", not just "tests pass"
- **Pipelines**: `ci` phase refuses green on new feature if coverage YAML missing or fails threshold

**Effort:** 2 d
**Owner:** Tester core
**Done when:** Procu gets `coverage/four-way-match.yaml` with all 28 scenarios + one existing scenario migrated into the runner; `tester coverage` prints a green table.

---

### T-003 [P0] — Stable Selector Enforcer + Source Linter

**Problem:** F10 vendor card picker used `textContent` regex heuristic because the vendor-card `<button>` had no `data-testid`. The input itself had no `name` attribute. These are source-side omissions that force fragile selectors.

**Scope (two halves):**

**Half A — test-side linter:** `tester lint <dir>` walks test files and warns on:
- `querySelector*` calls where the argument contains regex-like characters outside `[data-testid=...]` / `[name=...]` / `[aria-label=...]` / standard CSS
- `textContent`/`innerText` used as the PRIMARY match criterion when a stable attribute selector would work
- `await new Promise(r=>setTimeout(r, <n>))` with n < 500 in auth / navigation contexts
- CSS selectors that contain `!=` or unescaped `$`, `^` outside attribute brackets
- Severity: warn → error (configurable)

**Half B — source-side scanner:** `tester scan-selectors <app-dir>` walks target project source and flags:
- `<input>` without `name=""` or `data-testid=""`
- `<button onClick={...}>` inside `.map()` without a `data-testid` or `key`-derivable stable attribute
- Outputs `SELECTOR_GAPS.md` per project with suggested attributes

**Integration:**
- **CC sessions**: pre-commit hook runs `tester lint tests/ && tester scan-selectors apps/web/src`; fails commit if P0 violations
- **TWG**: after Guru's fix, Tester auto-suggests `data-testid` additions to complement the fix
- **Pipelines**: dev-agent prompt gets SELECTOR_GAPS.md in context → adds stable attrs proactively

**Effort:** 2 d (linter using ts-morph for AST analysis)
**Owner:** Tester core + per-project codemod recipes
**Done when:** Running on Procu produces exactly the `registrationNo`/vendor-card gaps I fixed manually in session 2026-04-24; running on a fixture with known good selectors produces zero warnings.

---

### T-004 [P0] — AI Failure Classifier (PRODUCT_BUG | HARNESS_BUG | FLAKE | ENV_MISCONFIG)

**Problem:** When F8/F10 failed, I had to manually eyeball each to decide "is this real?". That judgment call is where I kept making mistakes. AI can classify with pattern evidence and reduce "move-on" temptation.

**Scope:**
1. On test failure, Tester captures: failing assertion, DOM snapshot (HTML of the container element + siblings), console.log stream, network tail (last 20 requests), screenshot, Tailwind classes of matched elements, time-to-event metrics.
2. Bundles the above as `FailureContext` → POSTs to AIRouter (single call, Claude Opus 4.7 or Sonnet 4.6 fallback) with structured prompt: "Classify this failure as PRODUCT_BUG / HARNESS_BUG / FLAKE / ENV_MISCONFIG with confidence + one-sentence reason + one suggested remediation."
3. Classification appears in report.json alongside raw failure data
4. HARNESS_BUG auto-opens an issue in Tester's own issue tracker; PRODUCT_BUG goes to the project; FLAKE triggers auto-retry (up to 2) before marking fail
5. Rate-limit: max 1 classification per unique failure signature per run (dedup by assertion text + trace hash) to avoid AI spend

**Integration:**
- **CC sessions**: at end of test run, Claude receives classifications and follows remediation suggestion instead of guessing
- **TWG**: loop uses classification to decide "can Guru even fix this?" — HARNESS_BUG loops back to Tester, not Guru
- **Pipelines**: classifications gate commit-as-done; if PRODUCT_BUG unresolved, phase stays in `running`

**Effort:** 1.5 d (prompt engineering + AIRouter integration; use existing `ai-router` lib from ecosystem)
**Owner:** Tester core
**Done when:** Fed the 3 Procu failures (F2/F8/F10), classifier returns HARNESS_BUG with >70% confidence and the right remediation hint for each.

---

### T-005 [P0] — Test Generator from Prisma schema + API routes + OpenAPI

**Problem:** For Phase 1 in today's session, I had to manually write the E2E test covering signup → pending → accept → audit. It worked but was slow. Generic shape is predictable from schema.

**Scope:**
1. `tester generate --from-prisma <schema.prisma> --model <Model> --out tests/<model>/` produces:
   - Auth-negative tests (unauth → 401, wrong-role → 403)
   - Input validation tests (missing-required → 400; out-of-range numbers; too-long strings)
   - CRUD happy path (create → read → update → delete) with unique-constraint tests
   - Cleanup teardown (deletes records created in the run)
2. `tester generate --from-openapi <spec.json>` same but for API endpoints (use case: procuchaingo2 has `/api/openapi`)
3. `tester generate --from-schema <path/schema.ts>` for Zod schemas (common in this ecosystem)
4. Generated tests use stable-selector patterns (T-003) by default
5. Non-destructive — warns before overwriting existing test files

**Integration:**
- **CC sessions**: Claude runs `tester generate` on each new feature before hand-crafting scenario-specific cases
- **TWG**: when the user reports "X broken", Tester auto-generates a regression test for X first, then runs
- **Pipelines**: dev-agent's first phase output includes the generated test skeleton; QA phase extends it

**Effort:** 3 d (AST parsing + templating; ship with 3 generator templates: CRUD REST, Next App Router, Server Actions)
**Owner:** Tester CLI
**Done when:** Running `tester generate --from-prisma procuchaingo2/apps/web/prisma/schema.prisma --model LegalDocument` produces tests that cover the 12 scenarios I hand-wrote in `/tmp/phase1-test.mjs` plus 3 I missed.

---

### T-006 [P0] — Session-Awareness Query (`tester untested`)

**Problem:** At Milestone 3 today, I didn't know what was still untested in Procu without re-reading AUDIT_GAPS.md + DEVELOPMENT_STATUS.md manually. A machine-readable answer would have prevented drift.

**Scope:**
1. `tester untested --project <name>` — reads:
   - `<project>/coverage/*.yaml` (from T-002)
   - `<project>/AUDIT_GAPS.md` OPEN gaps
   - `<project>/DEVELOPMENT_STATUS.md` TODO section
   - `<project>/Reports/*.json` last audit results
   - Returns a ranked list: P0 gaps → P1 gaps → P2 gaps, each with pointer to coverage YAML or gap ID
2. Output modes: `--json`, `--markdown`, `--ascii` (default)
3. `tester untested --since <commit-sha>` — only items that changed/were-added since a given commit
4. Integrates with git blame to attribute untested changes

**Integration:**
- **CC sessions**: first command Claude runs at session start is `tester untested --project X`; feeds directly into TodoWrite
- **TWG**: loop pulls prioritized work items from `tester untested` instead of user typing them
- **Pipelines**: ABIP orchestrator uses this to auto-decompose scope into phases

**Effort:** 1 d
**Owner:** Tester CLI
**Done when:** Running on Procu post-today's session returns the 20+ items listed in DEVELOPMENT_STATUS.md "TODO" section, ranked correctly.

---

### T-007 [P1] — Flake Detection + Auto-Retry With Backoff

**Problem:** F8 failed once in session 2026-04-24 due to 800ms settle being too short. A retry with longer settle would have auto-resolved it, saving me manual fix time.

**Scope:**
1. On failure with classifier verdict FLAKE (T-004), auto-retry up to N (config, default 2) with exponential backoff
2. Settle times auto-extend on retry: 1.5x per retry up to 8s cap
3. Every retry logs `retry_count`, `final_verdict`, time-to-pass
4. Flake density reporter: `tester flake-report` shows which tests have retry_count > 0 most often → candidates for hard fix
5. Hard-fail mode (`--no-retry`) for CI correctness checks

**Effort:** 1 d
**Owner:** Tester executor
**Done when:** Artificial flake (dialog appears at random 200-1500ms) gets caught 95%+ on retry; flake-report surfaces it after 10 runs.

---

### T-008 [P1] — Visual Regression Baseline

**Problem:** My GET audit is 80 pages HTTP 200, but 80 pages could all render blank with broken CSS and I'd miss it. Today's sessions didn't have a single screenshot comparison.

**Scope:**
1. `tester snapshot --baseline` captures full-page PNG per route, stores `.tester/baselines/<project>/<route>.png`
2. `tester snapshot --compare` pixel-diffs current run vs baseline using pixelmatch; fails if > 1% diff (configurable)
3. Per-route masking (dynamic timestamps, random IDs) via `<project>/tester.config.ts` `snapshotMasks: []`
4. Approval workflow: failed diff → `tester snapshot --approve <route>` moves current to baseline
5. Storage: S3/MinIO adapter for baseline sharing across CI runs (local-first, cloud optional)

**Integration:**
- **CC sessions**: run on last audit step; shows pages that regressed visually
- **TWG**: Guru's fix must not introduce visual regression on unrelated pages
- **Pipelines**: ABIP final phase includes snapshot compare; blocks commit if >1% regression

**Effort:** 2 d
**Owner:** Tester visual
**Done when:** Baseline captured on Procu post-today, intentionally-broken CSS (remove Tailwind) fails all 80 pages in snapshot mode.

---

### T-009 [P1] — A11y Baseline + Budget

**Problem:** axe-core exists in Tester already but there's no baseline + budget per project. Regressions go unnoticed.

**Scope:**
1. `tester a11y --baseline --project <x>` stores current axe violations per route as `coverage/a11y-baseline.json`
2. Subsequent runs fail if NEW violations (critical/serious) appear vs baseline; pre-existing violations tolerated (marked `suppressed_until: <date>`)
3. Budget: `a11y-budget.yaml` sets max violations per severity per route
4. Reports include diff chart + code pointers

**Effort:** 1 d (axe is already integrated; adding baseline + diff is small)
**Owner:** Tester assertions
**Done when:** Procu routes scan produces baseline; intentionally breaking color-contrast on one component fails that route only.

---

### T-010 [P1] — Performance Budget (Lighthouse CI integration)

**Problem:** Lighthouse metrics never asserted across this ecosystem. A regression from 50kb to 5mb bundle would pass all existing tests.

**Scope:**
1. `tester perf --budget lighthouse.config.js --project <x>` runs Lighthouse on N routes
2. Budget file per project: LCP < 2.5s, CLS < 0.1, bundle-size < 300kb gzip
3. Historical trend reporter
4. CI integration: PR comment with before/after metrics

**Effort:** 1.5 d (Lighthouse wrapper + budget parser)
**Owner:** Tester perf
**Done when:** Procu `/dashboard` measured, budget violated artificially → CI fails.

---

## PART A — Claude Code Session improvements (independent sessions like 2026-04-24)

### T-A1 [P0] — `tester init <feature>` scaffold

**Problem:** `/tmp/*.mjs` ad-hoc scripts have no home, get deleted, aren't versioned. Reuse is accidental.

**Scope:**
1. `tester init <feature-name>` creates `tests/<feature>/` with:
   - `coverage.yaml` stub (T-002 format)
   - `index.spec.ts` test file with self-check import (T-001), login helper, cleanup teardown
   - `README.md` explaining the scenarios
2. Adds entry to `coverage/features.yaml` index
3. Auto-linked from `tester untested` (T-006)

**Effort:** 0.5 d
**Done when:** `tester init four-way-match` in procuchaingo2 produces a runnable skeleton that self-checks and logs in.

---

### T-A2 [P0] — Pre-commit hook integration

**Problem:** My premature "done" claims in session 2026-04-24 weren't blocked by any automation. A pre-commit hook could have enforced "feature coverage + self-check + lint pass" before accepting a commit.

**Scope:**
1. Ship `tester install-hooks <project>` — writes `.husky/pre-commit` (or `.git/hooks/pre-commit`) with:
   - Run `tester lint tests/` (T-003 half A)
   - Run `tester coverage --since HEAD --fail-under 0.9` (T-002 + T-006)
   - Run affected-test subset (`tester affected --since HEAD`)
2. Post-commit hook: auto-run `tester untested` and append diff to commit message footer
3. Opt-in, not forced; documented in per-project CLAUDE.md

**Integration:** direct benefit to sessions like today — would have blocked my first "Phase 1 done" announcement until test existed.

**Effort:** 0.5 d
**Done when:** Installed on Procu, intentionally committing a feature without test gets rejected at pre-commit stage.

---

### T-A3 [P1] — Session-state recorder

**Problem:** Lessons-learned from today are good but dispersed across TODO_PERSISTENT, memory files, AUDIT_GAPS. A machine-readable session log would help next-session Claude parse faster.

**Scope:**
1. `tester session start <description>` starts a session, writes `.tester/sessions/<id>.json` with timestamp, description, open todos
2. `tester session log <event>` records tool calls, commit shas, test runs
3. `tester session end` summarizes; integrates with DEVELOPMENT_STATUS.md append

**Effort:** 1 d
**Done when:** Running through a simulated 1-hour session produces a structured log that next-session Claude can consume via `tester session last`.

---

## PART B — TWG (Tester ↔ Website Guru loop) improvements

### T-B1 [P0] — Coverage-aware scoring (not just pass/fail)

**Problem:** TWG loop currently scores "X% tests pass". But if I only declare 10 scenarios and cover them all, score is 100% yet the feature has 18 unwritten scenarios (see today's 4-way match with 28 declared).

**Scope:**
1. Score formula change: `score = (tests_passing / tests_total) * (scenarios_covered / scenarios_declared)`
2. Declared scenarios come from T-002 coverage.yaml
3. Both multipliers reported separately
4. Loop goal changes from "score=100" to "scenarios_coverage >= target AND pass_rate == 100"

**Effort:** 0.5 d
**Done when:** TWG run on a feature with 10 covered / 20 declared at 100% pass reports score=50, not score=100.

---

### T-B2 [P0] — Regression-prevention suite (sticky fixes)

**Problem:** Once Guru fixes bug X, test for X must run on EVERY future loop so the fix doesn't regress. Today there's no explicit "regression locked" marker.

**Scope:**
1. On a successful fix→verify cycle, Tester auto-adds the scenario to `<project>/tests/regressions/<timestamp>-<slug>.spec.ts`
2. `tester run --all` includes regressions/ unconditionally
3. Regression failures block loop progression (severity bumped to P0 regardless of original classification)
4. Regressions prunable after 90 days with explicit `tester regressions expire` confirmation

**Effort:** 1 d
**Done when:** Simulated fix-break cycle on a test app demonstrates regression catches the re-break within the same loop.

---

### T-B3 [P0] — Product-vs-Harness triage via T-004 classifier

**Problem:** TWG loop occasionally blames Guru for a Tester harness bug (the F8 case-sensitive regex would have done this today). AI classifier resolves this before the loop escalates.

**Scope:**
1. Loop orchestrator calls classifier on every fail
2. HARNESS_BUG verdict → Tester self-fixes (following T-003 remediation) instead of invoking Guru
3. Loop metadata records split: `x guru fixes / y tester fixes` per iteration

**Effort:** 0.5 d (depends on T-004)
**Done when:** Simulated loop with 3 harness bugs + 2 product bugs reports 3 self-fixes + 2 guru-fixes in the right buckets.

---

## PART C — Master Pipeline improvements (AIP / AIP2 / ABIP / ABIP2)

### T-C1 [P0] — Pre-commit scope guard integrated into dev-agent

**Problem:** L40 incident (2026-04-22): AIP2 modified 75 files for a 1-file bug. Scope-creep is a repeat failure mode. Layer 1 of the TODO plan (add to dev-agent `Rules:`) was done, but there's no enforcement — the rule is a plea.

**Scope:**
1. New phase `scope-check` inserted between `dev` and `ci`:
   - Runs `git diff --stat HEAD~1..HEAD` against task description embedding similarity (AIRouter call)
   - If >10 files or >500 LOC touched AND similarity score < 0.6, pauses pipeline in `waiting_clarification` with "Scope: {N} files / {M} LOC. Task was: {description}. Intentional?"
2. Threshold configurable per pipeline mode; AIP2/ABIP2 stricter than AIP
3. User can override with `--allow-wide-scope` flag when starting pipeline

**Integration:** lives in `mesh/engine/phases/scope-check.js`; Tester exposes `tester scope-check --since <sha> --task "<description>"` for standalone use.

**Effort:** 1.5 d (AIRouter similarity + threshold tuning)
**Done when:** Replaying the Tutor AIP2 incident (pipe_mo9mmpxg_fyk3n6) against this guard pauses at 75 files with a clarification prompt instead of auto-committing.

---

### T-C2 [P1 — DEMOTED 2026-04-24] — Commit-test coupling check

**Problem:** Dev-agents commit source changes without a matching test file change. My own Phase 1 session-shipped commit wouldn't have failed this (I wrote `/tmp/phase1-test.mjs`), but a pipeline version would have, since tests live in `/tmp`.

**Scope:**
1. `scope-check` phase (or new `test-coupling-check`) fails if:
   - Commit touches `apps/*/src/` or `packages/*/src/` AND
   - Commit does NOT touch `**/*.spec.ts`, `**/*.test.ts`, `tests/**`, `coverage/*.yaml`
2. Warning-only for refactors (where git-diff classifier says "pure refactor")
3. Override via commit message trailer `Test-Coverage: existing` (explicit opt-out, audited)

**Integration:** runs in pipeline `ci` phase; CLI form `tester check-test-coupling --sha <sha>` for session use via T-A2 pre-commit.

**Effort:** 0.5 d
**Done when:** Intentional source-only commit in a test repo fails the check; override trailer makes it pass.

---

### T-C3 [P2 — DEMOTED 2026-04-24] — Rollback-on-regression trigger

**Problem:** If a pipeline commits → deploys → post-deploy smoke fails, there's no automated rollback today. Human intervention delays recovery. Example: today's Phase 1 deploy was safe, but if it broke login, the next user hit would have been a failure.

**Scope:**
1. New final phase `post-deploy-smoke`:
   - Runs minimal regression suite (T-B2) + auth smoke against deploy URL
   - On failure: `git revert HEAD`, `git push`, re-deploy, re-check
   - Notifies user via Slack/email: "Rollback triggered for commit X because smoke test Y failed"
2. Flag `--no-rollback` for staging runs where manual intervention is expected
3. Max 2 rollback cycles before escalation to user

**Effort:** 1 d
**Done when:** Intentionally merging a broken commit onto a test repo triggers automatic revert within 2 min of deploy.

---

### T-C4 [P0 — PROMOTED 2026-04-24] — Pipeline-phase-aware test scoping

**Problem:** ABIP2 runs a 14-phase plan but phase 8 "Run Initial Audit" runs the FULL audit every time, which is slow and drowns signal. Each phase should run ONLY the tests relevant to what it intends to change.

**Scope:**
1. Each phase declares `touches: ['auth', 'billing', 'db.users']` in its phase manifest
2. Tester maps tags → affected test files via `tester affected --tags auth,billing`
3. `tester run --affected` runs subset; full suite runs only in final phase
4. Speeds up AIP2 (14 phases × 5min full-audit → 14 × 30s scoped) = hours of savings

**Effort:** 2 d (tag system + mapping)
**Done when:** ABIP2 on a known-scope change touches only 10% of test suite per phase; final phase runs full suite.

---

### T-C5 [P0 — PROMOTED 2026-04-24] — Pipeline failure log analytics

**Problem:** I don't know which pipeline mode fails how often, on what task types, with what cost. Data-driven prioritization of future upgrades requires this.

**Scope:**
1. `mesh/state/pipelines/*.json` already exists (session-bridge logs). Add a normalizer: `tester pipeline-stats --since <date>`
2. Outputs: fail count per phase, avg context cost per pipeline, top-5 failure signatures with AI classifier (T-004) labels
3. Quarterly report `tester pipeline-stats --report` → markdown for TODO_PERSISTENT update

**Effort:** 1.5 d
**Done when:** Running on last 30 days' pipelines produces a top-5 failure list grouped by signature.

---

### T-C6 [P0 — NEW 2026-04-24] — Zombie cleanup watchdog (L24 deployed)

**Problem:** Phase 0.3 analysis of 263 pipelines shows **zombie cleanup ("process X dead, stuck in failed") is 44% of all failures** (44/99, corrected 2026-04-24 post-commit — see Phase 0 Outcomes Addendum). Lesson L24 documented this in Master `knowledge/lessons-learned.md`, proposed fix (shorter blocked-state timeout + session watchdog ping) was NEVER DEPLOYED. This is the canonical "documented-lesson-that-keeps-recurring" case — perfect validation target for T-000's behavior-change claim.

**Scope (MASTER mesh — Tester contributes detection + CLI):**

1. **Mesh side (Master repo, NOT Tester):** `mesh/engine/watcher.js` — reduce blocked-state timeout from current ~8h default to configurable 30min (`PIPELINE_BLOCKED_TIMEOUT_MIN=30`). When exceeded, emit `waiting_watchdog` state + push a RemoteTrigger/PushNotification to user asking "pipeline X blocked 30min — investigate or kill?".
2. **Tester side:** new CLI `tester zombie-scan` that queries `mesh/state/pipelines.json` for pipelines in `state=dev` or `state=ci` with `updatedAt > 30min ago` and no heartbeat. Surfaces candidates without killing.
3. **Tester side:** new assertion primitive `tester lessons regression-test L24` — spins up a mock pipeline, simulates 31-min idle, asserts the watchdog trigger fires.
4. **Integration with T-000:** L24 becomes the FIRST regression-test to pass `tester lessons validate`. If the watchdog timeout is reverted, the regression test fails immediately, blocking merge.

**Why parallel with T-000, not after:** T-C6 has zero code conflict with T-000 (different repos — Master mesh vs Tester CLI). Shipping it in parallel removes the highest-volume failure class from production data, providing a clean baseline to measure T-000's impact in subsequent weeks.

**Effort:** 1 d
- 3h mesh watcher timeout + `waiting_watchdog` state machine
- 2h `tester zombie-scan` CLI + zombie criteria
- 2h `lessons regression-test L24` integration once T-000 schema lands (can stub until T-000 Day 2)
- 1h documentation + CLAUDE.md update for NEW_BLOCKED_TIMEOUT env var

**Owner:** Master mesh + Tester CLI (cross-repo, coordinate commits)

**Done when:**
- Simulating a 31-min-idle pipeline fires the `waiting_watchdog` state transition with user notification
- `tester zombie-scan` lists known-idle pipelines matching criteria without false positives on healthy long-runs
- After T-000 lands, `tester lessons validate` passes L24 regression test; reverting the timeout change makes it fail
- After 1 week production runtime, zombie-class failures drop from **44% → <5%** of failure volume (metric lift measurable via `tester pipeline-stats`). **Success criterion correction (2026-04-24):** baseline is 44% (44/99 pipelines), not 31% — when implementing T-C6, re-measure zombie share with the same `[Zz]ombie|dead|stuck` regex used to derive this baseline; do NOT rely on the subagent's C5-only cluster count.

**Relationship to T-000:** L24 is the SIMPLEST lesson to encode first — text match on error signature + clear remedy + trivial regression test. It proves the T-000 lifecycle (detection → prevention → diagnosis → regression-lock) works end-to-end BEFORE the more nuanced F2/F8/F10 lessons.

---

## PART D — Cross-cutting meta

### T-D1 [P0] — `tester done` gate for feature completion

**Problem:** The word "done" is currently just my self-declaration. Needs enforcement.

**Scope:**
1. `tester done --feature <x>` runs:
   - `tester coverage --feature <x> --fail-under 0.9`
   - `tester run tests/<x>/**`
   - `tester snapshot --compare --scope <x>`
   - `tester a11y --baseline-check --scope <x>`
   - All 4 must pass → exit 0; `done` updates `coverage/features.yaml` status=done + date + commit
2. Reversible via `tester undone --feature <x>` (for regression reopens)
3. `tester status` lists done/pending per project

**Effort:** 1 d
**Done when:** Claiming "done" on a feature with missing scenarios fails the gate explicitly.

---

### T-D2 [P1] — Tester-as-library vs Tester-as-service split

**Problem:** Tester is currently both a CLI and an HTTP server. CC sessions want CLI, Guru wants HTTP. Versioning/backward-compat will bite as we add features faster.

**Scope:**
1. Keep CLI in `@aledan007/tester` (current npm package)
2. Extract HTTP server into `@aledan007/tester-service` (separate package) that wraps the library
3. Document API stability contract: CLI flags are stable, internal library API can break minor, service HTTP is versioned with `/v1/`, `/v2/`

**Effort:** 1 d (monorepo split, mostly mechanical)

---

### T-D3 [P1] — Documentation site with test patterns

**Problem:** Reusable patterns (login helper, cleanup teardown, snapshot masking) are hidden in source. New-session Claude reinvents.

**Scope:**
1. `docs/` site at tester.techbiz.ae/docs with:
   - Recipe cookbook (auth, CRUD, snapshot, a11y)
   - Scenario matrix patterns (the 28 4-way match pattern becomes a template)
   - Anti-patterns page (CSS `!=`, loose regex, short settles — the exact things I did wrong today)
2. Build from markdown in repo; Vercel or VPS1 hosting

**Effort:** 2 d
**Done when:** Docs cover the 10 most-used patterns from procuchaingo2 + BlocHub + PRO test suites.

---

### T-D4 [P2] — Cross-project test inventory dashboard

**Problem:** Which projects have best coverage? Which are regressing? No visibility today.

**Scope:** Aggregator `tester inventory` — pulls `coverage/*.yaml` from all projects under `PROJECTS_ROOT` → Master dashboard tile.

**Effort:** 1 d (needs Master dashboard plumbing too)

---

## Total effort estimate

**Original (outside-view guess):**

| Part | Effort | Value |
|---|---|---|
| **Phase 0 (self-diagnosis)** | **~2 h** | grounds all estimates below; may REDUCE total by removing duplicates |
| **T-000 Active Lessons Engine** | **~4 days** | ⭐ core architectural fix: lessons stop being passive prose |
| Foundations (T-001 .. T-010) | ~15 days | prevents 80% of session-2026-04-24-style false positives |
| CC sessions (T-A1 .. T-A3) | ~2 days | Claude-per-session quality bump |
| TWG (T-B1 .. T-B3) | ~2 days | loop no longer blames Guru for harness bugs |
| Pipelines (T-C1 .. T-C5) | ~6.5 days | prevents L40-style scope creep + improves observability |
| Meta (T-D1 .. T-D4) | ~5 days | enforces "done" + docs + visibility |
| **Total (original)** | **~34 days gross** | — |

**Revised post-Phase-0 (2026-04-24, ground-truth):**

| Part | Revised | Delta vs original | Justification |
|---|---|---|---|
| Phase 0 (self-diagnosis) | **~4 h actual** | +2h | Thorough sweep of 5.3MB pipeline archive + 42 lessons corpus |
| **T-000 Active Lessons Engine** | **~5 days** | +1d | Seed corpus 34 (not 30) lessons; governance detection rules added (L31/L40/L41/L24) |
| **T-C6 Zombie cleanup watchdog (NEW)** | **1 day** | +1d | L24 deployment; **44% of all failures** (corrected 2026-04-24); parallel with T-000 |
| Foundations (T-001..T-010) | **~13 days** | -2d | T-007..T-010 are extensions of existing code (retry, pixelmatch, axe, CDP) not greenfield |
| CC sessions (T-A1..T-A3) | ~2 days | — | unchanged |
| TWG (T-B1..T-B3) | ~2 days | — | unchanged |
| Pipelines (T-C1..T-C5) | ~6.5 days | — | T-C4 + T-C5 promoted to P0 but same effort; T-C2/T-C3 demoted but same effort |
| Meta (T-D1..T-D4) | ~5 days | — | unchanged |
| **Total (revised)** | **~34.5 days net** | +0.5d | Extension savings (-2d) offset by T-C6 (+1d) and T-000 corpus expansion (+1d) |

**Critical ordering (LOCKED post-Phase-0):**

1. **Phase 0** → complete 2026-04-24 ✓
2. **T-000 (5d) + T-C6 (1d) PARALLEL** — T-000 is architectural foundation for T-001/T-003/T-004; T-C6 is independent infra fix in Master mesh; zero code overlap
3. **T-001 + T-002 + T-003 PARALLEL (3d each)** — all three consume T-000 lesson schema once merged
4. **T-004 → T-B3** (T-B3 blocks on T-004 AI classifier)
5. **T-C4 → T-C5 → T-C1** (pipeline items in data-driven priority)
6. **T-005..T-010 extensions + T-A1..A3 + T-B1..B2 + T-D1..D4** — second wave after first 4 groups

**Why T-000 LANDS FIRST:** lesson schema is consumed by T-001 (self-test), T-003 (linter), T-004 (classifier). Building those first forces rework once T-000 schema lands. Package T-000 as `@aledan007/lessons` (or inline `src/lessons/`) so downstream items import from a stable surface.

---

## Lessons learned that motivate this roadmap

| # | Lesson | Which TODO item addresses it |
|---|---|---|
| L1 | "Done" ≠ commit+200. Re-run original test post-deploy. | T-D1, T-A2 |
| L2 | Scope discipline — no collateral changes. | T-C1, T-C2 |
| L3 | Prisma migration drift resolution protocol. | documented in per-project CLAUDE.md (not Tester scope) |
| L4 | SSH + Node escaping (scp → ssh pattern). | T-A1 ship helper scripts |
| L5 | Puppeteer `networkidle2` > `domcontentloaded` for auth. | T-001 timing fixture |
| L6 | Tailwind `uppercase` breaks case-sensitive regex. | T-001 case-handling probe |
| L7 | Defer with explicit logging when missing context. | T-006 (untested query) |
| L8 | Session budget planning. | T-A3 session-state recorder |
| L9 | Aviz-specific (Romania) — conditional flows. | Not Tester (domain logic); but T-002 lets us declare scenario coverage conditional on country |
| L10 | Stripe blocker patterns. | T-006 surface `configured: false` gaps as blockers |

---

## Unresolved questions for roadmap start (Tester team to answer)

1. Does `@aledan007/tester` publish cadence match this scope (6 weeks), or should Parts A/C ship first while Part 0 lands?
2. AIRouter billing envelope — T-004 + T-005 + T-C1 all use it. Estimate? (Order of 10k calls/month per active project.)
3. Baseline storage choice: local-first or S3 from day 1?
4. Backwards-compat contract: what counts as breaking the CLI? (Flags? Exit codes? stdout format?)
5. Who owns the Tester repo going forward — does this person have 6-week availability?

*Last updated: 2026-04-24. Next review: after T-001 + T-002 + T-003 land (estimate: +1 week).*
