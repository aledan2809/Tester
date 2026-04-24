# DIRECT-CHANGES — Tester (NO-TOUCH CRITIC)
# Ledger lunar al modificărilor Direct (protocol propose-confirm-apply)
# Month: 2026-04

---

## 2026-04-24 — feat(tester): T-000 Day-1 active lessons engine (schema + loader + scanner + CLI + 3 seed lessons)

- **Session:** Direct — continuation of Phase 0 autonomous upgrade, post-user-confirm ("OK, continua").
- **Scope:** Day 1 of T-000 per the revised roadmap in `TODO_PERSISTENT.md` (commits ace5d34+d036344). Delivers the minimal viable Active Lessons Engine: YAML schema definition, corpus loader + validation, regex scanner across file/dir targets, CLI skeleton (`tester lessons list` + `tester lessons scan`), and the 3 seed lessons that motivated T-000 (F2/F8/F10 Procu 2026-04-24 harness defects).

- **Files created (11):**
  - `src/lessons/schema.ts` (~80 lines) — Lesson type + sub-types (DetectionRule, Prevention, Diagnosis, ScanMatch, LoaderResult)
  - `src/lessons/loader.ts` (~120 lines) — `loadLessons(dir)`, `parseYamlLesson()`, `findLessonsDir()`, schema validation with collected-errors semantics (one bad lesson doesn't abort)
  - `src/lessons/scanner.ts` (~110 lines) — `scan(target, lessons)`, `scanFile(file, lessons)`; supports `regex_in_test_file` + `regex_in_source_file`; walks dirs, respects test-file glob defaults
  - `src/lessons/index.ts` (~20 lines) — public module exports
  - `src/cli/commands/lessons.ts` (~140 lines) — `lessonsList(opts)` + `lessonsScan(target, opts)` handlers with `--json` + `--severity` + `--tags` + `--dir` + `--no-fail-on-match` flags; non-zero exit on matches
  - `lessons/L-F2-css-ne-operator.yaml` — Procu F2 defect (invalid CSS `[attr!=value]`)
  - `lessons/L-F8-case-regex-uppercase.yaml` — Procu F8 defect (case-sensitive regex vs Tailwind `uppercase`)
  - `lessons/L-F10-loose-text-picker.yaml` — Procu F10 defect (unscoped text selector)
  - `lessons/README.md` — corpus format + CLI usage + naming convention
  - `tests/lessons/loader.test.ts` (9 tests) — seed corpus loads; validation rejects bad id/severity/regex; duplicate id detection; missing dir handling
  - `tests/lessons/scanner.test.ts` (7 tests) — **META-TEST GATE implemented** per TODO_PERSISTENT Phase 0.4: seed broken fixture with F2+F8+F10 → `scanFile()` MUST return all 3 lesson IDs. Clean code yields zero matches. Non-test files filtered out. Directory walk aggregates.

- **Files modified (3):**
  - `src/cli/index.ts` — added 2 lines of imports + registered `lessons list` + `lessons scan` subcommands under a `lessons` parent group. All 21 pre-existing CLI flags untouched (backward-compat preserved per Section 6.1 Code Survey).
  - `package.json` — added `js-yaml@^4.1.1` dep + `@types/js-yaml@^4.0.9` devDep. Required for YAML corpus parsing.
  - `package-lock.json` — npm-managed dep lock update.

- **Zero changes to DO-NOT-MODIFY zones (per CLAUDE.md):**
  - Assertion engine (`src/assertions/*`) — untouched
  - BFS crawler (`src/discovery/crawler.ts`) — untouched
  - Reporter output format (`src/reporter/*`) — untouched
  - Rate limiting (`src/server/*`) — untouched
  - Template fallback scenarios (`src/scenarios/templates.ts`) — untouched

- **Verification (per feedback_verification_ritual memory):**
  - `npx tsc --noEmit` → 0 errors (full project typecheck)
  - `npx vitest run tests/lessons/` → 16/16 pass (2 test files)
  - `npx vitest run` → **101/101 pass** (85 pre-existing + 16 new). Zero regressions on existing baseline.
  - `npm run build` → CJS/ESM/DTS all success (library 100KB, CLI 168KB, server 107KB)
  - `node dist/cli/index.js lessons list` → correctly prints 3 seed lessons sorted by severity (HIGH → MEDIUM)
  - **META-TEST GATE manual run:** seeded `/tmp/broken-flows.spec.ts` with F2+F8+F10 defects → `tester lessons scan` flagged all 3 lesson IDs (4 matches total, F2 correctly triggered both its detection rules), exit code 1 as designed.

- **Risk assessment:** LOW.
  - All changes are ADDITIVE (new commands, new module, new files).
  - Existing consumers (Website Guru HTTP server + `npx @aledan007/tester` CLI users) see no behavior change on their current usage — the 7 pre-existing subcommands (discover/run/login/report/audit/audit-only/journey-audit) are byte-identical in behavior.
  - New `lessons` subcommand is opt-in; absent from existing callers' workflows.
  - Added `js-yaml` dep has 18M+ weekly downloads, zero known CVEs at 4.1.1, 83KB unpacked — negligible footprint and risk.

- **User confirmation:** Explicit "OK, continua" following the paused Phase 0.4 roadmap review. Scope authorized per the locked critical path (T-000 Day 1 first; T-C6 and Day 2+ to follow).

- **Commit:** see `git log` post-commit. Expected message: `feat(tester): T-000 Day-1 active lessons engine`.

### Day 2 preview (next session)
- Add `tester lessons diagnose <failure-log>` — symptom-signature lookup returning top-3 matches with remediation
- Pre-commit hook via `tester install-hooks` (T-A2 preview)
- Expand corpus with 4 new lessons from Phase 0.3 (L43 agent create_api_route, L44 api_request, L45 deploy git, L46 JSON EOF)
- Add `tester lessons validate` — run ALL lesson regression tests; fail if any lesson regresses on itself

---

## 2026-04-24 — docs(tester): correct zombie count 31%→44%

- **Session:** Direct — continuation of Phase 0 autonomous upgrade kickoff. Follow-up to commit `ace5d34`.
- **Files modified:**
  - `TODO_PERSISTENT.md` — 6 inline corrections (31% → 44%, 32/98 → 44/99) + new "⚠ Addendum" block at top of PHASE 0 OUTCOMES with root-cause analysis + forward guardrail for T-000 / T-C5 / T-C6
  - `reports/PIPELINE_FAILURE_SIGNATURES_2026-04-24.md` — Section 3 note + Section 9 surprise #2 updated
- **Scope:** Documentation only. Zero source code modified.
- **Why:** User challenged my verification ("tu ai verificat implementarea P0? Esti 100% sigur ca e corecta?"). Ran independent jq re-verification per `feedback_verification_ritual` memory. Found: subagent C5 cluster (32 "Zombie cleanup: process X dead" — dominant signature) + C10 cluster (12 "Other unique zombie PIDs" — noise variants) are the SAME failure class split by signature normalization. Commit `ace5d34` synthesis cited only C5 → understated zombie share by 13 percentage points (31% vs actual 44%).
- **Verification method:** `jq '[.pipelines[] | select(.state == "failed") | (.errors | if length > 0 then .[-1] else "" end)] | map(tostring) | map(select(test("[Zz]ombie|dead|stuck"))) | length'` on both pipelines.json (6) + pipelines_archive.json (38) = 44 / 99 total failures = 44%.
- **Risk assessment:** ZERO-RISK. Documentation-only correction. T-C6 priority unchanged (stays P0); argument for it is STRONGER (44% vs 31% target).
- **Forward guardrail:** Addendum block mandates that T-000 detection rules and T-C5 analytics expose per-regex-class counts (not only per-exact-signature counts), so the same undercount pattern cannot recur when T-C6 measures its "44% → <5%" success criterion post-deployment.
- **User confirmation:** Explicit "aplica corectura ca commit followup ocs(tester): correct zombie count 31%→44% si te asiguri ca se fixeaza ulterior" — applied exactly as requested + added persistence mechanism (inline correction + addendum + T-C6 done-when update).
- **Commit:** see git log post-commit for hash.

### What "se fixeaza ulterior" means concretely

1. **T-C6 implementation** (when it runs) is now anchored to the 44% baseline via explicit regex in the success criterion. `tester pipeline-stats` after deploy must apply the same regex to measure zombie drop.
2. **T-000 seed lesson L24** YAML detection block must bucket signature variants BEFORE counting hits — otherwise the same undercount happens inside the lessons engine itself.
3. **T-C5 analytics CLI** must expose both exact-sig count and regex-class count — consumers that use only exact-sig counts will make the same mistake.

---

## 2026-04-24 — docs(tester): phase 0 self-diagnosis revises roadmap

- **Session:** Direct — autonomous upgrade kickoff. Session marker `Direct` set in `Master/.claude-session-routing`.
- **Files created:**
  - `Reports/CODE_SURVEY_2026-04-24.md` (382 lines, 35KB) — read-only survey of src/ + CLI + server
  - `Reports/LESSONS_INVENTORY_2026-04-24.md` (336 lines, 30KB) — 42 lessons across 14 files; **59% recurrence ratio**
  - `Reports/PIPELINE_FAILURE_SIGNATURES_2026-04-24.md` (236 lines, 15KB) — 263 pipelines surveyed; **38.4% failure rate**, 100% concentrated in phase "auto"
- **File modified:**
  - `TODO_PERSISTENT.md` — inserted "PHASE 0 OUTCOMES" header; promoted T-C4/T-C5 to P0; added T-C6 (zombie watchdog, L24 implementation); demoted T-C2→P1, T-C3→P2; updated Total effort table
- **Scope:** Documentation only. Zero source code modified. Zero tests/build config touched. Zero exports/CLI flags changed.
- **Why:** Phase 0 protocol mandates ground-truth investigation BEFORE any T-000..T-D4 implementation. Prevents duplicating existing Tester code, rebuilding half-built features (T-007..T-010 are extensions not greenfield), or conflicting with stable zones.
- **Risk assessment:** ZERO-RISK. Documentation-only commit. Reports are new files (force-added because `reports/` glob matches `Reports/` on macOS case-insensitive FS). TODO_PERSISTENT.md was previously untracked.
- **User confirmation:** Phase 0 commit is MANDATED by protocol ("Commit the revised TODO_PERSISTENT.md with message `docs(tester): phase 0 self-diagnosis revises roadmap`"). PAUSE for user confirmation happens AFTER commit, BEFORE any T-000 implementation.
- **Commit:** see git log post-commit for hash.

### Revisions summary
- **Priorities revised:** T-C4 P1→P0, T-C5 P1→P0, T-C2 P0→P1, T-C3 P0→P2 (data-driven from Phase 0.3)
- **New items:** T-C6 zombie cleanup watchdog (1d, targets 31% of failures — L24 deployment)
- **T-000 seed corpus expanded:** 30 → 34+ lessons (add L43 agent create_api_route, L44 agent api_request, L45 deploy git commit, L46 JSON EOF infra)
- **Effort estimate:** ~34d → ~34.5d net (extension savings offset by T-C6 + T-000 expansion)
- **Execution order locked:** T-000 + T-C6 parallel → T-001/T-002/T-003 parallel → rest

---

## 2026-04-22 — feat(journey-audit): support no-auth projects by making cfg.login optional

- **Session:** Direct pe Prompt-Architect; extindere scope cu Tester (single NO-TOUCH per session rule).
- **File modified:** `src/cli/commands/journey-audit.ts`
- **Scope:** 4 surgical edits — types made `login?`/`credentials?` optional, validator no longer requires `login`, credentials lookup gated on `needsAuth`, login flow wrapped in `if (cfg.login)` block. Zero changes to: assertion engine, BFS crawler, reporter format, rate limiter, template fallback.
- **Why:** Journey-audit was hard-coded to require email/password login. This blocked auditing of no-auth projects (local tools, public landing pages). Prompt-Architect is single-user local, no auth → needed this to demonstrate [8] mode on PA.
- **Risk assessment:** LOW. Existing callers (configs with `login` present) execute the exact same path. Only new behavior when `login` is absent.
- **Smoke checks passed:**
  - `npx tsc --noEmit` → 0 errors
  - `npm run build` (tsup CJS+ESM+DTS) → success
  - Live run on PA (http://localhost:3014, `.journey-audit.json` no-auth) → Home page classified OK, screenshot captured, report.json generated
- **User confirmation:** Explicit "2" + "da" prior to applying edits (per NO-TOUCH CRITIC propose-confirm-apply protocol).
- **Commit:** pending (awaiting user OK to commit)

### Diff summary
- Lines modified: ~15
- Types: `login` / `credentials` → optional
- Validator (l.71): removed `!cfg.login` clause
- Credentials block (l.135-142): gated on `needsAuth = !!cfg.login`
- Login flow (l.157-205): wrapped in `if (cfg.login) { … }`

---
