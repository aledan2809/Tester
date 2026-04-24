# DIRECT-CHANGES — Tester (NO-TOUCH CRITIC)
# Ledger lunar al modificărilor Direct (protocol propose-confirm-apply)
# Month: 2026-04

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
